import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, Search, Plus, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import { phone as fmtPhone, dateShort, money, sourceLabel, clientDeals } from '../../lib/format';
import { Avatar, EmptyState, ListSkeleton } from '../../components/ui';
import { ClientFormModal } from './ClientFormModal';
import type { ClientSource } from '../../lib/types';
import './clients.css';

type SourceFilter = 'all' | ClientSource;
type SortKey = 'created_desc' | 'created_asc' | 'deals_desc';

export function ClientsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [sort, setSort] = useState<SortKey>('created_desc');
  const [adding, setAdding] = useState(false);

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: api.clients,
  });

  const filtered = useMemo(() => {
    let list = clients ?? [];
    const term = q.trim().toLowerCase();
    if (term) {
      const digits = term.replace(/\D/g, '');
      list = list.filter(
        (c) =>
          c.full_name.toLowerCase().includes(term) ||
          (!!digits && c.phone.replace(/\D/g, '').includes(digits)),
      );
    }
    if (source !== 'all') list = list.filter((c) => c.source === source);

    const ts = (s: string) => new Date(s).getTime();
    return [...list].sort((a, b) => {
      if (sort === 'deals_desc') {
        return (
          clientDeals(b).count - clientDeals(a).count ||
          ts(b.created_at) - ts(a.created_at)
        );
      }
      if (sort === 'created_asc') return ts(a.created_at) - ts(b.created_at);
      return ts(b.created_at) - ts(a.created_at);
    });
  }, [clients, q, source, sort]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Клиенты</h1>
          <p className="page-sub">
            {clients ? `${clients.length} ${plural(clients.length, 'клиент', 'клиента', 'клиентов')} в базе` : 'Загрузка…'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> Клиент
        </button>
      </div>

      <div className="clients-controls">
        <div className="clients-search grow">
          <Search size={16} className="muted" />
          <input
            className="clients-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Фильтр по имени или телефону…"
            aria-label="Фильтр клиентов"
          />
        </div>
        <select
          className="select clients-select"
          value={source}
          onChange={(e) => setSource(e.target.value as SourceFilter)}
          aria-label="Источник"
        >
          <option value="all">Все источники</option>
          <option value="manual">Вручную</option>
          <option value="csv_import">Импорт</option>
          <option value="telegram_bot">Telegram</option>
        </select>
        <select
          className="select clients-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Сортировка"
        >
          <option value="created_desc">Сначала новые</option>
          <option value="created_asc">Сначала старые</option>
          <option value="deals_desc">Больше сделок</option>
        </select>
      </div>

      {(q || source !== 'all') && (
        <div className="text-xs muted" style={{ marginBottom: 'var(--sp-3)', marginTop: 'calc(-1 * var(--sp-2))' }}>
          Найдено: {filtered.length}
        </div>
      )}

      <div className="panel" style={{ overflow: 'hidden' }}>
        <div className="list-head client-row">
          <span>Клиент</span>
          <span className="col-phone">Телефон</span>
          <span className="col-source">Источник</span>
          <span className="col-deals tnum">История</span>
          <span className="col-date">Добавлен</span>
          <span />
        </div>

        {isLoading ? (
          <ListSkeleton rows={8} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={q ? 'Никого не нашли' : 'База пуста'}
            hint={q ? 'Измените запрос или заведите нового клиента.' : 'Заведите первого клиента или импортируйте базу из CSV.'}
            action={
              !q ? (
                <button className="btn btn-default" onClick={() => setAdding(true)}>
                  <Plus size={16} /> Добавить клиента
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="list">
            {filtered.map((c) => (
              <button key={c.id} className="list-row client-row" onClick={() => navigate(`/clients/${c.id}`)}>
                <span className="row gap-3" style={{ minWidth: 0 }}>
                  <Avatar name={c.full_name} size={32} />
                  <span className="col" style={{ minWidth: 0 }}>
                    <span className="fw-500 truncate">{c.full_name}</span>
                    <span className="text-xs muted col-phone-inline mono">{fmtPhone(c.phone)}</span>
                  </span>
                </span>
                <span className="col-phone mono text-sm">{fmtPhone(c.phone)}</span>
                <span className="col-source">
                  <span className="badge">{sourceLabel(c.source)}</span>
                </span>
                <span className="col-deals tnum text-sm">
                  {clientDeals(c).count > 0 ? (
                    <span title="Закрытых сделок / сумма (CRM + старая база)">
                      {clientDeals(c).count} · {money(clientDeals(c).sum)}
                    </span>
                  ) : (
                    <span className="faint">—</span>
                  )}
                </span>
                <span className="col-date text-sm muted tnum">{dateShort(c.created_at)}</span>
                <ChevronRight size={16} className="faint" />
              </button>
            ))}
          </div>
        )}
      </div>

      <ClientFormModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(c) => {
          setAdding(false);
          navigate(`/clients/${c.id}`);
        }}
      />
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
