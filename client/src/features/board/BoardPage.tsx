import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { canAssignMaster } from '../../lib/roles';
import { STATUS_ORDER } from '../../lib/types';
import type { WorkOrder, WorkOrderStatus } from '../../lib/types';
import { BoardView, type Columns } from './BoardView';

const EMPTY: Columns = { scheduled: [], in_progress: [], waiting: [], done: [], closed: [] };

export function BoardPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const showMaster = canAssignMaster(user?.role);
  const [cols, setCols] = useState<Columns>(EMPTY);
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['board'], queryFn: api.board });

  useEffect(() => {
    if (data && !activeId) setCols({ ...EMPTY, ...data });
  }, [data, activeId]);

  const mStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: WorkOrderStatus }) => api.setStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['work-order'] }); // detail page, if open
    },
    onError: (e) => {
      toast((e as Error).message, 'error');
      qc.invalidateQueries({ queryKey: ['board'] });
    },
  });

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const id = String(e.active.id);
    const over = e.over?.id as WorkOrderStatus | undefined;
    if (!over) return;
    const from = STATUS_ORDER.find((s) => cols[s].some((w) => w.id === id));
    if (!from || from === over) return;

    const card = cols[from].find((w) => w.id === id)!;
    const moved: WorkOrder = {
      ...card,
      status: over,
      ...(over === 'closed' && card.status !== 'closed'
        ? { total_frozen: card.total_cached, closed_at: new Date().toISOString() }
        : {}),
      ...(over !== 'closed' && card.status === 'closed' ? { total_frozen: null, closed_at: null } : {}),
    };
    setCols((c) => ({
      ...c,
      [from]: c[from].filter((w) => w.id !== id),
      [over]: [moved, ...c[over]],
    }));
    mStatus.mutate({ id, status: over });
  };

  return (
    <BoardView
      columns={cols}
      showMaster={showMaster}
      activeId={activeId}
      loading={isLoading}
      onOpen={(id) => navigate(`/work-orders/${id}`, { state: { back: { to: '/board', label: 'Доска' } } })}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    />
  );
}
