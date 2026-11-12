import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, Search, Trash2, Package, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { useAuth } from '../../lib/auth';
import { canManageCatalog, canSeeAnalytics } from '../../lib/roles';
import { money } from '../../lib/format';
import { partTemplateBody } from '../../lib/parts';
import { parsePrice } from '../../lib/price';
import { Spinner } from '../../components/ui';
import type { PartTemplate, PartUnit } from '../../lib/types';

/**
 * The parts catalog — «шаблон для запчастей по аналогии с работами». Search
 * covers name, brand and article, because a catalog you cannot search by
 * article is not usable at the counter.
 */
export function PartsCatalog() {
  const qc = useQueryClient();
  const toast = useToast();
  // The server refuses a master's writes anyway; the catalog is read-only for them here too.
  const { user } = useAuth();
  const manage = canManageCatalog(user?.role);
  const owner = canSeeAnalytics(user?.role);
  const [q, setQ] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: parts, isLoading } = useQuery({
    queryKey: ['part-templates', q],
    queryFn: () => api.partTemplates(q.trim() || undefined),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['part-templates'] });

  const mCreate = useMutation({
    mutationFn: (body: Partial<PartTemplate>) => api.createPartTemplate(body),
    onSuccess: () => { invalidate(); toast('Запчасть добавлена в каталог', 'success'); },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mUpdate = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<PartTemplate> }) =>
      api.updatePartTemplate(id, body),
    onSuccess: () => { invalidate(); setEditingId(null); toast('Запчасть обновлена', 'success'); },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const mDelete = useMutation({
    mutationFn: (id: string) => api.deactivatePartTemplate(id),
    onSuccess: () => { invalidate(); toast('Убрано из каталога', 'success'); },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <div className="col gap-4">
      <div className="pl-bar">
        <div className="field grow" style={{ minWidth: 240 }}>
          <label className="label">Поиск</label>
          <div className="row gap-2">
            <Search size={16} className="muted" style={{ alignSelf: 'center' }} />
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Название, производитель или артикул"
            />
          </div>
        </div>
      </div>

      <div className="panel pl-table">
        <div className="pl-head parts-grid" data-cost={owner || undefined}>
          <span>Название</span>
          <span>Производитель</span>
          <span className="mono">Артикул</span>
          {owner && <span className="ta-r">Закупка</span>}
          <span className="ta-r">Цена</span>
          <span />
        </div>

        {isLoading ? (
          <div className="center" style={{ minHeight: 120 }}><Spinner size={20} /></div>
        ) : (parts ?? []).length === 0 ? (
          <div className="smeta-empty">
            {q ? 'Ничего не найдено.' : manage ? 'Каталог пуст. Добавьте первую запчасть ниже.' : 'Каталог пуст.'}
          </div>
        ) : (
          (parts ?? []).map((p) => manage && p.id === editingId ? (
            <PartTemplateForm
              key={p.id}
              initial={p}
              owner={owner}
              busy={mUpdate.isPending}
              onSubmit={(body) => mUpdate.mutate({ id: p.id, body })}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={p.id} className="pl-row parts-grid" data-cost={owner || undefined}>
              <span className="truncate">{p.name}</span>
              <span className="truncate muted">{p.manufacturer || '—'}</span>
              <span className="mono faint truncate">{p.catalog_number || '—'}</span>
              {owner && (
                <span className="ta-r mono tnum">
                  {p.purchase_price != null ? money(p.purchase_price) : '—'}
                </span>
              )}
              <span className="ta-r mono tnum">
                {p.default_price != null ? money(p.default_price) : '—'}
              </span>
              {manage && <span className="row-actions">
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={() => setEditingId(p.id)}
                  aria-label={`Изменить ${p.name}`}
                  title="Изменить"
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="btn btn-ghost btn-icon btn-sm del"
                  onClick={() => mDelete.mutate(p.id)}
                  aria-label="Убрать из каталога"
                  title="Убрать из каталога"
                >
                  <Trash2 size={14} />
                </button>
              </span>}
            </div>
          ))
        )}

        {manage && <PartTemplateForm owner={owner} busy={mCreate.isPending} onSubmit={(b) => mCreate.mutate(b)} />}
      </div>

      <p className="text-xs muted">
        <Package size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Каталог — это
        только цена и реквизиты детали, без учёта остатков на складе. Правка каталога не меняет
        запчасти, уже добавленные в сметы.
      </p>
    </div>
  );
}

/**
 * One form for both jobs: the «add» row at the bottom of the catalog, and — with
 * `initial` — an existing row edited in place (Enter saves, Escape cancels).
 */
function PartTemplateForm({
  initial,
  owner,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: PartTemplate;
  owner: boolean;
  busy: boolean;
  onSubmit: (b: Partial<PartTemplate>) => void;
  onCancel?: () => void;
}) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState(initial?.manufacturer ?? '');
  const [cat, setCat] = useState(initial?.catalog_number ?? '');
  const [price, setPrice] = useState(initial?.default_price != null ? String(initial.default_price) : '');
  const [purchase, setPurchase] = useState(initial?.purchase_price != null ? String(initial.purchase_price) : '');
  const [unit, setUnit] = useState<PartUnit>(initial?.unit ?? 'pcs');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) nameRef.current?.focus();
  }, [editing]);

  const purchaseInvalid = owner && parsePrice(purchase).kind === 'invalid';

  const submit = () => {
    if (!name.trim() || purchaseInvalid) return;
    onSubmit(partTemplateBody(
      { name, manufacturer: brand, catalog_number: cat, unit, price, purchase },
      { owner, initial },
    ));
    if (!editing) { setName(''); setBrand(''); setCat(''); setPrice(''); setPurchase(''); setUnit('pcs'); }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape' && onCancel) { e.stopPropagation(); onCancel(); }
  };

  return (
    <div className="pl-row parts-grid" data-cost={owner || undefined} data-editing={editing || undefined} onKeyDown={onKeyDown}>
      <input
        ref={nameRef}
        className="cell-input"
        value={name}
        placeholder="Напр. Фильтр масляный"
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="cell-input"
        value={brand}
        placeholder="MANN"
        onChange={(e) => setBrand(e.target.value)}
      />
      <input
        className="cell-input mono"
        value={cat}
        placeholder="W712/95"
        onChange={(e) => setCat(e.target.value)}
      />
      {owner && (
        <input
          className="cell-input ta-r tnum"
          value={purchase}
          placeholder="закупка"
          inputMode="decimal"
          aria-label="Закупка за единицу"
          aria-invalid={purchaseInvalid || undefined}
          onChange={(e) => setPurchase(e.target.value)}
        />
      )}
      <div className="qty-cell">
        <input
          className="cell-input ta-r tnum"
          value={price}
          placeholder="цена"
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
            inputMode="decimal"
        />
        <select
          className="unit-select"
          value={unit}
          onChange={(e) => setUnit(e.target.value as PartUnit)}
          aria-label="Единица"
        >
          <option value="pcs">шт</option>
          <option value="l">л</option>
        </select>
      </div>
      <span className="row-actions">
        {editing && (
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onCancel} aria-label="Отмена" title="Отмена">
            <X size={15} />
          </button>
        )}
        <button
          className="btn btn-default btn-icon btn-sm"
          onClick={submit}
          disabled={!name.trim() || purchaseInvalid || busy}
          aria-label={editing ? 'Сохранить' : 'Добавить в каталог'}
          title={editing ? 'Сохранить' : 'Добавить в каталог'}
        >
          {busy ? <Spinner /> : editing ? <Check size={15} /> : <Plus size={15} />}
        </button>
      </span>
    </div>
  );
}
