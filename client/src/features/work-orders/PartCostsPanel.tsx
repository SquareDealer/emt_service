import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import type { PartCostRow, PartLine } from '../../lib/types';
import { rub, signedPct } from '../analytics/fmt';
import { parsePrice } from '../analytics/query';
import { unitLabel } from '../analytics/view';
import { costRows, costTotals, linesSignature } from './part-costs';

/**
 * Закупка запчастей наряда — видит и правит только владелец. Условие показа стоит на странице
 * (не-владелец не должен даже делать запрос), здесь только сама панель. Закупка за единицу;
 * работает и у закрытого наряда: правка закупки сумму наряда не двигает.
 */
export function PartCostsPanel({ workOrderId, lines }: { workOrderId: string; lines: PartLine[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  // Несохранённый ввод по id строки; ключ убирается после успеха, отказа или возврата к сохранённому.
  const [draft, setDraft] = useState<Record<string, string>>({});

  const queryKey = ['work-order', workOrderId, 'part-costs', linesSignature(lines)];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => api.partCosts(workOrderId),
  });

  const rows = costRows(lines, data ?? []);
  const totals = costTotals(rows);

  const dropDraft = (id: string) =>
    setDraft((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });

  const save = useMutation({
    mutationFn: (v: { id: string; price: number | null }) =>
      api.setPartCosts([{ part_line_id: v.id, purchase_price: v.price }]),
    onSuccess: (_r, v) => {
      qc.setQueryData<PartCostRow[]>(queryKey, (old) =>
        (old ?? []).map((c) => (c.part_line_id === v.id ? { ...c, purchase_price: v.price } : c)),
      );
      dropDraft(v.id);
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (e, v) => {
      // Поле возвращается к сохранённому значению: несохранённое не должно выглядеть сохранённым.
      dropDraft(v.id);
      toast((e as Error).message, 'error');
    },
  });

  const commit = (id: string, saved: number | null) => {
    const raw = draft[id];
    if (raw === undefined) return;
    const p = parsePrice(raw);
    if (p.kind === 'invalid') return;
    const next = p.kind === 'empty' ? null : p.value;
    if (next === saved) {
      dropDraft(id);
      return;
    }
    save.mutate({ id, price: next });
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">
          <Wallet size={16} className="muted" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} aria-hidden />
          Закупка
        </h2>
        <span className="text-xs muted">видите только вы</span>
      </div>
      {isLoading ? (
        <div className="pc-note muted text-sm">Загрузка…</div>
      ) : isError && !data ? (
        <div className="pc-note text-sm">
          Не удалось загрузить закупку{' '}
          <button type="button" className="btn btn-default btn-sm" onClick={() => refetch()}>
            Повторить
          </button>
        </div>
      ) : (
        <div className="pc">
          {rows.map((r) => {
            const raw = draft[r.id];
            const shown = raw ?? (r.purchase_price === null ? '' : String(r.purchase_price));
            const bad = raw !== undefined && parsePrice(raw).kind === 'invalid';
            return (
              <div key={r.id} className="pc-row">
                <span className="truncate">
                  {r.name}
                  {r.manufacturer && <span className="faint"> · {r.manufacturer}</span>}
                </span>
                <span className="mono tnum muted ta-r">
                  {r.qty} {unitLabel(r.unit)}
                </span>
                <input
                  className="input mono tnum pc-input"
                  inputMode="decimal"
                  placeholder="за ед."
                  aria-label={`Закупка за ед.: ${r.name}`}
                  aria-invalid={bad ? 'true' : undefined}
                  value={shown}
                  onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                  onBlur={() => commit(r.id, r.purchase_price)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    else if (e.key === 'Escape') dropDraft(r.id);
                  }}
                />
                <span className="mono tnum ta-r">{rub(r.cost)}</span>
                <span className="mono tnum ta-r pc-markup" data-neg={(r.markup ?? 0) < 0 || undefined}>
                  {r.markup_pct === null ? '—' : signedPct(r.markup_pct)}
                </span>
              </div>
            );
          })}
          <div className="pc-total text-sm">
            <span className="muted">
              Закупка <span className="mono tnum fw-500">{rub(totals.cost)}</span>
            </span>
            <span className="muted">
              Наценка <span className="mono tnum fw-500">{rub(totals.markup)}</span>
            </span>
            {totals.missing > 0 && <span className="faint">без закупки: {totals.missing}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
