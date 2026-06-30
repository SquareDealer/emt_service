import { useEffect, useMemo, useRef, useState } from 'react';
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
  Clock,
  Save,
  StickyNote,
  MessageSquareWarning,
  ClipboardList,
  FileDown,
  UserCog,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { canAssignMaster } from '../../lib/roles';
import {
  money,
  laborTotal,
  partTotal,
  subtotal,
  discountAmount,
  dateTime,
} from '../../lib/format';
import { STATUS_LABEL, STATUS_ORDER } from '../../lib/types';
import type { AppSettings, LaborLine, PartLine, PartUnit, User, WorkOrder, WorkOrderStatus, DiscountType } from '../../lib/types';
import { downloadBlob } from '../../lib/download';
import { hasConflict } from '../../lib/schedule';
import type { TimelineCfg, TimelineEvent } from '../../lib/schedule';
import { ScheduleTimeline, SELECTION_ID } from '../../components/ScheduleTimeline';
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
    onSuccess: onSaved,
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mClose = useMutation({
    mutationFn: () => api.closeWorkOrder(id),
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
    onSuccess: onSaved,
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mAddLabor = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.addLabor(id, body),
    onSuccess: onSaved,
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mEditLabor = useMutation({
    mutationFn: ({ lineId, body }: { lineId: string; body: Record<string, unknown> }) =>
      api.updateLabor(id, lineId, body),
    onSuccess: (n) => { onSaved(n); setEditLaborId(null); },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mDelLabor = useMutation({
    mutationFn: (lineId: string) => api.removeLabor(id, lineId),
    onSuccess: onSaved,
  });
  const mAddPart = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.addPart(id, body),
    onSuccess: onSaved,
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mEditPart = useMutation({
    mutationFn: ({ lineId, body }: { lineId: string; body: Record<string, unknown> }) =>
      api.updatePart(id, lineId, body),
    onSuccess: (n) => { onSaved(n); setEditPartId(null); },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mDelPart = useMutation({
    mutationFn: (lineId: string) => api.removePart(id, lineId),
    onSuccess: onSaved,
  });

  // Which labor/part line is being edited inline (pencil → row becomes a form).
  const [editLaborId, setEditLaborId] = useState<string | null>(null);
  const [editPartId, setEditPartId] = useState<string | null>(null);

  // Where "назад" goes — set by whoever navigated here (client/board/calendar).
  const navigate = useNavigate();
  const location = useLocation();
  const back: BackTarget =
    (location.state as { back?: BackTarget } | null)?.back ?? { to: '/board', label: 'Доска' };

  // Keep latest WO in a ref so the unmount cleanup can decide to drop an empty one.
  const keepRef = useRef(false);
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
  const sub = subtotal(wo);
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
            <span className="row gap-1"><Car size={14} /> {wo.vehicle?.model || 'MINI'} <span className="mono">{wo.vehicle?.plate || wo.vehicle?.vin || ''}</span></span>
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
                  onChange={(e) => { if (e.target.value) mAddLabor.mutate({ template_id: e.target.value }); e.target.value = ''; }}
                  aria-label="Добавить из шаблона"
                >
                  <option value="">+ Из шаблона…</option>
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
                <span className="ta-r">Сумма</span>
                <span />
              </div>
              {(wo.labor_lines ?? []).length === 0 && (
                <div className="smeta-empty">Нет работ. {closed ? '' : 'Добавьте операцию ниже или из шаблона.'}</div>
              )}
              {(wo.labor_lines ?? []).map((l) =>
                !closed && editLaborId === l.id ? (
                  <LaborLineForm
                    key={l.id}
                    defaultRate={rate}
                    initial={l}
                    busy={mEditLabor.isPending}
                    onSubmit={(b) => mEditLabor.mutate({ lineId: l.id, body: b })}
                    onCancel={() => setEditLaborId(null)}
                  />
                ) : (
                  <div key={l.id} className="smeta-row labor-grid">
                    <span className="truncate">{l.name}</span>
                    <span className="ta-r mono tnum muted">{l.hours ?? '—'}</span>
                    <span className="ta-r mono tnum muted">{money(l.rate_snapshot)}</span>
                    <span className="ta-r mono tnum">{l.price_override != null ? <span className="ovr">{money(l.price_override)}</span> : <span className="faint">—</span>}</span>
                    <span className="ta-r mono tnum fw-500">{money(laborTotal(l))}</span>
                    {!closed ? (
                      <span className="row-actions">
                        <button className="btn btn-ghost btn-icon btn-sm edit" onClick={() => { setEditLaborId(l.id); setEditPartId(null); }} aria-label="Изменить"><Pencil size={14} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm del" onClick={() => mDelLabor.mutate(l.id)} aria-label="Удалить"><Trash2 size={14} /></button>
                      </span>
                    ) : <span />}
                  </div>
                ),
              )}
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
                <span className="ta-r">Сумма</span>
                <span />
              </div>
              {(wo.part_lines ?? []).length === 0 && (
                <div className="smeta-empty">Нет запчастей. {closed ? '' : 'Добавьте деталь ниже.'}</div>
              )}
              {(wo.part_lines ?? []).map((p) =>
                !closed && editPartId === p.id ? (
                  <PartLineForm
                    key={p.id}
                    initial={p}
                    busy={mEditPart.isPending}
                    onSubmit={(b) => mEditPart.mutate({ lineId: p.id, body: b })}
                    onCancel={() => setEditPartId(null)}
                  />
                ) : (
                  <div key={p.id} className="smeta-row part-grid">
                    <span className="truncate">{p.name}{p.catalog_number ? <span className="mono faint"> · {p.catalog_number}</span> : ''}</span>
                    <span className="ta-r mono tnum muted">{fmtQty(p.qty)} {unitLabel(p.unit)}</span>
                    <span className="ta-r mono tnum muted">{money(p.unit_price)}</span>
                    <span className="ta-r mono tnum fw-500">{money(partTotal(p))}</span>
                    {!closed ? (
                      <span className="row-actions">
                        <button className="btn btn-ghost btn-icon btn-sm edit" onClick={() => { setEditPartId(p.id); setEditLaborId(null); }} aria-label="Изменить"><Pencil size={14} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm del" onClick={() => mDelPart.mutate(p.id)} aria-label="Удалить"><Trash2 size={14} /></button>
                      </span>
                    ) : <span />}
                  </div>
                ),
              )}
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

            {disc > 0 && (
              <div className="sum-line"><span className="muted">Скидка</span><span className="mono tnum" style={{ color: 'var(--danger)' }}>−{money(disc)}</span></div>
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
  useEffect(() => { if (!editMode) setRate(String(defaultRate)); }, [defaultRate, editMode]);

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      // edit: empty clears the field (null); add: empty omits it (undefined → defaults)
      hours: hours ? Number(hours) : editMode ? null : undefined,
      rate_snapshot: rate ? Number(rate) : undefined,
      price_override: override ? Number(override) : editMode ? null : undefined,
    });
    if (!editMode) { setName(''); setHours(''); setOverride(''); setRate(String(defaultRate)); }
  };

  return (
    <div className="smeta-add labor-grid">
      <input className="cell-input" value={name} placeholder="Напр. Замена масла" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoFocus={editMode} />
      <input className="cell-input ta-r tnum" value={hours} placeholder="ч" onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
      <input className="cell-input ta-r tnum" value={rate} placeholder="ставка" onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
      <input className="cell-input ta-r tnum" value={override} placeholder="фикс." onChange={(e) => setOverride(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
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
  const [unit, setUnit] = useState<PartUnit>(initial?.unit ?? 'pcs');
  const [qty, setQty] = useState(initial ? fmtQty(initial.qty) : '1');
  const [price, setPrice] = useState(initial?.unit_price != null ? String(initial.unit_price) : '');

  const onQty = (v: string, u: PartUnit) =>
    u === 'l'
      ? v.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
      : v.replace(/\D/g, '');

  const submit = () => {
    if (!name.trim() || !price) return;
    onSubmit({
      name: name.trim(),
      catalog_number: cat.trim() || (editMode ? null : undefined),
      qty: qty ? Number(qty) : 1,
      unit,
      unit_price: Number(price),
    });
    if (!editMode) { setName(''); setCat(''); setUnit('pcs'); setQty('1'); setPrice(''); }
  };

  return (
    <div className="smeta-add part-grid">
      <div className="part-name-cell">
        <input className="cell-input grow" value={name} placeholder="Напр. Масляный фильтр" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoFocus={editMode} />
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

  const dayStr = format(pickerDay, 'yyyy-MM-dd');
  const { data: dayBookings } = useQuery({
    queryKey: ['calendar', dayStr, dayStr],
    queryFn: () => api.calendar(dayStr, dayStr),
    enabled: pickOpen,
  });

  const busyEvents: TimelineEvent[] = useMemo(
    () =>
      (dayBookings ?? [])
        .filter((w) => w.scheduled_at && w.id !== wo.id)
        .map((w) => ({
          id: w.id,
          start: new Date(w.scheduled_at as string),
          durationMin: w.scheduled_duration_min ?? defaultDur,
          status: w.status,
          title: w.title?.trim() || `${w.vehicle?.model || 'MINI'} ${w.vehicle?.plate || ''}`.trim(),
          subtitle: w.vehicle?.client?.full_name ?? '',
        })),
    [dayBookings, wo.id, defaultDur],
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
