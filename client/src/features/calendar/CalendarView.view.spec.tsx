import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CalendarView } from './CalendarView';
import type { CalendarViewProps } from './CalendarView';
import { SlotMenu } from './SlotMenu';
import type { TimelineEvent } from '../../lib/schedule';

const noop = () => {};
// Local-time dates: timezone-safe for the layout math.
const mon = new Date(2026, 10, 16, 12, 0);
const days = Array.from({ length: 7 }, (_, i) => new Date(2026, 10, 16 + i, 12, 0));
const ev = (id: string, h: number): TimelineEvent => ({
  id,
  start: new Date(2026, 10, 18, h, 0),
  durationMin: 60,
  title: `Событие ${id}`,
  status: 'scheduled',
});

const base = (over: Partial<CalendarViewProps> = {}): CalendarViewProps => ({
  days,
  view: 'week',
  orientation: 'vertical',
  rangeLabel: '16–22 ноября',
  events: [ev('a', 10), ev('b', 14)],
  cfg: { startHour: 8, endHour: 20, slotMin: 30, pxPerMin: 0.8 },
  now: mon,
  onView: noop,
  onOrientation: noop,
  onPrev: noop,
  onToday: noop,
  onNext: noop,
  onEventClick: noop,
  onEventMove: noop,
  onEventResize: noop,
  onEmptyClick: noop,
  ...over,
});

describe('CalendarView', () => {
  it('has every data-demo hook', () => {
    const html = renderToStaticMarkup(<CalendarView {...base()} />);
    for (const n of ['cal-view-week', 'cal-view-day', 'cal-orient', 'cal-orient-vertical', 'cal-prev', 'cal-today', 'cal-next', 'timeline', 'timeline-event']) {
      expect(html).toContain(`data-demo="${n}"`);
    }
    expect(html).toContain('data-id="a"');
  });

  it('highlightId marks exactly one event', () => {
    const html = renderToStaticMarkup(<CalendarView {...base({ highlightId: 'b' })} />);
    expect(html.match(/data-highlight/g)).toHaveLength(1);
    expect(html).toMatch(/data-highlight=""[^>]*data-id="b"|data-id="b"[^>]*data-highlight=""/);
    expect(html).not.toContain('data-highlight="true"');
  });

  it('hoverId renders an empty data-hover value', () => {
    const html = renderToStaticMarkup(<CalendarView {...base({ hoverId: 'a' })} />);
    expect(html).toContain('data-hover=""');
    expect(html).not.toContain('data-hover="true"');
  });

  it('eventStyle styles only the matching event, never the selection', () => {
    const sel: TimelineEvent = { id: '__selection__', start: new Date(2026, 10, 19, 11, 0), durationMin: 60, title: 'Новая', status: 'scheduled', kind: 'selection' };
    const html = renderToStaticMarkup(
      <CalendarView {...base({ selection: sel, eventStyle: () => ({ outline: '3px solid red' }) })} />,
    );
    const evs = html.match(/<div class="stl-ev"[^>]*>/g) ?? [];
    expect(evs.filter((e) => e.includes('outline:3px solid red'))).toHaveLength(2);
    expect(evs.find((e) => e.includes('data-sel'))).not.toContain('outline');
    const only = renderToStaticMarkup(
      <CalendarView {...base({ eventStyle: (id) => (id === 'b' ? { outline: '3px solid red' } : undefined) })} />,
    );
    const tags = only.match(/<div class="stl-ev"[^>]*>/g) ?? [];
    expect(tags.filter((e) => e.includes('outline'))).toHaveLength(1);
    expect(tags.find((e) => e.includes('outline'))).toContain('data-id="b"');
  });

  it('hoverId marks one event', () => {
    const html = renderToStaticMarkup(<CalendarView {...base({ hoverId: 'a' })} />);
    expect(html.match(/data-hover/g)).toHaveLength(1);
  });

  it('forcePreview moves the event like a drag preview', () => {
    const plain = renderToStaticMarkup(<CalendarView {...base()} />);
    const forced = renderToStaticMarkup(
      <CalendarView {...base({ forcePreview: { id: 'a', startMin: 9 * 60, durMin: 90 } })} />,
    );
    // (9:00 - 8:00) * 0.8 = 48px, height 90 * 0.8 = 72px
    expect(forced).toMatch(/data-id="a"[^>]*style="[^"]*top:48px;height:72px/);
    expect(plain).not.toMatch(/data-id="a"[^>]*style="[^"]*top:48px/);
    expect(forced).toContain('data-drag="true"');
    expect(forced).toContain('09:00–10:30');
  });

  it('SlotMenu exposes slot demo hooks', () => {
    const html = renderToStaticMarkup(
      <SlotMenu inline slot={{ startISO: mon.toISOString(), durationMin: 60 }} onClose={noop} onBooking={noop} onReserve={noop} />,
    );
    expect(html).toContain('data-demo="slot-booking"');
    expect(html).toContain('data-demo="slot-reserve"');
    expect(html).toContain('modal-inline-backdrop');
  });
});
