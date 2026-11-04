import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import type { TimelineCfg, TimelineEvent } from '../../lib/schedule';
import { ScheduleTimeline } from '../../components/ScheduleTimeline';
import type { ScheduleTimelineProps, TimelineOrientation } from '../../components/ScheduleTimeline';
import { Spinner } from '../../components/ui';
import './calendar.css';

export interface CalendarViewProps {
  days: Date[];
  view: 'week' | 'day';
  orientation: TimelineOrientation;
  rangeLabel: string;
  events: TimelineEvent[];
  cfg: TimelineCfg;
  now?: Date;
  loading?: boolean;
  selection?: TimelineEvent | null;
  /** Default length for a new slot; the page passes the settings value. */
  defaultDurationMin?: number;
  highlightId?: string;
  hoverId?: string;
  /** Demo: extra style per event, passed to the timeline. */
  eventStyle?: ScheduleTimelineProps['eventStyle'];
  forcePreview?: ScheduleTimelineProps['forcePreview'];
  onView(v: 'week' | 'day'): void;
  onOrientation(o: TimelineOrientation): void;
  onPrev(): void;
  onToday(): void;
  onNext(): void;
  onEventClick(id: string): void;
  onEventMove(id: string, startISO: string): void;
  onEventResize(id: string, durationMin: number): void;
  onEmptyClick(startISO: string, durationMin: number): void;
}

export function CalendarView({
  days,
  view,
  orientation,
  rangeLabel,
  events,
  cfg,
  now,
  loading = false,
  selection,
  defaultDurationMin,
  highlightId,
  hoverId,
  eventStyle,
  forcePreview,
  onView,
  onOrientation,
  onPrev,
  onToday,
  onNext,
  onEventClick,
  onEventMove,
  onEventResize,
  onEmptyClick,
}: CalendarViewProps) {
  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Календарь</h1>
          <p className="page-sub">Записи по времени и длительности — тяните, чтобы перенести или растянуть</p>
        </div>
        <div className="row gap-2 wrap cal-controls">
          <div className="seg">
            <button className="seg-btn" data-demo="cal-view-week" data-on={view === 'week'} onClick={() => onView('week')}>Неделя</button>
            <button className="seg-btn" data-demo="cal-view-day" data-on={view === 'day'} onClick={() => onView('day')}>День</button>
          </div>
          <div className="seg">
            <button className="seg-btn" data-demo="cal-orient-vertical" data-on={orientation === 'vertical'} onClick={() => onOrientation('vertical')}>Верт.</button>
            <button className="seg-btn" data-demo="cal-orient" data-on={orientation === 'horizontal'} onClick={() => onOrientation('horizontal')}>Гориз.</button>
          </div>
          <div className="row gap-1">
            <button className="btn btn-default btn-icon" data-demo="cal-prev" onClick={onPrev} aria-label="Назад"><ChevronLeft size={16} /></button>
            <button className="btn btn-default" data-demo="cal-today" onClick={onToday}>Сегодня</button>
            <button className="btn btn-default btn-icon" data-demo="cal-next" onClick={onNext} aria-label="Вперёд"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      <div className="cal-rangebar">{rangeLabel}</div>

      {loading ? (
        <div className="center" style={{ minHeight: 280 }}><Spinner size={22} /></div>
      ) : (
        <ScheduleTimeline
          days={days}
          events={events}
          cfg={cfg}
          now={now}
          orientation={orientation}
          interactive
          selection={selection}
          defaultDurationMin={defaultDurationMin}
          highlightId={highlightId}
          hoverId={hoverId}
          eventStyle={eventStyle}
          forcePreview={forcePreview}
          onEventClick={onEventClick}
          onEventMove={onEventMove}
          onEventResize={onEventResize}
          onEmptyClick={onEmptyClick}
        />
      )}

      {!loading && events.length === 0 && (
        <div className="empty" style={{ marginTop: 'var(--sp-4)' }}>
          <CalendarDays />
          <div className="empty-title">На этот период записей нет</div>
          <div className="text-sm muted">Кликните по свободному месту, чтобы добавить запись или резерв.</div>
        </div>
      )}
    </div>
  );
}
