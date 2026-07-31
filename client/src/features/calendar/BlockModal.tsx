import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { canAssignMaster } from '../../lib/roles';
import { Modal, Spinner } from '../../components/ui';
import type { CalendarBlock } from '../../lib/types';
import type { Slot } from './SlotMenu';

/** datetime-local wants wall-clock text, not an instant. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function BlockModal({
  open,
  block,
  slot,
  onClose,
}: {
  open: boolean;
  /** null = creating a new one from `slot`. */
  block: CalendarBlock | null;
  slot: Slot | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const canAssign = canAssignMaster(user?.role);
  const editing = !!block;

  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [duration, setDuration] = useState('60');
  const [userId, setUserId] = useState('');
  const [notes, setNotes] = useState('');

  const { data: staff } = useQuery({ queryKey: ['users'], queryFn: api.users, enabled: open && canAssign });

  useEffect(() => {
    if (!open) return;
    setTitle(block?.title ?? '');
    setStartsAt(toLocalInput(block?.starts_at ?? slot?.startISO ?? new Date().toISOString()));
    setDuration(String(block?.duration_min ?? slot?.durationMin ?? 60));
    setUserId(block?.user_id ?? '');
    setNotes(block?.notes ?? '');
  }, [open, block, slot]);

  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ['calendar'] });
    toast(msg, 'success');
    onClose();
  };

  const mSave = useMutation({
    mutationFn: () => {
      const body: Partial<CalendarBlock> = {
        // Left null on purpose when blank — a block does not need a name.
        title: title.trim() || null,
        starts_at: new Date(startsAt).toISOString(),
        duration_min: Number(duration) || 60,
        notes: notes.trim() || null,
        ...(canAssign ? { user_id: userId || null } : {}),
      };
      return editing ? api.updateCalendarBlock(block!.id, body) : api.createCalendarBlock(body);
    },
    onSuccess: () => done(editing ? 'Резерв обновлён' : 'Время зарезервировано'),
    onError: (e) => toast((e as Error).message || 'Не удалось сохранить', 'error'),
  });

  const mDelete = useMutation({
    mutationFn: () => api.deleteCalendarBlock(block!.id),
    onSuccess: () => done('Резерв снят'),
    onError: (e) => toast((e as Error).message || 'Не удалось удалить', 'error'),
  });

  const busy = mSave.isPending || mDelete.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Резервная запись' : 'Резерв времени'}
      width={480}
      footer={
        <>
          {editing && (
            <button
              className="btn btn-ghost"
              style={{ marginRight: 'auto' }}
              onClick={() => mDelete.mutate()}
              disabled={busy}
            >
              <Trash2 size={16} /> Снять
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Отмена</button>
          <button className="btn btn-primary" onClick={() => mSave.mutate()} disabled={busy || !startsAt}>
            {busy ? <Spinner /> : <Check size={16} />}
            {editing ? 'Сохранить' : 'Зарезервировать'}
          </button>
        </>
      }
    >
      <div className="col gap-3">
        <div className="field">
          <label className="label">Название</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Необязательно — по умолчанию «Занято»"
            autoFocus
          />
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label">Начало</label>
            <input
              className="input"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label">Длительность, мин</label>
            <input
              className="input tnum"
              value={duration}
              onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
            />
          </div>
        </div>
        {canAssign && (
          <div className="field">
            <label className="label">Кого занимает</label>
            <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Весь сервис</option>
              {(staff ?? []).filter((u) => u.is_active).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <div className="text-xs muted" style={{ marginTop: 4 }}>
              «Весь сервис» видят все мастера. Личный резерв виден только этому мастеру и руководству.
            </div>
          </div>
        )}
        <div className="field">
          <label className="label">Заметка</label>
          <textarea
            className="input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
