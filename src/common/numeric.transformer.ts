import { ValueTransformer } from 'typeorm';

/**
 * Postgres `numeric` is returned by the pg driver as a string to avoid float
 * precision loss. For an MVP at this scale we want plain JS numbers in the API
 * payloads (the acceptance checks compare `jq .total_cached == 2500`), so we
 * parse on read. Values are small (estimates in rubles) — Number is safe here.
 */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value ?? null,
  from: (value: string | null | undefined) =>
    value === null || value === undefined ? null : Number(value),
};
