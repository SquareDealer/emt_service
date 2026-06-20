import { SettingsService } from './settings.service';

function svc(rows: { key: string; value: string }[]): SettingsService {
  const repo = { find: async () => rows } as never;
  return new SettingsService(repo);
}

describe('SettingsService.getScheduleSettings', () => {
  it('returns safe defaults when nothing is persisted', async () => {
    const s = await svc([]).getScheduleSettings();
    expect(s).toEqual({
      workingHoursStart: 8,
      workingHoursEnd: 20,
      slotMinutes: 30,
      defaultAppointmentMin: 60,
    });
  });

  it('reads persisted valid values verbatim', async () => {
    const s = await svc([
      { key: 'working_hours_start', value: '9' },
      { key: 'working_hours_end', value: '21' },
      { key: 'slot_minutes', value: '15' },
      { key: 'default_appointment_min', value: '90' },
    ]).getScheduleSettings();
    expect(s).toEqual({
      workingHoursStart: 9,
      workingHoursEnd: 21,
      slotMinutes: 15,
      defaultAppointmentMin: 90,
    });
  });

  it('falls back to default window when end <= start', async () => {
    const s = await svc([
      { key: 'working_hours_start', value: '20' },
      { key: 'working_hours_end', value: '8' },
    ]).getScheduleSettings();
    expect(s.workingHoursStart).toBe(8);
    expect(s.workingHoursEnd).toBe(20);
  });

  it('rejects an unsupported slot and clamps default duration to the window', async () => {
    const s = await svc([
      { key: 'slot_minutes', value: '7' },
      { key: 'default_appointment_min', value: '100000' },
    ]).getScheduleSettings();
    expect(s.slotMinutes).toBe(30);
    expect(s.defaultAppointmentMin).toBe((20 - 8) * 60);
  });

  it('clamps default duration up to at least one slot', async () => {
    const s = await svc([
      { key: 'slot_minutes', value: '30' },
      { key: 'default_appointment_min', value: '5' },
    ]).getScheduleSettings();
    expect(s.defaultAppointmentMin).toBe(30);
  });
});
