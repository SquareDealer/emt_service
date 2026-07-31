import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Wrench, Package } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { money } from '../../lib/format';
import { Modal, Spinner } from '../../components/ui';
import type { WorkOrder } from '../../lib/types';

/**
 * Confirmation sheet for «применить позицию прайса».
 *
 * Deliberately not fire-and-forget: a template brings its own parts, and a part
 * left in by accident becomes a wrong quote handed to the customer. The
 * receptionist sees exactly what will be added and unticks what is not needed.
 */
export function ApplyTemplateModal({
  workOrderId,
  templateId,
  onClose,
  onApplied,
}: {
  workOrderId: string;
  /** null = closed. */
  templateId: string | null;
  onClose: () => void;
  onApplied: (wo: WorkOrder) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState<Record<string, string>>({});

  const { data: preview, isLoading } = useQuery({
    queryKey: ['template-preview', workOrderId, templateId],
    queryFn: () => api.templatePreview(workOrderId, templateId!),
    enabled: !!templateId,
  });

  useEffect(() => {
    if (!preview) return;
    setPicked(new Set(preview.parts.filter((p) => p.is_default).map((p) => p.part_template_id)));
    setQty(Object.fromEntries(preview.parts.map((p) => [p.part_template_id, String(p.qty)])));
  }, [preview]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const total = useMemo(() => {
    if (!preview) return 0;
    const labor =
      preview.labor.price_override ??
      (preview.labor.hours ?? 0) * preview.labor.rate_snapshot;
    const parts = preview.parts
      .filter((p) => picked.has(p.part_template_id))
      .reduce((s, p) => s + (Number(qty[p.part_template_id]) || 0) * (p.unit_price ?? 0), 0);
    return labor + parts;
  }, [preview, picked, qty]);

  const mApply = useMutation({
    mutationFn: () =>
      api.applyTemplate(workOrderId, {
        template_id: templateId!,
        part_template_ids: [...picked],
        qty: Object.fromEntries(
          Object.entries(qty)
            .filter(([id]) => picked.has(id))
            .map(([id, v]) => [id, Number(v) || 1]),
        ),
      }),
    onSuccess: (wo) => {
      qc.invalidateQueries({ queryKey: ['work-order', workOrderId] });
      onApplied(wo);
      toast('Блок добавлен в смету', 'success');
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const sourceNote =
    preview?.price_source === 'generation'
      ? 'цена этого поколения'
      : preview?.price_source === 'template'
        ? 'базовая цена — для этого поколения не задана'
        : 'цена не задана, посчитается по ставке';

  return (
    <Modal
      open={!!templateId}
      onClose={onClose}
      title="Добавить в смету"
      width={620}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={mApply.isPending}>Отмена</button>
          <button
            className="btn btn-primary"
            onClick={() => mApply.mutate()}
            disabled={!preview || mApply.isPending}
          >
            {mApply.isPending ? <Spinner /> : <Check size={16} />}
            Добавить — {money(total)}
          </button>
        </>
      }
    >
      {isLoading || !preview ? (
        <div className="center" style={{ minHeight: 120 }}><Spinner size={20} /></div>
      ) : (
        <div className="col gap-4">
          <div className="panel" style={{ padding: 'var(--sp-3)' }}>
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
                <label key={p.part_template_id} className="list-row" style={{ gridTemplateColumns: 'auto 1fr 88px 100px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={picked.has(p.part_template_id)}
                    onChange={() => toggle(p.part_template_id)}
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
                    onChange={(e) =>
                      setQty((q) => ({ ...q, [p.part_template_id]: e.target.value.replace(/[^\d.]/g, '') }))
                    }
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
