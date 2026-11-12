import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2, Package } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { money } from '../../lib/format';
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
  const [q, setQ] = useState('');

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
        <div className="pl-head parts-grid">
          <span>Название</span>
          <span>Производитель</span>
          <span className="mono">Артикул</span>
          <span className="ta-r">Цена</span>
          <span />
        </div>

        {isLoading ? (
          <div className="center" style={{ minHeight: 120 }}><Spinner size={20} /></div>
        ) : (parts ?? []).length === 0 ? (
          <div className="smeta-empty">
            {q ? 'Ничего не найдено.' : 'Каталог пуст. Добавьте первую запчасть ниже.'}
          </div>
        ) : (
          (parts ?? []).map((p) => (
            <div key={p.id} className="pl-row parts-grid">
              <span className="truncate">{p.name}</span>
              <span className="truncate muted">{p.manufacturer || '—'}</span>
              <span className="mono faint truncate">{p.catalog_number || '—'}</span>
              <span className="ta-r mono tnum">
                {p.default_price != null ? money(p.default_price) : '—'}
              </span>
              <span className="row-actions">
                <button
                  className="btn btn-ghost btn-icon btn-sm del"
                  onClick={() => mDelete.mutate(p.id)}
                  aria-label="Убрать из каталога"
                  title="Убрать из каталога"
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
          ))
        )}

        <PartTemplateForm busy={mCreate.isPending} onSubmit={(b) => mCreate.mutate(b)} />
      </div>

      <p className="text-xs muted">
        <Package size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Каталог — это
        только цена и реквизиты детали, без учёта остатков на складе.
      </p>
    </div>
  );
}

function PartTemplateForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (b: Partial<PartTemplate>) => void;
}) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [cat, setCat] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState<PartUnit>('pcs');

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      manufacturer: brand.trim() || null,
      catalog_number: cat.trim() || null,
      unit,
      default_price: price ? Number(price) : null,
    });
    setName(''); setBrand(''); setCat(''); setPrice(''); setUnit('pcs');
  };

  return (
    <div className="pl-row parts-grid">
      <input
        className="cell-input"
        value={name}
        placeholder="Напр. Фильтр масляный"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <input
        className="cell-input"
        value={brand}
        placeholder="MANN"
        onChange={(e) => setBrand(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <input
        className="cell-input mono"
        value={cat}
        placeholder="W712/95"
        onChange={(e) => setCat(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <div className="qty-cell">
        <input
          className="cell-input ta-r tnum"
          value={price}
          placeholder="цена"
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
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
        <button
          className="btn btn-default btn-icon btn-sm"
          onClick={submit}
          disabled={!name.trim() || busy}
          aria-label="Добавить в каталог"
        >
          {busy ? <Spinner /> : <Plus size={15} />}
        </button>
      </span>
    </div>
  );
}
