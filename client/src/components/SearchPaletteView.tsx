import type { KeyboardEvent, Ref } from 'react';
import { Search, User, Car, CornerDownLeft } from 'lucide-react';
import { phone as fmtPhone, vehicleLabel } from '../lib/format';
import type { SearchHit } from '../lib/types';
import { Spinner } from './ui';
import './app-shell.css';

export interface SearchPaletteViewProps {
  q: string;
  hits: SearchHit[];
  active: number;
  fetching?: boolean;
  /** Debounced query that drives the empty states; defaults to q.trim(). */
  settledQ?: string;
  inputRef?: Ref<HTMLInputElement>;
  onQ(v: string): void;
  onKeyDown(e: KeyboardEvent<HTMLInputElement>): void;
  onHover(i: number): void;
  onPick(hit: SearchHit): void;
  onClose(): void;
}

export function SearchPaletteView({
  q,
  hits,
  active,
  fetching = false,
  settledQ,
  inputRef,
  onQ,
  onKeyDown,
  onHover,
  onPick,
  onClose,
}: SearchPaletteViewProps) {
  const debounced = settledQ ?? q.trim();
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
            data-demo="search-input"
            value={q}
            onChange={(e) => onQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Поиск клиента, телефона, VIN или госномера…"
            aria-label="Поисковый запрос"
          />
          {fetching && <Spinner />}
        </div>

        <div className="palette-results">
          {debounced.length < 1 && (
            <div className="empty" style={{ padding: 'var(--sp-6)' }}>
              <Search />
              <div className="text-sm muted">Начните вводить — ищем по всей базе</div>
            </div>
          )}
          {debounced.length >= 1 && !fetching && hits.length === 0 && (
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
                data-demo="search-hit"
                data-active={i === active}
                aria-selected={i === active}
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(h)}
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
                data-demo="search-hit"
                data-active={i === active}
                aria-selected={i === active}
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(h)}
              >
                <Car size={16} className="muted" />
                <div className="col grow" style={{ minWidth: 0 }}>
                  <span className="pi-main truncate">
                    <span className="mono">{h.vin || h.plate || '—'}</span>
                    {vehicleLabel(h, '') ? ` · ${vehicleLabel(h, '')}` : ''}
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
