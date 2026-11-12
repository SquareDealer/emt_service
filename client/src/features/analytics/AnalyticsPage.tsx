import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Minus,
  Table2,
} from 'lucide-react';
import { EmptyState } from '../../components/ui';
import { useToast } from '../../lib/toast';
import { generateOrders } from './mock';
import {
  PERIOD_LABEL,
  breakdown,
  comparisonFor,
  delta,
  inRange,
  periodOf,
  series,
  shift,
  totals,
  type BreakdownCol,
  type BreakdownKind,
  type PeriodKind,
} from './analytics';
import { count, pct, rub, signedPct } from './fmt';
import { TrendChart, TrendTable } from './TrendChart';
import { CostFillModal } from './CostFillModal';
import './analytics.css';

const KINDS: PeriodKind[] = ['week', 'month', 'quarter', 'year'];
const TABS: { key: BreakdownKind; label: string }[] = [
  { key: 'labor', label: 'Работы' },
  { key: 'parts', label: 'Запчасти' },
  { key: 'vehicles', label: 'Машины' },
];
const TOP_ROWS = 8;

function fmtCell(v: number | null, col: BreakdownCol): string {
  if (col.kind === 'money') return rub(v);
  if (col.kind === 'pct') return pct(v);
  return count(v);
}

/** Изменение к прошлому периоду. Направление несёт значок и знак, текст остаётся чернильным. */
function Delta({ value, points }: { value: number | null; points?: boolean }) {
  if (value === null) return <span className="an-delta faint">нет данных для сравнения</span>;
  const flat = Math.abs(value) < (points ? 0.0005 : 0.005);
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  const text = points
    ? `${value < 0 ? '−' : '+'}${Math.abs(value * 100).toFixed(1).replace('.', ',')} п.п.`
    : signedPct(value);
  return (
    <span className="an-delta" data-dir={flat ? 'flat' : value > 0 ? 'up' : 'down'}>
      <Icon size={14} aria-hidden />
      {flat ? 'без изменений' : text}
    </span>
  );
}

