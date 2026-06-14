import { Injectable } from '@nestjs/common';
import * as iconv from 'iconv-lite';
import { ClientsService } from '../clients.service';
import { normalizePhone } from '../../common/phone.util';

export interface ImportRowError {
  line: number;
  reason: string;
  raw?: string;
}

export interface ImportReport {
  total: number;
  added: number;
  skipped_duplicates: number;
  errors: ImportRowError[];
}

const HEADER_HINTS = ['телефон', 'фио', 'phone', 'имя', 'name'];

@Injectable()
export class ClientsImportService {
  constructor(private readonly clients: ClientsService) {}

  /**
   * Decode buffer as UTF-8, falling back to CP1251 (Windows-1251) which Excel
   * commonly emits for Russian text. Strips a UTF-8 BOM if present.
   */
  static decode(buf: Buffer): string {
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      return buf.subarray(3).toString('utf8');
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch {
      return iconv.decode(buf, 'win1251');
    }
  }

  /** Pick ',' or ';' by majority count on the first non-empty line. */
  static detectDelimiter(firstLine: string): ',' | ';' {
    const commas = (firstLine.match(/,/g) || []).length;
    const semis = (firstLine.match(/;/g) || []).length;
    return semis > commas ? ';' : ',';
  }

  /** Minimal CSV field splitter: handles double-quoted fields and escaped quotes. */
  static splitLine(line: string, delim: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }

  static looksLikeHeader(cells: string[]): boolean {
    // Exact per-cell match (not substring) so a real name like "Имярек"
    // isn't mistaken for the "имя" header keyword.
    const lower = cells.map((c) => c.trim().toLowerCase());
    if (lower.some((c) => HEADER_HINTS.includes(c))) return true;
    // Primary positional signal: a header's phone column has no digits.
    return !!cells[1] && !/\d/.test(cells[1]);
  }

  /** Parse `ДД.ММ.ГГГГ` or ISO (`ГГГГ-ММ-ДД[...]`). Returns undefined if empty/invalid. */
  static parseDate(raw: string): Date | undefined {
    const s = (raw || '').trim();
    if (!s) return undefined;
    const ru = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (ru) {
      const [, d, m, y] = ru;
      const date = new Date(
        Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0),
      );
      return isNaN(date.getTime()) ? undefined : date;
    }
    const iso = new Date(s.includes('T') ? s : `${s}T00:00:00Z`);
    return isNaN(iso.getTime()) ? undefined : iso;
  }

  /**
   * Parse a money/number cell tolerant of locale quirks:
   *  - spaces as thousands grouping ("145 000") are stripped
   *  - a single comma followed by 1–2 digits is a decimal ("1234,56" → 1234.56)
   *  - any other comma usage is thousands grouping and stripped
   *    ("145,000" → 145000, "1,234,567" → 1234567)
   */
  static parseNumber(raw: string): number {
    let s = (raw || '').replace(/\s/g, '');
    if (!s) return 0;
    const commas = (s.match(/,/g) || []).length;
    const dots = (s.match(/\./g) || []).length;
    if (commas > 0 && dots === 0 && commas === 1 && /,\d{1,2}$/.test(s)) {
      s = s.replace(',', '.'); // decimal comma
    } else {
      s = s.replace(/,/g, ''); // commas are grouping separators
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  static parseInt(raw: string): number {
    const n = Math.trunc(ClientsImportService.parseNumber(raw));
    return Number.isFinite(n) ? n : 0;
  }

  async import(buf: Buffer): Promise<ImportReport> {
    const text = ClientsImportService.decode(buf);
    const rawLines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);

    const report: ImportReport = {
      total: 0,
      added: 0,
      skipped_duplicates: 0,
      errors: [],
    };
    if (rawLines.length === 0) return report;

    const delim = ClientsImportService.detectDelimiter(rawLines[0]);
    let startIdx = 0;
    const firstCells = ClientsImportService.splitLine(rawLines[0], delim);
    if (ClientsImportService.looksLikeHeader(firstCells)) startIdx = 1;

    // Track phones seen within this file to dedup intra-file duplicates too.
    const seen = new Set<string>();

    for (let i = startIdx; i < rawLines.length; i++) {
      const lineNo = i + 1;
      const cells = ClientsImportService.splitLine(rawLines[i], delim);
      report.total++;

      const fullName = (cells[0] || '').trim();
      const rawPhone = (cells[1] || '').trim();
      const phone = normalizePhone(rawPhone);

      if (!fullName) {
        report.errors.push({ line: lineNo, reason: 'Пустое ФИО', raw: rawLines[i] });
        continue;
      }
      if (!phone) {
        report.errors.push({
          line: lineNo,
          reason: 'Пустой/некорректный телефон',
          raw: rawLines[i],
        });
        continue;
      }

      if (seen.has(phone) || (await this.clients.findByPhone(phone))) {
        report.skipped_duplicates++;
        seen.add(phone);
        continue;
      }

      const created_at = ClientsImportService.parseDate(cells[2]);
      const imported_deals_count = ClientsImportService.parseInt(cells[3]);
      const imported_deals_sum = ClientsImportService.parseNumber(cells[4]);

      try {
        await this.clients.create({
          full_name: fullName,
          phone,
          source: 'csv_import',
          created_at,
          imported_deals_count,
          imported_deals_sum,
        });
        seen.add(phone);
        report.added++;
      } catch (e) {
        report.errors.push({
          line: lineNo,
          reason: `Ошибка сохранения: ${(e as Error).message}`,
          raw: rawLines[i],
        });
      }
    }

    return report;
  }
}
