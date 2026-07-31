import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Car, GripVertical, UserCog } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { canAssignMaster } from '../../lib/roles';
import { money, timeOnly, dateShort, vehicleLabel } from '../../lib/format';
import { STATUS_LABEL, STATUS_ORDER } from '../../lib/types';
import type { WorkOrder, WorkOrderStatus } from '../../lib/types';
import { Spinner } from '../../components/ui';
import './board.css';

type Columns = Record<WorkOrderStatus, WorkOrder[]>;
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Grab-pan the board horizontally by dragging empty background. Cards keep their
  // own dnd-kit drag (PointerSensor), so we bail out when the press lands on a card.
  const boardRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startScroll: number } | null>(null);

  const onBoardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.board-card-drag')) return; // let dnd-kit handle cards
    const el = boardRef.current;
    if (!el) return;
    panRef.current = { startX: e.clientX, startScroll: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
    el.classList.add('panning');
  };
  const onBoardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const el = boardRef.current;
    if (!pan || !el) return;
    el.scrollLeft = pan.startScroll - (e.clientX - pan.startX);
  };
  const endPan = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = boardRef.current;
    if (!panRef.current || !el) return;
    panRef.current = null;
    el.releasePointerCapture?.(e.pointerId);
    el.classList.remove('panning');
  };

  const activeWo = useMemo(() => {
    if (!activeId) return null;
    for (const s of STATUS_ORDER) {
      const f = cols[s].find((w) => w.id === activeId);
      if (f) return f;
    }
    return null;
  }, [activeId, cols]);

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
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Доска</h1>
          <p className="page-sub">Перетаскивайте наряды между колонками, чтобы менять статус</p>
        </div>
      </div>

      {isLoading ? (
        <div className="center" style={{ minHeight: 280 }}><Spinner size={22} /></div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div
            className="board"
            ref={boardRef}
            onPointerDown={onBoardPointerDown}
            onPointerMove={onBoardPointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
          >
            {STATUS_ORDER.map((s) => (
              <Column key={s} status={s} items={cols[s]} showMaster={showMaster} onOpen={(id) => navigate(`/work-orders/${id}`, { state: { back: { to: '/board', label: 'Доска' } } })} />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeWo ? <Card wo={activeWo} showMaster={showMaster} dragging /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function Column({ status, items, showMaster, onOpen }: { status: WorkOrderStatus; items: WorkOrder[]; showMaster: boolean; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="board-col">
      <div className="board-col-head">
        <span className="board-dot" data-status={status} />
        <span className="board-col-title">{STATUS_LABEL[status]}</span>
        <span className="board-count">{items.length}</span>
      </div>
      <div ref={setNodeRef} className={`board-col-body ${isOver ? 'over' : ''}`}>
        {items.map((w) => (
          <DraggableCard key={w.id} wo={w} showMaster={showMaster} onOpen={onOpen} />
        ))}
        {items.length === 0 && <div className="board-empty">пусто</div>}
      </div>
    </div>
  );
}

function DraggableCard({ wo, showMaster, onOpen }: { wo: WorkOrder; showMaster: boolean; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: wo.id });
  // Listeners on the whole card -> drag from anywhere. PointerSensor's 5px
  // activation distance lets a plain click (no movement) still open the order.
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(wo.id)}
      className="board-card-drag"
      style={{ opacity: isDragging ? 0.35 : 1 }}
    >
      <Card wo={wo} showMaster={showMaster} />
    </div>
  );
}

function Card({ wo, showMaster, dragging }: { wo: WorkOrder; showMaster?: boolean; dragging?: boolean }) {
  const total = wo.status === 'closed' ? wo.total_frozen ?? wo.total_cached : wo.total_cached;
  return (
    <div className={`board-card ${dragging ? 'is-dragging' : ''}`}>
      <div className="board-card-top">
        <span className="board-card-title truncate">{wo.title || 'Заказ-наряд'}</span>
        <span className="board-grip" aria-hidden>
          <GripVertical size={14} />
        </span>
      </div>
      <div className="board-card-meta">
        <Car size={13} />
        <span className="truncate">{vehicleLabel(wo.vehicle)} <span className="mono">{wo.vehicle?.plate || ''}</span></span>
      </div>
      {wo.vehicle?.client && <div className="board-card-client truncate">{wo.vehicle.client.full_name}</div>}
      <div className="board-card-foot">
        <span className="mono tnum fw-500">{money(total)}</span>
        {wo.scheduled_at && <span className="board-card-time">{dateShort(wo.scheduled_at)} {timeOnly(wo.scheduled_at)}</span>}
      </div>
      {showMaster && wo.assigned_master && (
        <div className="board-card-master truncate" title={wo.assigned_master.name}>
          <UserCog size={12} /> {wo.assigned_master.name}
        </div>
      )}
    </div>
  );
}
