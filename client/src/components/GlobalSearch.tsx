import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SearchHit } from '../lib/types';
import { SearchPaletteView } from './SearchPaletteView';

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

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
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

  return (
    <SearchPaletteView
      q={q}
      settledQ={debounced}
      hits={hits}
      active={active}
      fetching={isFetching}
      inputRef={inputRef}
      onQ={setQ}
      onKeyDown={onKey}
      onHover={setActive}
      onPick={go}
      onClose={onClose}
    />
  );
}
