import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import {
  Archive,
  Search,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Car,
} from 'lucide-react';
import { api } from '../../lib/api';
import { downloadBlob } from '../../lib/download';
import { useToast } from '../../lib/toast';
import { money, dateShort, vehicleLabel } from '../../lib/format';
import { EmptyState, ListSkeleton, Spinner } from '../../components/ui';
import type { ArchiveSort, WorkOrder } from '../../lib/types';
import './archive.css';

const PAGE_SIZE = 25;
const BACK = { to: '/archive', label: 'Архив' };

export function ArchivePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sort, setSort] = useState<ArchiveSort>('closed_desc');
  const [page, setPage] = useState(1);

  // debounce the search box; reset to first page on any query/sort change
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sort]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['archive', debouncedQ, sort, page],
    queryFn: () => api.archive({ q: debouncedQ, sort, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const [pdfId, setPdfId] = useState<string | null>(null);
  const mPdf = useMutation({
    mutationFn: (wo: WorkOrder) => api.workOrderPdf(wo.id),
    onMutate: (wo) => setPdfId(wo.id),
    onSuccess: (blob, wo) => {
      downloadBlob(blob, `kalkulyaciya-${wo.doc_number ?? wo.id.slice(0, 8)}.pdf`);
      toast('Документ сформирован', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
    onSettled: () => setPdfId(null),
  });

  const open = (id: string) =>
    navigate(`/work-orders/${id}`, { state: { back: BACK } });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Архив</h1>
          <p className="page-sub">
            {isLoading
              ? 'Загрузка…'
              : `Закрытые заказ-наряды${total ? ` · ${total}` : ''}`}
          </p>
        </div>
      </div>

      <div className="clients-controls">
        <div className="clients-search grow">
          <Search size={16} className="muted" />
          <input
            className="clients-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск: название, авто, клиент, № документа…"
            aria-label="Поиск по архиву"
          />
          {isFetching && !isLoading && <Spinner size={14} />}
        </div>
        <select
          className="select clients-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as ArchiveSort)}
          aria-label="Сортировка"
        >
          <option value="closed_desc">Сначала новые (по закрытию)</option>
          <option value="closed_asc">Сначала старые</option>
          <option value="total_desc">Сумма: больше</option>
          <option value="total_asc">Сумма: меньше</option>
        </select>
      </div>

      <div className="panel" style={{ overflow: 'hidden' }}>
        <div className="list-head archive-row">
          <span>№</span>
          <span>Заказ-наряд</span>
          <span className="col-closed">Закрыт</span>
          <span className="archive-total">Сумма</span>
          <span />
          <span />
        </div>

        {isLoading ? (
          <ListSkeleton rows={8} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Archive />}
            title={debouncedQ ? 'Ничего не найдено' : 'Архив пуст'}
            hint={
              debouncedQ
                ? 'Измените запрос — поиск идёт по названию, авто, клиенту и номеру.'
                : 'Здесь появятся закрытые заказ-наряды с зафиксированной сметой.'
            }
          />
        ) : (
          <div className="list">
            {items.map((wo) => (
              <div
                key={wo.id}
                className="list-row archive-row"
                role="button"
                tabIndex={0}
                onClick={() => open(wo.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    open(wo.id);
                  }
                }}
              >
                <span className="mono tnum faint archive-num">
                  {wo.doc_number != null ? `№ ${wo.doc_number}` : '—'}
                </span>
                <span className="col" style={{ minWidth: 0 }}>
                  <span className="fw-500 truncate">{wo.title || 'Заказ-наряд'}</span>
                  <span className="text-xs muted truncate row gap-2 archive-sub">
                    <Car size={12} className="faint" />
                    <span className="truncate">
                      {vehicleLabel(wo.vehicle)}{' '}
                      <span className="mono">{wo.vehicle?.plate || ''}</span>
                      {wo.vehicle?.client ? ` · ${wo.vehicle.client.full_name}` : ''}
                    </span>
                  </span>
                </span>
                <span className="col-closed text-sm muted tnum">
                  {dateShort(wo.closed_at)}
                </span>
                <span className="mono tnum fw-500 archive-total">
                  {money(wo.total_frozen ?? wo.total_cached)}
                </span>
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  title="Скачать калькуляцию"
                  aria-label="Скачать калькуляцию"
                  disabled={mPdf.isPending && pdfId === wo.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    mPdf.mutate(wo);
                  }}
                >
                  {mPdf.isPending && pdfId === wo.id ? (
                    <Spinner size={15} />
                  ) : (
                    <FileDown size={15} />
                  )}
                </button>
                <ChevronRight size={16} className="faint" />
              </div>
            ))}
          </div>
        )}
      </div>

      {pageCount > 1 && (
        <div className="archive-pager">
          <button
            className="btn btn-default btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={15} /> Назад
          </button>
          <span className="text-sm muted tnum">
            стр. {page} из {pageCount}
          </span>
          <button
            className="btn btn-default btn-sm"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Вперёд <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
