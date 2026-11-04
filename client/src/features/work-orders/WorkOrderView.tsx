import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
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
  ChevronUp,
  ChevronDown,
  Save,
  StickyNote,
  MessageSquareWarning,
  ClipboardList,
  Copy,
  FileDown,
  UserCog,
} from 'lucide-react';
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
import type { LaborLine, PartLine, PartUnit, TaskTemplate, User, WorkOrder, WorkOrderStatus, DiscountType } from '../../lib/types';
import type { EstimateGroup } from '../../lib/format';
import { Spinner, StatusPill } from '../../components/ui';
import './wo.css';

export interface BackTarget { to: string; label: string }

/** What a labor-line form shows; a demo draft pins any subset of it. */
export interface LaborDraft {
  name: string;
  hours: string;
  rate: string;
  override: string;
  discType: DiscountType;
  discValue: string;
}

/** What a part-line form shows; a demo draft pins any subset of it. */
export interface PartDraft {
  name: string;
  cat: string;
  brand: string;
  unit: PartUnit;
  qty: string;
  price: string;
  discType: DiscountType;
  discValue: string;
}

export type WorkOrderPending = Partial<
  Record<'status' | 'close' | 'pdf' | 'orderPdf' | 'addLabor' | 'editLabor' | 'addPart' | 'editPart' | 'delete', boolean>
>;

export interface WorkOrderViewProps {
  wo: WorkOrder;
  back: BackTarget;
  templates?: TaskTemplate[];
  staff?: User[];
  canAssign: boolean;
  laborRate: number;
  editLaborId: string | null;
  editPartId: string | null;
  pending: WorkOrderPending;
  /** «Запись» section of the summary (the page passes its stateful ScheduleSection). */
  scheduleSlot: ReactNode;
  onUpdate(body: Partial<WorkOrder>): void;
  onStatus(s: WorkOrderStatus): void;
  onCloseOrder(): void;
  onPdf(): void;
  onOrderPdf(): void;
  onPaid(amount: number): void;
  onAddLabor(body: Record<string, unknown>): void;
  onEditLabor(lineId: string, body: Record<string, unknown>): void;
  onDelLabor(lineId: string): void;
  onAddPart(body: Record<string, unknown>): void;
  onEditPart(lineId: string, body: Record<string, unknown>): void;
  onDelPart(lineId: string): void;
  /** Rename a block; the page asks for the new name (seeded with `currentName`). */
  onRenameGroup(key: string, currentName: string): void;
  onMoveGroup(key: string, direction: 'up' | 'down'): void;
  onUngroup(key: string): void;
  onPickTemplate(templateId: string): void;
  onDuplicate(): void;
  onAskDelete(): void;
  onSave(): void;
  /** Pencil (id) / cancel (null) on a labor line. */
  onStartEditLabor(id: string | null): void;
  /** Pencil (id) / cancel (null) on a part line. */
  onStartEditPart(id: string | null): void;
  /** Demo: mark one estimate row (labor or part line id) with data-highlight. */
  highlightLineId?: string;
  /** Demo: mark one estimate row with data-hover (twin of :hover). */
  hoverLineId?: string;
  /** Demo: pinned values of the labor form being edited (`editLaborId`), else of the add form. */
  laborDraft?: Partial<LaborDraft>;
  /** Demo: pinned values of the part form being edited (`editPartId`), else of the add form. */
  partDraft?: Partial<PartDraft>;
  /** Demo: style per estimate row; index runs over labor rows, then part rows. */
  rowStyle?: (index: number, id: string) => CSSProperties;
}

