import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Package, Pencil, Plus, RotateCcw, Search, Tag, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { canManageCatalog } from '../../lib/roles';
import { useToast } from '../../lib/toast';
import { money } from '../../lib/format';
import { genLabel } from '../../lib/generations';
import { Modal, Spinner } from '../../components/ui';
import { ALL_GENERATIONS_KEY, GenerationPicker } from '../../components/GenerationPicker';
import { PartsCatalog } from './PartsCatalog';
import { TemplatePartsModal } from './TemplatePartsModal';
import { GenerationsModal } from './GenerationsModal';
import { RemoveWorkModal, WorkFormModal } from './WorkFormModal';
import type { PriceListRow, PriceSource, VehicleGeneration } from '../../lib/types';
import './price-list.css';
import './works.css';

const GEN_KEY = 'crm-price-generation';

const SOURCE_LABEL: Record<PriceSource, string> = {
  generation: 'своя',
  template: 'базовая',
  rate: 'по ставке',
};

export function PriceListPage() {
  const [tab, setTab] = useState<'works' | 'parts'>('works');

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

      {tab === 'parts' ? <PartsCatalog /> : <WorksTab />}
    </div>
  );
}

/**
 * The works catalog as priced for one generation.
 *
 * This is the only place works are created, edited and retired. Everything that
 * writes is rendered for the owner and the receptionist only; a plain master
 * gets the same table read-only (the server enforces it regardless).
 */
function WorksTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const manage = canManageCatalog(user?.role);

  // One generation at a time: a 15-column matrix is unreadable on a workshop
  // tablet, and the shop thinks in terms of «открыть прайс R56» anyway.
  const [generationId, setGenerationId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(GEN_KEY) || null;
    } catch {
      return null;
    }
  });
  const [q, setQ] = useState('');
  const [onlyOwn, setOnlyOwn] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [partsFor, setPartsFor] = useState<PriceListRow | null>(null);
  /** 'new' = the empty form; a row = editing it. */
  const [form, setForm] = useState<PriceListRow | 'new' | null>(null);
  const [removing, setRemoving] = useState<PriceListRow | null>(null);

  useEffect(() => {
    try {
      // Going back to the base prices has to stick across a reload too.
      if (generationId) localStorage.setItem(GEN_KEY, generationId);
      else localStorage.removeItem(GEN_KEY);
    } catch { /* ignore */ }
    if (!generationId) setOnlyOwn(false);
  }, [generationId]);

  // Retired rows included: the stored choice may point at one.
  const { data: generations } = useQuery({
    queryKey: ALL_GENERATIONS_KEY,
    queryFn: () => api.vehicleGenerations(true),
  });
  const { data: rows, isLoading } = useQuery({
    queryKey: ['price-list', generationId],
    queryFn: () => api.priceList(generationId ?? undefined),
  });

  const current = (generations ?? []).find((g) => g.id === generationId) ?? null;

  const mSet = useMutation({
    mutationFn: ({ templateId, hours, price }: { templateId: string; hours: number | null; price: number | null }) =>
      api.setPrice(templateId, generationId!, { hours, price }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-list'] }),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mClear = useMutation({
    mutationFn: (templateId: string) => api.clearPrice(templateId, generationId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-list'] });
      toast('Вернули базовую цену', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const all = useMemo(() => rows ?? [], [rows]);
  const withOverride = useMemo(() => all.filter((r) => r.override).length, [all]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(
      (r) =>
        (!onlyOwn || r.override) &&
        (!needle || r.template.name.toLowerCase().includes(needle)),
    );
  }, [all, q, onlyOwn]);

  const editable = manage && !!generationId;

  return (
    <>
      <div className="pw-bar">
        <div className="pw-gen">
          <GenerationPicker
            value={generationId}
            onChange={setGenerationId}
            allowBase
            onManage={manage ? () => setManageOpen(true) : undefined}
          />
        </div>
        <label className="pw-search">
          <Search size={15} aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск работы"
            aria-label="Поиск работы"
            autoComplete="off"
          />
          {q && (
            <button type="button" className="pw-search-clear" onClick={() => setQ('')} aria-label="Очистить поиск">
              <X size={14} />
            </button>
          )}
        </label>
        {generationId && (
          <div className="seg" role="group" aria-label="Какие работы показывать">
            <button type="button" className="seg-btn" data-on={!onlyOwn} onClick={() => setOnlyOwn(false)}>
              Все работы
            </button>
            <button type="button" className="seg-btn" data-on={onlyOwn} onClick={() => setOnlyOwn(true)}>
              Со своей ценой <span className="pw-count tnum">{withOverride}</span>
            </button>
          </div>
        )}
        {manage && (
          <div className="pw-actions">
            {generationId && (
              <button type="button" className="btn btn-default" onClick={() => setCopyOpen(true)}>
                <Copy size={15} /> Скопировать из…
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => setForm('new')}>
              <Plus size={16} /> Добавить работу
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="center" style={{ minHeight: 200 }}><Spinner size={22} /></div>
      ) : all.length === 0 ? (
        <div className="empty">
          <Tag />
          <div className="empty-title">Работ пока нет</div>
          <div className="text-sm muted" style={{ maxWidth: '44ch' }}>
            {manage
              ? 'Добавьте первую работу — она появится в прайсе всех поколений, а цену для каждого можно задать отдельно.'
              : 'Работы в прайс добавляет владелец или мастер-приёмщик.'}
          </div>
          {manage && (
            <button type="button" className="btn btn-primary" onClick={() => setForm('new')}>
              <Plus size={16} /> Добавить работу
            </button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">
          <Search />
          <div className="empty-title">
            {onlyOwn && !q.trim() && current
              ? `У ${genLabel(current)} пока нет своих цен`
              : 'Ничего не найдено'}
          </div>
          <div className="text-sm muted" style={{ maxWidth: '44ch' }}>
            {onlyOwn && !q.trim()
              ? 'Все работы идут по базовой цене. Свою можно задать в строке работы или скопировать из другого поколения.'
              : 'Проверьте запрос или сбросьте фильтр.'}
          </div>
          <button type="button" className="btn btn-default" onClick={() => { setQ(''); setOnlyOwn(false); }}>
            Показать все работы
          </button>
        </div>
      ) : (
        <div className="panel pw-table">
          <div className="pl-head pw-grid" data-manage={manage || undefined}>
            <span>Работа</span>
            <span className="ta-r">Норм.ч.</span>
            <span className="ta-r">Цена</span>
            <span className="ta-r">Итого по прайсу</span>
            <span className="ta-r">Детали</span>
            {manage && <span />}
          </div>
          {visible.map((r) => (
            <PriceRow
              key={r.template.id}
              row={r}
              manage={manage}
              editable={editable}
              showSource={!!generationId}
              busy={mSet.isPending || mClear.isPending}
              onSave={(hours, price) => mSet.mutate({ templateId: r.template.id, hours, price })}
              onClear={() => mClear.mutate(r.template.id)}
              onEditParts={() => setPartsFor(r)}
              onEdit={() => setForm(r)}
              onRemove={() => setRemoving(r)}
            />
          ))}
        </div>
      )}

      {manage && (
        <>
          <TemplatePartsModal
            templateId={partsFor?.template.id ?? null}
            templateName={partsFor?.template.name ?? ''}
            generation={current}
            onClose={() => setPartsFor(null)}
          />
          <WorkFormModal
            open={form !== null}
            row={form === 'new' ? null : form}
            generation={current}
            onClose={() => setForm(null)}
            onRemove={(row) => { setForm(null); setRemoving(row); }}
          />
          <RemoveWorkModal row={removing} onClose={() => setRemoving(null)} />
          <CopyPricesModal
            open={copyOpen}
            onClose={() => setCopyOpen(false)}
            generations={(generations ?? []).filter((g) => g.active)}
            target={current}
          />
          <GenerationsModal open={manageOpen} onClose={() => setManageOpen(false)} />
        </>
      )}
    </>
  );
}

/**
 * One work. Inherited figures are shown greyed; an override is shown in normal
 * weight with a reset button — so it is always obvious whether this generation
 * has its own price or is falling back to the shared one.
 */
function PriceRow({
  row,
  manage,
  editable,
  showSource,
  busy,
  onSave,
  onClear,
  onEditParts,
  onEdit,
  onRemove,
}: {
  row: PriceListRow;
  /** Owner / receptionist: the row carries its edit and remove actions. */
  manage: boolean;
  /** A generation is selected AND the viewer may write: hours/price are inputs. */
  editable: boolean;
  /** A generation is selected: say where the effective price comes from. */
  showSource: boolean;
  busy: boolean;
  onSave: (hours: number | null, price: number | null) => void;
  onClear: () => void;
  onEditParts: () => void;
  onEdit: () => void;
  onRemove: () => void;
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
  // Read-only cells show what applies here: the generation's own figure when it
  // has one, the base otherwise.
  const shownHours = showSource ? row.effective.hours : row.base.hours;
  const shownPrice = showSource ? row.override?.price ?? row.base.price : row.base.price;
  const name = row.template.name;

  return (
    <div className="pl-row pw-grid" data-manage={manage || undefined}>
      <span className="truncate" title={name}>{name}</span>
      {editable ? (
        <input
          className="cell-input ta-r tnum"
          value={hours}
          placeholder={row.base.hours != null ? String(row.base.hours) : '—'}
          onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          inputMode="decimal"
          aria-label={`Норм.ч. — ${name}`}
        />
      ) : (
        <span className="ta-r mono tnum muted">{shownHours ?? '—'}</span>
      )}
      {editable ? (
        <input
          className="cell-input ta-r tnum"
          value={price}
          placeholder={row.base.price != null ? String(row.base.price) : '—'}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          inputMode="decimal"
          aria-label={`Цена — ${name}`}
        />
      ) : (
        <span className="ta-r mono tnum muted">{shownPrice != null ? money(shownPrice) : '—'}</span>
      )}
      <span className="ta-r mono tnum" data-inherited={(showSource && inherited) || undefined}>
        {row.effective.price != null ? money(row.effective.price) : '—'}
        {showSource && <span className="pl-src">{SOURCE_LABEL[row.effective.source]}</span>}
      </span>
      <span className="pw-parts-cell">
        {manage ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onEditParts}
            title="Запчасти, которые подставятся вместе с работой"
            aria-label={`Запчасти работы «${name}»: ${row.parts_count}`}
          >
            <Package size={14} /> {row.parts_count || '—'}
          </button>
        ) : (
          <span className="pw-parts tnum" title="Запчасти, которые подставятся вместе с работой">
            <Package size={14} aria-hidden /> {row.parts_count || '—'}
          </span>
        )}
      </span>
      {manage && (
        <span className="pw-row-actions">
          {editable && row.override && (
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={onClear}
              disabled={busy}
              aria-label="Вернуть базовую цену"
              title="Вернуть базовую цену"
            >
              <RotateCcw size={14} />
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm"
            onClick={onEdit}
            aria-label={`Изменить ${name}`}
            title="Изменить работу"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon btn-sm pw-danger"
            onClick={onRemove}
            aria-label={`Убрать ${name} из прайса`}
            title="Убрать из прайса"
          >
            <Trash2 size={14} />
          </button>
        </span>
      )}
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
