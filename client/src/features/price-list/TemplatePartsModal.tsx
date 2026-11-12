import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { money } from '../../lib/format';
import { Modal, Spinner } from '../../components/ui';
import { PartPicker } from './PartPicker';
import type { PartTemplate, TaskTemplatePart, VehicleGeneration } from '../../lib/types';

/**
 * Which parts a work pulls in — the link that turns a price-list entry into
 * «работа + её запчасти».
 *
 * The «Роль» field is what makes a generation-specific part actually replace the
 * universal one: the R56 filter is a different catalog entry, so the two are
 * only recognised as alternatives when they share a role.
 */
export function TemplatePartsModal({
  templateId,
  templateName,
  generation,
  onClose,
}: {
  /** null = closed. */
  templateId: string | null;
  templateName: string;
  /** The generation currently selected on the price list, if any. */
  generation: VehicleGeneration | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const { data: links, isLoading } = useQuery({
    queryKey: ['template-parts', templateId],
    queryFn: () => api.templateParts(templateId!),
    enabled: !!templateId,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['template-parts', templateId] });
    qc.invalidateQueries({ queryKey: ['price-list'] });
  };

  const mDetach = useMutation({
    mutationFn: (l: TaskTemplatePart) =>
      api.detachTemplatePart(templateId!, l.part_template_id, l.generation_id),
    onSuccess: () => { refresh(); toast('Запчасть отвязана', 'success'); },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const universal = (links ?? []).filter((l) => !l.generation_id);
  const specific = (links ?? []).filter((l) => l.generation_id);
  // What each section already holds — the picker hides these by default.
  const universalIds = useMemo(
    () => new Set((links ?? []).filter((l) => !l.generation_id).map((l) => l.part_template_id)),
    [links],
  );
  const generationIds = useMemo(
    () => new Set(
      (links ?? []).filter((l) => generation && l.generation_id === generation.id).map((l) => l.part_template_id),
    ),
    [links, generation],
  );

  const row = (l: TaskTemplatePart) => (
    <div key={l.id} className="pl-row tp-grid">
      <span className="truncate">
        {l.part_template?.name ?? '—'}
        {l.part_template?.manufacturer ? <span className="faint"> · {l.part_template.manufacturer}</span> : ''}
      </span>
      <span className="truncate muted">{l.slot || <span className="faint">без роли</span>}</span>
      <span className="ta-r mono tnum">{l.qty ?? 1}</span>
      <span className="ta-r mono tnum">
        {l.part_template?.default_price != null ? money(l.part_template.default_price) : '—'}
      </span>
      <span className="row-actions">
        <button
          className="btn btn-ghost btn-icon btn-sm del"
          onClick={() => mDetach.mutate(l)}
          aria-label="Отвязать"
          title="Отвязать от работы"
        >
          <Trash2 size={14} />
        </button>
      </span>
    </div>
  );

  return (
    <Modal
      open={!!templateId}
      onClose={onClose}
      title={`Запчасти для «${templateName}»`}
      width={720}
      footer={<button className="btn btn-default" onClick={onClose}>Готово</button>}
    >
      {isLoading ? (
        <div className="center" style={{ minHeight: 120 }}><Spinner size={20} /></div>
      ) : (
        <div className="col gap-4">
          <p className="text-sm muted">
            Эти запчасти подставятся в смету вместе с работой. Если у двух запчастей
            одна <b>роль</b> («фильтр масляный»), то для своего поколения победит та,
            что задана под него.
          </p>

          <section className="col gap-1">
            <h3 className="text-sm fw-500 tp-title">Для всех поколений</h3>
            <div className="panel">
              <div className="pl-head tp-grid">
                <span>Запчасть</span>
                <span>Роль в работе</span>
                <span className="ta-r">Кол-во</span>
                <span className="ta-r">Цена</span>
                <span />
              </div>
              {universal.length === 0 ? (
                <div className="smeta-empty">Пока ничего не привязано.</div>
              ) : (
                universal.map(row)
              )}
              <AttachForm
                templateId={templateId!}
                generationId={null}
                attachedIds={universalIds}
                onDone={refresh}
              />
            </div>
          </section>

          {generation && (
            <section className="col gap-1">
              <h3 className="text-sm fw-500 tp-title">
                Только для {generation.make} {[generation.model, generation.code].filter(Boolean).join(' ')}
              </h3>
              <div className="panel">
                <div className="pl-head tp-grid">
                  <span>Запчасть</span>
                  <span>Роль в работе</span>
                  <span className="ta-r">Кол-во</span>
                  <span className="ta-r">Цена</span>
                  <span />
                </div>
                {specific.filter((l) => l.generation_id === generation.id).length === 0 ? (
                  <div className="smeta-empty">Своих запчастей у этого поколения нет.</div>
                ) : (
                  specific.filter((l) => l.generation_id === generation.id).map(row)
                )}
                <AttachForm
                  templateId={templateId!}
                  generationId={generation.id}
                  attachedIds={generationIds}
                  onDone={refresh}
                />
              </div>
            </section>
          )}

          {specific.some((l) => l.generation_id !== generation?.id) && (
            <p className="text-xs muted">
              У этой работы есть запчасти и для других поколений — выберите поколение
              в прайс-листе, чтобы их увидеть.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Pick a catalog part, give it a role and a quantity. */
function AttachForm({
  templateId,
  generationId,
  attachedIds,
  onDone,
}: {
  templateId: string;
  generationId: string | null;
  /** Parts already attached in this section. */
  attachedIds: ReadonlySet<string>;
  onDone: () => void;
}) {
  const toast = useToast();
  const [picked, setPicked] = useState<PartTemplate | null>(null);
  const [slot, setSlot] = useState('');
  const [qty, setQty] = useState('1');
  const slotRef = useRef<HTMLInputElement>(null);

  const mAttach = useMutation({
    mutationFn: () =>
      api.attachTemplatePart(templateId, picked!.id, {
        generation_id: generationId,
        qty: qty ? Number(qty) : null,
        slot: slot.trim() || null,
      }),
    onSuccess: () => {
      onDone();
      setPicked(null); setSlot(''); setQty('1');
      toast('Запчасть привязана', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const canAttach = !!picked && !mAttach.isPending;
  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canAttach) mAttach.mutate();
  };

  return (
    <div className="pl-row tp-grid tp-attach">
      <PartPicker
        value={picked}
        excludeIds={attachedIds}
        onChange={(p) => {
          setPicked(p);
          // Part chosen → the next thing to type is its role.
          if (p) slotRef.current?.focus();
        }}
      />
      <input
        ref={slotRef}
        className="cell-input"
        value={slot}
        onChange={(e) => setSlot(e.target.value)}
        onKeyDown={submitOnEnter}
        placeholder="напр. фильтр масляный"
        aria-label="Роль в работе"
      />
      <input
        className="cell-input ta-r tnum"
        value={qty}
        onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ''))}
        onKeyDown={submitOnEnter}
        inputMode="decimal"
        aria-label="Количество"
      />
      <span className="tp-attach-price ta-r mono tnum muted">
        {picked?.default_price != null ? money(picked.default_price) : ''}
      </span>
      <span className="row-actions">
        <button
          type="button"
          className="btn btn-default btn-icon btn-sm"
          onClick={() => mAttach.mutate()}
          disabled={!canAttach}
          aria-label="Привязать запчасть"
          title="Привязать к работе"
        >
          {mAttach.isPending ? <Spinner /> : <Plus size={15} />}
        </button>
      </span>
    </div>
  );
}
