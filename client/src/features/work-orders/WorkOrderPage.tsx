import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Wrench,
  Package,
  Lock,
  Unlock,
  Check,
  Car,
  CalendarClock,
  Save,
  StickyNote,
  FileDown,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import {
  money,
  laborTotal,
  partTotal,
  subtotal,
  discountAmount,
  dateTime,
} from '../../lib/format';
import { STATUS_LABEL, STATUS_ORDER } from '../../lib/types';
import type { WorkOrder, WorkOrderStatus, DiscountType } from '../../lib/types';
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
    !w.scheduled_at &&
    !w.discount_type
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: api.templates });

  const onSaved = (next: WorkOrder) => {
    qc.setQueryData(['work-order', id], next);
    qc.invalidateQueries({ queryKey: ['work-orders'] });
    qc.invalidateQueries({ queryKey: ['board'] });
    qc.invalidateQueries({ queryKey: ['calendar'] });
  };

  const mUpdate = useMutation({
    mutationFn: (body: Partial<WorkOrder>) => api.updateWorkOrder(id, body),
    onSuccess: onSaved,
    onError: (e) => toast((e as Error).message, 'error'),
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
  const mAddLabor = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.addLabor(id, body),
    onSuccess: onSaved,
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
  const mDelPart = useMutation({
    mutationFn: (lineId: string) => api.removePart(id, lineId),
    onSuccess: onSaved,
  });

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
              {(wo.labor_lines ?? []).map((l) => (
                <div key={l.id} className="smeta-row labor-grid">
                  <span className="truncate">{l.name}</span>
                  <span className="ta-r mono tnum muted">{l.hours ?? '—'}</span>
                  <span className="ta-r mono tnum muted">{money(l.rate_snapshot)}</span>
                  <span className="ta-r mono tnum">{l.price_override != null ? <span className="ovr">{money(l.price_override)}</span> : <span className="faint">—</span>}</span>
                  <span className="ta-r mono tnum fw-500">{money(laborTotal(l))}</span>
                  {!closed ? (
                    <button className="btn btn-ghost btn-icon btn-sm del" onClick={() => mDelLabor.mutate(l.id)} aria-label="Удалить"><Trash2 size={14} /></button>
                  ) : <span />}
                </div>
              ))}
              {!closed && <AddLaborRow defaultRate={rate} onAdd={(b) => mAddLabor.mutate(b)} busy={mAddLabor.isPending} />}
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
              {(wo.part_lines ?? []).map((p) => (
                <div key={p.id} className="smeta-row part-grid">
                  <span className="truncate">{p.name}{p.catalog_number ? <span className="mono faint"> · {p.catalog_number}</span> : ''}</span>
                  <span className="ta-r mono tnum muted">{p.qty}</span>
                  <span className="ta-r mono tnum muted">{money(p.unit_price)}</span>
                  <span className="ta-r mono tnum fw-500">{money(partTotal(p))}</span>
                  {!closed ? (
                    <button className="btn btn-ghost btn-icon btn-sm del" onClick={() => mDelPart.mutate(p.id)} aria-label="Удалить"><Trash2 size={14} /></button>
                  ) : <span />}
                </div>
              ))}
              {!closed && <AddPartRow onAdd={(b) => mAddPart.mutate(b)} busy={mAddPart.isPending} />}
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
            <div className="sum-line"><span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CalendarClock size={14} /> Запись</span></div>
            <input
              className="input"
              type="datetime-local"
              defaultValue={toLocalInput(wo.scheduled_at)}
              disabled={closed}
              onChange={(e) => mUpdate.mutate({ scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
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

            {!closed ? (
              <div className="col gap-2">
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSave}>
                  <Save size={15} /> Сохранить
                </button>
                <button className="btn btn-default" style={{ width: '100%' }} onClick={() => mClose.mutate()} disabled={mClose.isPending}>
                  {mClose.isPending ? <Spinner /> : <Lock size={15} />} Закрыть и зафиксировать
                </button>
              </div>
            ) : (
              <div className="col gap-2">
                <div className="frozen-chip"><Check size={14} /> Зафиксировано {money(wo.total_frozen)}</div>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => mPdf.mutate()} disabled={mPdf.isPending}>
                  {mPdf.isPending ? <Spinner /> : <FileDown size={15} />} Сгенерировать отчёт
                </button>
              </div>
            )}
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

function AddLaborRow({ defaultRate, onAdd, busy }: { defaultRate: number; onAdd: (b: Record<string, unknown>) => void; busy: boolean }) {
  const [name, setName] = useState('');
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState(String(defaultRate));
  const [override, setOverride] = useState('');
  useEffect(() => setRate(String(defaultRate)), [defaultRate]);

  const submit = () => {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      hours: hours ? Number(hours) : undefined,
      rate_snapshot: rate ? Number(rate) : undefined,
      price_override: override ? Number(override) : undefined,
    });
    setName(''); setHours(''); setOverride(''); setRate(String(defaultRate));
  };

  return (
    <div className="smeta-add labor-grid">
      <input className="cell-input" value={name} placeholder="Напр. Замена масла" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <input className="cell-input ta-r tnum" value={hours} placeholder="ч" onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
      <input className="cell-input ta-r tnum" value={rate} placeholder="ставка" onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
      <input className="cell-input ta-r tnum" value={override} placeholder="фикс." onChange={(e) => setOverride(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
      <span />
      <button className="btn btn-default btn-icon btn-sm" onClick={submit} disabled={!name.trim() || busy} aria-label="Добавить работу">
        {busy ? <Spinner /> : <Plus size={15} />}
      </button>
    </div>
  );
}

function AddPartRow({ onAdd, busy }: { onAdd: (b: Record<string, unknown>) => void; busy: boolean }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');

  const submit = () => {
    if (!name.trim() || !price) return;
    onAdd({ name: name.trim(), qty: qty ? Number(qty) : 1, unit_price: Number(price) });
    setName(''); setQty('1'); setPrice('');
  };

  return (
    <div className="smeta-add part-grid">
      <input className="cell-input" value={name} placeholder="Напр. Масляный фильтр" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <input className="cell-input ta-r tnum" value={qty} placeholder="кол-во" onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
      <input className="cell-input ta-r tnum" value={price} placeholder="цена" onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
      <span />
      <button className="btn btn-default btn-icon btn-sm" onClick={submit} disabled={!name.trim() || !price || busy} aria-label="Добавить запчасть">
        {busy ? <Spinner /> : <Plus size={15} />}
      </button>
    </div>
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
