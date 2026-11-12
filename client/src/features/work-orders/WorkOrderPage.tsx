import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, isSameDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  X,
  Wrench,
  Package,
  Lock,
  Unlock,
  Check,
  Car,
  CalendarClock,
  CalendarSearch,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Clock,
  Save,
  StickyNote,
  MessageSquareWarning,
  ClipboardList,
  Copy,
  FileDown,
  UserCog,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { canAssignMaster } from '../../lib/roles';
import {
  money,
  laborGross,
  laborTotal,
  partGross,
  partTotal,
  lineDiscount,
  lineDiscountTotal,
  estimateGroups,
  subtotal,
  discountAmount,
  dateTime,
  vehicleLabel,
} from '../../lib/format';
import { STATUS_LABEL, STATUS_ORDER } from '../../lib/types';
import type { AppSettings, LaborLine, PartLine, PartUnit, User, WorkOrder, WorkOrderStatus, DiscountType } from '../../lib/types';
import type { EstimateGroup } from '../../lib/format';
import { downloadBlob } from '../../lib/download';
import { blockToEvent, dayRangeIso, hasConflict } from '../../lib/schedule';
import type { TimelineCfg, TimelineEvent } from '../../lib/schedule';
import { ScheduleTimeline, SELECTION_ID } from '../../components/ScheduleTimeline';
import { ApplyTemplateModal } from './ApplyTemplateModal';
import { DuplicateModal } from './DuplicateModal';
import { Spinner, StatusPill, EmptyState, Modal } from '../../components/ui';
import './wo.css';

interface BackTarget { to: string; label: string }

