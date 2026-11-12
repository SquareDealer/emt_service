import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
import { EmptyState, ListSkeleton, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import type { AnalyticsSummary } from '../../lib/types';
import {
  PERIOD_LABEL,
  comparisonFor,
  delta,
  periodOf,
  shift,
  type BreakdownCol,
  type BreakdownKind,
  type Period,
  type PeriodKind,
} from './analytics';
import { count, pct, rub, signedPct } from './fmt';
import { summaryParams } from './query';
import { TrendChart, TrendTable } from './TrendChart';
import { breakdownView, bucketsView, type ChartBucket } from './view';
import { CostFillModal } from './CostFillModal';
import './analytics.css';

const KINDS: PeriodKind[] = ['week', 'month', 'quarter', 'year'];
const TABS: { key: BreakdownKind; label: string }[] = [
  { key: 'labor', label: 'Работы' },
  { key: 'parts', label: 'Запчасти' },
  { key: 'vehicles', label: 'Машины' },
  { key: 'clients', label: 'Клиенты' },
];
const TOP_ROWS = 8;

function fmtCell(v: number | null, col: BreakdownCol): string {
  if (col.kind === 'money') return rub(v);
  if (col.kind === 'pct') return pct(v);
  return count(v);
}

/** Изменение к прошлому периоду. Направление несёт значок и знак, текст остаётся чернильным. */
function Delta({ value, points, title }: { value: number | null; points?: boolean; title: string }) {
  if (value === null) return <span className="an-delta faint">нет данных для сравнения</span>;
  const flat = Math.abs(value) < (points ? 0.0005 : 0.005);
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  const text = points
    ? `${value < 0 ? '−' : '+'}${Math.abs(value * 100).toFixed(1).replace('.', ',')} п.п.`
    : signedPct(value);
  return (
    <span className="an-delta" title={title} data-dir={flat ? 'flat' : value > 0 ? 'up' : 'down'}>
      <Icon size={14} aria-hidden />
      {flat ? 'без изменений' : text}
    </span>
  );
}

/** Данные хранятся вместе с периодом, которому принадлежат: при keepPreviousData `data` — от прошлого периода. */
interface Loaded {
  period: Period;
  cmpLabel: string;
  summary: AnalyticsSummary;
}

const BACK = { to: '/analytics', label: 'Аналитика' };

function KpiSkeleton() {
  return (
    <dl className="an-kpi-row" aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="an-kpi">
          <Skeleton w="55%" h={12} />
          <Skeleton w="70%" h={22} />
          <Skeleton w="45%" h={12} />
        </div>
      ))}
    </dl>
  );
}

