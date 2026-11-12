import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, Search, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { genLabel, groupGenerations } from '../../lib/generations';
import { ALL_GENERATIONS_KEY } from '../../components/GenerationPicker';
import { Modal, Spinner } from '../../components/ui';
import type { VehicleGeneration } from '../../lib/types';
import './works.css';

interface Draft { make: string; model: string; code: string; years: string }

const EMPTY: Draft = { make: '', model: '', code: '', years: '' };

/** What goes on the wire: trimmed, with empty optional fields as null. */
function toBody(d: Draft) {
  return {
    make: d.make.trim(),
    model: d.model.trim(),
    code: d.code.trim() || null,
    years: d.years.trim() || null,
  };
}

const valid = (d: Draft) => !!d.make.trim() && !!d.model.trim();

/**
 * The generations catalog — the key the price list hangs off.
 *
 * Retiring is a soft delete (cars and prices point at the row), so it needs no
 * confirmation: «Вернуть» undoes it. Retired rows stay visible here, dimmed, at
 * the end of their make.
 */
export function GenerationsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const uid = useId();
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const makeRef = useRef<HTMLInputElement>(null);

  const { data: all, isLoading } = useQuery({
    queryKey: ALL_GENERATIONS_KEY,
    queryFn: () => api.vehicleGenerations(true),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setQ('');
    setDraft(EMPTY);
    setEditing(null);
    setError(null);
    searchRef.current?.focus();
  }, [open]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['vehicle-generations'] });
  // Shown both ways: the toast sits under the dialog's backdrop, the inline line does not.
  const fail = (e: unknown) => {
    const message = (e as Error).message;
    setError(message);
    toast(message, 'error');
  };

  const mAdd = useMutation({
    mutationFn: () => api.createVehicleGeneration(toBody(draft)),
    onSuccess: (g) => {
      refresh();
      // Keep the make: generations are usually entered a make at a time.
      setDraft({ ...EMPTY, make: draft.make.trim() });
      setError(null);
      toast(`Добавлено: ${genLabel(g)}`, 'success');
      makeRef.current?.focus();
    },
    onError: fail,
  });
  const mSave = useMutation({
    mutationFn: (e: { id: string; draft: Draft }) => api.updateVehicleGeneration(e.id, toBody(e.draft)),
    onSuccess: () => {
      refresh();
      setEditing(null);
      setError(null);
    },
    onError: fail,
  });
  const mActive = useMutation({
    mutationFn: ({ g, active }: { g: VehicleGeneration; active: boolean }) =>
      active ? api.updateVehicleGeneration(g.id, { active: true }) : api.deactivateVehicleGeneration(g.id),
    onSuccess: (_r, { g, active }) => {
      refresh();
      setError(null);
      toast(active ? `${genLabel(g)} — снова в справочнике` : `${genLabel(g)} — убрано`, 'success');
    },
    onError: fail,
  });

  const groups = useMemo(
    () =>
      groupGenerations(all ?? [], q).map((group) => ({
        make: group.make,
        // Stable: active rows keep the server order, retired ones sink.
        items: [...group.items.filter((g) => g.active), ...group.items.filter((g) => !g.active)],
      })),
    [all, q],
  );
  const makes = useMemo(() => [...new Set((all ?? []).map((g) => g.make))], [all]);
  const total = (all ?? []).filter((g) => g.active).length;

  const submitAdd = () => {
    if (valid(draft) && !mAdd.isPending) mAdd.mutate();
  };
  const submitEdit = () => {
    if (editing && valid(editing.draft) && !mSave.isPending) mSave.mutate(editing);
  };
  const editKeys = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitEdit();
    } else if (e.key === 'Escape') {
      // Cancel the row edit only — not the whole dialog.
      e.preventDefault();
      e.stopPropagation();
      setEditing(null);
    }
  };
  const patchEdit = (patch: Partial<Draft>) =>
    setEditing((cur) => (cur ? { ...cur, draft: { ...cur.draft, ...patch } } : cur));

  return (
    <Modal open={open} onClose={onClose} title="Поколения" width={680}>
      <div className="gm">
        <div className="gm-top">
          <label className="pw-search grow">
            <Search size={15} aria-hidden />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Марка, модель, код или годы"
              aria-label="Поиск поколения"
              autoComplete="off"
            />
          </label>
          <span className="text-xs muted tnum gm-count">В справочнике: {total}</span>
        </div>

        <div className="gm-list" role="list" aria-label="Справочник поколений">
          {isLoading ? (
            <div className="center" style={{ minHeight: 120 }}><Spinner size={20} /></div>
          ) : groups.length === 0 ? (
            <div className="gm-empty">
              {q.trim()
                ? 'Ничего не найдено — поколение можно добавить ниже.'
                : 'Справочник пуст. Добавьте первое поколение ниже.'}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.make} className="gm-group" role="presentation">
                <div className="gm-make">
                  {group.make}
                  <span className="gm-make-count tnum">{group.items.filter((g) => g.active).length}</span>
                </div>
                {group.items.map((g) =>
                  editing?.id === g.id ? (
                    <div key={g.id} className="gm-row gm-fields" role="listitem" data-editing onKeyDown={editKeys}>
                      <input
                        className="cell-input"
                        value={editing.draft.make}
                        onChange={(e) => patchEdit({ make: e.target.value })}
                        aria-label="Марка"
                        list={`${uid}-makes`}
                      />
                      <input
                        className="cell-input"
                        value={editing.draft.model}
                        onChange={(e) => patchEdit({ model: e.target.value })}
                        aria-label="Модель"
                        autoFocus
                      />
                      <input
                        className="cell-input mono"
                        value={editing.draft.code}
                        onChange={(e) => patchEdit({ code: e.target.value })}
                        aria-label="Код"
                      />
                      <input
                        className="cell-input tnum"
                        value={editing.draft.years}
                        onChange={(e) => patchEdit({ years: e.target.value })}
                        aria-label="Годы"
                      />
                      <span className="gm-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-icon btn-sm"
                          onClick={submitEdit}
                          disabled={!valid(editing.draft) || mSave.isPending}
                          aria-label="Сохранить"
                          title="Сохранить (Enter)"
                        >
                          {mSave.isPending ? <Spinner size={14} /> : <Check size={14} />}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => setEditing(null)}
                          aria-label="Отменить правку"
                          title="Отменить (Esc)"
                        >
                          <X size={14} />
                        </button>
                      </span>
                    </div>
                  ) : (
                    <div key={g.id} className="gm-row" role="listitem" data-retired={!g.active || undefined}>
                      <span className="gm-name truncate">
                        <span className="fw-500">{g.model}</span>
                        {g.code && <span className="gm-code mono">{g.code}</span>}
                        {g.years && <span className="gm-years tnum">{g.years}</span>}
                        {!g.active && <span className="badge gm-badge">убрано</span>}
                      </span>
                      <span className="gm-actions">
                        {g.active && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => {
                              setError(null);
                              setEditing({
                                id: g.id,
                                draft: { make: g.make, model: g.model, code: g.code ?? '', years: g.years ?? '' },
                              });
                            }}
                            aria-label={`Изменить ${genLabel(g)}`}
                            title="Изменить"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm gm-toggle"
                          onClick={() => mActive.mutate({ g, active: !g.active })}
                          disabled={mActive.isPending}
                          aria-label={`${g.active ? 'Убрать' : 'Вернуть'} ${genLabel(g)}`}
                          title={
                            g.active
                              ? 'Убрать из выбора. Машины и цены этого поколения сохранятся.'
                              : 'Вернуть в выбор'
                          }
                        >
                          {g.active ? 'Убрать' : 'Вернуть'}
                        </button>
                      </span>
                    </div>
                  ),
                )}
              </div>
            ))
          )}
        </div>

        <div
          className="gm-add"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitAdd();
            }
          }}
        >
          <div className="gm-add-title">Новое поколение</div>
          <div className="gm-add-fields">
            <div className="field">
              <label className="label" htmlFor={`${uid}-make`}>Марка</label>
              <input
                id={`${uid}-make`}
                ref={makeRef}
                className="input"
                value={draft.make}
                onChange={(e) => setDraft({ ...draft, make: e.target.value })}
                placeholder="MINI"
                list={`${uid}-makes`}
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor={`${uid}-model`}>Модель</label>
              <input
                id={`${uid}-model`}
                className="input"
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                placeholder="Cooper"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor={`${uid}-code`}>Код</label>
              <input
                id={`${uid}-code`}
                className="input mono"
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                placeholder="R56"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor={`${uid}-years`}>Годы</label>
              <input
                id={`${uid}-years`}
                className="input tnum"
                value={draft.years}
                onChange={(e) => setDraft({ ...draft, years: e.target.value })}
                placeholder="2006–2013"
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              className="btn btn-default"
              onClick={submitAdd}
              disabled={!valid(draft) || mAdd.isPending}
            >
              {mAdd.isPending ? <Spinner /> : <Plus size={16} />} Добавить
            </button>
          </div>
          {error && <div className="field-error" role="alert">{error}</div>}
        </div>

        <datalist id={`${uid}-makes`}>
          {makes.map((m) => <option key={m} value={m} />)}
        </datalist>
      </div>
    </Modal>
  );
}
