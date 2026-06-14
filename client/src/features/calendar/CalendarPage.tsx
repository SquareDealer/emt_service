import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  addDays,
  addWeeks,
  endOfWeek,
  format,
  isToday,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { api } from '../../lib/api';
import { money, timeOnly } from '../../lib/format';
import { STATUS_LABEL } from '../../lib/types';
import type { WorkOrder } from '../../lib/types';
import { Spinner } from '../../components/ui';
import './calendar.css';

type View = 'week' | 'day';

export function CalendarPage() {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(new Date());
  const [view, setView] = useState<View>('week');

  const days = useMemo(() => {
    if (view === 'day') return [anchor];
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor, view]);

  const from = format(days[0], 'yyyy-MM-dd');
  const to = format(days[days.length - 1], 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => api.calendar(from, to),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, WorkOrder[]>();
    for (const w of data ?? []) {
      if (!w.scheduled_at) continue;
      const key = format(new Date(w.scheduled_at), 'yyyy-MM-dd');
      const arr = map.get(key) ?? [];
      arr.push(w);
      map.set(key, arr);
    }
    for (const arr of map.values())
      arr.sort((a, b) => +new Date(a.scheduled_at!) - +new Date(b.scheduled_at!));
    return map;
  }, [data]);

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
          <p className="page-sub">Предстоящие и прошедшие работы по времени записи</p>
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
        <div className={`cal-grid ${view}`}>
          {days.map((d) => {
            const key = format(d, 'yyyy-MM-dd');
            const events = byDay.get(key) ?? [];
            return (
              <div key={key} className={`cal-day ${isToday(d) ? 'today' : ''}`}>
                <div className="cal-day-head">
                  <span className="cal-dow">{format(d, 'EEEEEE', { locale: ru })}</span>
                  <span className={`cal-date ${isToday(d) ? 'is-today' : ''}`}>{format(d, 'd')}</span>
                </div>
                <div className="cal-events">
                  {events.length === 0 ? (
                    <div className="cal-empty" />
                  ) : (
                    events.map((w) => (
                      <button
                        key={w.id}
                        className="cal-event"
                        data-status={w.status}
                        onClick={() => navigate(`/work-orders/${w.id}`, { state: { back: { to: '/calendar', label: 'Календарь' } } })}
                        title={`${STATUS_LABEL[w.status]} · ${money(w.status === 'closed' ? w.total_frozen ?? w.total_cached : w.total_cached)}`}
                      >
                        <span className="cal-event-time mono">{timeOnly(w.scheduled_at)}</span>
                        <span className="cal-event-title truncate">{w.title || `${w.vehicle?.model || 'MINI'} ${w.vehicle?.plate || ''}`}</span>
                        <span className="cal-event-sub truncate">{w.vehicle?.client?.full_name ?? ''}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <div className="empty" style={{ marginTop: 'calc(-1 * var(--sp-8))' }}>
          <CalendarDays />
          <div className="empty-title">На этот период работ нет</div>
          <div className="text-sm muted">Назначьте время записи в заказ-наряде, и он появится здесь.</div>
        </div>
      )}
    </div>
  );
}
