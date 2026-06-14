/**
 * Normalize a Russian phone number for dedup and search.
 * Rules (per spec NFR / data-model CSV import):
 *  - strip spaces, parens, dashes and any non-digit
 *  - leading 8 + 10 digits  -> +7XXXXXXXXXX
 *  - bare 10 digits         -> +7XXXXXXXXXX
 *  - already 7XXXXXXXXXX     -> +7XXXXXXXXXX
 * Returns '' for empty/garbage input so callers can decide what to do.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = '7' + digits.slice(1);
  } else if (digits.length === 10) {
    digits = '7' + digits;
  }
  return '+' + digits;
}
