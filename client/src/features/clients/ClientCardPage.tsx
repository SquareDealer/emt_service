import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { EmptyState, Modal, Spinner } from '../../components/ui';
import { ClientFormModal } from './ClientFormModal';
import { VehicleFormModal } from './VehicleFormModal';
import { ClientCardView } from './ClientCardView';
import type { Vehicle } from '../../lib/types';

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

  return (
    <>
      <ClientCardView
        client={client}
        vehicles={vehicles}
        orders={orders}
        creatingWoVehicleId={creatingWo}
        onEdit={() => setEditClient(true)}
        onDelete={() => setConfirmDel(true)}
        onAddVehicle={() => setAddVehicle(true)}
        onEditVehicle={setEditVehicle}
        onNewWorkOrder={newWorkOrder}
        onOpenOrder={(oid) => navigate(`/work-orders/${oid}`, { state: { back: backToClient } })}
      />

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
    </>
  );
}
