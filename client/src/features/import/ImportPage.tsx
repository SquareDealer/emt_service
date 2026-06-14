import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import type { ImportReport } from '../../lib/types';
import { Spinner } from '../../components/ui';
import './import.css';

export function ImportPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [err, setErr] = useState('');

  const mImport = useMutation({
    mutationFn: (file: File) => api.importClients(file),
    onSuccess: (r) => {
      setReport(r);
      setErr('');
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => setErr((e as Error).message || 'Не удалось импортировать'),
  });

  const handleFile = (file: File) => {
    setFileName(file.name);
    setReport(null);
    mImport.mutate(file);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Импорт базы</h1>
          <p className="page-sub">Перенос клиентов из старой системы — CSV с дедупом по телефону</p>
        </div>
      </div>

      <div
        className={`drop ${dragOver ? 'over' : ''} ${mImport.isPending ? 'busy' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        onClick={() => !mImport.isPending && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
        {mImport.isPending ? (
          <><Spinner size={24} /><span className="drop-title">Импортируем «{fileName}»…</span></>
        ) : (
          <>
            <div className="drop-icon"><Upload size={26} /></div>
            <span className="drop-title">Перетащите CSV сюда или нажмите для выбора</span>
            <span className="text-sm muted">UTF-8 и Windows-1251, разделитель «,» или «;»</span>
          </>
        )}
      </div>

      {err && <div className="import-err" role="alert"><AlertTriangle size={16} /> {err}</div>}

      {report && (
        <div className="report">
          <div className="report-stats">
            <div className="report-stat ok">
              <CheckCircle2 size={18} />
              <div className="col"><span className="report-num tnum">{report.added}</span><span className="report-lbl">добавлено</span></div>
            </div>
            <div className="report-stat">
              <div className="col"><span className="report-num tnum">{report.skipped_duplicates}</span><span className="report-lbl">дубли (пропущены)</span></div>
            </div>
            <div className="report-stat" data-warn={report.errors.length > 0}>
              <div className="col"><span className="report-num tnum">{report.errors.length}</span><span className="report-lbl">ошибок в строках</span></div>
            </div>
            <div className="report-stat">
              <div className="col"><span className="report-num tnum">{report.total}</span><span className="report-lbl">всего строк</span></div>
            </div>
          </div>

          {report.errors.length > 0 && (
            <div className="panel" style={{ marginTop: 'var(--sp-4)', overflow: 'hidden' }}>
              <div className="panel-head"><h2 className="panel-title">Пропущенные строки</h2></div>
              <div className="list">
                {report.errors.slice(0, 50).map((e, i) => (
                  <div key={i} className="list-row" style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'start' }}>
                    <span className="badge">строка {e.line}</span>
                    <div className="col">
                      <span className="text-sm">{e.reason}</span>
                      {e.raw && <span className="text-xs faint mono truncate">{e.raw}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Link to="/clients" className="btn btn-primary" style={{ marginTop: 'var(--sp-4)' }}>
            Открыть клиентов <ArrowRight size={16} />
          </Link>
        </div>
      )}

      <div className="panel format-card">
        <div className="panel-head"><h2 className="panel-title"><FileText size={16} className="muted" style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Формат файла</h2></div>
        <div style={{ padding: 'var(--sp-4)' }} className="col gap-3">
          <p className="text-sm muted">Колонки по порядку (заголовок необязателен):</p>
          <code className="format-cols mono">ФИО, телефон, дата создания, кол-во закрытых сделок, сумма закрытых сделок</code>
          <ul className="format-list text-sm muted">
            <li>Телефон нормализуется автоматически (8 → +7), дубли по номеру пропускаются.</li>
            <li>Дата — «ДД.ММ.ГГГГ» или ISO; сохраняется как реальная дата регистрации.</li>
            <li>Историческая выручка переносится в карточку клиента ({money(0)} если пусто).</li>
            <li>Повторный импорт того же файла не создаёт дублей.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
