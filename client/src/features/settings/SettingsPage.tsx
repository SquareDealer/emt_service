import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Trash2,
  Gauge,
  Building2,
  CalendarClock,
  Users2,
  UserPlus,
  KeyRound,
  Power,
  UserX,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { canManageUsers } from '../../lib/roles';
import { ROLE_LABEL } from '../../lib/types';
import type { User, UserRole } from '../../lib/types';
import { Spinner, Modal } from '../../components/ui';

const ROLE_VALUES = Object.keys(ROLE_LABEL) as UserRole[];

export function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings });

  const [rate, setRate] = useState('');
  useEffect(() => { if (settings) setRate(String(settings.labor_rate)); }, [settings]);

  const mRate = useMutation({
    mutationFn: (v: number) => api.updateSettings({ labor_rate: v }),
    onSuccess: (r) => { qc.setQueryData(['settings'], r); toast('Ставка сохранена', 'success'); },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  // Company requisites + VAT — shown in the calculation PDF header/totals.
  const [company, setCompany] = useState({ name: '', inn: '', address: '', phone: '' });
  const [vat, setVat] = useState('0');
  useEffect(() => {
    if (settings) {
      setCompany({
        name: settings.company_name ?? '',
        inn: settings.company_inn ?? '',
        address: settings.company_address ?? '',
        phone: settings.company_phone ?? '',
      });
      setVat(String(settings.vat_rate ?? 0));
    }
  }, [settings]);

  const mCompany = useMutation({
    mutationFn: () => api.updateSettings({
      company_name: company.name,
      company_inn: company.inn,
      company_address: company.address,
      company_phone: company.phone,
      vat_rate: Number(vat),
    }),
    onSuccess: (r) => { qc.setQueryData(['settings'], r); toast('Реквизиты сохранены', 'success'); },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  // Schedule / calendar bounds + default appointment length.
  const [sched, setSched] = useState({ start: '8', end: '20', slot: '30', dur: '60' });
  useEffect(() => {
    if (settings) {
      setSched({
        start: String(settings.working_hours_start ?? 8),
        end: String(settings.working_hours_end ?? 20),
        slot: String(settings.slot_minutes ?? 30),
        dur: String(settings.default_appointment_min ?? 60),
      });
    }
  }, [settings]);

  const mSched = useMutation({
    mutationFn: () => api.updateSettings({
      working_hours_start: Number(sched.start),
      working_hours_end: Number(sched.end),
      slot_minutes: Number(sched.slot),
      default_appointment_min: Number(sched.dur),
    }),
    onSuccess: (r) => { qc.setQueryData(['settings'], r); toast('Расписание сохранено', 'success'); },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const rateChanged = settings && rate !== String(settings.labor_rate) && rate !== '';

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Настройки</h1>
          <p className="page-sub">Ставка нормо-часа и реквизиты для документов</p>
        </div>
      </div>

      {canManageUsers(user?.role) && <UsersSection selfId={user?.id} />}

      <section className="panel" style={{ marginBottom: 'var(--sp-5)' }}>
        <div className="panel-head"><h2 className="panel-title"><Gauge size={16} className="muted" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Ставка нормо-часа</h2></div>
        <div style={{ padding: 'var(--sp-4)' }} className="col gap-3">
          <p className="text-sm muted" style={{ maxWidth: '60ch' }}>
            Применяется к новым строкам работ. Ставка фиксируется в наряде при добавлении строки —
            изменение здесь не затрагивает уже закрытые наряды.
          </p>
          <div className="row gap-2" style={{ maxWidth: 320 }}>
            <div className="field grow">
              <label className="label">Текущая ставка, ₽/час</label>
              <input className="input tnum" value={rate} onChange={(e) => setRate(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
            </div>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} disabled={!rateChanged || mRate.isPending} onClick={() => mRate.mutate(Number(rate))}>
              {mRate.isPending ? <Spinner /> : <Check size={16} />} Сохранить
            </button>
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 'var(--sp-5)' }}>
        <div className="panel-head"><h2 className="panel-title"><CalendarClock size={16} className="muted" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Расписание и календарь</h2></div>
        <div style={{ padding: 'var(--sp-4)' }} className="col gap-3">
          <p className="text-sm muted" style={{ maxWidth: '60ch' }}>
            Границы рабочего дня на таймлайне, шаг сетки при перетаскивании и длительность записи
            по умолчанию при создании наряда.
          </p>
          <div className="row gap-2 wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ width: 130 }}>
              <label className="label">Начало дня</label>
              <select className="select" value={sched.start} onChange={(e) => setSched((s) => ({ ...s, start: e.target.value }))}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </div>
            <div className="field" style={{ width: 130 }}>
              <label className="label">Конец дня</label>
              <select className="select" value={sched.end} onChange={(e) => setSched((s) => ({ ...s, end: e.target.value }))}>
                {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
              </select>
            </div>
            <div className="field" style={{ width: 130 }}>
              <label className="label">Шаг сетки</label>
              <select className="select" value={sched.slot} onChange={(e) => setSched((s) => ({ ...s, slot: e.target.value }))}>
                <option value="15">15 мин</option>
                <option value="30">30 мин</option>
                <option value="60">60 мин</option>
              </select>
            </div>
            <div className="field" style={{ width: 150 }}>
              <label className="label">Длит. по умолч., мин</label>
              <input className="input tnum" value={sched.dur} onChange={(e) => setSched((s) => ({ ...s, dur: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" />
            </div>
            <button className="btn btn-primary" disabled={mSched.isPending || Number(sched.end) <= Number(sched.start)} onClick={() => mSched.mutate()}>
              {mSched.isPending ? <Spinner /> : <Check size={16} />} Сохранить
            </button>
          </div>
          {Number(sched.end) <= Number(sched.start) && (
            <span className="text-xs" style={{ color: 'var(--danger)' }}>Конец дня должен быть позже начала.</span>
          )}
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 'var(--sp-5)' }}>
        <div className="panel-head"><h2 className="panel-title"><Building2 size={16} className="muted" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Реквизиты для документов</h2></div>
        <div style={{ padding: 'var(--sp-4)' }} className="col gap-3">
          <p className="text-sm muted" style={{ maxWidth: '60ch' }}>
            Шапка и итоги печатной калькуляции (PDF), которая формируется по закрытому наряду.
          </p>
          <div className="field">
            <label className="label">Название исполнителя</label>
            <input className="input" value={company.name} placeholder="ИП Иванов / ООО «Татарин»" onChange={(e) => setCompany((c) => ({ ...c, name: e.target.value }))} />
          </div>
          <div className="row gap-2 wrap">
            <div className="field grow" style={{ minWidth: 160 }}>
              <label className="label">ИНН</label>
              <input className="input tnum" value={company.inn} placeholder="—" onChange={(e) => setCompany((c) => ({ ...c, inn: e.target.value }))} inputMode="numeric" />
            </div>
            <div className="field grow" style={{ minWidth: 160 }}>
              <label className="label">Телефон</label>
              <input className="input tnum" value={company.phone} placeholder="+7…" onChange={(e) => setCompany((c) => ({ ...c, phone: e.target.value }))} />
            </div>
          </div>
          <div className="field">
            <label className="label">Адрес</label>
            <input className="input" value={company.address} placeholder="г. …, ул. …" onChange={(e) => setCompany((c) => ({ ...c, address: e.target.value }))} />
          </div>
          <div className="row gap-2" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ width: 200 }}>
              <label className="label">Ставка НДС</label>
              <select className="select" value={vat} onChange={(e) => setVat(e.target.value)}>
                <option value="0">Без НДС (УСН)</option>
                <option value="10">НДС 10%</option>
                <option value="20">НДС 20%</option>
              </select>
            </div>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} disabled={mCompany.isPending} onClick={() => mCompany.mutate()}>
              {mCompany.isPending ? <Spinner /> : <Check size={16} />} Сохранить
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}

/** Управление учётными записями: мастера, приёмщики, владельцы. Только для владельца. */
function UsersSection({ selfId }: { selfId?: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: api.users });

  const [form, setForm] = useState<{ name: string; login: string; password: string; role: UserRole }>(
    { name: '', login: '', password: '', role: 'master' },
  );

  const mCreate = useMutation({
    mutationFn: () =>
      api.createUser({
        name: form.name.trim(),
        login: form.login.trim(),
        password: form.password,
        role: form.role,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setForm({ name: '', login: '', password: '', role: 'master' });
      toast('Пользователь создан', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const canSubmit =
    form.name.trim() !== '' && form.login.trim().length >= 3 && form.password.length >= 4;

  return (
    <section className="panel" style={{ marginBottom: 'var(--sp-5)' }}>
      <div className="panel-head"><h2 className="panel-title"><Users2 size={16} className="muted" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Пользователи</h2></div>
      <div style={{ padding: 'var(--sp-4)' }} className="col gap-3">
        <p className="text-sm muted" style={{ maxWidth: '60ch' }}>
          Мастер видит только закреплённые за ним наряды. Мастер-приёмщик и владелец видят все
          наряды и могут назначать мастера. Отключённый пользователь не может войти.
        </p>
        {!users ? (
          <Spinner />
        ) : (
          <div className="users-list">
            {users.map((u) => (
              <UserRow key={u.id} u={u} self={u.id === selfId} />
            ))}
          </div>
        )}

        <div className="users-add">
          <div className="field grow" style={{ minWidth: 160 }}>
            <label className="label">Имя</label>
            <input className="input" value={form.name} placeholder="Пётр Петров" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="field users-add-short">
            <label className="label">Логин</label>
            <input className="input" value={form.login} placeholder="petrov" onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))} />
          </div>
          <div className="field users-add-short">
            <label className="label">Пароль</label>
            <input className="input" value={form.password} placeholder="мин. 4 символа" onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </div>
          <div className="field users-add-role">
            <label className="label">Роль</label>
            <select className="select" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}>
              {ROLE_VALUES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" disabled={!canSubmit || mCreate.isPending} onClick={() => mCreate.mutate()}>
            {mCreate.isPending ? <Spinner /> : <UserPlus size={16} />} Добавить
          </button>
        </div>
      </div>
    </section>
  );
}

function UserRow({ u, self }: { u: User; self: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [pwOpen, setPwOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const inval = () => qc.invalidateQueries({ queryKey: ['users'] });
  const mUpd = useMutation({
    mutationFn: (body: Partial<{ name: string; role: UserRole; is_active: boolean; password: string }>) =>
      api.updateUser(u.id, body),
    onSuccess: () => inval(),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mDel = useMutation({
    mutationFn: () => api.deleteUser(u.id),
    onSuccess: () => { setConfirmDel(false); inval(); toast('Пользователь удалён', 'success'); },
    onError: (e) => { setConfirmDel(false); toast((e as Error).message, 'error'); },
  });

  return (
    <div className="user-row" data-off={!u.is_active || undefined}>
      <div className="user-main">
        <div className="user-id">
          <input
            className="input user-name"
            defaultValue={u.name}
            key={u.name}
            aria-label="Имя"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== u.name) mUpd.mutate({ name: v });
            }}
          />
          <span className="user-login mono truncate">{u.login}{self ? ' · вы' : ''}</span>
        </div>
        <div className="user-actions">
          <select
            className="select user-role"
            value={u.role}
            disabled={mUpd.isPending}
            onChange={(e) => mUpd.mutate({ role: e.target.value as UserRole })}
            aria-label="Роль"
          >
            {ROLE_VALUES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          <span className="user-status" data-on={u.is_active}>
            {u.is_active ? 'активен' : 'отключён'}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setPwOpen((o) => !o)} title="Сбросить пароль">
            <KeyRound size={14} /> Пароль
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            disabled={self || mUpd.isPending}
            title={self ? 'Нельзя отключить себя' : u.is_active ? 'Деактивировать' : 'Активировать'}
            onClick={() => mUpd.mutate({ is_active: !u.is_active })}
            aria-label="Активность"
          >
            <Power size={15} style={{ color: u.is_active ? 'var(--primary)' : 'var(--faint)' }} />
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm del"
            disabled={self || mDel.isPending}
            title={self ? 'Нельзя удалить себя' : 'Удалить'}
            onClick={() => setConfirmDel(true)}
            aria-label="Удалить"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {pwOpen && (
        <div className="user-pw">
          <KeyRound size={14} className="faint" />
          <input
            className="input"
            style={{ width: 200, height: '1.875rem' }}
            value={pw}
            placeholder="новый пароль (мин. 4)"
            autoFocus
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { setPw(''); setPwOpen(false); } }}
          />
          <button
            className="btn btn-default btn-sm"
            disabled={pw.length < 4 || mUpd.isPending}
            onClick={() =>
              mUpd.mutate(
                { password: pw },
                { onSuccess: () => { setPw(''); setPwOpen(false); toast('Пароль обновлён', 'success'); inval(); } },
              )
            }
          >
            <Check size={14} /> Сохранить
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setPw(''); setPwOpen(false); }}>Отмена</button>
        </div>
      )}

      <Modal
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="Удалить пользователя?"
        width={420}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmDel(false)} disabled={mDel.isPending}>Отмена</button>
            <button className="btn btn-danger" onClick={() => mDel.mutate()} disabled={mDel.isPending}>
              {mDel.isPending ? <Spinner /> : <UserX size={15} />} Удалить
            </button>
          </>
        }
      >
        <p className="text-sm">
          Пользователь «{u.name}» ({u.login}) будет удалён. Привязка к его заказ-нарядам
          снимется (наряды останутся без мастера). Действие необратимо.
        </p>
      </Modal>
    </div>
  );
}
