import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, User, Car, CornerDownLeft } from 'lucide-react';
import { api } from '../lib/api';
import { phone as fmtPhone } from '../lib/format';
import type { SearchHit } from '../lib/types';
import { Spinner } from './ui';

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQ('');
      setDebounced('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 160);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.search(debounced),
    enabled: open && debounced.length >= 1,
  });

  const hits = useMemo(() => data ?? [], [data]);

  useEffect(() => setActive(0), [hits]);

  if (!open) return null;

  const go = (hit: SearchHit) => {
    const clientId = hit.type === 'client' ? hit.id : hit.client?.id;
    if (clientId) navigate(`/clients/${clientId}`);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return onClose();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault();
      go(hits[active]);
    }
  };

  const clients = hits.filter((h) => h.type === 'client');
  const vehicles = hits.filter((h) => h.type === 'vehicle');
  let idx = -1;

  return (
    <div className="palette-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Поиск">
        <div className="palette-input">
          <Search size={18} className="muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Поиск клиента, телефона, VIN или госномера…"
            aria-label="Поисковый запрос"
          />
          {isFetching && <Spinner />}
        </div>

        <div className="palette-results">
          {debounced.length < 1 && (
            <div className="empty" style={{ padding: 'var(--sp-6)' }}>
              <Search />
              <div className="text-sm muted">Начните вводить — ищем по всей базе</div>
            </div>
          )}
          {debounced.length >= 1 && !isFetching && hits.length === 0 && (
            <div className="empty" style={{ padding: 'var(--sp-6)' }}>
              <div className="text-sm muted">Ничего не найдено по «{debounced}»</div>
            </div>
          )}

          {clients.length > 0 && <div className="palette-group">Клиенты</div>}
          {clients.map((h) => {
            idx++;
            const i = idx;
            return (
              <button
                key={h.id}
                className="palette-item"
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
              >
                <User size={16} className="muted" />
                <div className="col grow" style={{ minWidth: 0 }}>
                  <span className="pi-main truncate">{h.full_name}</span>
                  <span className="pi-sub mono">{fmtPhone(h.phone)}</span>
                </div>
                {i === active && <CornerDownLeft size={14} className="faint" />}
              </button>
            );
          })}

          {vehicles.length > 0 && <div className="palette-group">Автомобили</div>}
          {vehicles.map((h) => {
            idx++;
            const i = idx;
            return (
              <button
                key={h.id}
                className="palette-item"
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h)}
              >
                <Car size={16} className="muted" />
                <div className="col grow" style={{ minWidth: 0 }}>
                  <span className="pi-main truncate">
                    <span className="mono">{h.vin || h.plate || '—'}</span>
                    {h.model ? ` · ${h.model}` : ''}
                  </span>
                  <span className="pi-sub truncate">{h.client?.full_name ?? ''}</span>
                </div>
                {i === active && <CornerDownLeft size={14} className="faint" />}
              </button>
            );
          })}
        </div>

        <div className="palette-foot">
          <span><kbd>↑↓</kbd> навигация</span>
          <span><kbd>↵</kbd> открыть</span>
          <span><kbd>esc</kbd> закрыть</span>
        </div>
      </div>
    </div>
  );
}
