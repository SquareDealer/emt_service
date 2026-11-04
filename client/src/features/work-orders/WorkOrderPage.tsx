import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, isSameDay } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { canAssignMaster } from '../../lib/roles';
import { vehicleLabel } from '../../lib/format';
import type { AppSettings, WorkOrder, WorkOrderStatus } from '../../lib/types';
import { downloadBlob } from '../../lib/download';
import { blockToEvent, dayRangeIso, hasConflict } from '../../lib/schedule';
import type { TimelineCfg, TimelineEvent } from '../../lib/schedule';
import { SELECTION_ID } from '../../components/ScheduleTimeline';
import { ScheduleFields, SlotPickerView, laborMinutes } from './ScheduleFields';
import { WorkOrderView, type BackTarget } from './WorkOrderView';
import { ApplyTemplateModal } from './ApplyTemplateModal';
import { DuplicateModal } from './DuplicateModal';
import { Spinner, EmptyState, Modal } from '../../components/ui';
import { isEmptyWo } from '../../lib/view-helpers';

export function WorkOrderPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: wo, isLoading } = useQuery({
    queryKey: ['work-order', id],
    queryFn: () => api.workOrder(id),
    // Always pull fresh on open: the global staleTime (10s) + edits made from other
    // surfaces (calendar/board drag) would otherwise show a stale time/date here
    // until a full page reload. 'always' refetches on every mount.
    refetchOnMount: 'always',
  });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: api.templates });
  const { user } = useAuth();
  const canAssign = canAssignMaster(user?.role);
  const { data: staff } = useQuery({ queryKey: ['users'], queryFn: api.users, enabled: canAssign });

  // Set as soon as ANY mutation starts, so the unmount cleanup below never drops
  // an order the user actually worked on. onMutate (not onSuccess) is the right
  // hook: the cleanup reads woRef, which is fed from the query cache and still
  // holds the pre-mutation snapshot while a request is in flight — navigating
  // away right after adding the first line used to delete the order.
  const keepRef = useRef(false);
  const keep = () => {
    keepRef.current = true;
  };

  const onSaved = (next: WorkOrder) => {
    qc.setQueryData(['work-order', id], next);
    qc.invalidateQueries({ queryKey: ['work-orders'] });
    qc.invalidateQueries({ queryKey: ['board'] });
    qc.invalidateQueries({ queryKey: ['calendar'] });
  };

  const mUpdate = useMutation({
    mutationFn: (body: Partial<WorkOrder>) => api.updateWorkOrder(id, body),
    // Optimistic: the edit shows in the UI the instant it's made (e.g. the «Запись»
    // time updates the moment you pick it) — no waiting for the round-trip, no
    // dependency on the «Сохранить» button. onSuccess swaps in the server truth;
    // onError rolls back.
    onMutate: async (body: Partial<WorkOrder>) => {
      keep();
      // Write the cache synchronously (before any await) so the controlled inputs
      // re-render to the new value in the same commit — no flicker/revert. Then
      // cancel any in-flight refetch so it can't clobber the optimistic value.
      const prev = qc.getQueryData<WorkOrder>(['work-order', id]);
      if (prev) qc.setQueryData<WorkOrder>(['work-order', id], { ...prev, ...body });
      await qc.cancelQueries({ queryKey: ['work-order', id] });
      return { prev };
    },
    onSuccess: onSaved,
    onError: (e, _body, ctx) => {
      if (ctx?.prev) qc.setQueryData(['work-order', id], ctx.prev);
      toast((e as Error).message, 'error');
    },
  });
  const mStatus = useMutation({
    mutationFn: (s: WorkOrderStatus) => api.setStatus(id, s),
    onMutate: keep,
    onSuccess: onSaved,
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mClose = useMutation({
    mutationFn: () => api.closeWorkOrder(id),
    onMutate: keep,
    onSuccess: (n) => { onSaved(n); toast('Наряд закрыт и зафиксирован', 'success'); },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mPdf = useMutation({
    mutationFn: () => api.workOrderPdf(id),
    onSuccess: (blob) => {
      downloadBlob(blob, `kalkulyaciya-${wo?.doc_number ?? id.slice(0, 8)}.pdf`);
      toast('Документ сформирован', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mOrderPdf = useMutation({
    mutationFn: () => api.workOrderOrderPdf(id),
    onSuccess: (blob) => {
      downloadBlob(blob, `zakaz-naryad-${wo?.order_doc_number ?? id.slice(0, 8)}.pdf`);
      toast('Заказ-наряд сформирован', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mPaid = useMutation({
    mutationFn: (amount: number) => api.setPaid(id, amount),
    onMutate: keep,
    onSuccess: onSaved,
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mAddLabor = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.addLabor(id, body),
    onMutate: keep,
    onSuccess: onSaved,
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mEditLabor = useMutation({
    mutationFn: ({ lineId, body }: { lineId: string; body: Record<string, unknown> }) =>
      api.updateLabor(id, lineId, body),
    onMutate: keep,
    onSuccess: (n) => { onSaved(n); setEditLaborId(null); },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mDelLabor = useMutation({
    mutationFn: (lineId: string) => api.removeLabor(id, lineId),
    onMutate: keep,
    onSuccess: onSaved,
  });
  const mAddPart = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.addPart(id, body),
    onMutate: keep,
    onSuccess: onSaved,
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mEditPart = useMutation({
    mutationFn: ({ lineId, body }: { lineId: string; body: Record<string, unknown> }) =>
      api.updatePart(id, lineId, body),
    onMutate: keep,
    onSuccess: (n) => { onSaved(n); setEditPartId(null); },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mRenameGroup = useMutation({
    mutationFn: ({ key, name }: { key: string; name: string }) => api.renameGroup(id, key, name),
    onMutate: keep,
    onSuccess: onSaved,
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mMoveGroup = useMutation({
    mutationFn: ({ key, direction }: { key: string; direction: 'up' | 'down' }) =>
      api.moveGroup(id, key, direction),
    onMutate: keep,
    onSuccess: onSaved,
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mUngroup = useMutation({
    mutationFn: (key: string) => api.ungroup(id, key),
    onMutate: keep,
    onSuccess: onSaved,
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mDelPart = useMutation({
    mutationFn: (lineId: string) => api.removePart(id, lineId),
    onMutate: keep,
    onSuccess: onSaved,
  });

  // Price-list entry awaiting confirmation before it is added to the estimate.
  const [applyTemplateId, setApplyTemplateId] = useState<string | null>(null);
  const [dupOpen, setDupOpen] = useState(false);

  // Which labor/part line is being edited inline (pencil → row becomes a form).
  const [editLaborId, setEditLaborId] = useState<string | null>(null);
  const [editPartId, setEditPartId] = useState<string | null>(null);

  // Where "назад" goes — set by whoever navigated here (client/board/calendar).
  const navigate = useNavigate();
  const location = useLocation();
  const back: BackTarget =
    (location.state as { back?: BackTarget } | null)?.back ?? { to: '/board', label: 'Доска' };

  // Keep latest WO in a ref so the unmount cleanup can decide to drop an empty one.
  const woRef = useRef<WorkOrder | null>(null);
  useEffect(() => {
    woRef.current = wo ?? null;
  }, [wo]);

  // Abandoned empty naряд (no lines/title/notes/time) is removed when leaving,
  // so the board/calendar don't fill with blank orders.
  useEffect(() => {
    return () => {
      if (!keepRef.current && isEmptyWo(woRef.current)) {
        api
          .deleteWorkOrder(id)
          .then(() => {
            qc.invalidateQueries({ queryKey: ['work-orders'] });
            qc.invalidateQueries({ queryKey: ['board'] });
            qc.invalidateQueries({ queryKey: ['calendar'] });
          })
          .catch(() => {});
      }
    };
  }, [id, qc]);

  const [confirmDel, setConfirmDel] = useState(false);
  const mDelete = useMutation({
    mutationFn: () => api.deleteWorkOrder(id),
    onSuccess: () => {
      keepRef.current = true;
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['client-vehicles'] });
      toast('Наряд удалён', 'success');
      navigate(back.to);
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const handleSave = () => {
    keepRef.current = true; // explicit keep — don't auto-delete even if empty
    toast('Сохранено успешно', 'success');
    navigate(back.to);
  };

  if (isLoading) return <div className="page center" style={{ minHeight: 320 }}><Spinner size={22} /></div>;
  if (!wo) {
    return (
      <div className="page">
        <EmptyState title="Заказ-наряд не найден" action={<Link className="btn btn-default" to={back.to}>{back.label}</Link>} />
      </div>
    );
  }

  const closed = wo.status === 'closed';

  return (
    <>
      <WorkOrderView
        wo={wo}
        back={back}
        templates={templates}
        staff={staff}
        canAssign={canAssign}
        laborRate={settings?.labor_rate ?? 2000}
        editLaborId={editLaborId}
        editPartId={editPartId}
        pending={{
          status: mStatus.isPending,
          close: mClose.isPending,
          pdf: mPdf.isPending,
          orderPdf: mOrderPdf.isPending,
          addLabor: mAddLabor.isPending,
          editLabor: mEditLabor.isPending,
          addPart: mAddPart.isPending,
          editPart: mEditPart.isPending,
          delete: mDelete.isPending,
        }}
        scheduleSlot={
          <ScheduleSection
            wo={wo}
            settings={settings}
            disabled={closed}
            onChange={(body) => mUpdate.mutate(body)}
          />
        }
        onUpdate={(body) => mUpdate.mutate(body)}
        onStatus={(s) => mStatus.mutate(s)}
        onCloseOrder={() => mClose.mutate()}
        onPdf={() => mPdf.mutate()}
        onOrderPdf={() => mOrderPdf.mutate()}
        onPaid={(v) => mPaid.mutate(v)}
        onAddLabor={(b) => mAddLabor.mutate(b)}
        onEditLabor={(lineId, b) => mEditLabor.mutate({ lineId, body: b })}
        onDelLabor={(lineId) => mDelLabor.mutate(lineId)}
        onAddPart={(b) => mAddPart.mutate(b)}
        onEditPart={(lineId, b) => mEditPart.mutate({ lineId, body: b })}
        onDelPart={(lineId) => mDelPart.mutate(lineId)}
        onRenameGroup={(key, currentName) => {
          const name = window.prompt('Название блока', currentName);
          if (name?.trim()) mRenameGroup.mutate({ key, name: name.trim() });
        }}
        onMoveGroup={(key, direction) => mMoveGroup.mutate({ key, direction })}
        onUngroup={(key) => mUngroup.mutate(key)}
        onPickTemplate={(templateId) => { keep(); setApplyTemplateId(templateId); }}
        onDuplicate={() => { keep(); setDupOpen(true); }}
        onAskDelete={() => setConfirmDel(true)}
        onSave={handleSave}
        onStartEditLabor={(lineId) => { setEditLaborId(lineId); if (lineId !== null) setEditPartId(null); }}
        onStartEditPart={(lineId) => { setEditPartId(lineId); if (lineId !== null) setEditLaborId(null); }}
      />

      <Modal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Удалить заказ-наряд?"
        width={420}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmDel(false)} disabled={mDelete.isPending}>Отмена</button>
            <button className="btn btn-danger" onClick={() => mDelete.mutate()} disabled={mDelete.isPending}>
              {mDelete.isPending ? <Spinner /> : <Trash2 size={15} />} Удалить
            </button>
          </>
        }
      >
        <p className="text-sm">
          Наряд{wo.title ? ` «${wo.title}»` : ''} и все его строки сметы будут удалены без возможности
          восстановления.
        </p>
      </Modal>

      <DuplicateModal open={dupOpen} wo={wo} onClose={() => setDupOpen(false)} />

      <ApplyTemplateModal
        workOrderId={id}
        templateId={applyTemplateId}
        onClose={() => setApplyTemplateId(null)}
        onApplied={onSaved}
      />
    </>
  );
}

/** «Запись» в сводке наряда: дата/время + длительность + визуальный выбор слота. */
function ScheduleSection({
  wo,
  settings,
  disabled,
  onChange,
}: {
  wo: WorkOrder;
  settings: AppSettings | undefined;
  disabled: boolean;
  onChange: (body: Partial<WorkOrder>) => void;
}) {
  const toast = useToast();
  const [pickOpen, setPickOpen] = useState(false);
  const [pickerDay, setPickerDay] = useState<Date>(() =>
    wo.scheduled_at ? new Date(wo.scheduled_at) : new Date(),
  );

  const defaultDur = settings?.default_appointment_min ?? 60;
  const cfg: TimelineCfg = {
    startHour: settings?.working_hours_start ?? 8,
    endHour: settings?.working_hours_end ?? 20,
    slotMin: settings?.slot_minutes ?? 30,
    pxPerMin: 1,
  };

  const dayRange = useMemo(() => dayRangeIso([pickerDay]), [pickerDay]);
  const { data: dayBookings } = useQuery({
    queryKey: ['calendar', dayRange.from, dayRange.to],
    queryFn: () => api.calendar(dayRange.from, dayRange.to),
    enabled: pickOpen,
  });
  // Reserved time counts as busy here as well.
  const { data: dayBlocks } = useQuery({
    queryKey: ['calendar', 'blocks', dayRange.from, dayRange.to],
    queryFn: () => api.calendarBlocks(dayRange.from, dayRange.to),
    enabled: pickOpen,
  });

  const busyEvents: TimelineEvent[] = useMemo(
    () => [
      ...(dayBookings ?? [])
        .filter((w) => w.scheduled_at && w.id !== wo.id)
        .map((w) => ({
          id: w.id,
          start: new Date(w.scheduled_at as string),
          durationMin: w.scheduled_duration_min ?? defaultDur,
          status: w.status,
          title: w.title?.trim() || `${vehicleLabel(w.vehicle)} ${w.vehicle?.plate || ''}`.trim(),
          subtitle: w.vehicle?.client?.full_name ?? '',
        })),
      ...(dayBlocks ?? []).map(blockToEvent),
    ],
    [dayBookings, dayBlocks, wo.id, defaultDur],
  );

  const dur = wo.scheduled_duration_min ?? defaultDur;
  const fitMinutes = laborMinutes(wo);

  const selection: TimelineEvent | null =
    wo.scheduled_at && isSameDay(new Date(wo.scheduled_at), pickerDay)
      ? {
          id: SELECTION_ID,
          start: new Date(wo.scheduled_at),
          durationMin: dur,
          kind: 'selection',
          title: 'Эта запись',
        }
      : null;

  const warn = (proposed: TimelineEvent) => {
    if (hasConflict(proposed, busyEvents)) toast('Пересечение с другой записью', 'info');
  };

  const setStart = (iso: string | null) => {
    if (iso) warn({ id: wo.id, start: new Date(iso), durationMin: dur });
    onChange({ scheduled_at: iso });
    toast(iso ? 'Время записи изменено' : 'Запись снята', 'success');
  };
  const setDuration = (mins: number) => {
    if (wo.scheduled_at) warn({ id: wo.id, start: new Date(wo.scheduled_at), durationMin: mins });
    onChange({ scheduled_duration_min: mins });
  };
  const onSelectSlot = (iso: string, d: number) => {
    warn({ id: wo.id, start: new Date(iso), durationMin: d });
    onChange({ scheduled_at: iso, scheduled_duration_min: d });
  };
  // ScheduleFields emits exactly one field per change.
  const onFieldsChange = (b: Partial<WorkOrder>) => {
    if ('scheduled_at' in b) setStart(b.scheduled_at ?? null);
    else if (b.scheduled_duration_min != null) setDuration(b.scheduled_duration_min);
  };

  return (
    <>
      <ScheduleFields
        wo={wo}
        defaultDurMin={defaultDur}
        disabled={disabled}
        onChange={onFieldsChange}
        onOpenPicker={() => {
          setPickerDay(wo.scheduled_at ? new Date(wo.scheduled_at) : new Date());
          setPickOpen(true);
        }}
        onFit={() => setDuration(fitMinutes)}
      />

      <Modal
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        title="Выбор слота"
        width={520}
        footer={<button className="btn btn-primary" onClick={() => setPickOpen(false)}>Готово</button>}
      >
        <SlotPickerView
          day={pickerDay}
          events={busyEvents}
          cfg={cfg}
          selection={selection}
          defaultDurationMin={defaultDur}
          onPrevDay={() => setPickerDay((d) => addDays(d, -1))}
          onToday={() => setPickerDay(new Date())}
          onNextDay={() => setPickerDay((d) => addDays(d, 1))}
          onSelect={onSelectSlot}
        />
      </Modal>
    </>
  );
}
