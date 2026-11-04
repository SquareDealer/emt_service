import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { templateTotal } from '../../lib/view-helpers';
import { ApplyTemplateView } from './ApplyTemplateView';
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

  const total = useMemo(() => templateTotal(preview, picked, qty), [preview, picked, qty]);

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

  return (
    <ApplyTemplateView
      open={!!templateId}
      preview={preview}
      loading={isLoading}
      picked={picked}
      qty={qty}
      total={total}
      pending={mApply.isPending}
      onToggle={toggle}
      onQty={(id, v) => setQty((q) => ({ ...q, [id]: v }))}
      onConfirm={() => mApply.mutate()}
      onClose={onClose}
    />
  );
}
