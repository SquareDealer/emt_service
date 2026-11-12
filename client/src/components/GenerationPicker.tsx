import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Search, Settings2 } from 'lucide-react';
import { api } from '../lib/api';
import { genLabel, groupGenerations } from '../lib/generations';
import type { VehicleGeneration } from '../lib/types';
import './generation-picker.css';

export const BASE_LABEL = 'Базовые цены (для всех)';

/** Shared by everything that needs the whole catalog, retired rows included. */
export const ALL_GENERATIONS_KEY = ['vehicle-generations', 'all'] as const;

const GAP = 4;
const EDGE = 8;

/**
 * Generation chooser with search — a native `<select>` stops being usable at
 * two dozen generations across several makes.
 *
 * The panel is `position: fixed` and placed from the trigger's rectangle, so it
 * is clipped neither by a horizontally scrolling `.panel` nor by the scrolling
 * body of a `<dialog>`; it stays in the trigger's DOM subtree, which keeps it in
 * the top layer when the picker lives inside a modal.
 *
 * The catalog is read with `all=1`: a car may sit on a retired generation, and
 * the picker must still be able to name it. Retired rows are not offered —
 * except the one currently selected.
 */
export function GenerationPicker({
  value,
  onChange,
  allowBase = false,
  onManage,
}: {
  /** null = base prices. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** Offer «Базовые цены (для всех)» as a choice. */
  allowBase?: boolean;
  /** Renders «Управлять поколениями» at the bottom of the panel. */
  onManage?: () => void;
}) {
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<CSSProperties | null>(null);

  const { data: all } = useQuery({
    queryKey: ALL_GENERATIONS_KEY,
    queryFn: () => api.vehicleGenerations(true),
  });

  const current = (all ?? []).find((g) => g.id === value) ?? null;

  const groups = useMemo(
    () => groupGenerations((all ?? []).filter((g) => g.active || g.id === value), q),
    [all, value, q],
  );
  const showBase = allowBase && (!q.trim() || BASE_LABEL.toLowerCase().includes(q.trim().toLowerCase()));

  /** Flat list in display order — what the arrow keys walk. */
  const options = useMemo<(VehicleGeneration | null)[]>(
    () => [...(showBase ? [null] : []), ...groups.flatMap((g) => g.items)],
    [groups, showBase],
  );

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const choose = (id: string | null) => {
    onChange(id);
    close();
  };

  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(Math.max(0, options.findIndex((o) => (o?.id ?? null) === value)));
    // Opening resets the query; `options` here is the pre-reset list on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the highlight on a real row while the list shrinks under the query.
  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, options.length - 1)));
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) {
      setPlace(null);
      return;
    }
    const position = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(Math.max(r.width, 340), vw - EDGE * 2);
      const left = Math.min(Math.max(EDGE, r.left), vw - EDGE - width);
      const below = vh - r.bottom - GAP - EDGE;
      const above = r.top - GAP - EDGE;
      // Prefer opening downwards; flip only when there is clearly more room above.
      const up = below < 260 && above > below;
      setPlace({
        left,
        width,
        maxHeight: Math.min(440, up ? above : below),
        ...(up ? { bottom: vh - r.top + GAP } : { top: r.bottom + GAP }),
      });
    };
    position();
    window.addEventListener('resize', position);
    // Capture: the trigger may sit in any scrolling ancestor.
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [open]);

  // Focus once, when the panel first gets its position (it is hidden until then).
  const placed = place !== null;
  useEffect(() => {
    if (open && placed) searchRef.current?.focus({ preventScroll: true });
  }, [open, placed]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, active, placed]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Inside a <dialog> an unhandled Escape would close the whole modal.
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      const picked = options[active];
      if (picked !== undefined) choose(picked?.id ?? null);
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  const optionId = (i: number) => `${uid}-opt-${i}`;
  let index = -1;
  const option = (g: VehicleGeneration | null) => {
    index += 1;
    const i = index;
    const selected = (g?.id ?? null) === value;
    return (
      <li
        key={g?.id ?? 'base'}
        id={optionId(i)}
        role="option"
        aria-selected={selected}
        className="gp-option"
        data-active={i === active}
        data-base={g === null || undefined}
        onPointerMove={() => setActive(i)}
        onClick={() => choose(g?.id ?? null)}
      >
        {g === null ? (
          <span className="gp-name">{BASE_LABEL}</span>
        ) : (
          <>
            <span className="gp-name truncate">
              {g.model}
              {g.code && <span className="gp-code mono">{g.code}</span>}
              {!g.active && <span className="gp-retired">убрано</span>}
            </span>
            {g.years && <span className="gp-years tnum">{g.years}</span>}
          </>
        )}
        <Check size={15} className="gp-check" aria-hidden data-on={selected} />
      </li>
    );
  };

  return (
    <div className="gp" ref={rootRef}>
      <span className="label" id={`${uid}-label`}>Поколение</span>
      <button
        ref={triggerRef}
        type="button"
        className="gp-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${uid}-label ${uid}-value`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="gp-value truncate" id={`${uid}-value`}>
          {value === null ? (
            allowBase ? BASE_LABEL : <span className="faint">Выберите поколение</span>
          ) : current ? (
            <>
              {genLabel(current)}
              {current.years && <span className="gp-value-years tnum">{current.years}</span>}
              {!current.active && <span className="gp-retired">убрано</span>}
            </>
          ) : (
            // The catalog has not loaded yet (or the id is unknown to it).
            <span className="faint">…</span>
          )}
        </span>
        <ChevronDown size={16} aria-hidden className="gp-chevron" />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="gp-panel"
          role="dialog"
          aria-label="Выбор поколения"
          style={place ?? { visibility: 'hidden' }}
          onKeyDown={onKeyDown}
        >
          <div className="gp-search">
            <Search size={15} aria-hidden />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              placeholder="Марка, модель, код или годы"
              aria-label="Поиск поколения"
              role="combobox"
              aria-expanded
              aria-controls={`${uid}-list`}
              aria-activedescendant={options.length ? optionId(active) : undefined}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <ul className="gp-list" id={`${uid}-list`} role="listbox" aria-label="Поколения">
            {showBase && option(null)}
            {groups.map((group) => (
              <li key={group.make} role="presentation">
                <div className="gp-make">{group.make}</div>
                <ul role="group" aria-label={group.make}>
                  {group.items.map((g) => option(g))}
                </ul>
              </li>
            ))}
            {options.length === 0 && (
              <li className="gp-empty" role="presentation">
                {all ? 'Ничего не найдено' : 'Загрузка…'}
              </li>
            )}
          </ul>

          {onManage && (
            <button
              type="button"
              className="gp-manage"
              onClick={() => {
                close(false);
                onManage();
              }}
            >
              <Settings2 size={15} aria-hidden /> Управлять поколениями
            </button>
          )}
        </div>
      )}
    </div>
  );
}
