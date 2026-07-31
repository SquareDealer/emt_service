import { Injectable } from '@nestjs/common';

export interface TemplateLike {
  name?: string;
  default_hours?: number | null;
  default_price?: number | null;
}

export interface OverrideLike {
  hours?: number | null;
  price?: number | null;
}

/**
 * Where each number came from. Returned deliberately: silently falling back to
 * the base price on a generation the shop meant to price separately is the main
 * risk of this feature, so the UI can say «базовая, для R56 не задана» instead
 * of quietly quoting the wrong figure.
 */
export type PriceSource = 'generation' | 'template' | 'rate';

export interface ResolvedPrice {
  hours: number | null;
  price_override: number | null;
  rate_snapshot: number;
  source: PriceSource;
}

/** Pure — no DB. The repository lookup happens in the caller. */
@Injectable()
export class PriceResolutionService {
  /**
   * Work out what a labor line should cost for one vehicle generation.
   *
   * Priority: the generation override → the template's own defaults → nothing
   * but the global hourly rate. `hours` and `price` are resolved independently,
   * so an override may set only one of them.
   *
   * A resolved price lands in `price_override` (that is how a fixed template
   * price has always worked); `rate_snapshot` is still captured so the line
   * keeps its rate even when a fixed price is used.
   */
  resolve(
    template: TemplateLike | null | undefined,
    override: OverrideLike | null | undefined,
    laborRate: number,
  ): ResolvedPrice {
    const hours = pick(override?.hours, template?.default_hours);
    const price = pick(override?.price, template?.default_price);

    const fromGeneration =
      (override?.hours ?? null) !== null || (override?.price ?? null) !== null;
    const fromTemplate =
      (template?.default_hours ?? null) !== null || (template?.default_price ?? null) !== null;

    return {
      hours,
      price_override: price,
      rate_snapshot: laborRate,
      source: fromGeneration ? 'generation' : fromTemplate ? 'template' : 'rate',
    };
  }

  /**
   * The effective figures shown on the price-list screen — same resolution, but
   * expressed as what the shop charges rather than as line fields.
   */
  effective(
    template: TemplateLike | null | undefined,
    override: OverrideLike | null | undefined,
    laborRate: number,
  ): { hours: number | null; price: number | null; source: PriceSource } {
    const r = this.resolve(template, override, laborRate);
    return {
      hours: r.hours,
      // With no fixed price the job is billed as hours × the global rate.
      price: r.price_override ?? (r.hours != null ? r.hours * laborRate : null),
      source: r.source,
    };
  }
}

/** First non-null of the two, preserving an explicit 0. */
function pick(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a !== null && a !== undefined) return a;
  if (b !== null && b !== undefined) return b;
  return null;
}
