/** Just the fields the label needs — works for a Vehicle entity or a plain row. */
export interface VehicleLike {
  make?: string | null;
  model?: string | null;
  generation_code?: string | null;
}

/**
 * Human label for a car: «MINI Hatch R56», «BMW X5 G05», «Renault Logan».
 *
 * The generation code is dropped when `model` already contains it. That case is
 * not hypothetical: before the make/generation split, `model` was the only field
 * and held the code itself, so backfilled rows have model = 'R56' AND
 * generation_code = 'R56' — naively joining would print «MINI R56 R56».
 */
export function vehicleLabel(v: VehicleLike | null | undefined): string {
  const make = v?.make?.trim() || '';
  const model = v?.model?.trim() || '';
  const code = v?.generation_code?.trim() || '';

  const parts = [make, model];
  if (code && !model.toUpperCase().includes(code.toUpperCase())) parts.push(code);
  return parts.filter(Boolean).join(' ');
}

/** Same, with a fallback for cars that carry no identifying text at all. */
export function vehicleLabelOr(v: VehicleLike | null | undefined, fallback = 'Автомобиль'): string {
  return vehicleLabel(v) || fallback;
}
