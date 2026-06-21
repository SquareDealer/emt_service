import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, addWeeks, endOfWeek, format, startOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { canAssignMaster } from '../../lib/roles';
import type { WorkOrder } from '../../lib/types';
import { hasConflict } from '../../lib/schedule';
import type { TimelineCfg, TimelineEvent } from '../../lib/schedule';
import { ScheduleTimeline } from '../../components/ScheduleTimeline';
import { Spinner } from '../../components/ui';
import './calendar.css';

type View = 'week' | 'day';

function eventTitle(w: WorkOrder): string {
  return w.title?.trim() || `${w.vehicle?.model || 'MINI'} ${w.vehicle?.plate || ''}`.trim();
}

export function CalendarPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const showMaster = canAssignMaster(user?.role);
  const [anchor, setAnchor] = useState(new Date());
  const [view, setView] = useState<View>('week');

  const days = useMemo(() => {
    if (view === 'day') return [anchor];
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor, view]);

  const from = format(days[0], 'yyyy-MM-dd');
  const to = format(days[days.length - 1], 'yyyy-MM-dd');
  const calKey = ['calendar', from, to];

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const { data, isLoading } = useQuery({ queryKey: calKey, queryFn: () => api.calendar(from, to) });

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
        .filter((w) => w.scheduled_at)
        .map((w) => ({
          id: w.id,
          start: new Date(w.scheduled_at as string),
          durationMin: w.scheduled_duration_min ?? defaultDur,
          status: w.status,
          title: eventTitle(w),
          subtitle: w.vehicle?.client?.full_name ?? '',
          masterName: showMaster ? w.assigned_master?.name : undefined,
        })),
    [data, defaultDur, showMaster],
  );

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
    },
  });

  const warnIfConflict = (proposed: TimelineEvent) => {
    if (hasConflict(proposed, events)) toast('Пересечение с другой записью', 'info');
  };

  const onEventMove = (id: string, startISO: string) => {
    const ev = events.find((e) => e.id === id);
    if (ev) warnIfConflict({ ...ev, start: new Date(startISO) });
    mUpdate.mutate({ id, body: { scheduled_at: startISO } });
  };

  const onEventResize = (id: string, durationMin: number) => {
    const ev = events.find((e) => e.id === id);
    if (ev) warnIfConflict({ ...ev, durationMin });
    mUpdate.mutate({ id, body: { scheduled_duration_min: durationMin } });
  };

  const move = (dir: number) =>
    setAnchor((d) => (view === 'day' ? addDays(d, dir) : addWeeks(d, dir)));

  const rangeLabel =
    view === 'day'
      ? format(anchor, 'd MMMM yyyy', { locale: ru })
      : `${format(days[0], 'd MMM', { locale: ru })} — ${format(endOfWeek(anchor, { weekStartsOn: 1 }), 'd MMM yyyy', { locale: ru })}`;

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Календарь</h1>
          <p className="page-sub">Записи по времени и длительности — тяните, чтобы перенести или растянуть</p>
        </div>
        <div className="row gap-2">
          <div className="seg">
            <button className="seg-btn" data-on={view === 'week'} onClick={() => setView('week')}>Неделя</button>
            <button className="seg-btn" data-on={view === 'day'} onClick={() => setView('day')}>День</button>
          </div>
          <div className="row gap-1">
            <button className="btn btn-default btn-icon" onClick={() => move(-1)} aria-label="Назад"><ChevronLeft size={16} /></button>
            <button className="btn btn-default btn-sm" onClick={() => setAnchor(new Date())}>Сегодня</button>
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
          events={events}
          cfg={cfg}
          interactive
          onEventClick={(id) =>
            navigate(`/work-orders/${id}`, { state: { back: { to: '/calendar', label: 'Календарь' } } })
          }
          onEventMove={onEventMove}
          onEventResize={onEventResize}
        />
      )}

      {!isLoading && events.length === 0 && (
        <div className="empty" style={{ marginTop: 'var(--sp-4)' }}>
          <CalendarDays />
          <div className="empty-title">На этот период записей нет</div>
          <div className="text-sm muted">Назначьте время записи в заказ-наряде, и оно появится здесь.</div>
        </div>
      )}
    </div>
  );
}
