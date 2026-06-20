import { useRef, useState } from 'react';
import { format, isSameDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  clamp,
  dateAtMinutes,
  hourMarks,
  minutesFromMidnight,
  snapMinutes,
  windowMinutes,
} from '../lib/schedule';
import { assignLanes } from '../lib/schedule';
import type { TimelineCfg, TimelineEvent } from '../lib/schedule';
import './schedule.css';

export const SELECTION_ID = '__selection__';

export interface ScheduleTimelineProps {
  days: Date[];
  events: TimelineEvent[];
  cfg: TimelineCfg;
  now?: Date;
  /** Allow drag-move + resize on real events. */
  interactive?: boolean;
  /** Allow click on empty space to place/move the selection block. */
  selectable?: boolean;
  /** The single selection block (picker mode). */
  selection?: TimelineEvent | null;
  /** Default length used when first placing a selection. */
  defaultDurationMin?: number;
  showHeaders?: boolean;
  onEventClick?: (id: string) => void;
  onEventMove?: (id: string, startISO: string) => void;
  onEventResize?: (id: string, durationMin: number) => void;
  /** Called when the selection is placed/moved/resized. */
  onSelect?: (startISO: string, durationMin: number) => void;
}

interface DragSession {
  id: string;
  kind: 'event' | 'selection';
  mode: 'move' | 'resize';
  dayIndex: number;
  startClientY: number;
  origStartMin: number;
  origDurMin: number;
  moved: boolean;
}

interface Preview {
  id: string;
  startMin: number;
  durMin: number;
}

