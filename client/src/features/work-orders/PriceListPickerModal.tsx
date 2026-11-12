import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info, Package, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { canManageCatalog } from '../../lib/roles';
import { money, vehicleLabel } from '../../lib/format';
import { genLabel } from '../../lib/generations';
import { Modal, Spinner } from '../../components/ui';
import { ALL_GENERATIONS_KEY, GenerationPicker } from '../../components/GenerationPicker';
import { GenerationsModal } from '../price-list/GenerationsModal';
import type { PriceSource, WorkOrder } from '../../lib/types';
import '../price-list/works.css';

const SOURCE_LABEL: Record<PriceSource, string> = {
  generation: 'своя',
  template: 'базовая',
  rate: 'по ставке',
};

/**
 * «Из прайса» in a work order: choose which generation's prices to use, then
 * the work. It opens on the car's own generation; picking another one (or the
 * base prices) is allowed but called out, because the estimate will then carry
 * figures that were not written for this car.
 */
export function PriceListPickerModal({
  open,
  workOrder,
  onClose,
  onPick,
}: {
  open: boolean;
  workOrder: WorkOrder;
  onClose: () => void;
  /** `generationId` null = base prices, chosen explicitly. */
  onPick: (templateId: string, generationId: string | null) => void;
}) {
  const { user } = useAuth();
  const uid = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const carGenerationId = workOrder.vehicle?.generation_id ?? null;
  const [generationId, setGenerationId] = useState<string | null>(carGenerationId);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setGenerationId(carGenerationId);
    setQ('');
    setActive(0);
    searchRef.current?.focus();
    // Reset only on open: a refetch of the order must not move the choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: generations } = useQuery({
    queryKey: ALL_GENERATIONS_KEY,
    queryFn: () => api.vehicleGenerations(true),
    enabled: open,
  });
  const { data: rows, isLoading } = useQuery({
    queryKey: ['price-list', generationId],
    queryFn: () => api.priceList(generationId ?? undefined),
    enabled: open,
  });

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !needle || r.template.name.toLowerCase().includes(needle));
  }, [rows, q]);

  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const chosen = (generations ?? []).find((g) => g.id === generationId) ?? null;
  const mismatch = generationId !== carGenerationId;

  const onSearchKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = visible[active];
      if (row) onPick(row.template.id, generationId);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Работа из прайса" width={720}>
        <div className="pp">
          <div className="pp-top">
            <div className="pp-gen">
              <GenerationPicker
                value={generationId}
                onChange={(id) => {
                  setGenerationId(id);
                  setActive(0);
                  searchRef.current?.focus();
                }}
                allowBase
                onManage={canManageCatalog(user?.role) ? () => setManageOpen(true) : undefined}
              />
            </div>
            <label className="pw-search">
              <Search size={15} aria-hidden />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onSearchKey}
                placeholder="Поиск работы"
                aria-label="Поиск работы"
                role="combobox"
                aria-expanded
                aria-controls={`${uid}-list`}
                aria-activedescendant={visible.length ? `${uid}-row-${active}` : undefined}
                autoComplete="off"
              />
            </label>
          </div>

          {mismatch && (
            <div className="pp-warn" role="status">
              <Info size={15} aria-hidden />
              <span>
                {chosen ? `Цены для ${genLabel(chosen)}` : 'Базовые цены'}, а в наряде{' '}
                {vehicleLabel(workOrder.vehicle)}
              </span>
              <button type="button" className="pp-warn-reset" onClick={() => setGenerationId(carGenerationId)}>
                {carGenerationId ? 'К поколению машины' : 'К базовым ценам'}
              </button>
            </div>
          )}

          <div className="pp-list" ref={listRef} id={`${uid}-list`} role="listbox" aria-label="Работы прайса">
            {isLoading || !rows ? (
              <div className="center" style={{ minHeight: 160 }}><Spinner size={20} /></div>
            ) : rows.length === 0 ? (
              <div className="pp-empty">
                В прайсе пока нет работ. Они добавляются в разделе «Прайс-лист».
              </div>
            ) : visible.length === 0 ? (
              <div className="pp-empty">По запросу «{q.trim()}» ничего не найдено.</div>
            ) : (
              visible.map((r, i) => (
                <div
                  key={r.template.id}
                  id={`${uid}-row-${i}`}
                  role="option"
                  aria-selected={i === active}
                  tabIndex={-1}
                  className="pp-row"
                  data-active={i === active}
                  onPointerMove={() => setActive(i)}
                  onClick={() => onPick(r.template.id, generationId)}
                >
                  <span className="pp-name truncate">{r.template.name}</span>
                  <span className="pp-parts tnum" title="Запчасти, которые подставятся вместе с работой">
                    {r.parts_count > 0 && (
                      <>
                        <Package size={14} aria-hidden /> {r.parts_count}
                      </>
                    )}
                  </span>
                  <span className="pp-hours mono">
                    {r.effective.hours != null ? `${r.effective.hours} н/ч` : ''}
                  </span>
                  <span className="pp-price mono">
                    {r.effective.price != null ? money(r.effective.price) : '—'}
                  </span>
                  <span className="pp-src" data-source={r.effective.source}>
                    {SOURCE_LABEL[r.effective.source]}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="pp-foot">
            <span><kbd>↑</kbd><kbd>↓</kbd> выбрать</span>
            <span><kbd>Enter</kbd> добавить</span>
            <span className="pp-foot-count tnum">
              {rows ? `${visible.length} из ${rows.length}` : ''}
            </span>
          </div>
        </div>
      </Modal>

      <GenerationsModal open={manageOpen} onClose={() => setManageOpen(false)} />
    </>
  );
}
