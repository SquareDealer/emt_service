import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { genLabel } from '../../lib/generations';
import { Modal, Spinner } from '../../components/ui';
import type { PriceListRow, VehicleGeneration } from '../../lib/types';
import './works.css';

/** Digits with one decimal separator; a comma is accepted and stored as a dot. */
const numeric = (v: string) => {
  const [whole, ...rest] = v.replace(/,/g, '.').replace(/[^\d.]/g, '').split('.');
  return rest.length ? `${whole}.${rest.join('')}` : whole;
};
/** Empty field → null (the figure is not set), never 0. */
const toNumber = (v: string): number | null => (v.trim() === '' ? null : Number(v));
const toText = (n: number | null | undefined) => (n == null ? '' : String(n));

/**
 * Create or edit a work.
 *
 * The catalog of works is shared by every generation; what a generation owns is
 * a price. So the form always edits the base figures and — when the price list
 * is open on a generation — that generation's own figures next to them.
 */
export function WorkFormModal({
  open,
  row,
  generation,
  onClose,
  onRemove,
}: {
  open: boolean;
  /** The work being edited; null = a new one. */
  row: PriceListRow | null;
  /** The generation the price list is open on; null = base prices. */
  generation: VehicleGeneration | null;
  onClose: () => void;
  /** «Убрать из прайса» — the caller owns the confirmation. */
  onRemove: (row: PriceListRow) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const uid = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [baseHours, setBaseHours] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [genHours, setGenHours] = useState('');
  const [genPrice, setGenPrice] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(row?.template.name ?? '');
    setBaseHours(toText(row?.base.hours));
    setBasePrice(toText(row?.base.price));
    setGenHours(toText(row?.override?.hours));
    setGenPrice(toText(row?.override?.price));
    nameRef.current?.focus();
    if (row) nameRef.current?.select();
    // Reset only when the dialog opens — a background refetch of `row` must not
    // wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mSave = useMutation({
    mutationFn: async () => {
      const base = { default_hours: toNumber(baseHours), default_price: toNumber(basePrice) };
      const own = { hours: toNumber(genHours), price: toNumber(genPrice) };

      if (!row) {
        // One request: the server creates the work and its generation price in
        // a single transaction.
        await api.createWork({
          name: name.trim(),
          ...base,
          generation_id: generation?.id ?? null,
          hours: generation ? own.hours : null,
          price: generation ? own.price : null,
        });
        return;
      }

      await api.updateTemplate(row.template.id, { name: name.trim(), ...base });
      if (!generation) return;
      const had = row.override;
      if (own.hours === null && own.price === null) {
        if (had) await api.clearPrice(row.template.id, generation.id);
      } else if (own.hours !== (had?.hours ?? null) || own.price !== (had?.price ?? null)) {
        await api.setPrice(row.template.id, generation.id, own);
      }
    },
    onSuccess: () => {
      toast(row ? 'Работа сохранена' : 'Работа добавлена в прайс', 'success');
      onClose();
    },
    onError: (e) => toast((e as Error).message, 'error'),
    // Also after a failure: an edit is two requests, and the first may have landed.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['price-list'] });
      qc.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const canSave = !!name.trim() && !mSave.isPending;
  const submit = () => {
    if (canSave) mSave.mutate();
  };

  const ownSet = genHours.trim() !== '' || genPrice.trim() !== '';
  const label = generation ? genLabel(generation) : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? 'Изменить работу' : 'Новая работа'}
      width={520}
      footer={
        <>
          {row && (
            <button
              type="button"
              className="btn btn-danger wf-remove"
              onClick={() => onRemove(row)}
              disabled={mSave.isPending}
            >
              <Trash2 size={15} /> Убрать из прайса
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={mSave.isPending}>
            Отмена
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!canSave}>
            {mSave.isPending ? <Spinner /> : <Check size={16} />} Сохранить
          </button>
        </>
      }
    >
      <div
        className="col gap-4"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      >
        <div className="field">
          <label className="label" htmlFor={`${uid}-name`}>Название</label>
          <input
            id={`${uid}-name`}
            ref={nameRef}
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Замена тормозных колодок"
            autoComplete="off"
          />
        </div>

        <div className="col gap-2">
          <div className="grid-2">
            <div className="field">
              <label className="label" htmlFor={`${uid}-bh`}>Базовые норм.ч.</label>
              <input
                id={`${uid}-bh`}
                className="input tnum"
                value={baseHours}
                onChange={(e) => setBaseHours(numeric(e.target.value))}
                placeholder="—"
                inputMode="decimal"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor={`${uid}-bp`}>Базовая цена</label>
              <div className="wf-money">
                <input
                  id={`${uid}-bp`}
                  className="input tnum"
                  value={basePrice}
                  onChange={(e) => setBasePrice(numeric(e.target.value))}
                  placeholder="по ставке"
                  inputMode="decimal"
                />
                <span aria-hidden>₽</span>
              </div>
            </div>
          </div>
          <p className="field-hint">
            Действуют для всех поколений без своей цены. Цена не указана — считается по ставке
            нормо-часа.
          </p>
        </div>

        {generation && (
          <fieldset className="wf-gen">
            <legend>Для {label}</legend>
            <div className="grid-2">
              <div className="field">
                <label className="label" htmlFor={`${uid}-gh`}>Норм.ч.</label>
                <input
                  id={`${uid}-gh`}
                  className="input tnum"
                  value={genHours}
                  onChange={(e) => setGenHours(numeric(e.target.value))}
                  placeholder={baseHours || '—'}
                  inputMode="decimal"
                  aria-label={`Норм.ч. для ${label}`}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor={`${uid}-gp`}>Цена</label>
                <div className="wf-money">
                  <input
                    id={`${uid}-gp`}
                    className="input tnum"
                    value={genPrice}
                    onChange={(e) => setGenPrice(numeric(e.target.value))}
                    placeholder={basePrice || 'по ставке'}
                    inputMode="decimal"
                    aria-label={`Цена для ${label}`}
                  />
                  <span aria-hidden>₽</span>
                </div>
              </div>
            </div>
            <p className="field-hint" data-own={ownSet || undefined}>
              {ownSet
                ? 'Своя цена этого поколения. Пустое поле берётся из базовых.'
                : 'Своя цена не задана — действует базовая. Заполните, чтобы переопределить.'}
            </p>
          </fieldset>
        )}
      </div>
    </Modal>
  );
}

/** «Убрать из прайса» is a retirement, not a deletion — say so before doing it. */
export function RemoveWorkModal({
  row,
  onClose,
}: {
  /** null = closed. */
  row: PriceListRow | null;
  onClose: (removed: boolean) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const mRemove = useMutation({
    mutationFn: () => api.deleteTemplate(row!.template.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-list'] });
      qc.invalidateQueries({ queryKey: ['templates'] });
      toast('Работа убрана из прайса', 'success');
      onClose(true);
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  return (
    <Modal
      open={!!row}
      onClose={() => onClose(false)}
      title="Убрать работу из прайса"
      width={440}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => onClose(false)} disabled={mRemove.isPending}>
            Отмена
          </button>
          <button type="button" className="btn btn-danger" onClick={() => mRemove.mutate()} disabled={mRemove.isPending}>
            {mRemove.isPending ? <Spinner /> : <Trash2 size={15} />} Убрать
          </button>
        </>
      }
    >
      <p className="text-sm">
        «{row?.template.name}» исчезнет из прайса и из выбора в нарядах. В уже
        созданных нарядах работа и её цена останутся как были.
      </p>
    </Modal>
  );
}
