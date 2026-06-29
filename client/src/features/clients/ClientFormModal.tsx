import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Check, UserCheck } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { Modal, Spinner } from '../../components/ui';
import type { Client } from '../../lib/types';

export function ClientFormModal({
  open,
  onClose,
  onCreated,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (c: Client) => void;
  initial?: Client;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const editing = !!initial;

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [dup, setDup] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (open) {
      setFullName(initial?.full_name ?? '');
      setPhone(initial?.phone ?? '');
      setDiscount(initial?.discount_default_pct != null ? String(initial.discount_default_pct) : '');
      setNotes(initial?.notes ?? '');
      setDup(null);
    }
  }, [open, initial]);

  const valid = fullName.trim() && phone.trim();

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const body = {
        full_name: fullName.trim(),
        phone: phone.trim(),
        discount_default_pct: discount ? Number(discount) : null,
        notes: notes.trim() || null,
      };
      const c = editing ? await api.updateClient(initial!.id, body) : await api.createClient(body);
      qc.invalidateQueries();
      toast(editing ? 'Клиент обновлён' : 'Клиент создан', 'success');
      onCreated?.(c);
      if (editing) onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const b = e.body as { clientId?: string; clientName?: string } | null;
        if (b?.clientId) {
          setDup({ id: b.clientId, name: b.clientName ?? '' });
          return;
        }
      }
      toast((e as Error).message || 'Ошибка сохранения', 'error');
    } finally {
      setBusy(false);
    }
  };

  const showExisting = () => {
    if (!dup) return;
    onClose();
    navigate(`/clients/${dup.id}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Редактировать клиента' : 'Новый клиент'}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Отмена</button>
          <button className="btn btn-primary" onClick={submit} disabled={!valid || busy}>
            {busy ? <Spinner /> : <Check size={16} />}
            {editing ? 'Сохранить' : 'Создать'}
          </button>
        </>
      }
    >
      <div className="col gap-3">
        {dup && (
          <div className="inline-warn">
            <span>Клиент с таким номером уже есть{dup.name ? `: ${dup.name}` : ''}.</span>
            <button type="button" className="btn btn-default btn-sm" onClick={showExisting}>
              <UserCheck size={15} /> Показать
            </button>
          </div>
        )}
        <div className="field">
          <label className="label">ФИО</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Иванов Иван" autoFocus />
        </div>
        <div className="field">
          <label className="label">Телефон</label>
          <input className="input mono" value={phone} onChange={(e) => { setPhone(e.target.value); setDup(null); }} placeholder="+7 999 123-45-67" />
          <span className="field-hint">Нормализуется автоматически (8 → +7).</span>
        </div>
        <div className="field">
          <label className="label">Скидка по умолчанию, %</label>
          <input className="input tnum" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" inputMode="decimal" />
        </div>
        <div className="field">
          <label className="label">Заметки</label>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Постоянный клиент, всегда наличными…" />
        </div>
      </div>
    </Modal>
  );
}
