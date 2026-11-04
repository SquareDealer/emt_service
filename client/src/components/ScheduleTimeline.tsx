import { useLayoutEffect, useRef, useState } from 'react';
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
import { useNow } from '../lib/now';
import './schedule.css';

export const SELECTION_ID = '__selection__';

export type TimelineOrientation = 'vertical' | 'horizontal';

/** Width (px) of the day-label column in horizontal mode. */
const LABEL_W = 64;
/** Width (px) of the hour-gutter column in vertical mode. */
const AXIS_W = 48;
/** Min day-column width (px): narrow screens pan the week instead of squeezing it. */
const V_MIN_COL = 120;
/** Min band height + per-overlap-lane height (px) for a day row in horizontal mode. */
const BAND_MIN = 120;
const PER_LANE = 80;
/** Legibility floor: px per minute below which the horizontal axis scrolls instead. */
const H_MIN_PX_PER_MIN = 0.7;

export interface ScheduleTimelineProps {
  days: Date[];
  events: TimelineEvent[];
  cfg: TimelineCfg;
  now?: Date;
  /** Time runs down (vertical, default) or left→right (horizontal). */
  orientation?: TimelineOrientation;
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
  /**
   * Click (not drag) on empty space, in `interactive` mode. Grab-pan still owns
   * dragging — a press that travels ≤3px is treated as a click instead.
   */
  onEmptyClick?: (startISO: string, durationMin: number) => void;
  /** Demo: render this event as if it were being dragged (same as an internal preview). */
  forcePreview?: { id: string; startMin: number; durMin: number } | null;
  /** Demo: mark one event with data-highlight. */
  highlightId?: string;
  /** Demo: mark one event with data-hover (twin of :hover). */
  hoverId?: string;
}

