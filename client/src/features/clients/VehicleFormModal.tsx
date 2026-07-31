import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { Modal, Spinner } from '../../components/ui';
import {
  VehicleFields,
  emptyVehicleFields,
  vehicleFieldsBody,
  vehicleFieldsValid,
} from '../../components/VehicleFields';
import type { VehicleFieldsValue } from '../../components/VehicleFields';
import type { Vehicle } from '../../lib/types';

export function VehicleFormModal({
  open,
  onClose,
  clientId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  initial?: Vehicle;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const editing = !!initial;

  const [fields, setFields] = useState<VehicleFieldsValue>(emptyVehicleFields);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setFields({
        make: initial?.make ?? '',
        model: initial?.model ?? '',
        generationId: initial?.generation_id ?? '',
        plate: initial?.plate ?? '',
        vin: initial?.vin ?? '',
        year: initial?.year != null ? String(initial.year) : '',
        mileage: initial?.mileage != null ? String(initial.mileage) : '',
      });
    }
  }, [open, initial]);

  const patch = (p: Partial<VehicleFieldsValue>) => setFields((f) => ({ ...f, ...p }));
  const valid = vehicleFieldsValid(fields);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const body = { client_id: clientId, ...vehicleFieldsBody(fields) } as Partial<Vehicle>;
      if (editing) await api.updateVehicle(initial!.id, body);
      else await api.createVehicle(body);
      qc.invalidateQueries();
      toast(editing ? 'Авто обновлено' : 'Авто добавлено', 'success');
      onClose();
    } catch (e) {
      toast((e as Error).message || 'Ошибка сохранения', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Редактировать авто' : 'Новый автомобиль'}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Отмена</button>
          <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
            {busy ? <Spinner /> : <Check size={16} />}
            {editing ? 'Сохранить' : 'Добавить'}
          </button>
        </>
      }
    >
      <VehicleFields value={fields} onChange={patch} autoFocus />
    </Modal>
  );
}
