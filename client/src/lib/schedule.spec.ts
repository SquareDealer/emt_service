import { describe, expect, it } from 'vitest';
import {
  assignLanes,
  blockEventId,
  blockToEvent,
  dayRangeIso,
  hasConflict,
  parseEventId,
  snapMinutes,
} from './schedule';
import type { TimelineEvent } from './schedule';

const ev = (id: string, iso: string, durationMin: number): TimelineEvent => ({
  id,
  start: new Date(iso),
  durationMin,
});

describe('dayRangeIso', () => {
  it('spans local midnight to local midnight of the next day', () => {
    // The API used to receive 'yyyy-MM-dd', which the server reads as UTC
    // midnight — in MSK that shifted the window by three hours and dropped the
    // first hours of the day. Reserved time is explicitly for odd hours, so the
    // range has to be an absolute instant.
    const { from, to } = dayRangeIso([new Date(2026, 6, 30, 15, 0)]);
    const f = new Date(from);
    const t = new Date(to);
    expect(f.getHours()).toBe(0);
    expect(f.getMinutes()).toBe(0);
    expect(t.getTime() - f.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('covers a whole week from the first day to just after the last', () => {
    const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 6, 27 + i));
    const { from, to } = dayRangeIso(days);
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('includes a booking at 00:30 local, which the old date-only range dropped', () => {
    const day = new Date(2026, 6, 30);
    const { from, to } = dayRangeIso([day]);
    const early = new Date(2026, 6, 30, 0, 30).toISOString();
    expect(early >= from && early < to).toBe(true);
  });
});

describe('hasConflict', () => {
  it('detects an overlap and ignores the event itself', () => {
    const target = ev('a', '2026-07-30T10:00:00', 60);
    expect(hasConflict(target, [ev('b', '2026-07-30T10:30:00', 60)])).toBe(true);
    expect(hasConflict(target, [target])).toBe(false);
  });

  it('treats touching intervals as free (half-open)', () => {
    const target = ev('a', '2026-07-30T10:00:00', 60);
    expect(hasConflict(target, [ev('b', '2026-07-30T11:00:00', 60)])).toBe(false);
  });

  it('counts reserved time as busy', () => {
    // A block is what makes the shop unavailable; it must conflict like a booking.
    const block = blockToEvent({
      id: 'blk',
      title: null,
      starts_at: new Date('2026-07-30T10:00:00').toISOString(),
      duration_min: 120,
    });
    expect(hasConflict(ev('a', '2026-07-30T11:00:00', 60), [block])).toBe(true);
  });
});

describe('event ids', () => {
  it('round-trips a block id and keeps work orders untouched', () => {
    expect(parseEventId(blockEventId('abc'))).toEqual({ kind: 'block', id: 'abc' });
    expect(parseEventId('abc')).toEqual({ kind: 'work-order', id: 'abc' });
  });

  it('keeps block ids distinct from work-order ids with the same uuid', () => {
    const uuid = '11111111-2222-3333-4444-555555555555';
    expect(blockEventId(uuid)).not.toBe(uuid);
  });
});

describe('blockToEvent', () => {
  it('names an untitled block «Занято» instead of leaving it blank', () => {
    const e = blockToEvent({
      id: 'b',
      title: null,
      starts_at: new Date('2026-07-30T10:00:00').toISOString(),
      duration_min: 60,
    });
    expect(e.title).toBe('Занято');
    expect(e.kind).toBe('block');
  });

  it('marks a personal reserve with its owner', () => {
    const e = blockToEvent({
      id: 'b',
      title: 'Обед',
      starts_at: new Date('2026-07-30T10:00:00').toISOString(),
      duration_min: 60,
      user: { id: 'm1', name: 'Пётр' },
    });
    expect(e.title).toBe('Обед');
    expect(e.subtitle).toContain('Пётр');
  });
});

describe('assignLanes', () => {
  it('puts overlapping events side by side and reuses a freed lane', () => {
    const laid = assignLanes([
      ev('a', '2026-07-30T10:00:00', 60),
      ev('b', '2026-07-30T10:30:00', 60),
      ev('c', '2026-07-30T12:00:00', 60),
    ]);
    const byId = Object.fromEntries(laid.map((p) => [p.event.id, p]));
    expect(byId.a.lane).not.toBe(byId.b.lane);
    expect(byId.a.laneCount).toBe(2);
    // 'c' does not overlap the first two, so it starts a fresh cluster.
    expect(byId.c.lane).toBe(0);
    expect(byId.c.laneCount).toBe(1);
  });
});

describe('snapMinutes', () => {
  it('rounds to the nearest slot', () => {
    expect(snapMinutes(614, 30)).toBe(600);
    expect(snapMinutes(616, 30)).toBe(630);
  });
});
