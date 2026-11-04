// Pure «Запись» fields of the work-order summary + the slot picker body.
// Imported by the video too: must stay free of api/auth/query/toast imports.
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { CalendarClock, CalendarSearch, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import type { WorkOrder } from '../../lib/types';
import type { TimelineCfg, TimelineEvent } from '../../lib/schedule';
import { ScheduleTimeline } from '../../components/ScheduleTimeline';

export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

/** Σ labor hours in minutes — what «Подогнать под часы работ» sets the duration to. */
export function laborMinutes(wo: WorkOrder): number {
  return Math.round(
    (wo.labor_lines ?? []).reduce((a, l) => a + (l.hours ?? 0), 0) * 60,
  );
}

export interface ScheduleFieldsProps {
  wo: WorkOrder;
  defaultDurMin: number;
  disabled: boolean;
  /** Emits exactly one field per change: `{ scheduled_at }` or `{ scheduled_duration_min }`. */
  onChange(b: Partial<WorkOrder>): void;
  onOpenPicker(): void;
  /** «Подогнать под часы работ»; without it the click emits `{ scheduled_duration_min: laborMinutes }`. */
  onFit?(): void;
}

/** «Запись» в сводке наряда: дата/время + длительность + кнопка выбора слота. */
export function ScheduleFields({ wo, defaultDurMin, disabled, onChange, onOpenPicker, onFit }: ScheduleFieldsProps) {
  const fitMinutes = laborMinutes(wo);
  return (
    <>
      <div className="sum-line">
        <span className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CalendarClock size={14} /> Запись
        </span>
      </div>
      <div className="col gap-2" data-demo="wo-schedule">
        <input
          className="input"
          type="datetime-local"
          // Controlled (value, not defaultValue + key): commits on pick via the
          // optimistic mUpdate, so the time changes the instant you choose it.
          // No `key` → no remount mid-edit; the optimistic cache write re-renders
          // the value smoothly. Slot picker / «Подогнать» flow in the same way.
          value={toLocalInput(wo.scheduled_at)}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ scheduled_at: v ? new Date(v).toISOString() : null });
          }}
        />
        <div className="row gap-2" style={{ alignItems: 'flex-end' }}>
          <div className="field grow">
            <label className="label">Длительность, мин</label>
            <input
              className="input tnum"
              key={`dur-${wo.scheduled_duration_min ?? 'd'}`}
              defaultValue={wo.scheduled_duration_min ?? ''}
              placeholder={String(defaultDurMin)}
              inputMode="numeric"
              disabled={disabled || !wo.scheduled_at}
              onBlur={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                const n = v ? Number(v) : defaultDurMin;
                if (n !== (wo.scheduled_duration_min ?? null)) onChange({ scheduled_duration_min: n });
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          </div>
          <button
            type="button"
            className="btn btn-default btn-sm"
            disabled={disabled}
            onClick={() => onOpenPicker()}
          >
            <CalendarSearch size={15} /> Слот
          </button>
        </div>
        {!disabled && wo.scheduled_at && fitMinutes > 0 && fitMinutes !== wo.scheduled_duration_min && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => (onFit ? onFit() : onChange({ scheduled_duration_min: fitMinutes }))}
          >
            <Clock size={14} /> Подогнать под часы работ ({fitMinutes} мин)
          </button>
        )}
      </div>
    </>
  );
}

export interface SlotPickerViewProps {
  day: Date;
  events: TimelineEvent[];
  cfg: TimelineCfg;
  selection: TimelineEvent | null;
  now?: Date;
  /** Length of a freshly picked slot; the page passes the settings value. */
  defaultDurationMin?: number;
  onPrevDay(): void;
  onToday?(): void;
  onNextDay(): void;
  onSelect(startISO: string, durationMin: number): void;
}

/** Body of the «Выбор слота» modal: one day of the timeline, busy slots shown. */
export function SlotPickerView({
  day,
  events,
  cfg,
  selection,
  now,
  defaultDurationMin,
  onPrevDay,
  onToday,
  onNextDay,
  onSelect,
}: SlotPickerViewProps) {
  return (
    <div data-demo="slot-picker">
      <div className="row gap-2" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="fw-500" style={{ textTransform: 'capitalize' }}>
          {format(day, 'EEEE, d MMMM', { locale: ru })}
        </span>
        <div className="row gap-1">
          <button className="btn btn-default btn-icon btn-sm" onClick={() => onPrevDay()} aria-label="Назад"><ChevronLeft size={15} /></button>
          <button className="btn btn-default btn-sm" onClick={() => onToday?.()}>Сегодня</button>
          <button className="btn btn-default btn-icon btn-sm" onClick={() => onNextDay()} aria-label="Вперёд"><ChevronRight size={15} /></button>
        </div>
      </div>
      <ScheduleTimeline
        days={[day]}
        events={events}
        cfg={cfg}
        now={now}
        selectable
        selection={selection}
        defaultDurationMin={defaultDurationMin}
        showHeaders={false}
        onSelect={onSelect}
      />
    </div>
  );
}
