import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Modal } from '../../components/ui';
import type { MockOrder } from './mock';
import { pct, rub } from './fmt';

/**
 * Быстрое дозаполнение закупки: все запчасти периода без закупочной цены одним списком,
 * чтобы владельцу не открывать каждый наряд. Наценка считается сразу при вводе.
 */
export function CostFillModal({
  open,
  orders,
  onClose,
  onSave,
}: {
  open: boolean;
  orders: MockOrder[];
  onClose: () => void;
  onSave: (costs: Record<string, number>) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  const rows = useMemo(
    () =>
      orders
        .flatMap((o) => o.parts.filter((p) => p.cost === null).map((p) => ({ o, p })))
        .sort((a, b) => b.o.closedAt.getTime() - a.o.closedAt.getTime()),
    [orders],
  );

  const parsed: Record<string, number> = {};
  for (const [id, raw] of Object.entries(draft)) {
    const v = Number(raw.replace(/\s/g, '').replace(',', '.'));
    if (raw.trim() !== '' && Number.isFinite(v) && v >= 0) parsed[id] = v;
  }
  const filled = Object.keys(parsed).length;

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
            {filled ? `Заполнено ${filled} из ${rows.length}` : 'Сумма закупки на всю строку, ₽'}
          </span>
          <button type="button" className="btn btn-default" onClick={close}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!filled}
            onClick={() => {
              onSave(parsed);
              setDraft({});
            }}
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
      <div className="an-fill">
        {rows.map(({ o, p }) => {
          const v = parsed[p.id];
          const m = v !== undefined && v > 0 ? (p.net - v) / v : null;
          return (
            <label key={p.id} className="an-fill-row">
              <span className="col" style={{ minWidth: 0 }}>
                <span className="fw-500 truncate">
                  {p.name} <span className="muted">· {p.manufacturer}</span>
                </span>
                <span className="text-xs muted truncate">
                  <span className="mono">№ {o.docNumber}</span> ·{' '}
                  {format(o.closedAt, 'd MMM', { locale: ru })} · {o.vehicle} · {p.qty} {p.unit}
                </span>
              </span>
              <span className="col an-fill-sale">
                <span className="text-xs faint">Продажа</span>
                <span className="mono">{rub(p.net)}</span>
              </span>
              <input
                className="input mono an-fill-input"
                inputMode="decimal"
                placeholder="Закупка"
                aria-label={`Закупка: ${p.name}, наряд № ${o.docNumber}`}
                value={draft[p.id] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))}
              />
              <span className="mono text-xs an-fill-m" data-neg={(m ?? 0) < 0 || undefined}>
                {m === null ? '' : `${m < 0 ? '−' : '+'}${pct(Math.abs(m))}`}
              </span>
            </label>
          );
        })}
      </div>
    </Modal>
  );
}