function isEmptyWo(w: WorkOrder | null): boolean {
  return (
    !!w &&
    w.status === 'scheduled' &&
    (w.labor_lines?.length ?? 0) === 0 &&
    (w.part_lines?.length ?? 0) === 0 &&
    !w.title?.trim() &&
    !w.notes?.trim() &&
    !w.complaint?.trim() &&
    !w.recommendation?.trim() &&
    !w.scheduled_at &&
    !w.discount_type
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

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
    // Closing / reopening an order changes the client's deal history.
    qc.invalidateQueries({ queryKey: ['clients'] });
    qc.invalidateQueries({ queryKey: ['client'] });
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
  // Blocks are what «группировка работ вместе с запчастями» produces; both
  // panels label their sections from the same list so the two agree.
  const groups = estimateGroups(wo);
  const groupOf = (key: string | null) => groups.find((g) => g.key === key);
  const startsGroup = (
    arr: { group_key: string | null }[],
    i: number,
  ) => !!arr[i].group_key && (i === 0 || arr[i - 1].group_key !== arr[i].group_key);

  const sub = subtotal(wo);
  // Two separate figures: the order discount applies to what is left after the
  // per-line ones, so showing a single «Скидка» would not add up.
  const lineDisc = lineDiscountTotal(wo);
  const disc = discountAmount(wo);
  const total = closed ? wo.total_frozen ?? wo.total_cached : wo.total_cached;
  const client = wo.vehicle?.client;
  const rate = settings?.labor_rate ?? 2000;

  return (
    <div className="page page-wide wo-page">
      <Link to={back.to} className="back-link"><ArrowLeft size={15} /> {back.label}</Link>

      <header className="wo-head">
        <div className="grow" style={{ minWidth: 0 }}>
          <input
            className="wo-title-input"
            defaultValue={wo.title ?? ''}
            placeholder="Заказ-наряд без названия"
            disabled={closed}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (wo.title ?? '')) mUpdate.mutate({ title: v || null });
            }}
          />
          <div className="row gap-3 wrap text-sm muted" style={{ marginTop: 4 }}>
            {client && (
              <Link to={`/clients/${client.id}`} className="row gap-1 wo-client">
                {client.full_name}
              </Link>
            )}
            <span className="row gap-1"><Car size={14} /> {vehicleLabel(wo.vehicle)} <span className="mono">{wo.vehicle?.plate || wo.vehicle?.vin || ''}</span></span>
          </div>
        </div>
        <div className="row gap-2">
          {closed ? (
            <>
              <StatusPill status="closed" />
              <button className="btn btn-default" onClick={() => mStatus.mutate('in_progress')} disabled={mStatus.isPending}>
                <Unlock size={15} /> Открыть заново
              </button>
            </>
          ) : (
            <select
              className="select wo-status-select"
              value={wo.status}
              onChange={(e) => mStatus.mutate(e.target.value as WorkOrderStatus)}
              aria-label="Статус"
            >
              {STATUS_ORDER.filter((s) => s !== 'closed').map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          )}
          <button
            className="btn btn-danger btn-icon"
            onClick={() => setConfirmDel(true)}
            disabled={mDelete.isPending}
            aria-label="Удалить наряд"
            title="Удалить наряд"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      {closed && (
        <div className="wo-frozen-banner">
          <Lock size={14} />
          Наряд закрыт {wo.closed_at ? `· ${dateTime(wo.closed_at)}` : ''}. Смета зафиксирована и не меняется при изменении ставки.
        </div>
      )}

      <div className="wo-grid">
        <div className="col gap-4" style={{ minWidth: 0 }}>
          {/* labor */}
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title"><Wrench size={16} className="muted" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Работы</h2>
              {!closed && templates && templates.length > 0 && (
                <select
                  className="select btn-sm"
                  style={{ width: 'auto', height: '1.875rem' }}
                  value=""
                  onChange={(e) => { if (e.target.value) { keep(); setApplyTemplateId(e.target.value); } e.target.value = ''; }}
                  aria-label="Добавить из шаблона"
                >
                  <option value="">+ Из прайса…</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </div>

            <div className="smeta">
              <div className="smeta-head labor-grid">
                <span>Операция</span>
                <span className="ta-r">Часы</span>
                <span className="ta-r">Ставка</span>
                <span className="ta-r">Цена</span>
                <span className="ta-r">Скидка</span>
                <span className="ta-r">Сумма</span>
                <span />
              </div>
              {(wo.labor_lines ?? []).length === 0 && (
                <div className="smeta-empty">Нет работ. {closed ? '' : 'Добавьте операцию ниже или из шаблона.'}</div>
              )}
              {(wo.labor_lines ?? []).map((l, i, arr) => (
                <Fragment key={l.id}>
                  {startsGroup(arr, i) && (
                    <GroupHeader
                      group={groupOf(l.group_key)!}
                      controls
                      disabled={closed}
                      onRename={(name) => mRenameGroup.mutate({ key: l.group_key!, name })}
                      onMove={(direction) => mMoveGroup.mutate({ key: l.group_key!, direction })}
                      onUngroup={() => mUngroup.mutate(l.group_key!)}
                    />
                  )}
                  {!closed && editLaborId === l.id ? (
                  <LaborLineForm
                    key={l.id}
                    defaultRate={rate}
                    initial={l}
                    busy={mEditLabor.isPending}
                    onSubmit={(b) => mEditLabor.mutate({ lineId: l.id, body: b })}
                    onCancel={() => setEditLaborId(null)}
                  />
                ) : (
                  <div className="smeta-row labor-grid">
                    <span className="truncate">{l.name}</span>
                    <span className="ta-r mono tnum muted">{l.hours ?? '—'}</span>
                    <span className="ta-r mono tnum muted">{money(l.rate_snapshot)}</span>
                    <span className="ta-r mono tnum">{l.price_override != null ? <span className="ovr">{money(l.price_override)}</span> : <span className="faint">—</span>}</span>
                    <span className="ta-r mono tnum">{lineDiscountCell(laborGross(l), l)}</span>
                    <span className="ta-r mono tnum fw-500">{money(laborTotal(l))}</span>
                    {!closed ? (
                      <span className="row-actions">
                        <button className="btn btn-ghost btn-icon btn-sm edit" onClick={() => { setEditLaborId(l.id); setEditPartId(null); }} aria-label="Изменить"><Pencil size={14} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm del" onClick={() => mDelLabor.mutate(l.id)} aria-label="Удалить"><Trash2 size={14} /></button>
                      </span>
                    ) : <span />}
                  </div>
                  )}
                </Fragment>
              ))}
              {!closed && <LaborLineForm defaultRate={rate} onSubmit={(b) => mAddLabor.mutate(b)} busy={mAddLabor.isPending} />}
            </div>
          </section>

          {/* parts */}
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title"><Package size={16} className="muted" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Запчасти</h2>
            </div>
            <div className="smeta">
              <div className="smeta-head part-grid">
                <span>Деталь</span>
                <span className="ta-r">Кол-во</span>
                <span className="ta-r">Цена</span>
                <span className="ta-r">Скидка</span>
                <span className="ta-r">Сумма</span>
                <span />
              </div>
              {(wo.part_lines ?? []).length === 0 && (
                <div className="smeta-empty">Нет запчастей. {closed ? '' : 'Добавьте деталь ниже.'}</div>
              )}
              {(wo.part_lines ?? []).map((p, i, arr) => (
                <Fragment key={p.id}>
                  {startsGroup(arr, i) && (
                    <GroupHeader
                      group={groupOf(p.group_key)!}
                      controls={false}
                      disabled={closed}
                      onRename={() => undefined}
                      onMove={() => undefined}
                      onUngroup={() => undefined}
                    />
                  )}
                  {!closed && editPartId === p.id ? (
                  <PartLineForm
                    key={p.id}
                    initial={p}
                    busy={mEditPart.isPending}
                    onSubmit={(b) => mEditPart.mutate({ lineId: p.id, body: b })}
                    onCancel={() => setEditPartId(null)}
                  />
                ) : (
                  <div className="smeta-row part-grid">
                    <span className="truncate">
                      {p.name}
                      {p.manufacturer ? <span className="faint"> · {p.manufacturer}</span> : ''}
                      {p.catalog_number ? <span className="mono faint"> · {p.catalog_number}</span> : ''}
                    </span>
                    <span className="ta-r mono tnum muted">{fmtQty(p.qty)} {unitLabel(p.unit)}</span>
                    <span className="ta-r mono tnum muted">{money(p.unit_price)}</span>
                    <span className="ta-r mono tnum">{lineDiscountCell(partGross(p), p)}</span>
                    <span className="ta-r mono tnum fw-500">{money(partTotal(p))}</span>
                    {!closed ? (
                      <span className="row-actions">
                        <button className="btn btn-ghost btn-icon btn-sm edit" onClick={() => { setEditPartId(p.id); setEditLaborId(null); }} aria-label="Изменить"><Pencil size={14} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm del" onClick={() => mDelPart.mutate(p.id)} aria-label="Удалить"><Trash2 size={14} /></button>
                      </span>
                    ) : <span />}
                  </div>
                  )}
                </Fragment>
              ))}
              {!closed && <PartLineForm onSubmit={(b) => mAddPart.mutate(b)} busy={mAddPart.isPending} />}
            </div>
          </section>

          {/* complaint — причина обращения (prints in order PDF) */}
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title"><MessageSquareWarning size={16} className="muted" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Причина обращения</h2>
            </div>
            <div style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
              <textarea
                className="textarea"
                defaultValue={wo.complaint ?? ''}
                key={wo.id + (wo.complaint ?? '')}
                placeholder="Жалоба клиента, с чем приехал…"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (wo.complaint ?? '')) mUpdate.mutate({ complaint: v || null });
                }}
              />
            </div>
          </section>

          {/* recommendation — рекомендации клиенту (prints in order PDF) */}
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title"><ClipboardList size={16} className="muted" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Рекомендации клиенту</h2>
            </div>
            <div style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
              <textarea
                className="textarea"
                defaultValue={wo.recommendation ?? ''}
                key={wo.id + (wo.recommendation ?? '')}
                placeholder="Что советуем сделать в следующий раз…"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (wo.recommendation ?? '')) mUpdate.mutate({ recommendation: v || null });
                }}
              />
            </div>
          </section>

          {/* notes */}
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title"><StickyNote size={16} className="muted" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Заметки</h2>
            </div>
            <div style={{ padding: 'var(--sp-3) var(--sp-4)' }}>
              <textarea
                className="textarea"
                defaultValue={wo.notes ?? ''}
                key={wo.id + (wo.notes ?? '')}
                placeholder="Комментарий по работе, договорённости с клиентом, что проверить…"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (wo.notes ?? '')) mUpdate.mutate({ notes: v || null });
                }}
              />
            </div>
          </section>
        </div>

        {/* summary */}
        <aside className="wo-summary">
          <div className="panel summary-panel">
            <MasterControl
              wo={wo}
              staff={staff}
              canAssign={canAssign}
              disabled={closed}
              onChange={(v) => mUpdate.mutate({ assigned_master_id: v })}
            />

            <ScheduleSection
              wo={wo}
              settings={settings}
              disabled={closed}
              onChange={(body) => mUpdate.mutate(body)}
            />

            <div className="sum-div" />

            <div className="sum-line"><span className="muted">Работы + запчасти</span><span className="mono tnum">{money(sub)}</span></div>

            <DiscountControl wo={wo} disabled={closed} onChange={(t, v) => mUpdate.mutate({ discount_type: t, discount_value: v })} />

            {lineDisc > 0 && (
              <div className="sum-line"><span className="muted">Скидки по строкам</span><span className="mono tnum" style={{ color: 'var(--danger)' }}>−{money(lineDisc)}</span></div>
            )}
            {disc > 0 && (
              <div className="sum-line"><span className="muted">Скидка наряда</span><span className="mono tnum" style={{ color: 'var(--danger)' }}>−{money(disc)}</span></div>
            )}

            <div className="sum-div" />
            <div className="sum-total">
              <span>Итого</span>
              <span className="mono tnum">{money(total)}</span>
            </div>

            <PaidControl wo={wo} total={total} onChange={(v) => mPaid.mutate(v)} />

            <div className="col gap-2">
              {!closed ? (
                <>
                  <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSave}>
                    <Save size={15} /> Сохранить
                  </button>
                  <button className="btn btn-default" style={{ width: '100%' }} onClick={() => mClose.mutate()} disabled={mClose.isPending}>
                    {mClose.isPending ? <Spinner /> : <Lock size={15} />} Закрыть и зафиксировать
                  </button>
                </>
              ) : (
                <>
                  <div className="frozen-chip"><Check size={14} /> Зафиксировано {money(wo.total_frozen)}</div>
                  <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => mPdf.mutate()} disabled={mPdf.isPending}>
                    {mPdf.isPending ? <Spinner /> : <FileDown size={15} />} Сгенерировать отчёт
                  </button>
                </>
              )}
              <button className="btn btn-default" style={{ width: '100%' }} onClick={() => { keep(); setDupOpen(true); }}>
                <Copy size={15} /> Копировать наряд
              </button>
              <button className="btn btn-default" style={{ width: '100%' }} onClick={() => mOrderPdf.mutate()} disabled={mOrderPdf.isPending}>
                {mOrderPdf.isPending ? <Spinner /> : <FileDown size={15} />} Заказ-наряд (PDF)
              </button>
            </div>
          </div>
        </aside>
      </div>

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
    </div>
  );
}

