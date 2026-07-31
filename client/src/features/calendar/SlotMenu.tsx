import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { CalendarPlus, Ban } from 'lucide-react';
import { Modal } from '../../components/ui';

export interface Slot {
  startISO: string;
  durationMin: number;
}

/**
 * What a click on empty calendar space offers. Two explicit choices beat a mode
 * toggle in the toolbar: nothing to remember, and no way to create the wrong
 * kind of thing by accident.
 */
export function SlotMenu({
  slot,
  onClose,
  onBooking,
  onReserve,
}: {
  slot: Slot | null;
  onClose: () => void;
  onBooking: (slot: Slot) => void;
  onReserve: (slot: Slot) => void;
}) {
  const when = slot
    ? format(new Date(slot.startISO), 'd MMMM, HH:mm', { locale: ru })
    : '';

  return (
    <Modal open={!!slot} onClose={onClose} title={when} width={420}>
      <div className="col gap-2">
        <button
          className="list-row"
          style={{ gridTemplateColumns: 'auto 1fr', textAlign: 'left' }}
          onClick={() => slot && onBooking(slot)}
        >
          <CalendarPlus size={18} className="muted" />
          <div className="col">
            <span className="fw-500">Новая запись</span>
            <span className="text-xs muted">Клиент, автомобиль и заказ-наряд на это время</span>
          </div>
        </button>
        <button
          className="list-row"
          style={{ gridTemplateColumns: 'auto 1fr', textAlign: 'left' }}
          onClick={() => slot && onReserve(slot)}
        >
          <Ban size={18} className="muted" />
          <div className="col">
            <span className="fw-500">Резерв</span>
            <span className="text-xs muted">Просто занять время — без клиента и машины</span>
          </div>
        </button>
      </div>
    </Modal>
  );
}
