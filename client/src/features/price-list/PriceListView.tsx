import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Copy, RotateCcw, Tag, Package } from 'lucide-react';
import { money } from '../../lib/format';
import { Spinner } from '../../components/ui';
import type { PriceListRow, VehicleGeneration } from '../../lib/types';
import './price-list.css';

export function genLabel(g: VehicleGeneration): string {
  return `${g.make} ${[g.model, g.code].filter(Boolean).join(' ')}`;
}

export interface PriceListViewProps {
  tab: 'works' | 'parts';
  generations: VehicleGeneration[];
  generationId: string | null;
  rows?: PriceListRow[];
  loading?: boolean;
  withOverride: number;
  busy?: boolean;
  /** Parts-catalog tab content (container-owned). */
  partsSlot?: ReactNode;
  /** Demo: marks this price row with data-highlight. */
  highlightTemplateId?: string;
  onTab(t: 'works' | 'parts'): void;
  onGeneration(id: string | null): void;
  onSave(templateId: string, hours: number | null, price: number | null): void;
  onClear(templateId: string): void;
  onEditParts(row: PriceListRow): void;
  onCopy(): void;
}

export function PriceListView({
  tab,
  generations,
  generationId,
  rows,
  loading,
  withOverride,
  busy,
  partsSlot,
  highlightTemplateId,
  onTab,
  onGeneration,
  onSave,
  onClear,
  onEditParts,
  onCopy,
}: PriceListViewProps) {
  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Прайс-лист</h1>
          <p className="page-sub">
            Цены работ по поколениям и каталог запчастей
          </p>
        </div>
        <div className="seg">
          <button className="seg-btn" data-demo="pl-tab-works" data-on={tab === 'works'} onClick={() => onTab('works')}>
            <Tag size={14} /> Работы
          </button>
          <button className="seg-btn" data-demo="pl-tab-parts" data-on={tab === 'parts'} onClick={() => onTab('parts')}>
            <Package size={14} /> Запчасти
          </button>
        </div>
      </div>

      {tab === 'parts' ? (
        partsSlot
      ) : (
        <>
          <div className="pl-bar">
            <div className="field" style={{ minWidth: 260 }}>
              <label className="label">Поколение</label>
              <select
                className="input"
                data-demo="pl-generation"
                value={generationId ?? ''}
                onChange={(e) => onGeneration(e.target.value || null)}
              >
                <option value="">Базовые цены (для всех)</option>
                {generations.map((g) => (
                  <option key={g.id} value={g.id}>
                    {genLabel(g)}{g.years ? ` · ${g.years}` : ''}
                  </option>
                ))}
              </select>
            </div>
            {generationId && (
              <>
                <span className="text-sm muted">
                  Своя цена задана у {withOverride} из {(rows ?? []).length}
                </span>
                <button className="btn btn-default" data-demo="pl-copy" onClick={onCopy}>
                  <Copy size={15} /> Скопировать из…
                </button>
              </>
            )}
          </div>

          {loading ? (
            <div className="center" style={{ minHeight: 200 }}><Spinner size={22} /></div>
          ) : (rows ?? []).length === 0 ? (
            <div className="empty">
              <Tag />
              <div className="empty-title">Работ пока нет</div>
              <div className="text-sm muted">Добавьте работы в Настройках — они появятся здесь.</div>
            </div>
          ) : (
            <div className="panel">
              <div className="pl-head pl-grid">
                <span>Работа</span>
                <span className="ta-r">Норм.ч.</span>
                <span className="ta-r">Цена</span>
                <span className="ta-r">Итого по прайсу</span>
                <span className="ta-r">Детали</span>
                <span />
              </div>
              {(rows ?? []).map((r) => (
                <PriceRow
                  key={r.template.id}
                  row={r}
                  editable={!!generationId}
                  busy={!!busy}
                  highlight={highlightTemplateId === r.template.id}
                  onSave={(hours, price) => onSave(r.template.id, hours, price)}
                  onClear={() => onClear(r.template.id)}
                  onEditParts={() => onEditParts(r)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One work. Inherited figures are shown greyed; an override is shown in normal
 * weight with a reset button — so it is always obvious whether this generation
 * has its own price or is falling back to the shared one.
 */
function PriceRow({
  row,
  editable,
  busy,
  highlight,
  onSave,
  onClear,
  onEditParts,
}: {
  row: PriceListRow;
  editable: boolean;
  busy: boolean;
  highlight: boolean;
  onSave: (hours: number | null, price: number | null) => void;
  onClear: () => void;
  onEditParts: () => void;
}) {
  const [hours, setHours] = useState(row.override?.hours != null ? String(row.override.hours) : '');
  const [price, setPrice] = useState(row.override?.price != null ? String(row.override.price) : '');

  useEffect(() => {
    setHours(row.override?.hours != null ? String(row.override.hours) : '');
    setPrice(row.override?.price != null ? String(row.override.price) : '');
  }, [row.override?.hours, row.override?.price]);

  const commit = () => {
    const h = hours ? Number(hours) : null;
    const p = price ? Number(price) : null;
    if (h === (row.override?.hours ?? null) && p === (row.override?.price ?? null)) return;
    if (h === null && p === null) {
      if (row.override) onClear();
      return;
    }
    onSave(h, p);
  };

  const inherited = !row.override;

  return (
    <div className="pl-row pl-grid" data-demo="pl-row" data-id={row.template.id} data-highlight={highlight ? '' : undefined}>
      <span className="truncate">{row.template.name}</span>
      {editable ? (
        <input
          className="cell-input ta-r tnum"
          value={hours}
          placeholder={row.base.hours != null ? String(row.base.hours) : '—'}
          onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          inputMode="decimal"
        />
      ) : (
        <span className="ta-r mono tnum muted">{row.base.hours ?? '—'}</span>
      )}
      {editable ? (
        <input
          className="cell-input ta-r tnum"
          value={price}
          placeholder={row.base.price != null ? String(row.base.price) : '—'}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          inputMode="decimal"
        />
      ) : (
        <span className="ta-r mono tnum muted">{row.base.price != null ? money(row.base.price) : '—'}</span>
      )}
      <span className="ta-r mono tnum" data-inherited={inherited || undefined}>
        {row.effective.price != null ? money(row.effective.price) : '—'}
        {editable && (
          <span className="pl-src">
            {row.effective.source === 'generation'
              ? 'своя'
              : row.effective.source === 'template'
                ? 'базовая'
                : 'по ставке'}
          </span>
        )}
      </span>
      <span className="ta-r">
        <button
          className="btn btn-ghost btn-sm"
          data-demo="pl-parts-btn"
          onClick={onEditParts}
          title="Запчасти, которые подставятся вместе с работой"
        >
          <Package size={14} /> {row.parts_count || '—'}
        </button>
      </span>
      <span className="row-actions">
        {editable && row.override && (
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onClear}
            disabled={busy}
            aria-label="Вернуть базовую цену"
            title="Вернуть базовую цену"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </span>
    </div>
  );
}
