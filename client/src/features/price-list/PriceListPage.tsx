import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, RotateCcw, Tag, Package } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { money } from '../../lib/format';
import { Modal, Spinner } from '../../components/ui';
import { PartsCatalog } from './PartsCatalog';
import { TemplatePartsModal } from './TemplatePartsModal';
import type { PriceListRow, VehicleGeneration } from '../../lib/types';
import './price-list.css';

const GEN_KEY = 'crm-price-generation';

function genLabel(g: VehicleGeneration): string {
  return `${g.make} ${[g.model, g.code].filter(Boolean).join(' ')}`;
}

export function PriceListPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<'works' | 'parts'>('works');
  // One generation at a time: a 15-column matrix is unreadable on a workshop
  // tablet, and the shop thinks in terms of «открыть прайс R56» anyway.
  const [generationId, setGenerationId] = useState<string>(
    () => localStorage.getItem(GEN_KEY) ?? '',
  );
  const [copyOpen, setCopyOpen] = useState(false);
  const [partsFor, setPartsFor] = useState<PriceListRow | null>(null);

  useEffect(() => {
    try {
      if (generationId) localStorage.setItem(GEN_KEY, generationId);
    } catch { /* ignore */ }
  }, [generationId]);

  const { data: generations } = useQuery({
    queryKey: ['vehicle-generations'],
    queryFn: () => api.vehicleGenerations(),
  });
  const { data: rows, isLoading } = useQuery({
    queryKey: ['price-list', generationId],
    queryFn: () => api.priceList(generationId || undefined),
  });

  const current = (generations ?? []).find((g) => g.id === generationId);

  const mSet = useMutation({
    mutationFn: ({ templateId, hours, price }: { templateId: string; hours: number | null; price: number | null }) =>
      api.setPrice(templateId, generationId, { hours, price }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-list'] }),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mClear = useMutation({
    mutationFn: (templateId: string) => api.clearPrice(templateId, generationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-list'] });
      toast('Вернули базовую цену', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const withOverride = useMemo(
    () => (rows ?? []).filter((r) => r.override).length,
    [rows],
  );

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <h1 className="page-title">Прайс-лист</h1>
          <p className="page-sub">
            Цены работ по поколениям и каталог запчастей
          </p>
        </div>
        <div className="seg">
          <button className="seg-btn" data-on={tab === 'works'} onClick={() => setTab('works')}>
            <Tag size={14} /> Работы
          </button>
          <button className="seg-btn" data-on={tab === 'parts'} onClick={() => setTab('parts')}>
            <Package size={14} /> Запчасти
          </button>
        </div>
      </div>

      {tab === 'parts' ? (
        <PartsCatalog />
      ) : (
        <>
          <div className="pl-bar">
            <div className="field pl-gen">
              <label className="label">Поколение</label>
              <select
                className="input"
                value={generationId}
                onChange={(e) => setGenerationId(e.target.value)}
              >
                <option value="">Базовые цены (для всех)</option>
                {(generations ?? []).map((g) => (
                  <option key={g.id} value={g.id}>
                    {genLabel(g)}{g.years ? ` · ${g.years}` : ''}
                  </option>
                ))}
              </select>
            </div>
            {generationId && (
              <>
                <span className="text-sm muted">
                  Своя цена задана у {withOverride} из {(rows ?? []).length}
                </span>
                <button className="btn btn-default" onClick={() => setCopyOpen(true)}>
                  <Copy size={15} /> Скопировать из…
                </button>
              </>
            )}
          </div>

          {isLoading ? (
            <div className="center" style={{ minHeight: 200 }}><Spinner size={22} /></div>
          ) : (rows ?? []).length === 0 ? (
            <div className="empty">
              <Tag />
              <div className="empty-title">Работ пока нет</div>
              <div className="text-sm muted">Добавьте работы в Настройках — они появятся здесь.</div>
            </div>
          ) : (
            <div className="panel pl-table">
              <div className="pl-head pl-grid">
                <span>Работа</span>
                <span className="ta-r">Норм.ч.</span>
                <span className="ta-r">Цена</span>
                <span className="ta-r">Итого по прайсу</span>
                <span className="ta-r">Детали</span>
                <span />
              </div>
              {(rows ?? []).map((r) => (
                <PriceRow
                  key={r.template.id}
                  row={r}
                  editable={!!generationId}
                  busy={mSet.isPending}
                  onSave={(hours, price) => mSet.mutate({ templateId: r.template.id, hours, price })}
                  onClear={() => mClear.mutate(r.template.id)}
                  onEditParts={() => setPartsFor(r)}
                />
              ))}
            </div>
          )}

          <TemplatePartsModal
            templateId={partsFor?.template.id ?? null}
            templateName={partsFor?.template.name ?? ''}
            generation={current ?? null}
            onClose={() => setPartsFor(null)}
          />

          <CopyPricesModal
            open={copyOpen}
            onClose={() => setCopyOpen(false)}
            generations={generations ?? []}
            target={current ?? null}
          />
        </>
      )}
    </div>
  );
}

/**
 * One work. Inherited figures are shown greyed; an override is shown in normal
 * weight with a reset button — so it is always obvious whether this generation
 * has its own price or is falling back to the shared one.
 */
function PriceRow({
  row,
  editable,
  busy,
  onSave,
  onClear,
  onEditParts,
}: {
  row: PriceListRow;
  editable: boolean;
  busy: boolean;
  onSave: (hours: number | null, price: number | null) => void;
  onClear: () => void;
  onEditParts: () => void;
}) {
  const [hours, setHours] = useState(row.override?.hours != null ? String(row.override.hours) : '');
  const [price, setPrice] = useState(row.override?.price != null ? String(row.override.price) : '');

  useEffect(() => {
    setHours(row.override?.hours != null ? String(row.override.hours) : '');
    setPrice(row.override?.price != null ? String(row.override.price) : '');
  }, [row.override?.hours, row.override?.price]);

  const commit = () => {
    const h = hours ? Number(hours) : null;
    const p = price ? Number(price) : null;
    if (h === (row.override?.hours ?? null) && p === (row.override?.price ?? null)) return;
    if (h === null && p === null) {
      if (row.override) onClear();
      return;
    }
    onSave(h, p);
  };

  const inherited = !row.override;

  return (
    <div className="pl-row pl-grid">
      <span className="truncate">{row.template.name}</span>
      <span className="pl-cell" data-label="Норм.ч.">
      {editable ? (
        <input
          className="cell-input ta-r tnum"
          aria-label="Нормо-часы"
          value={hours}
          placeholder={row.base.hours != null ? String(row.base.hours) : '—'}
          onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          inputMode="decimal"
        />
      ) : (
        <span className="ta-r mono tnum muted">{row.base.hours ?? '—'}</span>
      )}
      </span>
      <span className="pl-cell" data-label="Цена">
      {editable ? (
        <input
          className="cell-input ta-r tnum"
          aria-label="Цена"
          value={price}
          placeholder={row.base.price != null ? String(row.base.price) : '—'}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          inputMode="decimal"
        />
      ) : (
        <span className="ta-r mono tnum muted">{row.base.price != null ? money(row.base.price) : '—'}</span>
      )}
      </span>
      <span className="ta-r mono tnum" data-inherited={inherited || undefined}>
        {row.effective.price != null ? money(row.effective.price) : '—'}
        {editable && (
          <span className="pl-src">
            {row.effective.source === 'generation'
              ? 'своя'
              : row.effective.source === 'template'
                ? 'базовая'
                : 'по ставке'}
          </span>
        )}
      </span>
      <span className="ta-r">
        <button
          className="btn btn-ghost btn-sm"
          onClick={onEditParts}
          title="Запчасти, которые подставятся вместе с работой"
        >
          <Package size={14} /> {row.parts_count || '—'}
        </button>
      </span>
      <span className="row-actions">
        {editable && row.override && (
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onClear}
            disabled={busy}
            aria-label="Вернуть базовую цену"
            title="Вернуть базовую цену"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </span>
    </div>
  );
}

/** Bulk fill — without it nobody would ever populate 15 generations by hand. */
function CopyPricesModal({
  open,
  onClose,
  generations,
  target,
}: {
  open: boolean;
  onClose: () => void;
  generations: VehicleGeneration[];
  target: VehicleGeneration | null;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [mode, setMode] = useState<'fill' | 'replace'>('fill');

  useEffect(() => { if (open) { setFrom(''); setMode('fill'); } }, [open]);

  const mCopy = useMutation({
    mutationFn: () =>
      api.copyPrices({ from_generation_id: from, to_generation_id: target!.id, mode }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['price-list'] });
      toast(`Скопировано ${r.copied}, пропущено ${r.skipped}`, 'success');
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Скопировать цены в ${target ? genLabel(target) : ''}`}
      width={480}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={mCopy.isPending}>Отмена</button>
          <button
            className="btn btn-primary"
            onClick={() => mCopy.mutate()}
            disabled={!from || !target || mCopy.isPending}
          >
            {mCopy.isPending ? <Spinner /> : <Copy size={16} />} Скопировать
          </button>
        </>
      }
    >
      <div className="col gap-3">
        <div className="field">
          <label className="label">Откуда</label>
          <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">Выберите поколение</option>
            {generations.filter((g) => g.id !== target?.id).map((g) => (
              <option key={g.id} value={g.id}>{genLabel(g)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Что делать с уже заданными ценами</label>
          <select className="input" value={mode} onChange={(e) => setMode(e.target.value as 'fill' | 'replace')}>
            <option value="fill">Не трогать — заполнить только пустые</option>
            <option value="replace">Перезаписать</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}