/** Display a part qty without trailing zeros (1.500 → "1.5", 2.000 → "2"). */
function fmtQty(n: number): string {
  return String(n);
}
function unitLabel(u: PartUnit): string {
  return u === 'l' ? 'л' : 'шт';
}

/** Add- and edit-form for a labor line (same grid). Edit mode = `onCancel` given. */
/**
 * Per-line discount editor: amount + a %/₽ picker, mirroring the qty/unit cell.
 * Clearing the amount clears the discount entirely, so there is no way to leave
 * a dangling type behind.
 */
/**
 * Block heading inside the estimate. Blocks are the same construct in both
 * panels, so the works panel owns the controls and the parts panel only labels
 * its section — repeating rename/move in two places would be two ways to do one
 * thing.
 */
function GroupHeader({
  group,
  controls,
  disabled,
  onRename,
  onMove,
  onUngroup,
}: {
  group: EstimateGroup;
  controls: boolean;
  disabled: boolean;
  onRename: (name: string) => void;
  onMove: (direction: 'up' | 'down') => void;
  onUngroup: () => void;
}) {
  return (
    <div className="smeta-group">
      <span className="smeta-group-name truncate">{group.name}</span>
      <span className="mono tnum fw-500">{money(group.total)}</span>
      {controls && !disabled && (
        <span className="row-actions">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onMove('up')} aria-label="Выше" title="Выше">
            <ChevronUp size={14} />
          </button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onMove('down')} aria-label="Ниже" title="Ниже">
            <ChevronDown size={14} />
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={() => {
              const name = window.prompt('Название блока', group.name);
              if (name?.trim()) onRename(name.trim());
            }}
            aria-label="Переименовать блок"
            title="Переименовать блок"
          >
            <Pencil size={14} />
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm del"
            onClick={onUngroup}
            aria-label="Разгруппировать"
            title="Разгруппировать — строки останутся"
          >
            <X size={14} />
          </button>
        </span>
      )}
    </div>
  );
}

