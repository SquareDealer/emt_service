import { Link } from 'react-router-dom';
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
import {
  phone as fmtPhone,
  dateShort,
  dateTime,
  money,
  sourceLabel,
  vehicleLabel,
} from '../../lib/format';
import { Avatar, EmptyState, Spinner, StatusPill } from '../../components/ui';
import type { Client, Vehicle, WorkOrder } from '../../lib/types';
import './card.css';

export interface ClientCardViewProps {
  client: Client;
  /** undefined = still loading. */
  vehicles?: Vehicle[];
  orders: WorkOrder[];
  creatingWoVehicleId?: string | null;
  /** Demo: marks this order row with data-highlight. */
  highlightOrderId?: string;
  onEdit(): void;
  onDelete(): void;
  onAddVehicle(): void;
  onEditVehicle(v: Vehicle): void;
  onNewWorkOrder(vehicleId: string): void;
  onOpenOrder(id: string): void;
}

export function ClientCardView({
  client,
  vehicles,
  orders,
  creatingWoVehicleId,
  highlightOrderId,
  onEdit,
  onDelete,
  onAddVehicle,
  onEditVehicle,
  onNewWorkOrder,
  onOpenOrder,
}: ClientCardViewProps) {
  return (
    <div className="page">
      <Link to="/clients" className="back-link"><ArrowLeft size={15} /> Клиенты</Link>

      <header className="client-head" data-demo="client-head">
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
          <button className="btn btn-default" data-demo="client-edit" onClick={onEdit}>
            <Pencil size={15} /> Изменить
          </button>
          <button className="btn btn-danger" onClick={onDelete} aria-label="Удалить клиента">
            <Trash2 size={15} /> Удалить
          </button>
        </div>
      </header>

      {(client.imported_deals_count > 0 || client.notes) && (
        <div className="client-meta">
          {client.imported_deals_count > 0 && (
            <div className="meta-stat">
              <span className="meta-val tnum">{client.imported_deals_count}</span>
              <span className="meta-label">закрытых сделок (история)</span>
            </div>
          )}
          {client.imported_deals_count > 0 && (
            <div className="meta-stat">
              <span className="meta-val tnum">{money(client.imported_deals_sum)}</span>
              <span className="meta-label">выручка (история)</span>
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
            <button className="btn btn-default btn-sm" onClick={onAddVehicle}>
              <Plus size={15} /> Авто
            </button>
          </div>
          {!vehicles ? (
            <div style={{ padding: 'var(--sp-4)' }}><Spinner /></div>
          ) : vehicles.length === 0 ? (
            <EmptyState icon={<Car />} title="Нет автомобилей" hint="Добавьте первое ТС клиента." action={<button className="btn btn-default btn-sm" onClick={onAddVehicle}><Plus size={15} /> Добавить</button>} />
          ) : (
            <div className="list">
              {vehicles.map((v) => (
                <div key={v.id} className="veh-row" data-demo="vehicle-row">
                  <div className="veh-icon"><Car size={18} /></div>
                  <div className="col grow" style={{ minWidth: 0 }}>
                    <button className="veh-name" onClick={() => onEditVehicle(v)} title="Редактировать">
                      {vehicleLabel(v)} <span className="mono faint">· {v.plate || v.vin || 'без номера'}</span>
                    </button>
                    <span className="text-xs muted">
                      {[v.year, v.mileage ? `${new Intl.NumberFormat('ru-RU').format(v.mileage)} км` : null].filter(Boolean).join(' · ') || 'нет данных'}
                    </span>
                  </div>
                  <button className="btn btn-ghost btn-sm" data-demo="new-work-order" onClick={() => onNewWorkOrder(v.id)} disabled={creatingWoVehicleId === v.id}>
                    {creatingWoVehicleId === v.id ? <Spinner /> : <Wrench size={15} />} Работа
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* work orders */}
        <section className="panel" data-demo="client-orders">
          <div className="panel-head">
            <h2 className="panel-title">Заказ-наряды {`· ${orders.length}`}</h2>
          </div>
          {orders.length === 0 ? (
            <EmptyState icon={<Wrench />} title="Работ ещё не было" hint="Создайте наряд на любом из автомобилей слева." />
          ) : (
            <div className="list">
              {orders.map((w) => (
                <button key={w.id} className="list-row wo-row" data-demo="order-row" data-id={w.id} data-highlight={highlightOrderId === w.id ? '' : undefined} onClick={() => onOpenOrder(w.id)}>
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
    </div>
  );
}