export function WorkOrderView({
  wo,
  back,
  templates,
  staff,
  canAssign,
  laborRate,
  editLaborId,
  editPartId,
  pending,
  scheduleSlot,
  onUpdate,
  onStatus,
  onCloseOrder,
  onPdf,
  onOrderPdf,
  onPaid,
  onAddLabor,
  onEditLabor,
  onDelLabor,
  onAddPart,
  onEditPart,
  onDelPart,
  onRenameGroup,
  onMoveGroup,
  onUngroup,
  onPickTemplate,
  onDuplicate,
  onAskDelete,
  onSave,
  onStartEditLabor,
  onStartEditPart,
  highlightLineId,
  hoverLineId,
  laborDraft,
  partDraft,
  rowStyle,
}: WorkOrderViewProps) {
  const closed = wo.status === 'closed';
  // Blocks are what «группировка работ вместе с запчастями» produces; both
  // panels label their sections from the same list so the two agree.
  const groups = estimateGroups(wo);
  const groupOf = (key: string | null) => groups.find((g) => g.key === key);
  const startsGroup = (
    arr: { group_key: string | null }[],
    i: number,
  ) => !!arr[i].group_key && (i === 0 || arr[i - 1].group_key !== arr[i].group_key);
  // One estimate-group hook per block: on its works heading, or on its parts
  // heading when the block has no works left.
  const hasLabor = (key: string | null) => (wo.labor_lines ?? []).some((l) => l.group_key === key);
  const laborCount = (wo.labor_lines ?? []).length;

  const sub = subtotal(wo);
  // Two separate figures: the order discount applies to what is left after the
  // per-line ones, so showing a single «Скидка» would not add up.
  const lineDisc = lineDiscountTotal(wo);
  const disc = discountAmount(wo);
  const total = closed ? wo.total_frozen ?? wo.total_cached : wo.total_cached;
  const client = wo.vehicle?.client;

  return (
    <div className="page page-wide wo-page">
      <Link to={back.to} className="back-link"><ArrowLeft size={15} /> {back.label}</Link>

      <header className="wo-head">
        <div className="grow" style={{ minWidth: 0 }}>
          <input
            className="wo-title-input"
            data-demo="wo-title"
            defaultValue={wo.title ?? ''}
            placeholder="Заказ-наряд без названия"
            disabled={closed}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (wo.title ?? '')) onUpdate({ title: v || null });
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
              <button className="btn btn-default" onClick={() => onStatus('in_progress')} disabled={pending.status}>
                <Unlock size={15} /> Открыть заново
              </button>
            </>
          ) : (
            <select
              className="select wo-status-select"
              data-demo="wo-status"
              value={wo.status}
              onChange={(e) => onStatus(e.target.value as WorkOrderStatus)}
              aria-label="Статус"
            >
              {STATUS_ORDER.filter((s) => s !== 'closed').map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          )}
          <button
            className="btn btn-danger btn-icon"
            data-demo="wo-delete"
            onClick={() => onAskDelete()}
            disabled={pending.delete}
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
          <section className="panel" data-demo="labor-panel">
            <div className="panel-head">
              <h2 className="panel-title"><Wrench size={16} className="muted" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Работы</h2>
              {!closed && templates && templates.length > 0 && (
                <select
                  className="select btn-sm"
                  data-demo="add-from-price"
                  style={{ width: 'auto', height: '1.875rem' }}
                  value=""
                  onChange={(e) => { if (e.target.value) { onPickTemplate(e.target.value); } e.target.value = ''; }}
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
                      demo
                      disabled={closed}
                      onRename={(current) => onRenameGroup(l.group_key!, current)}
                      onMove={(direction) => onMoveGroup(l.group_key!, direction)}
                      onUngroup={() => onUngroup(l.group_key!)}
                    />
                  )}
                  {!closed && editLaborId === l.id ? (
                  <LaborLineForm
                    key={l.id}
                    defaultRate={laborRate}
                    initial={l}
                    busy={!!pending.editLabor}
                    draft={laborDraft}
                    onSubmit={(b) => onEditLabor(l.id, b)}
                    onCancel={() => onStartEditLabor(null)}
                  />
                ) : (
                  <div
                    className="smeta-row labor-grid"
                    data-demo="labor-row"
                    data-id={l.id}
                    data-highlight={highlightLineId === l.id ? '' : undefined}
                    data-hover={hoverLineId === l.id ? '' : undefined}
                    style={rowStyle?.(i, l.id)}
                  >
                    <span className="truncate">{l.name}</span>
                    <span className="ta-r mono tnum muted">{l.hours ?? '—'}</span>
                    <span className="ta-r mono tnum muted">{money(l.rate_snapshot)}</span>
                    <span className="ta-r mono tnum">{l.price_override != null ? <span className="ovr">{money(l.price_override)}</span> : <span className="faint">—</span>}</span>
                    <span className="ta-r mono tnum">{lineDiscountCell(laborGross(l), l)}</span>
                    <span className="ta-r mono tnum fw-500">{money(laborTotal(l))}</span>
                    {!closed ? (
                      <span className="row-actions">
                        <button className="btn btn-ghost btn-icon btn-sm edit" onClick={() => onStartEditLabor(l.id)} aria-label="Изменить"><Pencil size={14} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm del" onClick={() => onDelLabor(l.id)} aria-label="Удалить"><Trash2 size={14} /></button>
                      </span>
                    ) : <span />}
                  </div>
                  )}
                </Fragment>
              ))}
              {!closed && <LaborLineForm defaultRate={laborRate} onSubmit={(b) => onAddLabor(b)} busy={!!pending.addLabor} draft={editLaborId ? undefined : laborDraft} />}
            </div>
          </section>

          {/* parts */}
          <section className="panel" data-demo="parts-panel">
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
                      demo={!hasLabor(p.group_key)}
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
                    busy={!!pending.editPart}
                    draft={partDraft}
                    onSubmit={(b) => onEditPart(p.id, b)}
                    onCancel={() => onStartEditPart(null)}
                  />
                ) : (
                  <div
                    className="smeta-row part-grid"
                    data-demo="part-row"
                    data-id={p.id}
                    data-highlight={highlightLineId === p.id ? '' : undefined}
                    data-hover={hoverLineId === p.id ? '' : undefined}
                    style={rowStyle?.(laborCount + i, p.id)}
                  >
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
                        <button className="btn btn-ghost btn-icon btn-sm edit" onClick={() => onStartEditPart(p.id)} aria-label="Изменить"><Pencil size={14} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm del" onClick={() => onDelPart(p.id)} aria-label="Удалить"><Trash2 size={14} /></button>
                      </span>
                    ) : <span />}
                  </div>
                  )}
                </Fragment>
              ))}
              {!closed && <PartLineForm onSubmit={(b) => onAddPart(b)} busy={!!pending.addPart} draft={editPartId ? undefined : partDraft} />}
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
                  if (v !== (wo.complaint ?? '')) onUpdate({ complaint: v || null });
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
                  if (v !== (wo.recommendation ?? '')) onUpdate({ recommendation: v || null });
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
                  if (v !== (wo.notes ?? '')) onUpdate({ notes: v || null });
                }}
              />
            </div>
          </section>
        </div>

        {/* summary */}
        <aside className="wo-summary" data-demo="wo-summary">
          <div className="panel summary-panel">
            <MasterControl
              wo={wo}
              staff={staff}
              canAssign={canAssign}
              disabled={closed}
              onChange={(v) => onUpdate({ assigned_master_id: v })}
            />

            {scheduleSlot}

            <div className="sum-div" />

            <div className="sum-line"><span className="muted">Работы + запчасти</span><span className="mono tnum">{money(sub)}</span></div>

            <DiscountControl wo={wo} disabled={closed} onChange={(t, v) => onUpdate({ discount_type: t, discount_value: v })} />

            {lineDisc > 0 && (
              <div className="sum-line"><span className="muted">Скидки по строкам</span><span className="mono tnum" style={{ color: 'var(--danger)' }}>−{money(lineDisc)}</span></div>
            )}
            {disc > 0 && (
              <div className="sum-line"><span className="muted">Скидка наряда</span><span className="mono tnum" style={{ color: 'var(--danger)' }}>−{money(disc)}</span></div>
            )}

            <div className="sum-div" />
            <div className="sum-total" data-demo="wo-total">
              <span>Итого</span>
              <span className="mono tnum">{money(total)}</span>
            </div>

            <PaidControl wo={wo} total={total} onChange={(v) => onPaid(v)} />

            <div className="col gap-2">
              {!closed ? (
                <>
                  <button className="btn btn-primary" data-demo="wo-save" style={{ width: '100%' }} onClick={() => onSave()}>
                    <Save size={15} /> Сохранить
                  </button>
                  <button className="btn btn-default" data-demo="wo-close" style={{ width: '100%' }} onClick={() => onCloseOrder()} disabled={pending.close}>
                    {pending.close ? <Spinner /> : <Lock size={15} />} Закрыть и зафиксировать
                  </button>
                </>
              ) : (
                <>
                  <div className="frozen-chip"><Check size={14} /> Зафиксировано {money(wo.total_frozen)}</div>
                  <button className="btn btn-primary" data-demo="wo-report-pdf" style={{ width: '100%' }} onClick={() => onPdf()} disabled={pending.pdf}>
                    {pending.pdf ? <Spinner /> : <FileDown size={15} />} Сгенерировать отчёт
                  </button>
                </>
              )}
              <button className="btn btn-default" data-demo="wo-duplicate" style={{ width: '100%' }} onClick={() => onDuplicate()}>
                <Copy size={15} /> Копировать наряд
              </button>
              <button className="btn btn-default" data-demo="wo-order-pdf" style={{ width: '100%' }} onClick={() => onOrderPdf()} disabled={pending.orderPdf}>
                {pending.orderPdf ? <Spinner /> : <FileDown size={15} />} Заказ-наряд (PDF)
              </button>
            </div>
          </div>
        </aside>
      </div>
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
  demo,
  disabled,
  onRename,
  onMove,
  onUngroup,
}: {
  group: EstimateGroup;
  controls: boolean;
  /** Carries the block's `estimate-group` hook (one heading per block). */
  demo: boolean;
  disabled: boolean;
  /** Rename asked for; the page prompts, seeded with the current name. */
  onRename: (currentName: string) => void;
  onMove: (direction: 'up' | 'down') => void;
  onUngroup: () => void;
}) {
  return (
    <div className="smeta-group" data-demo={demo ? 'estimate-group' : undefined} data-id={demo ? group.key : undefined}>
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
            onClick={() => onRename(group.name)}
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
  draft,
}: {
  defaultRate: number;
  initial?: LaborLine;
  onSubmit: (b: Record<string, unknown>) => void;
  onCancel?: () => void;
  busy: boolean;
  /** Demo: pinned field values; undefined fields fall back to the form's own state. */
  draft?: Partial<LaborDraft>;
}) {
  const editMode = !!onCancel;
  const [name, setName] = useState(initial?.name ?? '');
  const [hours, setHours] = useState(initial?.hours != null ? String(initial.hours) : '');
  const [rate, setRate] = useState(String(initial?.rate_snapshot ?? defaultRate));
  const [override, setOverride] = useState(initial?.price_override != null ? String(initial.price_override) : '');
  const [discType, setDiscType] = useState<DiscountType>(initial?.discount_type ?? 'percent');
  const [discValue, setDiscValue] = useState(initial?.discount_value != null ? String(initial.discount_value) : '');
  useEffect(() => { if (!editMode) setRate(String(defaultRate)); }, [defaultRate, editMode]);
  const v: LaborDraft = {
    name: draft?.name ?? name,
    hours: draft?.hours ?? hours,
    rate: draft?.rate ?? rate,
    override: draft?.override ?? override,
    discType: draft?.discType ?? discType,
    discValue: draft?.discValue ?? discValue,
  };

  const submit = () => {
    if (!v.name.trim()) return;
    onSubmit({
      name: v.name.trim(),
      // edit: empty clears the field (null); add: empty omits it (undefined → defaults)
      hours: v.hours ? Number(v.hours) : editMode ? null : undefined,
      rate_snapshot: v.rate ? Number(v.rate) : undefined,
      price_override: v.override ? Number(v.override) : editMode ? null : undefined,
      // An empty amount clears the discount rather than leaving a stale type.
      discount_type: v.discValue ? v.discType : null,
      discount_value: v.discValue ? Number(v.discValue) : null,
    });
    if (!editMode) { setName(''); setHours(''); setOverride(''); setRate(String(defaultRate)); setDiscValue(''); }
  };

  return (
    <div className="smeta-add labor-grid" data-demo={editMode ? undefined : 'labor-add'}>
      <input className="cell-input" value={v.name} placeholder="Напр. Замена масла" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoFocus={editMode} />
      <input className="cell-input ta-r tnum" value={v.hours} placeholder="ч" onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
      <input className="cell-input ta-r tnum" value={v.rate} placeholder="ставка" onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
      <input className="cell-input ta-r tnum" value={v.override} placeholder="фикс." onChange={(e) => setOverride(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
      <LineDiscountCell type={v.discType} value={v.discValue} onType={setDiscType} onValue={setDiscValue} />
      <span />
      <span className="row-actions">
        {onCancel && (
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onCancel} disabled={busy} aria-label="Отмена"><X size={15} /></button>
        )}
        <button className="btn btn-default btn-icon btn-sm" onClick={submit} disabled={!v.name.trim() || busy} aria-label={editMode ? 'Сохранить' : 'Добавить работу'}>
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
  draft,
}: {
  initial?: PartLine;
  onSubmit: (b: Record<string, unknown>) => void;
  onCancel?: () => void;
  busy: boolean;
  /** Demo: pinned field values; undefined fields fall back to the form's own state. */
  draft?: Partial<PartDraft>;
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
  const v: PartDraft = {
    name: draft?.name ?? name,
    cat: draft?.cat ?? cat,
    brand: draft?.brand ?? brand,
    unit: draft?.unit ?? unit,
    qty: draft?.qty ?? qty,
    price: draft?.price ?? price,
    discType: draft?.discType ?? discType,
    discValue: draft?.discValue ?? discValue,
  };

  const onQty = (s: string, u: PartUnit) =>
    u === 'l'
      ? s.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
      : s.replace(/\D/g, '');

  const submit = () => {
    if (!v.name.trim() || !v.price) return;
    onSubmit({
      name: v.name.trim(),
      catalog_number: v.cat.trim() || (editMode ? null : undefined),
      manufacturer: v.brand.trim() || (editMode ? null : undefined),
      qty: v.qty ? Number(v.qty) : 1,
      unit: v.unit,
      unit_price: Number(v.price),
      discount_type: v.discValue ? v.discType : null,
      discount_value: v.discValue ? Number(v.discValue) : null,
    });
    if (!editMode) { setName(''); setCat(''); setBrand(''); setUnit('pcs'); setQty('1'); setPrice(''); setDiscValue(''); }
  };

  return (
    <div className="smeta-add part-grid" data-demo={editMode ? undefined : 'part-add'}>
      <div className="part-name-cell">
        <input className="cell-input grow" value={v.name} placeholder="Напр. Масляный фильтр" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} autoFocus={editMode} />
        <input className="cell-input brand" value={v.brand} placeholder="Производитель" onChange={(e) => setBrand(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <input className="cell-input art" value={v.cat} placeholder="Артикул" onChange={(e) => setCat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </div>
      <div className="qty-cell">
        <input className="cell-input ta-r tnum" value={v.qty} placeholder="кол-во" onChange={(e) => setQty(onQty(e.target.value, v.unit))} inputMode="decimal" />
        <select className="unit-select" value={v.unit} onChange={(e) => { const u = e.target.value as PartUnit; setUnit(u); setQty((q) => onQty(q, u)); }} aria-label="Единица">
          <option value="pcs">шт</option>
          <option value="l">л</option>
        </select>
      </div>
      <input className="cell-input ta-r tnum" value={v.price} placeholder="цена" onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" />
      <LineDiscountCell type={v.discType} value={v.discValue} onType={setDiscType} onValue={setDiscValue} />
      <span />
      <span className="row-actions">
        {onCancel && (
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onCancel} disabled={busy} aria-label="Отмена"><X size={15} /></button>
        )}
        <button className="btn btn-default btn-icon btn-sm" onClick={submit} disabled={!v.name.trim() || !v.price || busy} aria-label={editMode ? 'Сохранить' : 'Добавить запчасть'}>
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
        <div className="sum-line" data-demo="wo-master">
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
      <div className="sum-line" data-demo="wo-master">
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
    <div className="discount-row" data-demo="wo-discount">
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
      <div className="discount-row" data-demo="wo-paid">
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
