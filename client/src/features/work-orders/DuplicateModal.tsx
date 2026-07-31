import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Copy, Search, Check, Car } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { phone as fmtPhone, vehicleLabel } from '../../lib/format';
import { Modal, Spinner } from '../../components/ui';
import type { WorkOrder } from '../../lib/types';

/**
 * «Копировать заказ-наряд для переноса работ на нового клиента».
 *
 * The estimate is reproduced as it stands — same prices, same blocks. What
 * belongs to the original run (schedule, document numbers, payment) is not
 * copied, so the new order starts clean.
 */
export function DuplicateModal({
  open,
  wo,
  onClose,
}: {
  open: boolean;
  wo: WorkOrder;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  const [target, setTarget] = useState<'same' | 'other'>('same');
  const [q, setQ] = useState('');
  const [clientId, setClientId] = useState<string>('');
  const [vehicleId, setVehicleId] = useState<string>('');

  useEffect(() => {
    if (open) {
      setTarget('same');
      setQ('');
      setClientId('');
      setVehicleId('');
    }
  }, [open]);

  const { data: hits, isFetching } = useQuery({
    queryKey: ['dup-search', q],
    queryFn: () => api.search(q.trim()),
    enabled: open && target === 'other' && q.trim().length >= 1,
  });
  const clients = (hits ?? []).filter((h) => h.type === 'client');

  const { data: vehicles } = useQuery({
    queryKey: ['dup-vehicles', clientId],
    queryFn: () => api.clientVehicles(clientId),
    enabled: open && !!clientId,
  });

  const mDuplicate = useMutation({
    mutationFn: () =>
      api.duplicateWorkOrder(wo.id, target === 'other' ? vehicleId : undefined),
    onSuccess: (copy) => {
      qc.invalidateQueries();
      toast('Копия создана', 'success');
      onClose();
      navigate(`/work-orders/${copy.id}`, {
        state: { back: { to: `/work-orders/${wo.id}`, label: 'Исходный наряд' } },
      });
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const ready = target === 'same' || !!vehicleId;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Копировать заказ-наряд"
      width={560}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={mDuplicate.isPending}>Отмена</button>
          <button
            className="btn btn-primary"
            onClick={() => mDuplicate.mutate()}
            disabled={!ready || mDuplicate.isPending}
          >
            {mDuplicate.isPending ? <Spinner /> : <Copy size={16} />} Копировать
          </button>
        </>
      }
    >
      <div className="col gap-3">
        <p className="text-sm muted">
          Все работы и запчасти переедут в новый наряд с теми же ценами и блоками.
          Запись в календаре, номера документов и оплата не копируются.
        </p>

        <div className="seg">
          <button className="seg-btn" data-on={target === 'same'} onClick={() => setTarget('same')}>
            Тот же автомобиль
          </button>
          <button className="seg-btn" data-on={target === 'other'} onClick={() => setTarget('other')}>
            Другой клиент
          </button>
        </div>

        {target === 'same' ? (
          <div className="row gap-2" style={{ alignItems: 'center' }}>
            <Car size={15} className="muted" />
            <span className="fw-500">{vehicleLabel(wo.vehicle)}</span>
            <span className="mono faint">{wo.vehicle?.plate || wo.vehicle?.vin || ''}</span>
          </div>
        ) : (
          <>
            <div className="field">
              <label className="label">Клиент</label>
              <div className="row gap-2">
                <Search size={16} className="muted" style={{ alignSelf: 'center' }} />
                <input
                  className="input"
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setClientId(''); setVehicleId(''); }}
                  placeholder="Имя или телефон"
                  autoFocus
                />
              </div>
            </div>

            {q.trim() && (
              <div className="col" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', maxHeight: 180, overflowY: 'auto' }}>
                {isFetching && <div className="center" style={{ padding: 'var(--sp-4)' }}><Spinner /></div>}
                {!isFetching && clients.length === 0 && (
                  <div className="smeta-empty">Не найдено</div>
                )}
                {clients.map((c) => (
                  <button
                    key={c.id}
                    className="list-row"
                    style={{ gridTemplateColumns: '1fr auto', borderRadius: 0 }}
                    aria-current={clientId === c.id}
                    onClick={() => { setClientId(c.id); setVehicleId(''); }}
                  >
                    <div className="col" style={{ minWidth: 0 }}>
                      <span className="fw-500 truncate">{c.full_name}</span>
                      <span className="text-xs muted mono">{fmtPhone(c.phone ?? '')}</span>
                    </div>
                    {clientId === c.id && <Check size={16} className="muted" />}
                  </button>
                ))}
              </div>
            )}

            {clientId && (
              <div className="field">
                <label className="label">Автомобиль</label>
                {(vehicles ?? []).length === 0 ? (
                  <p className="text-sm muted">У клиента нет машин — заведите её на карточке клиента.</p>
                ) : (
                  <div className="col" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                    {(vehicles ?? []).map((v) => (
                      <button
                        key={v.id}
                        className="list-row"
                        style={{ gridTemplateColumns: '1fr auto', borderRadius: 0 }}
                        aria-current={vehicleId === v.id}
                        onClick={() => setVehicleId(v.id)}
                      >
                        <span className="truncate">
                          {vehicleLabel(v)} <span className="mono faint">· {v.plate || v.vin || 'без номера'}</span>
                        </span>
                        {vehicleId === v.id && <Check size={16} className="muted" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
