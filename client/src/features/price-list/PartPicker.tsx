import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Search, X } from 'lucide-react';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { filterParts, manufacturersOf } from '../../lib/parts';
import type { PartTemplate } from '../../lib/types';
import './part-picker.css';

/**
 * Catalog part picker for the «запчасти работы» form.
 *
 * Focusing the search unfolds the WHOLE catalog — the shop rarely remembers how
 * a part was named, but recognises it in a list. The catalog is loaded once and
 * narrowed locally (query, manufacturer chips, «скрыть привязанные»), so the
 * list reacts instantly and works before a single letter is typed.
 *
 * The panel is laid out in the flow of the parent grid (`grid-column: 1 / -1`),
 * not as an absolute popover: both the surrounding `.panel` and the `<dialog>`
 * body clip their overflow. The root is `display: contents`, so the search
 * field stays in the first grid cell while the panel takes the full row.
 */
export function PartPicker({
  value,
  onChange,
  excludeIds,
}: {
  value: PartTemplate | null;
  onChange: (p: PartTemplate | null) => void;
  /** Parts already attached where this picker lives — hidden by default. */
  excludeIds?: ReadonlySet<string>;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const optId = (i: number) => `${uid}-opt-${i}`;

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [manufacturer, setManufacturer] = useState<string | null>(null);
  const [hideAttached, setHideAttached] = useState(true);
  /** Highlighted row; -1 = none, so a stray Enter never picks by accident. */
  const [active, setActive] = useState(-1);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const pointerDown = useRef(false);
  const byKeyboard = useRef(false);
  const refocus = useRef(false);

  // Same key as the catalog tab with an empty search — one cache, and every
  // existing `invalidateQueries(['part-templates'])` refreshes the picker too.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['part-templates', ''],
    queryFn: () => api.partTemplates(),
  });
  const all = useMemo(() => data ?? [], [data]);

  const manufacturers = useMemo(() => manufacturersOf(all), [all]);
  // A chip whose brand has left the catalog must not keep filtering invisibly.
  const brand = manufacturer !== null && manufacturers.includes(manufacturer) ? manufacturer : null;
  const attachedCount = useMemo(
    () => (excludeIds ? all.filter((p) => excludeIds.has(p.id)).length : 0),
    [all, excludeIds],
  );

  const matching = useMemo(() => filterParts(all, { q, manufacturer: brand }), [all, q, brand]);
  const shown = useMemo(
    () => (hideAttached && excludeIds ? matching.filter((p) => !excludeIds.has(p.id)) : matching),
    [matching, hideAttached, excludeIds],
  );

  useEffect(() => { setActive(-1); }, [q, brand, hideAttached]);

  // Fold on an outside CLICK, not on blur: the panel is in the flow, so folding
  // on mousedown would shift the page under the pointer and swallow the click.
  useEffect(() => {
    if (!open) return;
    const down = () => { pointerDown.current = true; };
    const up = () => { pointerDown.current = false; };
    const click = (e: MouseEvent) => {
      pointerDown.current = false;
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('click', click, true);
    return () => {
      pointerDown.current = false;
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('click', click, true);
    };
  }, [open]);

  // The dialog body scrolls; make sure the unfolded panel is actually in view.
  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  // A mouse wheel has no sideways axis: let it scroll the chip row. Native
  // listener — React's onWheel is passive and could not stop the dialog body
  // from scrolling along.
  const hasChips = manufacturers.length > 0;
  useEffect(() => {
    const el = chipsRef.current;
    if (!open || !el) return;
    const wheel = (e: WheelEvent) => {
      if (e.deltaX !== 0 || e.deltaY === 0 || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [open, hasChips]);

  useEffect(() => {
    if (!byKeyboard.current || active < 0) return;
    byKeyboard.current = false;
    document.getElementById(optId(active))?.scrollIntoView({ block: 'nearest' });
    // optId only depends on the stable useId value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // «Выбрать другую»: the search input only exists once the value is cleared.
  useEffect(() => {
    if (!value && refocus.current) {
      refocus.current = false;
      inputRef.current?.focus();
      setOpen(true);
    }
  }, [value]);

  const pick = (p: PartTemplate) => {
    setOpen(false);
    setQ('');
    setActive(-1);
    onChange(p);
  };

  const resetFilters = () => {
    setQ('');
    setManufacturer(null);
  };

  const move = (delta: 1 | -1) => {
    if (shown.length === 0) return;
    byKeyboard.current = true;
    setActive((i) => {
      if (i < 0) return delta === 1 ? 0 : shown.length - 1;
      return (i + delta + shown.length) % shown.length;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (!open) return; // let the modal have it
      // Fold the panel only — the dialog would otherwise take Escape as «закрыть».
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      inputRef.current?.focus();
      return;
    }
    if (e.target !== inputRef.current) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      const target = active >= 0 ? shown[active] : shown.length === 1 ? shown[0] : undefined;
      if (target) pick(target);
    }
  };

  if (value) {
    const meta = [value.manufacturer, value.catalog_number].filter(Boolean).join(' · ');
    return (
      <div className="pp-value" title={[value.name, meta].filter(Boolean).join(' · ')}>
        <span className="truncate">
          {value.name}
          {meta && <span className="faint"> · {meta}</span>}
        </span>
        <button
          type="button"
          className="pp-reset"
          onClick={() => { refocus.current = true; onChange(null); }}
          aria-label="Выбрать другую запчасть"
          title="Выбрать другую"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  const filtered = q.trim() !== '' || brand !== null;

  return (
    <div
      className="pp"
      ref={rootRef}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        // Keyboard left the picker (Tab). Pointer exits are handled on click.
        if (pointerDown.current) return;
        const next = e.relatedTarget;
        if (next instanceof Node && !rootRef.current?.contains(next)) setOpen(false);
      }}
    >
      <div className="pp-field" data-open={open || undefined}>
        <Search size={14} className="pp-field-icon" aria-hidden />
        <input
          ref={inputRef}
          className="cell-input pp-input"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          placeholder="Найти в каталоге"
          role="combobox"
          aria-label="Запчасть из каталога"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <ChevronDown size={14} className="pp-field-chevron" aria-hidden />
      </div>

      {open && (
        // Keep the caret in the search while chips and rows are clicked.
        <div className="pp-panel" ref={panelRef} onMouseDown={(e) => e.preventDefault()}>
          {(manufacturers.length > 0 || attachedCount > 0) && (
            <div className="pp-bar">
              {manufacturers.length > 0 && (
                <div className="pp-chips" ref={chipsRef} role="group" aria-label="Производитель">
                  <button
                    type="button"
                    className="pp-chip"
                    aria-pressed={brand === null}
                    onClick={() => setManufacturer(null)}
                  >
                    <span>Все</span>
                  </button>
                  {manufacturers.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="pp-chip"
                      aria-pressed={brand === m}
                      onClick={() => setManufacturer(brand === m ? null : m)}
                    >
                      <span>{m}</span>
                    </button>
                  ))}
                </div>
              )}
              {attachedCount > 0 && (
                <label className="pp-check">
                  <input
                    type="checkbox"
                    checked={hideAttached}
                    onChange={(e) => setHideAttached(e.target.checked)}
                  />
                  Скрыть привязанные
                </label>
              )}
            </div>
          )}

          <div className="pp-list" id={listId} role="listbox" aria-label="Каталог запчастей">
            {isLoading ? (
              <div className="pp-skeleton" aria-busy="true">
                {[72, 54, 64].map((w) => (
                  <div key={w} className="skeleton" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : isError ? (
              <div className="pp-empty">
                <span>Не удалось загрузить каталог</span>
                <button type="button" className="btn btn-default btn-sm" onClick={() => refetch()}>
                  Повторить
                </button>
              </div>
            ) : all.length === 0 ? (
              <div className="pp-empty">Каталог пуст — добавьте детали во вкладке «Запчасти»</div>
            ) : shown.length === 0 ? (
              matching.length > 0 ? (
                <div className="pp-empty">
                  <span>{filtered ? 'Подходящие детали уже привязаны' : 'Все детали каталога уже привязаны'}</span>
                  <button type="button" className="btn btn-default btn-sm" onClick={() => setHideAttached(false)}>
                    Показать привязанные
                  </button>
                </div>
              ) : (
                <div className="pp-empty">
                  <span>Ничего не найдено</span>
                  <button type="button" className="btn btn-default btn-sm" onClick={resetFilters}>
                    Сбросить фильтры
                  </button>
                </div>
              )
            ) : (
              shown.map((p, i) => (
                <div
                  key={p.id}
                  id={optId(i)}
                  role="option"
                  aria-selected={i === active}
                  className="pp-opt"
                  onClick={() => pick(p)}
                  onMouseMove={() => { if (active !== i) setActive(i); }}
                >
                  <span className="pp-opt-name truncate">
                    {p.name}
                    {excludeIds?.has(p.id) && <span className="pp-opt-tag">привязана</span>}
                  </span>
                  <span className="pp-opt-brand truncate">{p.manufacturer}</span>
                  <span className="pp-opt-art mono truncate">{p.catalog_number}</span>
                  <span className="pp-opt-price mono tnum">{money(p.default_price)}</span>
                </div>
              ))
            )}
          </div>

          {all.length > 0 && (
            <div className="pp-foot">
              <span>Показано {shown.length} из {all.length}</span>
              <span className="pp-keys" aria-hidden>
                <kbd>↑</kbd><kbd>↓</kbd> выбрать · <kbd>Enter</kbd> взять · <kbd>Esc</kbd> свернуть
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
