import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { Modal, Spinner } from '../../components/ui';
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

  const [model, setModel] = useState('');
  const [plate, setPlate] = useState('');
  const [vin, setVin] = useState('');
  const [year, setYear] = useState('');
  const [mileage, setMileage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setModel(initial?.model ?? '');
      setPlate(initial?.plate ?? '');
      setVin(initial?.vin ?? '');
      setYear(initial?.year != null ? String(initial.year) : '');
      setMileage(initial?.mileage != null ? String(initial.mileage) : '');
    }
  }, [open, initial]);

  const valid = model.trim() || plate.trim() || vin.trim();

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const body = {
        client_id: clientId,
        model: model.trim() || null,
        plate: plate.trim() || null,
        vin: vin.trim() || null,
        year: year ? Number(year) : null,
        mileage: mileage ? Number(mileage) : null,
      } as Partial<Vehicle>;
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
      <div className="col gap-3">
        <div className="grid-2">
          <div className="field">
            <label className="label">Модель / поколение</label>
            <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="R56, F56…" autoFocus />
          </div>
          <div className="field">
            <label className="label">Госномер</label>
            <input className="input mono" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="А123ВС777" />
          </div>
        </div>
        <div className="field">
          <label className="label">VIN</label>
          <input className="input mono" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="WMW…" />
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label">Год</label>
            <input className="input tnum" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} placeholder="2014" inputMode="numeric" />
          </div>
          <div className="field">
            <label className="label">Пробег, км</label>
            <input className="input tnum" value={mileage} onChange={(e) => setMileage(e.target.value.replace(/\D/g, ''))} placeholder="120000" inputMode="numeric" />
          </div>
        </div>
      </div>
    </Modal>
  );
}
