import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

export interface ToastItem {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

export function ToastView({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" data-kind={t.kind}>
          {t.kind === 'success' && <CheckCircle2 size={16} />}
          {t.kind === 'error' && <AlertCircle size={16} />}
          {t.kind === 'info' && <Info size={16} />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
