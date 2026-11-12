import { useEffect, useId, useRef, useState } from 'react';
import type { Bucket } from './analytics';
import { niceScale } from './analytics';
import { rub, rubAxis } from './fmt';

/**
 * Столбцы выручки. Снизу вверх: работы → наценка запчастей → закупка → «закупка не указана».
 * Цветная часть от базовой линии — валовая прибыль, серая сверху — то, что ушло поставщику.
 * Одна ось, одна шкала (рубли): прибыль и выручку можно сравнивать глазом.
 */
const SERIES = [
  { key: 'labor', label: 'Работы', cls: 'an-s-labor' },
  { key: 'markup', label: 'Наценка запчастей', cls: 'an-s-markup' },
  { key: 'cost', label: 'Закупка запчастей', cls: 'an-s-cost' },
  { key: 'unknown', label: 'Закупка не указана', cls: 'an-s-unknown' },
] as const;

const H = 220;
const AXIS = 24;
const LEFT = 52;
const TOP = 10;
const GAP = 2;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Прямоугольник со скруглённым верхом — «data-end», низ остаётся прямым. */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}a${rr},${rr} 0 0 1 ${rr},${-rr}H${x + w - rr}a${rr},${rr} 0 0 1 ${rr},${rr}V${y + h}Z`;
}

export function TrendChart({ buckets, now }: { buckets: Bucket[]; now: Date }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const hatch = useId();

  const hasUnknown = buckets.some((b) => b.unknown > 0);
  const legend = SERIES.filter((s) => s.key !== 'unknown' || hasUnknown);

  const n = buckets.length;
  const plotW = Math.max(0, width - LEFT);
  const band = n ? plotW / n : 0;
  const barW = Math.max(3, Math.min(24, band - 4));
  const { top, step } = niceScale(Math.max(...buckets.map((b) => b.revenue), 0));
  const y = (v: number) => TOP + H - (v / top) * H;
  const ticks: number[] = [];
  for (let t = 0; t <= top + step / 2; t += step) ticks.push(t);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 44))));

  const act = active !== null ? buckets[active] : null;
  const tipLeft = active !== null ? LEFT + band * (active + 0.5) : 0;
  const tipRight = active !== null && tipLeft > width * 0.6;

  return (
    <div className="an-chart">
      <ul className="an-legend" aria-label="Обозначения">
        {legend.map((s) => (
          <li key={s.key}>
            <span className={`an-swatch ${s.cls}`} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>

      <div className="an-plot" ref={ref} onMouseLeave={() => setActive(null)}>
        {width > 0 && (
          <svg
            width={width}
            height={TOP + H + AXIS}
            role="img"
            aria-label="Выручка по периодам: работы, наценка и закупка запчастей"
          >
            <defs>
              <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" className="an-hatch-bg" />
                <rect width="2" height="6" className="an-hatch-ink" />
              </pattern>
            </defs>

            {ticks.map((t) => (
              <g key={t}>
                <line x1={LEFT} x2={width} y1={y(t)} y2={y(t)} className={t === 0 ? 'an-base' : 'an-grid'} />
                <text x={LEFT - 8} y={y(t)} dy="0.32em" textAnchor="end" className="an-tick">
                  {rubAxis(t)}
                </text>
              </g>
            ))}

            {buckets.map((b, i) => {
              const cx = LEFT + band * (i + 0.5);
              const x = cx - barW / 2;
              const segs = SERIES.map((s) => ({ ...s, v: b[s.key] })).filter((s) => s.v > 0);
              let acc = 0;
              const future = b.from > now;
              return (
                <g key={i}>
                  {active === i && (
                    <rect x={LEFT + band * i} y={TOP} width={band} height={H} className="an-band" />
                  )}
                  {segs.map((s, j) => {
                    const y0 = y(acc);
                    acc += s.v;
                    const y1 = y(acc);
                    const last = j === segs.length - 1;
                    // 2px «воздуха» между сегментами вместо обводки
                    const h = Math.max(1, y0 - y1 - (last ? 0 : GAP));
                    const yy = y0 - h;
                    const fill = s.key === 'unknown' ? { fill: `url(#${hatch})` } : undefined;
                    return last ? (
                      <path key={s.key} d={topRounded(x, yy, barW, h, 4)} className={s.cls} style={fill} />
                    ) : (
                      <rect key={s.key} x={x} y={yy} width={barW} height={h} className={s.cls} style={fill} />
                    );
                  })}
                  {(i % labelEvery === 0 || n <= 14) && (
                    <text x={cx} y={TOP + H + 16} textAnchor="middle" className="an-tick" data-future={future || undefined}>
                      {b.label}
                    </text>
                  )}
                  <rect
                    x={LEFT + band * i}
                    y={TOP}
                    width={band}
                    height={H + AXIS}
                    fill="transparent"
                    tabIndex={0}
                    className="an-hit"
                    aria-label={`${b.title}: выручка ${rub(b.revenue)}, прибыль ${rub(b.profit)}`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {act && (
          <div
            className="an-tip"
            role="status"
            style={tipRight ? { right: width - tipLeft + 12 } : { left: tipLeft + 12 }}
          >
            <div className="an-tip-title">{act.title}</div>
            {act.revenue === 0 ? (
              <div className="muted">Закрытых нарядов нет</div>
            ) : (
              <>
                {SERIES.filter((s) => act[s.key] > 0).map((s) => (
                  <div key={s.key} className="an-tip-row">
                    <span className={`an-swatch ${s.cls}`} aria-hidden />
                    <span>{s.label}</span>
                    <span className="mono">{rub(act[s.key])}</span>
                  </div>
                ))}
                <div className="an-tip-sum">
                  <div className="an-tip-row">
                    <span />
                    <span>Выручка · {act.orders} нар.</span>
                    <span className="mono fw-600">{rub(act.revenue)}</span>
                  </div>
                  <div className="an-tip-row">
                    <span />
                    <span>Валовая прибыль</span>
                    <span className="mono fw-600">{rub(act.profit)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Табличный двойник графика — те же цифры без наведения. */
export function TrendTable({ buckets, now }: { buckets: Bucket[]; now: Date }) {
  const rows = buckets.filter((b) => b.from <= now);
  return (
    <div className="an-ttable">
      <table>
        <thead>
          <tr>
            <th>Период</th>
            <th>Нарядов</th>
            <th>Работы</th>
            <th>Наценка</th>
            <th>Закупка</th>
            <th>Без закупки</th>
            <th>Выручка</th>
            <th>Прибыль</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.title} data-empty={b.orders === 0 || undefined}>
              <td>{b.title}</td>
              <td className="mono">{b.orders || '—'}</td>
              <td className="mono">{b.orders ? rub(b.labor) : '—'}</td>
              <td className="mono">{b.orders ? rub(b.markup) : '—'}</td>
              <td className="mono">{b.orders ? rub(b.cost) : '—'}</td>
              <td className="mono">{b.unknown ? rub(b.unknown) : '—'}</td>
              <td className="mono fw-500">{b.orders ? rub(b.revenue) : '—'}</td>
              <td className="mono fw-500">{b.orders ? rub(b.profit) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
