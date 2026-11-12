import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Pencil,
  Plus,
  Car,
  Wrench,
  Phone,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import {
  phone as fmtPhone,
  dateShort,
  dateTime,
  money,
  sourceLabel,
  vehicleLabel,
  clientDeals,
} from '../../lib/format';
import { Avatar, EmptyState, Modal, Spinner, StatusPill } from '../../components/ui';
import { ClientFormModal } from './ClientFormModal';
import { VehicleFormModal } from './VehicleFormModal';
import type { Vehicle } from '../../lib/types';
import './card.css';

export function ClientCardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const [editClient, setEditClient] = useState(false);
  const [addVehicle, setAddVehicle] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [creatingWo, setCreatingWo] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const mDelete = useMutation({
    mutationFn: () => api.deleteClient(id),
    onSuccess: () => {
      setConfirmDel(false);
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      toast('Клиент удалён', 'success');
      navigate('/clients');
    },
    onError: (e) => toast((e as Error).message || 'Не удалось удалить клиента', 'error'),
  });

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', id],
    queryFn: () => api.client(id),
  });
  const { data: vehicles } = useQuery({
    queryKey: ['client-vehicles', id],
    queryFn: () => api.clientVehicles(id),
    enabled: !!id,
  });
  const { data: allOrders } = useQuery({
    queryKey: ['work-orders'],
    queryFn: api.workOrders,
  });

  const orders = (allOrders ?? []).filter((w) => w.vehicle?.client?.id === id);

  const backToClient = { to: `/clients/${id}`, label: client?.full_name ?? 'Клиент' };

  const newWorkOrder = async (vehicleId: string) => {
    setCreatingWo(vehicleId);
    try {
      const wo = await api.createWorkOrder({ vehicle_id: vehicleId } as never);
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      navigate(`/work-orders/${wo.id}`, { state: { back: backToClient } });
    } catch (e) {
      toast((e as Error).message || 'Не удалось создать наряд', 'error');
    } finally {
      setCreatingWo(null);
    }
  };

  if (isLoading) {
    return <div className="page center" style={{ minHeight: 320 }}><Spinner size={22} /></div>;
  }
  if (!client) {
    return (
      <div className="page">
        <EmptyState title="Клиент не найден" hint="Возможно, запись удалена." action={<Link className="btn btn-default" to="/clients">К списку</Link>} />
      </div>
    );
  }

  const deals = clientDeals(client);

  return (
    <div className="page">
      <Link to="/clients" className="back-link"><ArrowLeft size={15} /> Клиенты</Link>

      <header className="client-head">
        <Avatar name={client.full_name} size={52} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row gap-3 wrap">
            <h1 className="page-title truncate">{client.full_name}</h1>
            <span className="badge">{sourceLabel(client.source)}</span>
          </div>
          <div className="row gap-4 wrap" style={{ marginTop: 4 }}>
            <a className="row gap-2 muted text-sm client-head-phone" href={`tel:${client.phone}`}>
              <Phone size={14} /> <span className="mono">{fmtPhone(client.phone)}</span>
            </a>
            <span className="text-sm muted">в базе с {dateShort(client.created_at)}</span>
            {client.discount_default_pct ? (
              <span className="text-sm muted">скидка {client.discount_default_pct}%</span>
            ) : null}
          </div>
        </div>
        <div className="row gap-2 client-head-actions">
          <button className="btn btn-default" onClick={() => setEditClient(true)}>
            <Pencil size={15} /> Изменить
          </button>
          <button className="btn btn-danger" onClick={() => setConfirmDel(true)} aria-label="Удалить клиента">
            <Trash2 size={15} /> Удалить
          </button>
        </div>
      </header>

      {(deals.count > 0 || client.notes) && (
        <div className="client-meta">
          {deals.count > 0 && (
            <div className="meta-stat">
              <span className="meta-val tnum">{deals.count}</span>
              <span className="meta-label">закрытых сделок</span>
            </div>
          )}
          {deals.count > 0 && (
            <div className="meta-stat">
              <span className="meta-val tnum">{money(deals.sum)}</span>
              <span className="meta-label">выручка</span>
            </div>
          )}
          {client.notes && (
            <div className="meta-note">
              <span className="meta-label">Заметки</span>
              <p className="text-sm">{client.notes}</p>
            </div>
          )}
        </div>
      )}

      <div className="card-grid">
        {/* vehicles */}
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Автомобили {vehicles ? `· ${vehicles.length}` : ''}</h2>
            <button className="btn btn-default btn-sm" onClick={() => setAddVehicle(true)}>
              <Plus size={15} /> Авто
            </button>
          </div>
          {!vehicles ? (
            <div style={{ padding: 'var(--sp-4)' }}><Spinner /></div>
          ) : vehicles.length === 0 ? (
            <EmptyState icon={<Car />} title="Нет автомобилей" hint="Добавьте первое ТС клиента." action={<button className="btn btn-default btn-sm" onClick={() => setAddVehicle(true)}><Plus size={15} /> Добавить</button>} />
          ) : (
            <div className="list">
              {vehicles.map((v) => (
                <div key={v.id} className="veh-row">
                  <div className="veh-icon"><Car size={18} /></div>
                  <div className="col grow" style={{ minWidth: 0 }}>
                    <button className="veh-name" onClick={() => setEditVehicle(v)} title="Редактировать">
                      {vehicleLabel(v)} <span className="mono faint">· {v.plate || v.vin || 'без номера'}</span>
                    </button>
                    <span className="text-xs muted">
                      {[v.year, v.mileage ? `${new Intl.NumberFormat('ru-RU').format(v.mileage)} км` : null].filter(Boolean).join(' · ') || 'нет данных'}
                    </span>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => newWorkOrder(v.id)} disabled={creatingWo === v.id}>
                    {creatingWo === v.id ? <Spinner /> : <Wrench size={15} />} Работа
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* work orders */}
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Заказ-наряды {`· ${orders.length}`}</h2>
          </div>
          {orders.length === 0 ? (
            <EmptyState icon={<Wrench />} title="Работ ещё не было" hint="Создайте наряд на любом из автомобилей слева." />
          ) : (
            <div className="list">
              {orders.map((w) => (
                <button key={w.id} className="list-row wo-row" onClick={() => navigate(`/work-orders/${w.id}`, { state: { back: backToClient } })}>
                  <div className="col" style={{ minWidth: 0 }}>
                    <span className="fw-500 truncate">{w.title || 'Заказ-наряд'}</span>
                    <span className="text-xs muted">
                      {vehicleLabel(w.vehicle)} <span className="mono">{w.vehicle?.plate || ''}</span>
                      {w.scheduled_at ? ` · ${dateTime(w.scheduled_at)}` : ''}
                    </span>
                  </div>
                  <StatusPill status={w.status} />
                  <span className="mono tnum fw-500 wo-total">{money(w.status === 'closed' ? w.total_frozen ?? w.total_cached : w.total_cached)}</span>
                  <ChevronRight size={16} className="faint" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <ClientFormModal open={editClient} onClose={() => setEditClient(false)} initial={client} onCreated={() => qc.invalidateQueries({ queryKey: ['client', id] })} />
      <VehicleFormModal open={addVehicle} onClose={() => setAddVehicle(false)} clientId={id} />
      <VehicleFormModal open={!!editVehicle} onClose={() => setEditVehicle(null)} clientId={id} initial={editVehicle ?? undefined} />

      <Modal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Удалить клиента?"
        width={440}
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
          Клиент «{client.full_name}», его автомобили ({vehicles?.length ?? 0}) и все открытые
          заказ-наряды будут удалены без возможности восстановления. Если есть закрытые наряды
          (история выручки), удаление будет отклонено.
        </p>
      </Modal>
    </div>
  );
}
