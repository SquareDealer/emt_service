import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ExternalLink } from 'lucide-react';
import { Modal, ListSkeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import type { PartCostItem } from '../../lib/types';
import { rub, signedPct } from './fmt';
import { COSTS_CHUNK, chunk, parsePrice } from './query';
import { unitLabel } from './view';

/**
 * Быстрое дозаполнение закупки: все запчасти периода без закупочной цены одним списком,
 * чтобы владельцу не открывать каждый наряд. Вводится закупка за единицу, как в наряде.
 * Ввод хранится по part_line_id, поэтому фоновый refetch списка его не теряет.
 */
export function CostFillModal({
  open,
  range,
  onClose,
}: {
  open: boolean;
  range: { from: string; to: string };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const { from, to } = range;
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', 'missing', from, to],
    queryFn: () => api.analyticsMissingCosts(from, to),
    enabled: open,
  });
  const rows = data ?? [];

  const prices: Record<string, number> = {};
  let invalid = 0;
  for (const r of rows) {
    const p = parsePrice(draft[r.part_line_id] ?? '');
    if (p.kind === 'ok') prices[r.part_line_id] = p.value;
    else if (p.kind === 'invalid') invalid++;
  }
  const filled = Object.keys(prices).length;

  const save = useMutation({
    mutationFn: async (items: PartCostItem[]) => {
      // Пачки последовательно: при ошибке уже сохранённые не откатываются.
      const saved: string[] = [];
      try {
        for (const part of chunk(items, COSTS_CHUNK)) {
          await api.setPartCosts(part);
          for (const i of part) saved.push(i.part_line_id);
        }
      } catch (e) {
        throw Object.assign(e instanceof Error ? e : new Error(String(e)), { saved });
      }
      return saved;
    },
    onSuccess: (saved) => {
      toast(`Закупка сохранена: ${saved.length}`, 'success');
      setDraft({});
      qc.invalidateQueries({ queryKey: ['analytics'] });
      onClose();
    },
    onError: (e) => {
      const saved = (e as { saved?: string[] }).saved ?? [];
      if (saved.length) {
        setDraft((d) => {
          const next = { ...d };
          for (const id of saved) delete next[id];
          return next;
        });
      }
      // Список и при полном отказе мог устареть (запчасть удалена) — иначе каждый повтор падает.
      qc.invalidateQueries({ queryKey: ['analytics'] });
      toast((e as Error).message, 'error');
    },
  });

  const close = () => {
    setDraft({});
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Закупка не указана"
      width={760}
      footer={
        <>
          <span className="text-sm muted grow">
            {filled ? `Заполнено ${filled} из ${rows.length}` : 'Закупка за единицу, ₽'}
          </span>
          <button type="button" className="btn btn-default" onClick={close}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!filled || invalid > 0 || save.isPending}
            onClick={() =>
              save.mutate(
                Object.entries(prices).map(([part_line_id, purchase_price]) => ({
                  part_line_id,
                  purchase_price,
                })),
              )
            }
          >
            Сохранить
          </button>
        </>
      }
    >
      <p className="text-sm muted" style={{ marginBottom: 'var(--sp-3)', maxWidth: '64ch' }}>
        Пока закупка пустая, продажа этих запчастей учтена в выручке, но не в прибыли. Видите и
        заполняете это только вы.
      </p>
      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : isError && !data ? (
        <div className="col gap-2" style={{ alignItems: 'flex-start' }}>
          <span className="text-sm">Не удалось загрузить список запчастей</span>
          <button type="button" className="btn btn-default btn-sm" onClick={() => refetch()}>
            Повторить
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm muted">Закупка указана у всех запчастей периода</p>
      ) : (
        <div className="an-fill">
          {rows.map((r) => {
            const raw = draft[r.part_line_id] ?? '';
            const bad = parsePrice(raw).kind === 'invalid';
            const unit = prices[r.part_line_id];
            const total = unit !== undefined ? r.qty * unit : null;
            const m = total !== null && total > 0 ? (r.net - total) / total : null;
            const doc = r.doc_number ?? '—';
            return (
              <div key={r.part_line_id} className="an-fill-row">
                <span className="col" style={{ minWidth: 0 }}>
                  <span className="fw-500 truncate">
                    {r.name}
                    {r.manufacturer && <span className="muted"> · {r.manufacturer}</span>}
                  </span>
                  <span className="text-xs muted truncate">
                    <span className="mono">№ {doc}</span> ·{' '}
                    {format(new Date(r.closed_at), 'd MMM', { locale: ru })} · {r.vehicle} · {r.qty}{' '}
                    {unitLabel(r.unit)}
                  </span>
                </span>
                <span className="col an-fill-sale">
                  <span className="text-xs faint">Продажа</span>
                  <span className="mono">{rub(r.net)}</span>
                </span>
                <input
                  className="input mono an-fill-input"
                  inputMode="decimal"
                  placeholder="Закупка за ед."
                  aria-label={`Закупка за ед.: ${r.name}, наряд № ${doc}`}
                  aria-invalid={bad ? 'true' : undefined}
                  value={raw}
                  disabled={save.isPending}
                  onChange={(e) => setDraft((d) => ({ ...d, [r.part_line_id]: e.target.value }))}
                />
                <span className="col mono text-xs an-fill-m" data-neg={(m ?? 0) < 0 || undefined}>
                  {total !== null && <span>{rub(total)}</span>}
                  {m !== null && <span>{signedPct(m)}</span>}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon btn-sm"
                  aria-label={`Открыть наряд № ${doc}`}
                  title="Открыть наряд"
                  onClick={() =>
                    navigate(`/work-orders/${r.work_order_id}`, {
                      state: { back: { to: '/analytics', label: 'Аналитика' } },
                    })
                  }
                >
                  <ExternalLink size={14} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
