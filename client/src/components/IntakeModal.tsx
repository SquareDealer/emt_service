import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, isSameDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Check, User, Car, Wrench, Search, ChevronLeft, ChevronRight, CalendarX, UserCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useToast } from '../lib/toast';
import { phone as fmtPhone } from '../lib/format';
import type { Vehicle } from '../lib/types';
import type { TimelineCfg, TimelineEvent } from '../lib/schedule';
import { ScheduleTimeline, SELECTION_ID } from './ScheduleTimeline';
import { Modal, Spinner } from './ui';

type Picked = { id: string; full_name: string; phone: string };

const STEPS = [
  { n: 1, label: 'Клиент', icon: User },
  { n: 2, label: 'Автомобиль', icon: Car },
  { n: 3, label: 'Работа', icon: Wrench },
];

export function IntakeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  // step 1
  const [clientMode, setClientMode] = useState<'new' | 'existing'>('new');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [q, setQ] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dup, setDup] = useState<{ id: string; name: string } | null>(null);

  // step 2
  const [vehMode, setVehMode] = useState<'new' | 'existing'>('new');
  const [vehId, setVehId] = useState<string>('');
  const [vin, setVin] = useState('');
  const [model, setModel] = useState('');
  const [plate, setPlate] = useState('');
  const [year, setYear] = useState('');
  const [mileage, setMileage] = useState('');

  // step 3
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [duration, setDuration] = useState('');
  const [pickerDay, setPickerDay] = useState<Date>(new Date());

  useEffect(() => {
    if (open) {
      setStep(1);
      setClientMode('new');
      setPicked(null);
      setQ('');
      setFullName('');
      setPhone('');
      setDup(null);
      setVehMode('new');
      setVehId('');
      setVin('');
      setModel('');
      setPlate('');
      setYear('');
      setMileage('');
      setTitle('');
      setScheduledAt('');
      setDuration('');
      setPickerDay(new Date());
    }
  }, [open]);

  const { data: searchHits, isFetching: searching } = useQuery({
    queryKey: ['intake-search', q],
    queryFn: () => api.search(q.trim()),
    enabled: open && clientMode === 'existing' && q.trim().length >= 1,
  });
  const clientHits = (searchHits ?? []).filter((h) => h.type === 'client');

  const { data: existingVehicles } = useQuery({
    queryKey: ['intake-vehicles', picked?.id],
    queryFn: () => api.clientVehicles(picked!.id),
    enabled: open && step >= 2 && clientMode === 'existing' && !!picked?.id,
  });

  // step 3 — slot picker over the chosen day's existing bookings
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const dayStr = format(pickerDay, 'yyyy-MM-dd');
  const { data: dayBookings } = useQuery({
    queryKey: ['calendar', dayStr, dayStr],
    queryFn: () => api.calendar(dayStr, dayStr),
    enabled: open && step === 3,
  });

  const defaultDur = settings?.default_appointment_min ?? 60;
  const cfg: TimelineCfg = {
    startHour: settings?.working_hours_start ?? 8,
    endHour: settings?.working_hours_end ?? 20,
    slotMin: settings?.slot_minutes ?? 30,
    pxPerMin: 1,
  };

  const busyEvents: TimelineEvent[] = useMemo(
    () =>
      (dayBookings ?? [])
        .filter((w) => w.scheduled_at)
        .map((w) => ({
          id: w.id,
          start: new Date(w.scheduled_at as string),
          durationMin: w.scheduled_duration_min ?? defaultDur,
          status: w.status,
          title: w.title?.trim() || `${w.vehicle?.model || 'MINI'} ${w.vehicle?.plate || ''}`.trim(),
          subtitle: w.vehicle?.client?.full_name ?? '',
        })),
    [dayBookings, defaultDur],
  );

  const selection: TimelineEvent | null =
    scheduledAt && isSameDay(new Date(scheduledAt), pickerDay)
      ? {
          id: SELECTION_ID,
          start: new Date(scheduledAt),
          durationMin: Number(duration) || defaultDur,
          kind: 'selection',
          title: 'Новая запись',
        }
      : null;

  const onSelectSlot = (iso: string, dur: number) => {
    setScheduledAt(iso);
    setDuration(String(dur));
  };

  const step1Valid =
    clientMode === 'existing'
      ? !!picked
      : fullName.trim().length > 0 && phone.trim().length > 0;
  const step2Valid =
    vehMode === 'existing'
      ? !!vehId
      : !!(vin.trim() || plate.trim() || model.trim());

  const next = () => {
    if (step === 1 && !step1Valid) return;
    if (step === 2 && !step2Valid) return;
    // if existing client has no vehicles, force new
    if (step === 1 && clientMode === 'new') setVehMode('new');
    setStep((s) => Math.min(s + 1, 3));
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let clientId = picked?.id;
      if (clientMode === 'new') {
        const c = await api.createClient({ full_name: fullName.trim(), phone: phone.trim() });
        clientId = c.id;
      }
      if (!clientId) throw new Error('Не выбран клиент');

      let vehicleId = vehId;
      if (vehMode === 'new' || !vehicleId) {
        const v = await api.createVehicle({
          client_id: clientId,
          vin: vin.trim() || undefined,
          model: model.trim() || undefined,
          plate: plate.trim() || undefined,
          year: year ? Number(year) : undefined,
          mileage: mileage ? Number(mileage) : undefined,
        } as Partial<Vehicle>);
        vehicleId = v.id;
      }

      const wo = await api.createWorkOrder({
        vehicle_id: vehicleId,
        title: title.trim() || undefined,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        scheduled_duration_min: duration ? Number(duration) : undefined,
      } as never);

      qc.invalidateQueries();
      toast('Заказ-наряд создан', 'success');
      onClose();
      const label = clientMode === 'new' ? fullName.trim() : picked?.full_name ?? 'Клиент';
      navigate(`/work-orders/${wo.id}`, { state: { back: { to: `/clients/${clientId}`, label } } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const b = e.body as { clientId?: string; clientName?: string } | null;
        if (b?.clientId) {
          setDup({ id: b.clientId, name: b.clientName ?? '' });
          setStep(1);
          return;
        }
      }
      toast((e as Error).message || 'Не удалось создать', 'error');
    } finally {
      setBusy(false);
    }
  };

  const showExisting = () => {
    if (!dup) return;
    onClose();
    navigate(`/clients/${dup.id}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новый приём"
      width={step === 3 ? 660 : 560}
      footer={
        <>
          {step > 1 && (
            <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)} disabled={busy}>
              Назад
            </button>
          )}
          <div className="grow" />
          {step < 3 ? (
            <button className="btn btn-primary" onClick={next} disabled={step === 1 ? !step1Valid : !step2Valid}>
              Далее
            </button>
          ) : (
            <button className="btn btn-primary" onClick={submit} disabled={busy}>
              {busy ? <Spinner /> : <Check size={16} />}
              Создать наряд
            </button>
          )}
        </>
      }
    >
      <div className="stepper">
        {STEPS.map((s) => (
          <div key={s.n} className="step" data-state={step === s.n ? 'current' : step > s.n ? 'done' : 'todo'}>
            <span className="step-dot">{step > s.n ? <Check size={13} /> : <s.icon size={14} />}</span>
            <span className="step-label">{s.label}</span>
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="col gap-4">
          <div className="seg">
            <button className="seg-btn" data-on={clientMode === 'new'} onClick={() => setClientMode('new')}>
              Новый клиент
            </button>
            <button className="seg-btn" data-on={clientMode === 'existing'} onClick={() => setClientMode('existing')}>
              Существующий
            </button>
          </div>

          {clientMode === 'new' ? (
            <>
              {dup && (
                <div className="inline-warn">
                  <span>Клиент с таким номером уже есть{dup.name ? `: ${dup.name}` : ''}.</span>
                  <button type="button" className="btn btn-default btn-sm" onClick={showExisting}>
                    <UserCheck size={15} /> Показать
                  </button>
                </div>
              )}
              <div className="field">
                <label className="label">ФИО</label>
                <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Иванов Иван" autoFocus />
              </div>
              <div className="field">
                <label className="label">Телефон</label>
                <input className="input mono" value={phone} onChange={(e) => { setPhone(e.target.value); setDup(null); }} placeholder="+7 999 123-45-67" />
              </div>
            </>
          ) : (
            <div className="col gap-2">
              <div className="palette-input" style={{ border: '1px solid var(--border-strong)', borderRadius: 'var(--r-sm)', padding: 'var(--sp-2) var(--sp-3)' }}>
                <Search size={16} className="muted" />
                <input style={{ fontSize: 'var(--text-sm)', border: 'none', outline: 'none', background: 'none', flex: 1, color: 'var(--ink)' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти клиента…" autoFocus />
                {searching && <Spinner />}
              </div>
              <div className="col" style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
                {clientHits.map((h) => (
                  <button
                    key={h.id}
                    className="list-row"
                    style={{ gridTemplateColumns: '1fr auto', borderRadius: 0 }}
                    aria-current={picked?.id === h.id}
                    onClick={() => setPicked({ id: h.id, full_name: h.full_name!, phone: h.phone! })}
                  >
                    <div className="col" style={{ minWidth: 0 }}>
                      <span className="fw-500 truncate">{h.full_name}</span>
                      <span className="text-xs muted mono">{fmtPhone(h.phone)}</span>
                    </div>
                    {picked?.id === h.id && <Check size={16} className="muted" />}
                  </button>
                ))}
                {q.trim() && !searching && clientHits.length === 0 && (
                  <div className="empty" style={{ padding: 'var(--sp-5)' }}>
                    <span className="text-sm muted">Не найдено — заведите как нового</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="col gap-4">
          {clientMode === 'existing' && (existingVehicles?.length ?? 0) > 0 && (
            <div className="seg">
              <button className="seg-btn" data-on={vehMode === 'existing'} onClick={() => setVehMode('existing')}>
                Из гаража
              </button>
              <button className="seg-btn" data-on={vehMode === 'new'} onClick={() => setVehMode('new')}>
                Новое авто
              </button>
            </div>
          )}

          {vehMode === 'existing' && clientMode === 'existing' ? (
            <div className="col" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
              {(existingVehicles ?? []).map((v) => (
                <button
                  key={v.id}
                  className="list-row"
                  style={{ gridTemplateColumns: '1fr auto', borderRadius: 0 }}
                  aria-current={vehId === v.id}
                  onClick={() => setVehId(v.id)}
                >
                  <div className="col" style={{ minWidth: 0 }}>
                    <span className="fw-500 truncate">{v.model || 'MINI'} · <span className="mono">{v.plate || v.vin || '—'}</span></span>
                    <span className="text-xs muted">{v.year ?? ''} {v.mileage ? `· ${v.mileage} км` : ''}</span>
                  </div>
                  {vehId === v.id && <Check size={16} className="muted" />}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="grid-2">
                <div className="field">
                  <label className="label">Модель / поколение</label>
                  <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="R56, F56…" autoFocus />
                </div>
                <div className="field">
                  <label className="label">Госномер</label>
                  <input className="input mono" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="А123ВС777" />
                </div>
              </div>
              <div className="field">
                <label className="label">VIN</label>
                <input className="input mono" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="WMW…" />
              </div>
              <div className="grid-2">
                <div className="field">
                  <label className="label">Год</label>
                  <input className="input tnum" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} placeholder="2014" inputMode="numeric" />
                </div>
                <div className="field">
                  <label className="label">Пробег, км</label>
                  <input className="input tnum" value={mileage} onChange={(e) => setMileage(e.target.value.replace(/\D/g, ''))} placeholder="120000" inputMode="numeric" />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="col gap-4">
          <div className="field">
            <label className="label">Что делаем (необязательно)</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ТО, диагностика подвески…" autoFocus />
          </div>

          <div className="field">
            <div className="row gap-2" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="label" style={{ margin: 0 }}>Запись на время — выберите свободный слот</label>
              <div className="row gap-1">
                <button type="button" className="btn btn-default btn-icon btn-sm" onClick={() => setPickerDay((d) => addDays(d, -1))} aria-label="Предыдущий день"><ChevronLeft size={15} /></button>
                <button type="button" className="btn btn-default btn-sm" onClick={() => setPickerDay(new Date())}>Сегодня</button>
                <button type="button" className="btn btn-default btn-icon btn-sm" onClick={() => setPickerDay((d) => addDays(d, 1))} aria-label="Следующий день"><ChevronRight size={15} /></button>
              </div>
            </div>
            <div className="cal-rangebar" style={{ margin: '6px 0' }}>{format(pickerDay, 'EEEE, d MMMM', { locale: ru })}</div>
            <ScheduleTimeline
              days={[pickerDay]}
              events={busyEvents}
              cfg={cfg}
              selectable
              selection={selection}
              defaultDurationMin={defaultDur}
              showHeaders={false}
              onSelect={onSelectSlot}
            />
          </div>

          <div className="row gap-2 wrap" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div className="text-sm">
              {scheduledAt ? (
                <span>
                  Запись: <span className="mono fw-500">{format(new Date(scheduledAt), 'd MMM, HH:mm', { locale: ru })}</span>
                  {' · '}{Number(duration) || defaultDur} мин
                </span>
              ) : (
                <span className="muted">Слот не выбран — наряд создастся без записи</span>
              )}
            </div>
            <div className="row gap-2" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ width: 110 }}>
                <label className="label">Длит., мин</label>
                <input
                  className="input tnum"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))}
                  placeholder={String(defaultDur)}
                  inputMode="numeric"
                  disabled={!scheduledAt}
                />
              </div>
              {scheduledAt && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setScheduledAt(''); setDuration(''); }}>
                  <CalendarX size={15} /> Без записи
                </button>
              )}
            </div>
          </div>
          <p className="text-xs muted">Строки работ и запчасти добавите в смете после создания наряда.</p>
        </div>
      )}
    </Modal>
  );
}
