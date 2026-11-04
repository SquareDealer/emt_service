import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, addWeeks, format, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { canAssignMaster } from '../../lib/roles';
import type { WorkOrder } from '../../lib/types';
import { calendarRangeLabel, workOrderToEvent } from '../../lib/view-helpers';
import { blockToEvent, dayRangeIso, hasConflict, parseEventId } from '../../lib/schedule';
import type { TimelineCfg, TimelineEvent } from '../../lib/schedule';
import { useIntake } from '../../lib/intake';
import { BlockModal } from './BlockModal';
import { SlotMenu } from './SlotMenu';
import type { CalendarBlock } from '../../lib/types';
import { ScheduleTimeline } from '../../components/ScheduleTimeline';
import type { TimelineOrientation } from '../../components/ScheduleTimeline';
import { Spinner } from '../../components/ui';
import './calendar.css';

type View = 'week' | 'day';

const ORIENT_KEY = 'crm-cal-orientation';

export function CalendarPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const showMaster = canAssignMaster(user?.role);
  const [anchor, setAnchor] = useState(new Date());
  const [view, setView] = useState<View>('week');
  const [orientation, setOrientation] = useState<TimelineOrientation>(
    () => (localStorage.getItem(ORIENT_KEY) as TimelineOrientation) || 'vertical',
  );
  useEffect(() => {
    try { localStorage.setItem(ORIENT_KEY, orientation); } catch { /* ignore */ }
  }, [orientation]);

  const days = useMemo(() => {
    if (view === 'day') return [anchor];
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor, view]);

  const { from, to } = useMemo(() => dayRangeIso(days), [days]);
  const calKey = ['calendar', from, to];

  // Kept on its own key so the five existing invalidateQueries(['calendar'])
  // calls still cover it by prefix, while the typed optimistic setQueryData
  // below keeps operating on a plain WorkOrder[].
  const blocksKey = ['calendar', 'blocks', from, to];

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const { data, isLoading } = useQuery({ queryKey: calKey, queryFn: () => api.calendar(from, to) });
  const { data: blocks } = useQuery({ queryKey: blocksKey, queryFn: () => api.calendarBlocks(from, to) });

  const { openIntake } = useIntake();
  const [slotMenu, setSlotMenu] = useState<{ startISO: string; durationMin: number } | null>(null);
  const [blockEdit, setBlockEdit] = useState<CalendarBlock | 'new' | null>(null);
  const [newBlockSlot, setNewBlockSlot] = useState<{ startISO: string; durationMin: number } | null>(null);

  const defaultDur = settings?.default_appointment_min ?? 60;

  const cfg: TimelineCfg = {
    startHour: settings?.working_hours_start ?? 8,
    endHour: settings?.working_hours_end ?? 20,
    slotMin: settings?.slot_minutes ?? 30,
    pxPerMin: view === 'day' ? 1.2 : 0.8,
  };

  const events: TimelineEvent[] = useMemo(
    () =>
      (data ?? [])
        .map((w) => workOrderToEvent(w, defaultDur, { showMaster }))
        .filter((e): e is TimelineEvent => e !== null),
    [data, defaultDur, showMaster],
  );

  const blockEvents: TimelineEvent[] = useMemo(
    () => (blocks ?? []).map(blockToEvent),
    [blocks],
  );
  // Reserved time takes part in layout and conflict checks exactly like a booking.
  const allEvents = useMemo(() => [...events, ...blockEvents], [events, blockEvents]);

  const mUpdate = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<WorkOrder> }) =>
      api.updateWorkOrder(id, body),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: calKey });
      const prev = qc.getQueryData<WorkOrder[]>(calKey);
      qc.setQueryData<WorkOrder[]>(calKey, (old) =>
        (old ?? []).map((w) => (w.id === id ? { ...w, ...body } : w)),
      );
      return { prev };
    },
    onSuccess: (_data, { body }) => {
      if (body.scheduled_at) {
        toast(`Время записи изменено · ${format(new Date(body.scheduled_at), 'HH:mm')}`, 'success');
      } else if (body.scheduled_duration_min != null) {
        toast(`Длительность изменена · ${body.scheduled_duration_min} мин`, 'success');
      }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(calKey, ctx.prev);
      toast('Не удалось сохранить запись', 'error');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['work-order'] }); // detail page, if open
    },
  });

  const mBlock = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<CalendarBlock> }) =>
      api.updateCalendarBlock(id, body),
    onError: (e) => toast((e as Error).message || 'Не удалось сдвинуть резерв', 'error'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
  });

  const warnIfConflict = (proposed: TimelineEvent) => {
    if (hasConflict(proposed, allEvents)) toast('Пересечение с другой записью', 'info');
  };

  // The timeline hands back a bare id string; the blk: prefix is what tells the
  // two kinds apart, since they need different endpoints.
  const onEventMove = (rawId: string, startISO: string) => {
    const ev = allEvents.find((e) => e.id === rawId);
    if (ev) warnIfConflict({ ...ev, start: new Date(startISO) });
    const { kind, id } = parseEventId(rawId);
    if (kind === 'block') mBlock.mutate({ id, body: { starts_at: startISO } });
    else mUpdate.mutate({ id, body: { scheduled_at: startISO } });
  };

  const onEventResize = (rawId: string, durationMin: number) => {
    const ev = allEvents.find((e) => e.id === rawId);
    if (ev) warnIfConflict({ ...ev, durationMin });
    const { kind, id } = parseEventId(rawId);
    if (kind === 'block') mBlock.mutate({ id, body: { duration_min: durationMin } });
    else mUpdate.mutate({ id, body: { scheduled_duration_min: durationMin } });
  };

  const onEventClick = (rawId: string) => {
    const { kind, id } = parseEventId(rawId);
    if (kind === 'block') {
      const b = (blocks ?? []).find((x) => x.id === id);
      if (b) setBlockEdit(b);
      return;
    }
    navigate(`/work-orders/${id}`, { state: { back: { to: '/calendar', label: 'Календарь' } } });
  };

  const move = (dir: number) =>
    setAnchor((d) => (view === 'day' ? addDays(d, dir) : addWeeks(d, dir)));

  const rangeLabel = calendarRangeLabel(view, days);

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Календарь</h1>
          <p className="page-sub">Записи по времени и длительности — тяните, чтобы перенести или растянуть</p>
        </div>
        <div className="row gap-2 wrap cal-controls">
          <div className="seg">
            <button className="seg-btn" data-on={view === 'week'} onClick={() => setView('week')}>Неделя</button>
            <button className="seg-btn" data-on={view === 'day'} onClick={() => setView('day')}>День</button>
          </div>
          <div className="seg">
            <button className="seg-btn" data-on={orientation === 'vertical'} onClick={() => setOrientation('vertical')}>Верт.</button>
            <button className="seg-btn" data-on={orientation === 'horizontal'} onClick={() => setOrientation('horizontal')}>Гориз.</button>
          </div>
          <div className="row gap-1">
            <button className="btn btn-default btn-icon" onClick={() => move(-1)} aria-label="Назад"><ChevronLeft size={16} /></button>
            <button className="btn btn-default" onClick={() => setAnchor(new Date())}>Сегодня</button>
            <button className="btn btn-default btn-icon" onClick={() => move(1)} aria-label="Вперёд"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      <div className="cal-rangebar">{rangeLabel}</div>

      {isLoading ? (
        <div className="center" style={{ minHeight: 280 }}><Spinner size={22} /></div>
      ) : (
        <ScheduleTimeline
          days={days}
          events={allEvents}
          cfg={cfg}
          orientation={orientation}
          interactive
          defaultDurationMin={defaultDur}
          onEventClick={onEventClick}
          onEventMove={onEventMove}
          onEventResize={onEventResize}
          onEmptyClick={(startISO, durationMin) => setSlotMenu({ startISO, durationMin })}
        />
      )}

      {!isLoading && allEvents.length === 0 && (
        <div className="empty" style={{ marginTop: 'var(--sp-4)' }}>
          <CalendarDays />
          <div className="empty-title">На этот период записей нет</div>
          <div className="text-sm muted">Кликните по свободному месту, чтобы добавить запись или резерв.</div>
        </div>
      )}

      <SlotMenu
        slot={slotMenu}
        onClose={() => setSlotMenu(null)}
        onBooking={(slot) => {
          setSlotMenu(null);
          openIntake({ scheduledAt: slot.startISO, durationMin: slot.durationMin });
        }}
        onReserve={(slot) => {
          setSlotMenu(null);
          setNewBlockSlot(slot);
          setBlockEdit('new');
        }}
      />

      <BlockModal
        open={blockEdit !== null}
        block={blockEdit === 'new' ? null : blockEdit}
        slot={newBlockSlot}
        onClose={() => {
          setBlockEdit(null);
          setNewBlockSlot(null);
        }}
      />
    </div>
  );
}
