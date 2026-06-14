import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Plus, Trash2, Gauge, ListChecks } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { money } from '../../lib/format';
import { Spinner, EmptyState } from '../../components/ui';

export function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings });
  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: api.templates });

  const [rate, setRate] = useState('');
  useEffect(() => { if (settings) setRate(String(settings.labor_rate)); }, [settings]);

  const mRate = useMutation({
    mutationFn: (v: number) => api.updateSettings(v),
    onSuccess: (r) => { qc.setQueryData(['settings'], r); toast('Ставка сохранена', 'success'); },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const [tName, setTName] = useState('');
  const [tHours, setTHours] = useState('');
  const [tPrice, setTPrice] = useState('');

  const mAddTpl = useMutation({
    mutationFn: () => api.createTemplate({
      name: tName.trim(),
      default_hours: tHours ? Number(tHours) : null,
      default_price: tPrice ? Number(tPrice) : null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); setTName(''); setTHours(''); setTPrice(''); toast('Шаблон добавлен', 'success'); },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mDelTpl = useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  const rateChanged = settings && rate !== String(settings.labor_rate) && rate !== '';

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Настройки</h1>
          <p className="page-sub">Ставка нормо-часа и шаблоны типовых работ</p>
        </div>
      </div>

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

      <section className="panel">
        <div className="panel-head"><h2 className="panel-title"><ListChecks size={16} className="muted" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Шаблоны работ</h2></div>
        <div style={{ padding: 'var(--sp-4)' }} className="col gap-3">
          {!templates ? (
            <Spinner />
          ) : templates.length === 0 ? (
            <EmptyState title="Нет шаблонов" hint="Добавьте типовые операции — они подставляются в смету одним кликом." />
          ) : (
            <div className="list" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
              {templates.map((t) => (
                <div key={t.id} className="list-row" style={{ gridTemplateColumns: '1fr auto auto auto' }}>
                  <span className="fw-500 truncate">{t.name}</span>
                  <span className="text-sm muted tnum">{t.default_hours != null ? `${t.default_hours} ч` : '—'}</span>
                  <span className="text-sm muted tnum" style={{ minWidth: 90, textAlign: 'right' }}>{t.default_price != null ? money(t.default_price) : 'по ставке'}</span>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => mDelTpl.mutate(t.id)} aria-label="Удалить"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="row gap-2 wrap" style={{ alignItems: 'flex-end' }}>
            <div className="field grow" style={{ minWidth: 180 }}>
              <label className="label">Название операции</label>
              <input className="input" value={tName} onChange={(e) => setTName(e.target.value)} placeholder="Замена колодок" onKeyDown={(e) => e.key === 'Enter' && tName.trim() && mAddTpl.mutate()} />
            </div>
            <div className="field" style={{ width: 96 }}>
              <label className="label">Часы</label>
              <input className="input tnum" value={tHours} onChange={(e) => setTHours(e.target.value.replace(/[^\d.]/g, ''))} placeholder="1.5" inputMode="decimal" />
            </div>
            <div className="field" style={{ width: 120 }}>
              <label className="label">Фикс. цена</label>
              <input className="input tnum" value={tPrice} onChange={(e) => setTPrice(e.target.value.replace(/\D/g, ''))} placeholder="—" inputMode="numeric" />
            </div>
            <button className="btn btn-default" disabled={!tName.trim() || mAddTpl.isPending} onClick={() => mAddTpl.mutate()}>
              {mAddTpl.isPending ? <Spinner /> : <Plus size={16} />} Добавить
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
