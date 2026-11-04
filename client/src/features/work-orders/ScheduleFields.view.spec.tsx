import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScheduleFields, SlotPickerView } from './ScheduleFields';
import type { WorkOrder } from '../../lib/types';
import type { TimelineCfg } from '../../lib/schedule';

const noop = () => {};
const wo = (over: Partial<WorkOrder> = {}) =>
  ({
    id: 'wo-1',
    scheduled_at: '2026-11-18T09:00:00+03:00',
    scheduled_duration_min: 60,
    labor_lines: [{ id: 'l1', hours: 2 }],
    ...over,
  }) as unknown as WorkOrder;
const fields = (w: WorkOrder, disabled = false) =>
  renderToStaticMarkup(
    <ScheduleFields wo={w} defaultDurMin={45} disabled={disabled} onChange={noop} onOpenPicker={noop} />,
  );

describe('ScheduleFields', () => {
  it('renders the schedule hook, duration placeholder and the fit hint', () => {
    const h = fields(wo());
    expect(h).toContain('data-demo="wo-schedule"');
    expect(h).toContain('placeholder="45"');
    expect(h).toContain('Подогнать под часы работ (120 мин)');
  });

  it('hides the fit hint when it would change nothing or the order is locked', () => {
    expect(fields(wo({ scheduled_duration_min: 120 }))).not.toContain('Подогнать');
    expect(fields(wo(), true)).not.toContain('Подогнать');
    expect(fields(wo({ scheduled_at: null }))).not.toContain('Подогнать');
  });
});

describe('SlotPickerView', () => {
  const cfg: TimelineCfg = { startHour: 8, endHour: 20, slotMin: 30, pxPerMin: 1 };
  it('renders the day heading and the timeline under the slot-picker hook', () => {
    const h = renderToStaticMarkup(
      <SlotPickerView
        day={new Date('2026-11-18T12:00:00+03:00')}
        events={[]}
        cfg={cfg}
        selection={null}
        now={new Date('2026-11-18T10:40:00+03:00')}
        onPrevDay={noop}
        onNextDay={noop}
        onSelect={noop}
      />,
    );
    expect(h).toContain('data-demo="slot-picker"');
    expect(h).toMatch(/ноября/);
    expect(h).toContain('aria-label="Назад"');
    expect(h).toContain('aria-label="Вперёд"');
    expect(h).toContain('Сегодня');
  });
});