export function AnalyticsPage() {
  const toast = useToast();
  const now = useMemo(() => new Date(), []);
  // ПРОТОТИП: демо-наряды в локальном состоянии, чтобы «Указать закупку» пересчитывала экран.
  const [orders, setOrders] = useState(() => generateOrders(now));

  const [kind, setKind] = useState<PeriodKind>('month');
  const [anchor, setAnchor] = useState(now);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [tab, setTab] = useState<BreakdownKind>('labor');
  const [sort, setSort] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [fillOpen, setFillOpen] = useState(false);

  const period = useMemo(() => periodOf(kind, anchor), [kind, anchor]);
  const cmp = useMemo(() => comparisonFor(period, now), [period, now]);
  const isCurrent = cmp.partial;

  const current = useMemo(() => inRange(orders, period), [orders, period]);
  const t = useMemo(() => totals(current), [current]);
  const prev = useMemo(() => totals(inRange(orders, cmp.previous)), [orders, cmp]);
  const buckets = useMemo(() => series(orders, period), [orders, period]);

  const bd = useMemo(() => breakdown(current, tab), [current, tab]);
  const sortCol = sort ?? bd.defaultSort;
  const rows = useMemo(
    () => [...bd.rows].sort((a, b) => (b.vals[sortCol] ?? -Infinity) - (a.vals[sortCol] ?? -Infinity)),
    [bd, sortCol],
  );
  const revenueTotal = rows.reduce((s, r) => s + r.revenue, 0);
  const visible = showAll ? rows : rows.slice(0, TOP_ROWS);

  const pickTab = (k: BreakdownKind) => {
    setTab(k);
    setSort(null);
    setShowAll(false);
  };

  const saveCosts = (costs: Record<string, number>) => {
    setOrders((list) =>
      list.map((o) =>
        o.parts.some((p) => p.id in costs)
          ? { ...o, parts: o.parts.map((p) => (p.id in costs ? { ...p, cost: costs[p.id] } : p)) }
          : o,
      ),
    );
    setFillOpen(false);
    toast(`Закупка сохранена: ${Object.keys(costs).length}`, 'success');
  };

  const kpis = [
    { label: 'Выручка', value: rub(t.revenue), d: delta(t.revenue, prev.revenue), lead: true },
    {
      label: 'Валовая прибыль',
      value: rub(t.profit),
      d: delta(t.profit, prev.profit),
      note: t.unknownCount ? 'не ниже — есть запчасти без закупки' : undefined,
    },
    {
      label: 'Маржа',
      value: pct(t.margin, 1),
      d: t.margin !== null && prev.margin !== null ? t.margin - prev.margin : null,
      points: true,
    },
    { label: 'Закрыто нарядов', value: String(t.orders), d: delta(t.orders, prev.orders) },
    { label: 'Средний чек', value: rub(t.avgCheck), d: delta(t.avgCheck, prev.avgCheck) },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Аналитика</h1>
          <p className="page-sub">
            Закрытые заказ-наряды, по дате закрытия <span className="badge an-demo">демо-данные</span>
          </p>
        </div>

        <div className="an-period">
          <div className="seg" role="group" aria-label="Период">
            {KINDS.map((k) => (
              <button
                key={k}
                className="seg-btn"
                data-on={kind === k}
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k);
                  setAnchor(now);
                }}
              >
                {PERIOD_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="an-stepper">
            <button
              className="btn btn-default btn-icon"
              aria-label="Предыдущий период"
              onClick={() => setAnchor((a) => shift(kind, a, -1))}
            >
              <ChevronLeft />
            </button>
            <span className="an-period-label" aria-live="polite">
              {period.label}
            </span>
            <button
              className="btn btn-default btn-icon"
              aria-label="Следующий период"
              disabled={isCurrent}
              onClick={() => setAnchor((a) => shift(kind, a, 1))}
            >
              <ChevronRight />
            </button>
          </div>
        </div>
      </div>

      {/* Сводка: одна полоса, не ряд карточек */}
      <section className="panel an-kpis" aria-label="Итоги периода">
        <dl className="an-kpi-row">
          {kpis.map((k) => (
            <div key={k.label} className="an-kpi" data-lead={k.lead || undefined}>
              <dt>{k.label}</dt>
              <dd className="an-kpi-value">{k.value}</dd>
              <dd>
                <Delta value={k.d} points={k.points} />
              </dd>
              {k.note && <dd className="an-kpi-note">{k.note}</dd>}
            </div>
          ))}
        </dl>
        <p className="an-kpi-foot">
          Изменение {cmp.label}
          {cmp.partial && ' — период ещё идёт, сравниваем равное число дней'}
        </p>
      </section>

      {t.orders === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<BarChart3 />}
            title="За этот период нет закрытых нарядов"
            hint="В аналитику попадает наряд, когда он переведён в «Выдана». Выберите другой период стрелками."
          />
        </div>
      ) : (
        <>
          <div className="an-grid">
            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Динамика выручки</h2>
                <div className="seg an-seg-sm" role="group" aria-label="Вид">
                  <button
                    className="seg-btn"
                    data-on={view === 'chart'}
                    aria-pressed={view === 'chart'}
                    aria-label="График"
                    title="График"
                    onClick={() => setView('chart')}
                  >
                    <BarChart3 size={15} />
                  </button>
                  <button
                    className="seg-btn"
                    data-on={view === 'table'}
                    aria-pressed={view === 'table'}
                    aria-label="Таблица"
                    title="Таблица"
                    onClick={() => setView('table')}
                  >
                    <Table2 size={15} />
                  </button>
                </div>
              </div>
              {view === 'chart' ? (
                <TrendChart buckets={buckets} now={now} />
              ) : (
                <TrendTable buckets={buckets} now={now} />
              )}
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Из чего сложилась прибыль</h2>
              </div>
              <dl className="an-ledger">
                <div>
                  <dt>
                    Работы <span className="faint">· {count(t.hours)} ч</span>
                  </dt>
                  <dd className="mono">{rub(t.labor)}</dd>
                </div>
                <div>
                  <dt>Запчасти, продажа</dt>
                  <dd className="mono">{rub(t.partsSale)}</dd>
                </div>
                <div>
                  <dt>Запчасти, закупка</dt>
                  <dd className="mono">−{rub(t.partsCost)}</dd>
                </div>
                <div className="an-ledger-sub">
                  <dt>
                    Наценка на запчастях{' '}
                    <span className="faint">· {pct(t.partsCost ? t.markup / t.partsCost : null)}</span>
                  </dt>
                  <dd className="mono">{rub(t.markup)}</dd>
                </div>
                <div className="an-ledger-total">
                  <dt>Валовая прибыль</dt>
                  <dd className="mono">{rub(t.profit)}</dd>
                </div>
                <div className="an-ledger-info">
                  <dt>Скидки клиентам, уже вычтены</dt>
                  <dd className="mono">{rub(t.discounts)}</dd>
                </div>
              </dl>

              {t.unknownCount > 0 && (
                <div className="an-warn">
                  <AlertTriangle size={16} aria-hidden />
                  <div className="col gap-2">
                    <span>
                      У {t.unknownCount} запчастей на <span className="mono">{rub(t.unknownSale)}</span> не
                      указана закупка. В выручке они есть, в прибыли — нет.
                    </span>
                    <button className="btn btn-default btn-sm" onClick={() => setFillOpen(true)}>
                      Указать закупку
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="panel an-bd">
            <div className="panel-head">
              <h2 className="panel-title">Что выгодно</h2>
              <div className="seg" role="group" aria-label="Разрез">
                {TABS.map((x) => (
                  <button
                    key={x.key}
                    className="seg-btn"
                    data-on={tab === x.key}
                    aria-pressed={tab === x.key}
                    onClick={() => pickTab(x.key)}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="an-table" style={{ '--an-cols': bd.cols.length } as React.CSSProperties}>
              <div className="list-head an-row">
                <span>{TABS.find((x) => x.key === tab)?.label}</span>
                {bd.cols.map((c, i) => (
                  <button
                    key={c.label}
                    className="an-th"
                    data-minor={c.minor || undefined}
                    aria-pressed={sortCol === i}
                    title={`Сортировать: ${c.label}`}
                    onClick={() => setSort(i)}
                  >
                    {c.label}
                    {sortCol === i && <ArrowDown size={11} aria-hidden />}
                  </button>
                ))}
                <span className="an-share-h">Доля выручки</span>
              </div>
              <div className="list">
                {visible.map((r) => {
                  const share = revenueTotal ? r.revenue / revenueTotal : 0;
                  return (
                    <div key={r.key} className="list-row an-row">
                      <span className="col" style={{ minWidth: 0 }}>
                        <span className="fw-500 truncate">{r.name}</span>
                        {(r.sub || r.unknown) && (
                          <span className="text-xs muted truncate">
                            {r.sub}
                            {r.sub && r.unknown ? ' · ' : ''}
                            {r.unknown ? `без закупки: ${r.unknown}` : ''}
                          </span>
                        )}
                      </span>
                      {bd.cols.map((c, i) => (
                        <span
                          key={c.label}
                          className="mono an-td"
                          data-minor={c.minor || undefined}
                          data-sorted={sortCol === i || undefined}
                        >
                          {fmtCell(r.vals[i], c)}
                        </span>
                      ))}
                      <span className="an-share">
                        <span className="an-meter" aria-hidden>
                          <span style={{ width: `${Math.max(1, share * 100)}%` }} />
                        </span>
                        <span className="mono text-xs muted">{pct(share)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              {rows.length > TOP_ROWS && (
                <button className="an-more" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Свернуть' : `Показать все · ${rows.length}`}
                </button>
              )}
            </div>
          </section>
        </>
      )}

      <CostFillModal open={fillOpen} orders={current} onClose={() => setFillOpen(false)} onSave={saveCosts} />
    </div>
  );
}