function LineDiscountCell({
  type,
  value,
  onType,
  onValue,
}: {
  type: DiscountType;
  value: string;
  onType: (t: DiscountType) => void;
  onValue: (v: string) => void;
}) {
  return (
    <div className="disc-cell">
      <input
        className="cell-input ta-r tnum"
        value={value}
        placeholder="скидка"
        onChange={(e) => onValue(e.target.value.replace(/[^\d.]/g, ''))}
        inputMode="decimal"
      />
      <select
        className="unit-select"
        value={type}
        onChange={(e) => onType(e.target.value as DiscountType)}
        aria-label="Тип скидки"
      >
        <option value="percent">%</option>
        <option value="fixed">₽</option>
      </select>
    </div>
  );
}

/** The discount actually taken off a line, for the read-only row. */
function lineDiscountCell(gross: number, line: { discount_type: DiscountType | null; discount_value: number | null }) {
  const d = lineDiscount(gross, line);
  if (d <= 0) return <span className="faint">—</span>;
  const suffix = line.discount_type === 'percent' ? ` (${line.discount_value}%)` : '';
  return <span className="disc">−{money(d)}{suffix}</span>;
}

function LaborLineForm({
  defaultRate,
  initial,
  onSubmit,
  onCancel,
  busy,
}: {
  defaultRate: number;
  initial?: LaborLine;
  onSubmit: (b: Record<string, unknown>) => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  const editMode = !!onCancel;
  const [name, setName] = useState(initial?.name ?? '');
  const [hours, setHours] = useState(initial?.hours != null ? String(initial.hours) : '');
  const [rate, setRate] = useState(String(initial?.rate_snapshot ?? defaultRate));
  const [override, setOverride] = useState(initial?.price_override != null ? String(initial.price_override) : '');
  const [discType, setDiscType] = useState<DiscountType>(initial?.discount_type ?? 'percent');
  const [discValue, setDiscValue] = useState(initial?.discount_value != null ? String(initial.discount_value) : '');
  useEffect(() => { if (!editMode) setRate(String(defaultRate)); }, [defaultRate, editMode]);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      // edit: empty clears the field (null); add: empty omits it (undefined → defaults)
      hours: hours ? Number(hours) : editMode ? null : undefined,
      rate_snapshot: rate ? Number(rate) : undefined,
      price_override: override ? Number(override) : editMode ? null : undefined,
      // An empty amount clears the discount rather than leaving a stale type.
      discount_type: discValue ? discType : null,
      discount_value: discValue ? Number(discValue) : null,
    });
    if (!editMode) { setName(''); setHours(''); setOverride(''); setRate(String(defaultRate)); setDiscValue(''); }
  };

  return (
    <div className="smeta-add labor-grid">
      <input className="cell-input" value={name} placeholder="Напр. Замена масла" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoFocus={editMode} />
      <input className="cell-input ta-r tnum" value={hours} placeholder="ч" onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
      <input className="cell-input ta-r tnum" value={rate} placeholder="ставка" onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
      <input className="cell-input ta-r tnum" value={override} placeholder="фикс." onChange={(e) => setOverride(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
      <LineDiscountCell type={discType} value={discValue} onType={setDiscType} onValue={setDiscValue} />
      <span />
      <span className="row-actions">
        {onCancel && (
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onCancel} disabled={busy} aria-label="Отмена"><X size={15} /></button>
        )}
        <button className="btn btn-default btn-icon btn-sm" onClick={submit} disabled={!name.trim() || busy} aria-label={editMode ? 'Сохранить' : 'Добавить работу'}>
          {busy ? <Spinner /> : editMode ? <Check size={15} /> : <Plus size={15} />}
        </button>
      </span>
    </div>
  );
}