export function ScheduleTimeline({
  days,
  events,
  cfg,
  now = new Date(),
  interactive = false,
  selectable = false,
  selection = null,
  defaultDurationMin = 60,
  showHeaders = true,
  onEventClick,
  onEventMove,
  onEventResize,
  onSelect,
}: ScheduleTimelineProps) {
  const dragRef = useRef<DragSession | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const dayStartMin = cfg.startHour * 60;
  const dayEndMin = cfg.endHour * 60;
  const gridHeight = windowMinutes(cfg) * cfg.pxPerMin;
  const marks = hourMarks(cfg);

  const allEvents = selection ? [...events, selection] : events;
  const perDay = days.map((d) => assignLanes(allEvents.filter((e) => isSameDay(e.start, d))));

  const setPrev = (p: Preview | null) => {
    previewRef.current = p;
    setPreview(p);
  };

  const commit = (s: DragSession, startMin: number, durMin: number) => {
    const start = dateAtMinutes(days[s.dayIndex], startMin);
    if (s.kind === 'selection') {
      onSelect?.(start.toISOString(), durMin);
    } else if (s.mode === 'move') {
      onEventMove?.(s.id, start.toISOString());
    } else {
      onEventResize?.(s.id, durMin);
    }
  };

  const onBlockDown = (
    e: React.PointerEvent,
    ev: TimelineEvent,
    dayIndex: number,
    mode: 'move' | 'resize',
  ) => {
    const kind = ev.kind === 'selection' ? 'selection' : 'event';
    const draggable = kind === 'selection' ? selectable : interactive;
    if (!draggable) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      id: ev.id,
      kind,
      mode,
      dayIndex,
      startClientY: e.clientY,
      origStartMin: minutesFromMidnight(ev.start),
      origDurMin: ev.durationMin,
      moved: false,
    };
  };

  const onPtrMove = (e: React.PointerEvent) => {
    const s = dragRef.current;
    if (!s) return;
    const dy = e.clientY - s.startClientY;
    if (Math.abs(dy) > 3) s.moved = true;
    const deltaMin = dy / cfg.pxPerMin;
    if (s.mode === 'move') {
      const startMin = clamp(
        snapMinutes(s.origStartMin + deltaMin, cfg.slotMin),
        dayStartMin,
        Math.max(dayStartMin, dayEndMin - s.origDurMin),
      );
      setPrev({ id: s.id, startMin, durMin: s.origDurMin });
    } else {
      const durMin = clamp(
        snapMinutes(s.origDurMin + deltaMin, cfg.slotMin),
        cfg.slotMin,
        dayEndMin - s.origStartMin,
      );
      setPrev({ id: s.id, startMin: s.origStartMin, durMin });
    }
  };

  const onPtrUp = () => {
    const s = dragRef.current;
    if (!s) return;
    dragRef.current = null;
    const p = previewRef.current;
    setPrev(null);
    if (!s.moved) {
      if (s.kind !== 'selection') onEventClick?.(s.id);
      return;
    }
    if (!p) return;
    if (s.kind !== 'selection') {
      if (s.mode === 'move' && p.startMin === s.origStartMin) return;
      if (s.mode === 'resize' && p.durMin === s.origDurMin) return;
    }
    commit(s, p.startMin, p.durMin);
  };

  const onEmptyDown = (e: React.PointerEvent, dayIndex: number) => {
    if (!selectable) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const localY = e.clientY - rect.top;
    const dur = selection?.durationMin ?? defaultDurationMin;
    const startMin = clamp(
      snapMinutes(dayStartMin + localY / cfg.pxPerMin, cfg.slotMin),
      dayStartMin,
      Math.max(dayStartMin, dayEndMin - dur),
    );
    const start = dateAtMinutes(days[dayIndex], startMin);
    onSelect?.(start.toISOString(), dur);
  };

  const renderEvent = (
    pos: { event: TimelineEvent; lane: number; laneCount: number },
    dayIndex: number,
  ) => {
    const ev = pos.event;
    const isSel = ev.kind === 'selection';
    const draggable = isSel ? selectable : interactive;
    const clickable = !isSel && !!onEventClick;

    let startMin = minutesFromMidnight(ev.start);
    let durMin = ev.durationMin;
    if (preview && preview.id === ev.id) {
      startMin = preview.startMin;
      durMin = preview.durMin;
    }
    const top = (startMin - dayStartMin) * cfg.pxPerMin;
    const height = Math.max(durMin, 1) * cfg.pxPerMin;
    const widthPct = 100 / pos.laneCount;
    const leftPct = pos.lane * widthPct;

    const day = days[dayIndex];
    const start = dateAtMinutes(day, startMin);
    const end = new Date(start.getTime() + durMin * 60_000);
    const dragging = preview?.id === ev.id;

    return (
      <div
        key={ev.id}
        className="stl-ev"
        data-status={ev.status}
        data-sel={isSel || undefined}
        data-drag={dragging || undefined}
        role={clickable || draggable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        style={{
          top,
          height,
          left: `calc(${leftPct}% + 2px)`,
          width: `calc(${widthPct}% - 4px)`,
          cursor: draggable ? 'grab' : clickable ? 'pointer' : 'default',
        }}
        onPointerDown={draggable ? (e) => onBlockDown(e, ev, dayIndex, 'move') : undefined}
        onPointerMove={draggable ? onPtrMove : undefined}
        onPointerUp={draggable ? onPtrUp : undefined}
        onClick={!draggable && clickable ? () => onEventClick?.(ev.id) : undefined}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && clickable) {
            e.preventDefault();
            onEventClick?.(ev.id);
          }
        }}
      >
        <div className="stl-ev-timerow">
          <span className="stl-ev-time mono">
            {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
          </span>
          {ev.masterName && (
            <span className="stl-ev-master truncate" title={ev.masterName}>{ev.masterName}</span>
          )}
        </div>
        {ev.title && height > 30 && <div className="stl-ev-title truncate">{ev.title}</div>}
        {ev.subtitle && height > 46 && <div className="stl-ev-sub truncate">{ev.subtitle}</div>}
        {draggable && (
          <div
            className="stl-ev-resize"
            onPointerDown={(e) => onBlockDown(e, ev, dayIndex, 'resize')}
            onPointerMove={onPtrMove}
            onPointerUp={onPtrUp}
          />
        )}
      </div>
    );
  };

  return (
    <div className="stl">
      <div className="stl-scroll">
        <div
          className="stl-grid"
          style={{ gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))` }}
        >
          {showHeaders && (
            <>
              <div className="stl-corner" />
              {days.map((d) => (
                <div key={`h-${d.toISOString()}`} className="stl-colhead" data-today={isSameDay(d, now) || undefined}>
                  <span className="stl-dow">{format(d, 'EEEEEE', { locale: ru })}</span>
                  <span className="stl-date">{format(d, 'd MMM', { locale: ru })}</span>
                </div>
              ))}
            </>
          )}

          <div className="stl-axis" style={{ height: gridHeight }}>
            {marks.map((h) => (
              <div key={h} className="stl-hour" style={{ top: (h * 60 - dayStartMin) * cfg.pxPerMin }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {days.map((d, di) => {
            const today = isSameDay(d, now);
            const nowMin = minutesFromMidnight(now);
            const nowVisible = today && nowMin >= dayStartMin && nowMin <= dayEndMin;
            return (
              <div
                key={`c-${d.toISOString()}`}
                className="stl-col"
                style={{ height: gridHeight, cursor: selectable ? 'copy' : 'default' }}
                onPointerDown={selectable ? (e) => onEmptyDown(e, di) : undefined}
              >
                {marks.map((h) => (
                  <div
                    key={h}
                    className="stl-line"
                    style={{ top: (h * 60 - dayStartMin) * cfg.pxPerMin }}
                  />
                ))}
                {nowVisible && (
                  <div className="stl-now" style={{ top: (nowMin - dayStartMin) * cfg.pxPerMin }} />
                )}
                {perDay[di].map((pos) => renderEvent(pos, di))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
