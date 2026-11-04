import { Check, Wrench, Package } from 'lucide-react';
import { money } from '../../lib/format';
import { Modal, Spinner } from '../../components/ui';
import type { TemplatePreview } from '../../lib/types';

export interface ApplyTemplateViewProps {
  open: boolean;
  preview?: TemplatePreview;
  loading?: boolean;
  picked: ReadonlySet<string>;
  qty: Record<string, string>;
  total: number;
  pending?: boolean;
  /** Demo: render the dialog already open, in normal flow. */
  inline?: boolean;
  onToggle: (partTemplateId: string) => void;
  onQty: (partTemplateId: string, v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Confirmation sheet for «применить позицию прайса».
 *
 * Deliberately not fire-and-forget: a template brings its own parts, and a part
 * left in by accident becomes a wrong quote handed to the customer. The
 * receptionist sees exactly what will be added and unticks what is not needed.
 */
export function ApplyTemplateView({
  open,
  preview,
  loading,
  picked,
  qty,
  total,
  pending,
  inline,
  onToggle,
  onQty,
  onConfirm,
  onClose,
}: ApplyTemplateViewProps) {
  const sourceNote =
    preview?.price_source === 'generation'
      ? 'цена этого поколения'
      : preview?.price_source === 'template'
        ? 'базовая цена — для этого поколения не задана'
        : 'цена не задана, посчитается по ставке';

  return (
    <Modal
      open={open}
      inline={inline}
      onClose={onClose}
      title="Добавить в смету"
      width={620}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={pending}>Отмена</button>
          <button
            className="btn btn-primary"
            data-demo="apply-confirm"
            onClick={onConfirm}
            disabled={!preview || pending}
          >
            {pending ? <Spinner /> : <Check size={16} />}
            Добавить — {money(total)}
          </button>
        </>
      }
    >
      {loading || !preview ? (
        <div className="center" style={{ minHeight: 120 }}><Spinner size={20} /></div>
      ) : (
        <div className="col gap-4">
          <div className="panel" data-demo="apply-labor" style={{ padding: 'var(--sp-3)' }}>
            <div className="row gap-2" style={{ alignItems: 'baseline' }}>
              <Wrench size={15} className="muted" />
              <span className="fw-500">{preview.labor.name}</span>
              <span className="mono tnum" style={{ marginLeft: 'auto' }}>
                {money(
                  preview.labor.price_override ??
                    (preview.labor.hours ?? 0) * preview.labor.rate_snapshot,
                )}
              </span>
            </div>
            <div className="text-xs muted" style={{ marginTop: 4 }}>
              {preview.labor.hours != null ? `${preview.labor.hours} н/ч · ` : ''}{sourceNote}
            </div>
          </div>

          {preview.parts.length === 0 ? (
            <p className="text-sm muted">
              К этой работе запчасти в прайсе не привязаны — добавите вручную.
            </p>
          ) : (
            <div className="col gap-2">
              <div className="row gap-2" style={{ alignItems: 'center' }}>
                <Package size={15} className="muted" />
                <span className="fw-500 text-sm">Запчасти по прайсу</span>
                <span className="text-xs muted" style={{ marginLeft: 'auto' }}>
                  снимите галочку с лишнего
                </span>
              </div>
              {preview.parts.map((p) => (
                <label key={p.part_template_id} className="list-row" data-demo="apply-part" data-id={p.part_template_id} style={{ gridTemplateColumns: 'auto 1fr 88px 100px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={picked.has(p.part_template_id)}
                    onChange={() => onToggle(p.part_template_id)}
                  />
                  <div className="col" style={{ minWidth: 0 }}>
                    <span className="truncate">{p.name}</span>
                    <span className="text-xs muted truncate">
                      {[p.manufacturer, p.catalog_number].filter(Boolean).join(' · ') || '—'}
                      {p.generation_specific ? ' · для этого поколения' : ''}
                    </span>
                  </div>
                  <input
                    className="cell-input ta-r tnum"
                    value={qty[p.part_template_id] ?? ''}
                    onChange={(e) => onQty(p.part_template_id, e.target.value.replace(/[^\d.]/g, ''))}
                    onClick={(e) => e.preventDefault()}
                    inputMode="decimal"
                  />
                  <span className="ta-r mono tnum">
                    {p.unit_price != null ? money(p.unit_price) : '—'}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
