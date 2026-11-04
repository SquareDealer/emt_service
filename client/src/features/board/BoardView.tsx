import { useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
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
import { money, timeOnly, dateShort, vehicleLabel } from '../../lib/format';
import { STATUS_LABEL, STATUS_ORDER } from '../../lib/types';
import type { WorkOrder, WorkOrderStatus } from '../../lib/types';
import { Spinner } from '../../components/ui';
import './board.css';

export type Columns = Record<WorkOrderStatus, WorkOrder[]>;

export interface BoardViewProps {
  columns: Columns;
  showMaster: boolean;
  activeId: string | null;
  loading?: boolean;
  onOpen(id: string): void;
  onDragStart(e: DragStartEvent): void;
  onDragEnd(e: DragEndEvent): void;
  /** Demo: render this column as if a card were dragged over it. */
  overStatus?: WorkOrderStatus;
  /** Demo: render this card as the source of a drag in progress. */
  ghostId?: string;
  /** Demo: hover look on this card. */
  highlightId?: string;
  /** Demo: extra style for a card wrapper, by position within its column. */
  rowStyle?: (index: number, id: string) => CSSProperties;
}

export function BoardView({
  columns,
  showMaster,
  activeId,
  loading = false,
  onOpen,
  onDragStart,
  onDragEnd,
  overStatus,
  ghostId,
  highlightId,
  rowStyle,
}: BoardViewProps) {
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
      const f = columns[s].find((w) => w.id === activeId);
      if (f) return f;
    }
    return null;
  }, [activeId, columns]);

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Доска</h1>
          <p className="page-sub">Перетаскивайте наряды между колонками, чтобы менять статус</p>
        </div>
      </div>

      {loading ? (
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
              <Column
                key={s}
                status={s}
                items={columns[s]}
                showMaster={showMaster}
                onOpen={onOpen}
                forceOver={overStatus === s}
                ghostId={ghostId}
                highlightId={highlightId}
                rowStyle={rowStyle}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeWo ? <BoardCard wo={activeWo} showMaster={showMaster} dragging /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

function Column({
  status,
  items,
  showMaster,
  onOpen,
  forceOver,
  ghostId,
  highlightId,
  rowStyle,
}: {
  status: WorkOrderStatus;
  items: WorkOrder[];
  showMaster: boolean;
  onOpen: (id: string) => void;
  forceOver?: boolean;
  ghostId?: string;
  highlightId?: string;
  rowStyle?: (index: number, id: string) => CSSProperties;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="board-col" data-demo="board-col" data-status={status}>
      <div className="board-col-head">
        <span className="board-dot" data-status={status} />
        <span className="board-col-title">{STATUS_LABEL[status]}</span>
        <span className="board-count">{items.length}</span>
      </div>
      <div ref={setNodeRef} className={`board-col-body ${isOver || forceOver ? 'over' : ''}`}>
        {items.map((w, i) => (
          <DraggableCard
            key={w.id}
            wo={w}
            showMaster={showMaster}
            onOpen={onOpen}
            ghost={ghostId === w.id}
            hover={highlightId === w.id}
            style={rowStyle?.(i, w.id)}
          />
        ))}
        {items.length === 0 && <div className="board-empty">пусто</div>}
      </div>
    </div>
  );
}

function DraggableCard({
  wo,
  showMaster,
  onOpen,
  ghost,
  hover,
  style,
}: {
  wo: WorkOrder;
  showMaster: boolean;
  onOpen: (id: string) => void;
  ghost?: boolean;
  hover?: boolean;
  style?: CSSProperties;
}) {
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
      data-demo="board-card"
      data-id={wo.id}
      style={{ opacity: isDragging || ghost ? 0.35 : 1, ...style }}
    >
      <BoardCard wo={wo} showMaster={showMaster} hover={hover} />
    </div>
  );
}

export function BoardCard({ wo, showMaster, dragging, hover }: { wo: WorkOrder; showMaster?: boolean; dragging?: boolean; hover?: boolean }) {
  const total = wo.status === 'closed' ? wo.total_frozen ?? wo.total_cached : wo.total_cached;
  return (
    <div className={`board-card ${dragging ? 'is-dragging' : ''}`} data-hover={hover ? '' : undefined}>
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
