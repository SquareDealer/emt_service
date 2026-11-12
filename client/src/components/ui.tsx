import {
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { Loader2, X } from 'lucide-react';
import type { WorkOrderStatus } from '../lib/types';
import { STATUS_LABEL } from '../lib/types';
import { initials } from '../lib/format';

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="spin" aria-hidden style={{ animation: 'spin 0.8s linear infinite' }} />;
}

export function StatusPill({ status }: { status: WorkOrderStatus }) {
  return (
    <span className="pill" data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--primary-wash)',
        color: 'var(--primary-ink)',
        fontSize: size * 0.4,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon}
      <div className="empty-title">{title}</div>
      {hint && <div className="text-sm muted" style={{ maxWidth: '38ch' }}>{hint}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ w, h = 14, r }: { w?: number | string; h?: number; r?: number }) {
  return (
    <span
      className="skeleton"
      style={{ display: 'block', width: w ?? '100%', height: h, borderRadius: r }}
    />
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="list">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
          <div className="col gap-2" style={{ maxWidth: 280 }}>
            <Skeleton w="60%" />
            <Skeleton w="40%" h={11} />
          </div>
          <Skeleton w={64} h={22} r={999} />
        </div>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // Only a backdrop click that BOTH started and ended on the dialog itself should
  // close. Without this, selecting text inside and releasing the mouse over the
  // backdrop fires a click whose target is the <dialog> → modal closed by accident.
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && downOnBackdrop.current) onClose();
      }}
      style={width ? { maxWidth: `min(94vw, ${width}px)` } : undefined}
    >
      <form method="dialog" onSubmit={(e) => e.preventDefault()} style={{ display: 'contents' }}>
        <div className="panel-head" style={{ border: 'none', borderBottom: '1px solid var(--border)' }}>
          <h2 className="panel-title">{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 'var(--sp-4)', maxHeight: '70vh', overflow: 'auto' }}>{children}</div>
        {footer && (
          <div
            className="row"
            style={{
              justifyContent: 'flex-end',
              gap: 'var(--sp-2)',
              padding: 'var(--sp-3) var(--sp-4)',
              borderTop: '1px solid var(--border)',
            }}
          >
            {footer}
          </div>
        )}
      </form>
    </dialog>
  );
}