export function AnalyticsPage() {
  const navigate = useNavigate();
  const now = useMemo(() => new Date(), []);

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

  const { edges, prev: prevRange } = summaryParams(period, cmp);
  const { data, isLoading, isError, isPlaceholderData, refetch } = useQuery({
    queryKey: ['analytics', 'summary', edges.join(','), prevRange.from, prevRange.to],
    queryFn: async (): Promise<Loaded> => ({
      period,
      cmpLabel: cmp.label,
      summary: await api.analyticsSummary({ edges, prev: prevRange }),
    }),
    placeholderData: keepPreviousData,
  });
  const stale = isPlaceholderData || undefined;

  // Корзины склеиваются с периодом данных, а не с выбранным сейчас; сбой склейки — та же панель ошибки.
  const buckets = useMemo(() => {
    if (!data) return { ok: null as ChartBucket[] | null, failed: false };
    try {
      return { ok: bucketsView(data.period, data.summary.buckets), failed: false };
    } catch {
      return { ok: null, failed: true };
    }
  }, [data]);

  const summary = data?.summary;
  const t = summary?.totals;
  const prev = summary?.previous ?? null;

  const bd = useMemo(
    () => (summary ? breakdownView(tab, summary.breakdown) : null),
    [summary, tab],
  );
  const sortCol = sort ?? bd?.defaultSort ?? 0;
  const rows = useMemo(
    () => [...(bd?.rows ?? [])].sort((a, b) => (b.vals[sortCol] ?? -Infinity) - (a.vals[sortCol] ?? -Infinity)),
    [bd, sortCol],
  );
  const revenueTotal = rows.reduce((s, r) => s + r.revenue, 0);
  const visible = showAll ? rows : rows.slice(0, TOP_ROWS);

  const pickTab = (k: BreakdownKind) => {
    setTab(k);
    setSort(null);
    setShowAll(false);
  };

  const failed = isError || buckets.failed;

  const kpis = [
    { label: 'Выручка', value: rub(t?.revenue ?? 0), d: delta(t?.revenue ?? 0, prev?.revenue ?? null), lead: true },
    {
      label: 'Валовая прибыль',
      value: rub(t?.profit ?? 0),
      d: delta(t?.profit ?? 0, prev?.profit ?? null),
      missing: t?.unknown_count,
    },
    {
      label: 'Маржа',
      value: pct(t?.margin ?? null, 1),
      d: t?.margin != null && prev?.margin != null ? t.margin - prev.margin : null,
      points: true,
    },
    { label: 'Закрыто нарядов', value: String(t?.orders ?? 0), d: delta(t?.orders ?? 0, prev?.orders ?? null) },
    { label: 'Средний чек', value: rub(t?.avg_check ?? null), d: delta(t?.avg_check ?? null, prev?.avg_check ?? null) },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Аналитика</h1>
          <p className="page-sub">
            Закрытые заказ-наряды, по дате закрытия
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
      {failed ? (
        <div className="panel an-error" role="alert">
          <span>Не удалось загрузить аналитику</span>
          <button type="button" className="btn btn-default btn-sm" onClick={() => refetch()}>
            Повторить
          </button>
        </div>
      ) : (
        <>
      <section className="panel an-kpis an-live" data-stale={stale} aria-label="Итоги периода">
        {isLoading || !t ? (
          <KpiSkeleton />
        ) : (
        <dl className="an-kpi-row">
          {kpis.map((k) => (
            <div key={k.label} className="an-kpi" data-lead={k.lead || undefined}>
              <dt>
                {k.label}
                {!!k.missing && (
                  <button
                    className="an-miss"
                    title={`Не указана закупка: ${k.missing} запч. — прибыль занижена. Нажмите, чтобы заполнить`}
                    aria-label={`Не указана закупка у ${k.missing} запчастей. Заполнить`}
                    onClick={() => setFillOpen(true)}
                  >
                    <span aria-hidden>!</span>
                    {k.missing}
                  </button>
                )}
              </dt>
              <dd className="an-kpi-value">{k.value}</dd>
              <dd>
                <Delta value={k.d} points={k.points} title={`Изменение ${data?.cmpLabel ?? cmp.label}`} />
              </dd>
            </div>
          ))}
        </dl>
        )}
      </section>

      {isLoading || !t || !bd ? (
        <>
          <div className="an-grid">
            <section className="panel" aria-busy="true">
              <div className="panel-head">
                <h2 className="panel-title">Динамика выручки</h2>
              </div>
              <Skeleton h={254} />
            </section>
            <section className="panel" aria-busy="true">
              <div className="panel-head">
                <h2 className="panel-title">Из чего сложилась прибыль</h2>
              </div>
              <div className="col gap-3" style={{ padding: 'var(--sp-3)' }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} h={16} />
                ))}
              </div>
            </section>
          </div>
          <section className="panel an-bd" aria-busy="true">
            <div className="panel-head">
              <h2 className="panel-title">Что выгодно</h2>
            </div>
            <ListSkeleton rows={5} />
          </section>
        </>
      ) : t.orders === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<BarChart3 />}
            title="За этот период нет закрытых нарядов"
            hint="В аналитику попадает наряд, когда он переведён в «Выдана». Выберите другой период стрелками."
          />
        </div>
      ) : (
        <>
          <div className="an-grid an-live" data-stale={stale}>
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
                <TrendChart buckets={buckets.ok ?? []} now={now} />
              ) : (
                <TrendTable buckets={buckets.ok ?? []} now={now} />
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
                  <dd className="mono">{rub(t.parts_sale)}</dd>
                </div>
                <div>
                  <dt>Запчасти, закупка</dt>
                  <dd className="mono">−{rub(t.parts_cost)}</dd>
                </div>
                <div className="an-ledger-sub">
                  <dt>
                    Наценка на запчастях{' '}
                    <span className="faint">· {pct(t.parts_cost ? t.markup / t.parts_cost : null)}</span>
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

              {t.unknown_count > 0 && (
                <div className="an-warn">
                  <AlertTriangle size={16} aria-hidden />
                  <div className="col gap-2">
                    <span>
                      У {t.unknown_count} запчастей на <span className="mono">{rub(t.unknown_sale)}</span> не
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

          <section className="panel an-bd an-live" data-stale={stale}>
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
                    <div
                      key={r.key}
                      className="list-row an-row"
                      {...(r.href
                        ? {
                            role: 'link',
                            tabIndex: 0,
                            onClick: () => navigate(r.href!, { state: { back: BACK } }),
                            onKeyDown: (e: React.KeyboardEvent) => {
                              if (e.key === 'Enter') navigate(r.href!, { state: { back: BACK } });
                            },
                          }
                        : {})}
                    >
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
        </>
      )}

      <CostFillModal
        open={fillOpen}
        range={{ from: period.from.toISOString(), to: period.to.toISOString() }}
        onClose={() => setFillOpen(false)}
      />
    </div>
  );
}