/** Add- and edit-form for a part line, with шт/л unit + fractional liters. */
function PartLineForm({
  initial,
  onSubmit,
  onCancel,
  busy,
}: {
  initial?: PartLine;
  onSubmit: (b: Record<string, unknown>) => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  const editMode = !!onCancel;
  const [name, setName] = useState(initial?.name ?? '');
  const [cat, setCat] = useState(initial?.catalog_number ?? '');
  const [brand, setBrand] = useState(initial?.manufacturer ?? '');
  const [unit, setUnit] = useState<PartUnit>(initial?.unit ?? 'pcs');
  const [qty, setQty] = useState(initial ? fmtQty(initial.qty) : '1');
  const [price, setPrice] = useState(initial?.unit_price != null ? String(initial.unit_price) : '');
  const [discType, setDiscType] = useState<DiscountType>(initial?.discount_type ?? 'percent');
  const [discValue, setDiscValue] = useState(initial?.discount_value != null ? String(initial.discount_value) : '');

  const onQty = (v: string, u: PartUnit) =>
    u === 'l'
      ? v.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
      : v.replace(/\D/g, '');

  const submit = () => {
    if (!name.trim() || !price) return;
    onSubmit({
      name: name.trim(),
      catalog_number: cat.trim() || (editMode ? null : undefined),
      manufacturer: brand.trim() || (editMode ? null : undefined),
      qty: qty ? Number(qty) : 1,
      unit,
      unit_price: Number(price),
      discount_type: discValue ? discType : null,
      discount_value: discValue ? Number(discValue) : null,
    });
    if (!editMode) { setName(''); setCat(''); setBrand(''); setUnit('pcs'); setQty('1'); setPrice(''); setDiscValue(''); }
  };

  return (
    <div className="smeta-add part-grid">
      <div className="part-name-cell">
        <input className="cell-input grow" value={name} placeholder="Напр. Масляный фильтр" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoFocus={editMode} />
        <input className="cell-input brand" value={brand} placeholder="Производитель" onChange={(e) => setBrand(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <input className="cell-input art" value={cat} placeholder="Артикул" onChange={(e) => setCat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </div>
      <div className="qty-cell">
        <input className="cell-input ta-r tnum" value={qty} placeholder="кол-во" onChange={(e) => setQty(onQty(e.target.value, unit))} inputMode="decimal" />
        <select className="unit-select" value={unit} onChange={(e) => { const u = e.target.value as PartUnit; setUnit(u); setQty((q) => onQty(q, u)); }} aria-label="Единица">
          <option value="pcs">шт</option>
          <option value="l">л</option>
        </select>
      </div>
      <input className="cell-input ta-r tnum" value={price} placeholder="цена" onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
      <LineDiscountCell type={discType} value={discValue} onType={setDiscType} onValue={setDiscValue} />
      <span />
      <span className="row-actions">
        {onCancel && (
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onCancel} disabled={busy} aria-label="Отмена"><X size={15} /></button>
        )}
        <button className="btn btn-default btn-icon btn-sm" onClick={submit} disabled={!name.trim() || !price || busy} aria-label={editMode ? 'Сохранить' : 'Добавить запчасть'}>
          {busy ? <Spinner /> : editMode ? <Check size={15} /> : <Plus size={15} />}
        </button>
      </span>
    </div>
  );
}

/** Закреплённый мастер: селектор для админа/приёмщика, имя read-only для мастера. */
function MasterControl({
  wo,
  staff,
  canAssign,
  disabled,
  onChange,
}: {
  wo: WorkOrder;
  staff: User[] | undefined;
  canAssign: boolean;
  disabled: boolean;
  onChange: (masterId: string | null) => void;
}) {
  if (!canAssign) {
    if (!wo.assigned_master) return null;
    return (
      <>
        <div className="sum-line">
          <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserCog size={14} /> Мастер
          </span>
          <span className="fw-500">{wo.assigned_master.name}</span>
        </div>
        <div className="sum-div" />
      </>
    );
  }
  const assignable = (staff ?? []).filter((u) => u.is_active);
  return (
    <>
      <div className="sum-line">
        <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <UserCog size={14} /> Мастер
        </span>
        <select
          className="select btn-sm"
          style={{ width: 'auto', maxWidth: 190, height: '1.875rem' }}
          value={wo.assigned_master_id ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)}
          aria-label="Закреплённый мастер"
        >
          <option value="">— не назначен —</option>
          {assignable.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>
      <div className="sum-div" />
    </>
  );
}

function DiscountControl({ wo, disabled, onChange }: { wo: WorkOrder; disabled: boolean; onChange: (t: DiscountType | null, v: number | null) => void }) {
  const [type, setType] = useState<'' | DiscountType>(wo.discount_type ?? '');
  const [val, setVal] = useState(wo.discount_value != null ? String(wo.discount_value) : '');

  useEffect(() => {
    setType(wo.discount_type ?? '');
    setVal(wo.discount_value != null ? String(wo.discount_value) : '');
  }, [wo.discount_type, wo.discount_value]);

  const apply = (t: '' | DiscountType, v: string) => {
    if (!t) onChange(null, null);
    else onChange(t, v ? Number(v) : 0);
  };

  return (
    <div className="discount-row">
      <span className="muted">Скидка на наряд</span>
      <div className="row gap-2">
        <select
          className="select btn-sm"
          style={{ width: 92, height: '1.875rem' }}
          value={type}
          disabled={disabled}
          onChange={(e) => { const t = e.target.value as '' | DiscountType; setType(t); apply(t, val); }}
        >
          <option value="">нет</option>
          <option value="percent">%</option>
          <option value="fixed">₽</option>
        </select>
        {type && (
          <input
            className="input btn-sm tnum"
            style={{ width: 84, height: '1.875rem', textAlign: 'right' }}
            value={val}
            disabled={disabled}
            onChange={(e) => setVal(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={() => apply(type, val)}
            onKeyDown={(e) => e.key === 'Enter' && apply(type, val)}
            inputMode="decimal"
          />
        )}
      </div>
    </div>
  );
}

/** Учёт оплаты: сумма, внесённая клиентом (можно частями) + остаток. */
function PaidControl({ wo, total, onChange }: { wo: WorkOrder; total: number; onChange: (v: number) => void }) {
  const paid = wo.paid_amount ?? 0;
  const [val, setVal] = useState(paid ? String(paid) : '');

  useEffect(() => {
    setVal((wo.paid_amount ?? 0) ? String(wo.paid_amount) : '');
  }, [wo.paid_amount]);

  const remainder = Math.max(0, total - paid);
  const apply = () => {
    const n = val ? Number(val) : 0;
    if (n !== paid) onChange(n);
  };

  return (
    <>
      <div className="sum-div" />
      <div className="discount-row">
        <span className="muted">Оплачено</span>
        <input
          className="input btn-sm tnum"
          style={{ width: 110, height: '1.875rem', textAlign: 'right' }}
          value={val}
          onChange={(e) => setVal(e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={apply}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          inputMode="decimal"
          placeholder="0"
        />
      </div>
      <div className="sum-line">
        <span className="muted">Остаток</span>
        <span className="mono tnum fw-500">{money(remainder)}</span>
      </div>
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
  const laborMinutes = Math.round(
    (wo.labor_lines ?? []).reduce((a, l) => a + (l.hours ?? 0), 0) * 60,
  );

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

  return (
    <>
      <div className="sum-line">
        <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CalendarClock size={14} /> Запись
        </span>
      </div>
      <div className="col gap-2">
        <input
          className="input"
          type="datetime-local"
          // Controlled (value, not defaultValue + key): commits on pick via the
          // optimistic mUpdate, so the time changes the instant you choose it.
          // No `key` → no remount mid-edit; the optimistic cache write re-renders
          // the value smoothly. Slot picker / «Подогнать» flow in the same way.
          value={toLocalInput(wo.scheduled_at)}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            setStart(v ? new Date(v).toISOString() : null);
          }}
        />
        <div className="row gap-2" style={{ alignItems: 'flex-end' }}>
          <div className="field grow">
            <label className="label">Длительность, мин</label>
            <input
              className="input tnum"
              key={`dur-${wo.scheduled_duration_min ?? 'd'}`}
              defaultValue={wo.scheduled_duration_min ?? ''}
              placeholder={String(defaultDur)}
              inputMode="numeric"
              disabled={disabled || !wo.scheduled_at}
              onBlur={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                const n = v ? Number(v) : defaultDur;
                if (n !== (wo.scheduled_duration_min ?? null)) setDuration(n);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </div>
          <button
            type="button"
            className="btn btn-default btn-sm"
            disabled={disabled}
            onClick={() => {
              setPickerDay(wo.scheduled_at ? new Date(wo.scheduled_at) : new Date());
              setPickOpen(true);
            }}
          >
            <CalendarSearch size={15} /> Слот
          </button>
        </div>
        {!disabled && wo.scheduled_at && laborMinutes > 0 && laborMinutes !== wo.scheduled_duration_min && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setDuration(laborMinutes)}
          >
            <Clock size={14} /> Подогнать под часы работ ({laborMinutes} мин)
          </button>
        )}
      </div>

      <Modal
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        title="Выбор слота"
        width={520}
        footer={<button className="btn btn-primary" onClick={() => setPickOpen(false)}>Готово</button>}
      >
        <div className="row gap-2" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span className="fw-500" style={{ textTransform: 'capitalize' }}>
            {format(pickerDay, 'EEEE, d MMMM', { locale: ru })}
          </span>
          <div className="row gap-1">
            <button className="btn btn-default btn-icon btn-sm" onClick={() => setPickerDay((d) => addDays(d, -1))} aria-label="Назад"><ChevronLeft size={15} /></button>
            <button className="btn btn-default btn-sm" onClick={() => setPickerDay(new Date())}>Сегодня</button>
            <button className="btn btn-default btn-icon btn-sm" onClick={() => setPickerDay((d) => addDays(d, 1))} aria-label="Вперёд"><ChevronRight size={15} /></button>
          </div>
        </div>
        <ScheduleTimeline
          days={[pickerDay]}
          events={busyEvents}
          cfg={cfg}
          selectable
          selection={selection}
          defaultDurationMin={defaultDur}
          showHeaders={false}
          onSelect={onSelectSlot}
        />
      </Modal>
    </>
  );
}