interface DragSession {
  id: string;
  kind: 'event' | 'selection';
  mode: 'move' | 'resize';
  dayIndex: number;
  /** Client coordinate along the time axis (Y when vertical, X when horizontal). */
  startClient: number;
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
  now: nowProp,
  orientation = 'vertical',
  interactive = false,
  selectable = false,
  selection = null,
  defaultDurationMin = 60,
  showHeaders = true,
  onEventClick,
  onEventMove,
  onEventResize,
  onSelect,
  onEmptyClick,
  forcePreview,
  highlightId,
  hoverId,
}: ScheduleTimelineProps) {
  const ctxNow = useNow();
  const now = nowProp ?? ctxNow;
  const horizontal = orientation === 'horizontal';
  const dragRef = useRef<DragSession | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const [internalPreview, setPreview] = useState<Preview | null>(null);
  const preview = internalPreview ?? forcePreview ?? null;

  // Measure the scroll viewport so the horizontal timeline can stretch the time
  // axis to fill the full width instead of using a fixed px-per-minute.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollW, setScrollW] = useState(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setScrollW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dayStartMin = cfg.startHour * 60;
  const dayEndMin = cfg.endHour * 60;
  const winMin = windowMinutes(cfg);
  const marks = hourMarks(cfg);

  const allEvents = selection ? [...events, selection] : events;
  const perDay = days.map((d) => assignLanes(allEvents.filter((e) => isSameDay(e.start, d))));

  // Horizontal: px-per-minute is derived to fill the viewport width (with a
  // legibility floor that lets it scroll if the window is very narrow). Vertical
  // keeps the configured scale exactly — behaviour-identical to before.
  const axisPx = scrollW ? Math.max(0, scrollW - LABEL_W) : winMin * cfg.pxPerMin;
  const hPxPerMin = winMin > 0 ? Math.max(axisPx, winMin * H_MIN_PX_PER_MIN) / winMin : cfg.pxPerMin;
  const pxPerMin = horizontal ? hPxPerMin : cfg.pxPerMin;
  // Length of the time axis in px (height when vertical, width when horizontal).
  const gridLength = winMin * pxPerMin;

  // Horizontal day-row heights grow with the day's max overlap so ≥2 parallel
  // works always fit, each lane keeping ~PER_LANE px.
  const laneMax = perDay.map((day) => day.reduce((m, p) => Math.max(m, p.laneCount), 1));
  const bandPx = (di: number) => Math.max(BAND_MIN, laneMax[di] * PER_LANE);

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

  /** Client coordinate along the time axis for a pointer event. */
  const axisClient = (e: React.PointerEvent) => (horizontal ? e.clientX : e.clientY);

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
      startClient: axisClient(e),
      origStartMin: minutesFromMidnight(ev.start),
      origDurMin: ev.durationMin,
      moved: false,
    };
  };

  const onPtrMove = (e: React.PointerEvent) => {
    const s = dragRef.current;
    if (!s) return;
    const delta = axisClient(e) - s.startClient;
    if (Math.abs(delta) > 3) s.moved = true;
    const deltaMin = delta / pxPerMin;
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
    const local = horizontal ? e.clientX - rect.left : e.clientY - rect.top;
    const dur = selection?.durationMin ?? defaultDurationMin;
    const startMin = clamp(
      snapMinutes(dayStartMin + local / pxPerMin, cfg.slotMin),
      dayStartMin,
      Math.max(dayStartMin, dayEndMin - dur),
    );
    const start = dateAtMinutes(days[dayIndex], startMin);
    onSelect?.(start.toISOString(), dur);
  };

  // Grab-pan the viewport by dragging empty background (both axes → diagonal).
  // Disabled in selectable/picker mode, where empty-space clicks place a slot.
  // Event presses stopPropagation in onBlockDown, so they never start a pan.
  const panEnabled = !selectable;
  const panRef = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  // Where an empty-space press landed. Captured on pointerdown because
  // setPointerCapture below retargets pointerup to the scroll container, so by
  // then e.target no longer tells us which day column was hit.
  const emptyHitRef = useRef<{ dayIndex: number; startMin: number } | null>(null);

  /** Snapped start minute for a pointer press inside a day column/lane. */
  const hitStartMin = (e: React.PointerEvent, cell: HTMLElement, dur: number): number => {
    const rect = cell.getBoundingClientRect();
    const local = horizontal ? e.clientX - rect.left : e.clientY - rect.top;
    return clamp(
      snapMinutes(dayStartMin + local / pxPerMin, cfg.slotMin),
      dayStartMin,
      Math.max(dayStartMin, dayEndMin - dur),
    );
  };

  const onScrollDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panEnabled || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.stl-ev')) return; // let event drag/click win
    const el = scrollRef.current;
    if (!el) return;

    // Read the day cell now, while the event target is still the real element.
    // The index comes from data-di, not from indexOf over the grid's children —
    // the first child is the hour axis/corner, so positions do not line up.
    emptyHitRef.current = null;
    if (onEmptyClick) {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.stl-col, .stl-lane');
      const di = cell?.dataset.di;
      if (cell && di !== undefined) {
        emptyHitRef.current = {
          dayIndex: Number(di),
          startMin: hitStartMin(e, cell, defaultDurationMin),
        };
      }
    }

    e.preventDefault();
    panRef.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
    el.setPointerCapture(e.pointerId);
    el.classList.add('stl-panning');
  };
  const onScrollMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = panRef.current;
    const el = scrollRef.current;
    if (!p || !el) return;
    if (Math.abs(e.clientX - p.x) > 3 || Math.abs(e.clientY - p.y) > 3) {
      emptyHitRef.current = null; // it's a pan, not a click
    }
    el.scrollLeft = p.l - (e.clientX - p.x);
    el.scrollTop = p.t - (e.clientY - p.y);
  };
  const onScrollUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!panRef.current || !el) return;
    panRef.current = null;
    el.releasePointerCapture?.(e.pointerId);
    el.classList.remove('stl-panning');

    const hit = emptyHitRef.current;
    emptyHitRef.current = null;
    if (hit && onEmptyClick) {
      const start = dateAtMinutes(days[hit.dayIndex], hit.startMin);
      onEmptyClick(start.toISOString(), defaultDurationMin);
    }
  };
  const panProps = panEnabled
    ? { onPointerDown: onScrollDown, onPointerMove: onScrollMove, onPointerUp: onScrollUp, onPointerCancel: onScrollUp }
    : {};
  const scrollClass = `stl-scroll${panEnabled ? ' stl-pannable' : ''}`;

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
    const mainStart = (startMin - dayStartMin) * pxPerMin;
    const mainSize = Math.max(durMin, 1) * pxPerMin;
    const crossSizePct = 100 / pos.laneCount;
    const crossPct = pos.lane * crossSizePct;

    const day = days[dayIndex];
    const start = dateAtMinutes(day, startMin);
    const end = new Date(start.getTime() + durMin * 60_000);
    const dragging = preview?.id === ev.id;
    const room = mainSize; // px available along the time axis for labels

    const style: React.CSSProperties = horizontal
      ? {
          left: mainStart,
          width: mainSize,
          top: `calc(${crossPct}% + 2px)`,
          height: `calc(${crossSizePct}% - 4px)`,
          cursor: draggable ? 'grab' : clickable ? 'pointer' : 'default',
        }
      : {
          top: mainStart,
          height: mainSize,
          left: `calc(${crossPct}% + 2px)`,
          width: `calc(${crossSizePct}% - 4px)`,
          cursor: draggable ? 'grab' : clickable ? 'pointer' : 'default',
        };

    return (
      <div
        key={ev.id}
        className="stl-ev"
        data-status={ev.status}
        data-kind={ev.kind === 'block' ? 'block' : undefined}
        data-sel={isSel || undefined}
        data-drag={dragging || undefined}
        data-highlight={ev.id === highlightId || undefined}
        data-hover={ev.id === hoverId || undefined}
        data-demo={isSel ? undefined : 'timeline-event'}
        data-id={ev.id}
        role={clickable || draggable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        style={style}
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
        {ev.title && room > 30 && <div className="stl-ev-title truncate">{ev.title}</div>}
        {ev.subtitle && room > 46 && <div className="stl-ev-sub truncate">{ev.subtitle}</div>}
        {draggable && (
          <div
            className={horizontal ? 'stl-ev-resize-h' : 'stl-ev-resize'}
            onPointerDown={(e) => onBlockDown(e, ev, dayIndex, 'resize')}
            onPointerMove={onPtrMove}
            onPointerUp={onPtrUp}
          />
        )}
      </div>
    );
  };

  // ----- Horizontal layout: time across the top, days as rows -----
  if (horizontal) {
    return (
      <div className="stl" data-orient="h" data-demo="timeline">
        <div className={scrollClass} ref={scrollRef} {...panProps}>
          <div
            className="stl-grid"
            data-orient="h"
            style={{
              gridTemplateColumns: `${LABEL_W}px ${gridLength}px`,
              gridTemplateRows: `28px ${days.map((_, di) => `${bandPx(di)}px`).join(' ')}`,
            }}
          >
            {showHeaders && <div className="stl-corner" />}
            {showHeaders && (
              <div className="stl-axis-h" style={{ width: gridLength }}>
                {marks.map((h) => (
                  <div key={h} className="stl-hour-h" style={{ left: (h * 60 - dayStartMin) * pxPerMin }}>
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>
            )}

            {days.map((d, di) => {
              const today = isSameDay(d, now);
              const nowMin = minutesFromMidnight(now);
              const nowVisible = today && nowMin >= dayStartMin && nowMin <= dayEndMin;
              return [
                <div key={`rh-${d.toISOString()}`} className="stl-rowhead" data-today={today || undefined}>
                  <span className="stl-dow">{format(d, 'EEEEEE', { locale: ru })}</span>
                  <span className="stl-date">{format(d, 'd MMM', { locale: ru })}</span>
                </div>,
                <div
                  key={`lane-${d.toISOString()}`}
                  className="stl-lane"
                  data-di={di}
                  style={{ width: gridLength, cursor: selectable ? 'copy' : undefined }}
                  onPointerDown={selectable ? (e) => onEmptyDown(e, di) : undefined}
                >
                  {marks.map((h) => (
                    <div
                      key={h}
                      className="stl-line-v"
                      style={{ left: (h * 60 - dayStartMin) * pxPerMin }}
                    />
                  ))}
                  {nowVisible && (
                    <div className="stl-now-v" style={{ left: (nowMin - dayStartMin) * pxPerMin }} />
                  )}
                  {perDay[di].map((p) => renderEvent(p, di))}
                </div>,
              ];
            })}
          </div>
        </div>
      </div>
    );
  }

  // ----- Vertical layout (default): time down the page, days as columns -----
  return (
    <div className="stl" data-demo="timeline">
      <div className={scrollClass} ref={scrollRef} {...panProps}>
        <div
          className="stl-grid"
          style={{
            gridTemplateColumns: `${AXIS_W}px repeat(${days.length}, minmax(${V_MIN_COL}px, 1fr))`,
            minWidth: AXIS_W + days.length * V_MIN_COL,
          }}
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

          <div className="stl-axis" style={{ height: gridLength }}>
            {marks.map((h) => (
              <div key={h} className="stl-hour" style={{ top: (h * 60 - dayStartMin) * pxPerMin }}>
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
                data-di={di}
                style={{ height: gridLength, cursor: selectable ? 'copy' : undefined }}
                onPointerDown={selectable ? (e) => onEmptyDown(e, di) : undefined}
              >
                {marks.map((h) => (
                  <div
                    key={h}
                    className="stl-line"
                    style={{ top: (h * 60 - dayStartMin) * pxPerMin }}
                  />
                ))}
                {nowVisible && (
                  <div className="stl-now" style={{ top: (nowMin - dayStartMin) * pxPerMin }} />
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
