/**
 * Pure layout/geometry helpers for the booking timeline. No DOM, no React —
 * everything here is deterministic and unit-testable. The ScheduleTimeline
 * component renders on top of these.
 */

export interface TimelineCfg {
  /** Working-day window, hours [startHour, endHour) — e.g. 8..20. */
  startHour: number;
  endHour: number;
  /** Snap granularity in minutes (15 / 30 / 60). */
  slotMin: number;
  /** Vertical scale — pixels per minute. */
  pxPerMin: number;
}

export interface TimelineEvent {
  id: string;
  start: Date;
  durationMin: number;
  // presentational (filled by callers)
  status?: string;
  title?: string;
  subtitle?: string;
  /** Assigned master name — shown as a badge (owner/receptionist only). */
  masterName?: string;
  kind?: 'event' | 'selection';
}

export interface Positioned<T> {
  event: T;
  /** 0-based column within its overlap cluster. */
  lane: number;
  /** number of columns the cluster needs. */
  laneCount: number;
}

const MS_PER_MIN = 60_000;

/** Minutes since local midnight for a date. */
export function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Round a minute value to the nearest slot boundary. */
export function snapMinutes(min: number, slot: number): number {
  if (slot <= 0) return Math.round(min);
  return Math.round(min / slot) * slot;
}

/** Clamp helper. */
export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

/** A new Date on the same calendar day as `day`, at `minutes` since midnight. */
export function dateAtMinutes(day: Date, minutes: number): Date {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

/** Half-open interval overlap on raw timestamps. */
function intervalsOverlap(aS: number, aE: number, bS: number, bE: number): boolean {
  return aS < bE && bS < aE;
}

/**
 * Does `target` overlap any of `others` in wall-clock time? Ignores the event
 * with the same id (so an event never conflicts with itself).
 */
export function hasConflict(target: TimelineEvent, others: TimelineEvent[]): boolean {
  const ts = target.start.getTime();
  const te = ts + target.durationMin * MS_PER_MIN;
  return others.some((o) => {
    if (o.id === target.id) return false;
    const os = o.start.getTime();
    const oe = os + o.durationMin * MS_PER_MIN;
    return intervalsOverlap(ts, te, os, oe);
  });
}

/**
 * Assign side-by-side columns to overlapping events (classic day-calendar
 * layout). Events are grouped into clusters of transitive overlap; within a
 * cluster each event takes the first free column and every event in that
 * cluster shares the same `laneCount` so widths line up.
 */
export function assignLanes<T extends { start: Date; durationMin: number }>(
  events: T[],
): Positioned<T>[] {
  const items = events
    .map((e) => ({
      e,
      s: e.start.getTime(),
      en: e.start.getTime() + Math.max(e.durationMin, 1) * MS_PER_MIN,
    }))
    .sort((a, b) => a.s - b.s || b.en - a.en);

  const result: Positioned<T>[] = [];
  let cluster: { e: T; col: number }[] = [];
  let columns: number[] = []; // last end-ts per column, reset per cluster
  let clusterEnd = -Infinity;

  const flush = () => {
    const laneCount = columns.length || 1;
    for (const c of cluster) result.push({ event: c.e, lane: c.col, laneCount });
    cluster = [];
    columns = [];
    clusterEnd = -Infinity;
  };

  for (const item of items) {
    if (cluster.length && item.s >= clusterEnd) flush();
    let col = columns.findIndex((end) => end <= item.s);
    if (col === -1) {
      col = columns.length;
      columns.push(item.en);
    } else {
      columns[col] = item.en;
    }
    cluster.push({ e: item.e, col });
    clusterEnd = Math.max(clusterEnd, item.en);
  }
  if (cluster.length) flush();
  return result;
}

/** Pixel position of an event within a day column. */
export function layout(
  event: { start: Date; durationMin: number },
  cfg: TimelineCfg,
): { topPx: number; heightPx: number } {
  const dayStart = cfg.startHour * 60;
  const startMin = minutesFromMidnight(event.start);
  return {
    topPx: (startMin - dayStart) * cfg.pxPerMin,
    heightPx: Math.max(event.durationMin, 1) * cfg.pxPerMin,
  };
}

/** Total minutes in the working window. */
export function windowMinutes(cfg: TimelineCfg): number {
  return (cfg.endHour - cfg.startHour) * 60;
}

/** Hour marks [startHour .. endHour] inclusive, for axis labels/gridlines. */
export function hourMarks(cfg: TimelineCfg): number[] {
  const out: number[] = [];
  for (let h = cfg.startHour; h <= cfg.endHour; h++) out.push(h);
  return out;
}
