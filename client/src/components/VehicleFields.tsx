import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { VehicleGeneration } from '../lib/types';

/**
 * The vehicle field set, shared by VehicleFormModal and IntakeModal step 2 —
 * they used to carry two independent copies of the same inputs, which is how
 * «Модель / поколение» stayed a single free-text box in both.
 *
 * Fully controlled: the parent owns the state and decides what to submit.
 */
export interface VehicleFieldsValue {
  make: string;
  model: string;
  generationId: string;
  plate: string;
  vin: string;
  year: string;
  mileage: string;
}

export const emptyVehicleFields: VehicleFieldsValue = {
  make: '',
  model: '',
  generationId: '',
  plate: '',
  vin: '',
  year: '',
  mileage: '',
};

/** A vehicle is identifiable if it has any of make/model/plate/VIN. */
export function vehicleFieldsValid(v: VehicleFieldsValue): boolean {
  return !!(v.make.trim() || v.model.trim() || v.plate.trim() || v.vin.trim());
}

export function VehicleFields({
  value,
  onChange,
  autoFocus,
}: {
  value: VehicleFieldsValue;
  onChange: (patch: Partial<VehicleFieldsValue>) => void;
  autoFocus?: boolean;
}) {
  const { data: generations } = useQuery({
    queryKey: ['vehicle-generations'],
    queryFn: () => api.vehicleGenerations(),
    staleTime: 5 * 60_000, // a reference table — no need to refetch per modal
  });

  // Grouped by make so the picker reads «MINI → Hatch R56» rather than one long list.
  const byMake = useMemo(() => {
    const map = new Map<string, VehicleGeneration[]>();
    for (const g of generations ?? []) {
      const list = map.get(g.make) ?? [];
      list.push(g);
      map.set(g.make, list);
    }
    return [...map.entries()];
  }, [generations]);

  const makes = useMemo(() => [...new Set((generations ?? []).map((g) => g.make))], [generations]);

  const pickGeneration = (id: string) => {
    const g = (generations ?? []).find((x) => x.id === id);
    // Picking from the catalog is an explicit choice — let it set make/model.
    // Clearing it keeps whatever is typed, so non-catalog cars stay editable.
    if (g) onChange({ generationId: id, make: g.make, model: g.model });
    else onChange({ generationId: '' });
  };

  return (
    <div className="col gap-3">
      <div className="grid-2">
        <div className="field">
          <label className="label">Марка</label>
          <input
            className="input"
            list="vf-makes"
            value={value.make}
            onChange={(e) => onChange({ make: e.target.value })}
            placeholder="MINI, BMW…"
            autoFocus={autoFocus}
          />
          <datalist id="vf-makes">
            {makes.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label className="label">Модель</label>
          <input
            className="input"
            value={value.model}
            onChange={(e) => onChange({ model: e.target.value })}
            placeholder="Hatch, Countryman, X5…"
          />
        </div>
      </div>

      <div className="field">
        <label className="label">Поколение</label>
        <select
          className="input"
          value={value.generationId}
          onChange={(e) => pickGeneration(e.target.value)}
        >
          <option value="">Не из справочника</option>
          {byMake.map(([make, list]) => (
            <optgroup key={make} label={make}>
              {list.map((g) => (
                <option key={g.id} value={g.id}>
                  {[g.model, g.code].filter(Boolean).join(' ')}
                  {g.years ? ` · ${g.years}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="text-xs muted" style={{ marginTop: 4 }}>
          Поколение задаёт цены из прайс-листа. Для машин не из справочника оставьте пустым.
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label className="label">Госномер</label>
          <input
            className="input mono"
            value={value.plate}
            onChange={(e) => onChange({ plate: e.target.value })}
            placeholder="А123ВС777"
          />
        </div>
        <div className="field">
          <label className="label">VIN</label>
          <input
            className="input mono"
            value={value.vin}
            onChange={(e) => onChange({ vin: e.target.value })}
            placeholder="WMW…"
          />
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label className="label">Год</label>
          <input
            className="input tnum"
            value={value.year}
            onChange={(e) => onChange({ year: e.target.value.replace(/\D/g, '') })}
            placeholder="2014"
            inputMode="numeric"
          />
        </div>
        <div className="field">
          <label className="label">Пробег, км</label>
          <input
            className="input tnum"
            value={value.mileage}
            onChange={(e) => onChange({ mileage: e.target.value.replace(/\D/g, '') })}
            placeholder="120000"
            inputMode="numeric"
          />
        </div>
      </div>
    </div>
  );
}

/** Shape the controlled values into a POST/PATCH body. */
export function vehicleFieldsBody(v: VehicleFieldsValue) {
  return {
    make: v.make.trim() || null,
    model: v.model.trim() || null,
    generation_id: v.generationId || null,
    plate: v.plate.trim() || null,
    vin: v.vin.trim() || null,
    year: v.year ? Number(v.year) : null,
    mileage: v.mileage ? Number(v.mileage) : null,
  };
}
