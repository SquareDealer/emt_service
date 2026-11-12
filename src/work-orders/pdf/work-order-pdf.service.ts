import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import PdfPrinter from 'pdfmake';
import type {
  Column,
  Content,
  TableCell,
  TDocumentDefinitions,
  TFontDictionary,
} from 'pdfmake/interfaces';

// @types/pdfmake describes the browser build; the Node entry (src/printer.js)
// exports the PdfPrinter constructor directly. Re-type it as constructable.
type PdfDoc = NodeJS.ReadableStream & { end(): void };
const Printer = PdfPrinter as unknown as new (fonts: TFontDictionary) => {
  createPdfKitDocument(def: TDocumentDefinitions): PdfDoc;
};
import { WorkOrder } from '../../entities/work-order.entity';
import { DocSettings } from '../../settings/settings.service';
import { vehicleLabel } from '../../common/vehicle-label.util';
import type { DiscountableLike } from '../pricing.service';

import { rublesInWords } from '../../common/rubles-in-words.util';
import { PricingService } from '../pricing.service';

/**
 * A document table as plain data, before pdfmake styling. Keeping this shape
 * separate is what lets the spec assert on cells instead of rendered bytes.
 */
export interface DocTable {
  head: string[];
  body: string[][];
  widths: (number | '*')[];
  /** Column indexes rendered right-aligned (money and quantities). */
  right: number[];
  /** Block heading to print immediately before row i, keyed by row index. */
  headings?: Record<number, string>;
}

/** One «работа + её запчасти» block of the order document. */
export interface DocBlock {
  name: string;
  total: string;
  table: DocTable;
}

/** Heading rows for the calc tables, where blocks stay inside one table. */
function groupHeadings(lines: { group_key: string | null; group_name: string | null }[]): Record<number, string> {
  const headings: Record<number, string> = {};
  let current: string | null | undefined;
  lines.forEach((l, i) => {
    if (l.group_key !== current) {
      current = l.group_key;
      if (l.group_key && l.group_name) headings[i] = l.group_name;
    }
  });
  return headings;
}

const FONTS_DIR = path.join(process.cwd(), 'assets', 'fonts');
/** Printed logo width, pt. */
const LOGO_WIDTH = 130;
const LOGO_PATH = path.join(process.cwd(), 'assets', 'emt-logo-light-theme.png');

/** Which document to render: the post-close calculation or the work order. */
export type DocVariant = 'calc' | 'order';

/**
 * Renders work-order PDFs. Two documents share the printer/fonts/helpers:
 *  - 'calc'  — «Предварительная калькуляция» (Васильев.pdf), only after close.
 *  - 'order' — «Заказ наряд» (febc.pdf), any status, own number sequence.
 * Cyrillic via vendored DejaVu (mapped onto pdfmake's default "Roboto" name).
 */
@Injectable()
export class WorkOrderPdfService {
  private readonly printer = new Printer({
    Roboto: {
      normal: path.join(FONTS_DIR, 'DejaVuSans.ttf'),
      bold: path.join(FONTS_DIR, 'DejaVuSans-Bold.ttf'),
      italics: path.join(FONTS_DIR, 'DejaVuSans.ttf'),
      bolditalics: path.join(FONTS_DIR, 'DejaVuSans-Bold.ttf'),
    },
  });

  constructor(private readonly pricing: PricingService) {}

  /** EMT letterhead logo as a base64 data URI (read once; '' if missing). */
  private logoCache?: string;
  private logo(): string | null {
    if (this.logoCache === undefined) {
      try {
        this.logoCache = 'data:image/png;base64,' + fs.readFileSync(LOGO_PATH).toString('base64');
      } catch {
        this.logoCache = '';
      }
    }
    return this.logoCache || null;
  }

  async build(
    wo: WorkOrder,
    settings: DocSettings,
    variant: DocVariant = 'calc',
  ): Promise<Buffer> {
    const def =
      variant === 'order'
        ? this.orderDefinition(wo, settings)
        : this.definition(wo, settings);
    const doc = this.printer.createPdfKitDocument(def);
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }

  // --- formatting helpers ---

  private m(n: number | null | undefined): string {
    return (Number(n) || 0).toFixed(2);
  }

  private dmy(d: Date | string | null | undefined): string {
    if (!d) return '-';
    const dt = new Date(d);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${dt.getFullYear()}`;
  }

  /**
   * Second title line of the calculation. A closed order carries its number and
   * close date; an open one is a preview — no number yet, dated today.
   */
  calcTitleLine(wo: Pick<WorkOrder, 'doc_number' | 'closed_at'>, now: Date = new Date()): string {
    const date = this.dmy(wo.closed_at ?? now);
    return wo.doc_number != null ? `№ ${wo.doc_number} от ${date}` : `от ${date}`;
  }

  private styles(): NonNullable<TDocumentDefinitions['styles']> {
    return {
      company: { fontSize: 7, alignment: 'right', color: '#333333' },
      docTitle: { fontSize: 13, bold: true, alignment: 'center' },
      th: { fontSize: 7, bold: true, fillColor: '#f0f0f0' },
      cell: { fontSize: 8 },
      secTitle: { fontSize: 9, bold: true, margin: [0, 8, 0, 3] },
      disclaimer: { fontSize: 7, color: '#555555', italics: true },
    };
  }

  /** Right-aligned company requisites block, shared by both documents. */
  private companyBlock(s: DocSettings, companyName: string): Column {
    return {
      width: '*',
      style: 'company',
      stack: [
        { text: companyName, bold: true },
        s.companyInn ? `ИНН: ${s.companyInn}` : '',
        s.companyAddress || '',
        s.companyPhone || '',
      ].filter(Boolean) as Content[],
    };
  }

  /**
   * Letterhead shared by both documents: logo in the geometric centre,
   * requisites on the right. The two equal star columns are what centre the
   * logo — with the requisites block at 'auto' it would drift left by half
   * that block's width. A missing logo file leaves the slot empty.
   */
  headerColumns(logo: string | null, s: DocSettings, companyName: string): Column[] {
    return [
      { text: '', width: '*' },
      logo
        ? { image: logo, width: LOGO_WIDTH, alignment: 'center' }
        : { text: '', width: LOGO_WIDTH },
      this.companyBlock(s, companyName),
    ];
  }

  // ====================== «Предварительная калькуляция» ======================

  private definition(wo: WorkOrder, s: DocSettings): TDocumentDefinitions {
    const labor = wo.labor_lines ?? [];
    const parts = wo.part_lines ?? [];
    // «Стоимость работ»/«Стоимость запчастей» are pre-discount figures, and
    // «Сумма скидок» is derived from them so the four printed numbers reconcile:
    // работы + запчасти − скидки === Итого (pinned in pricing.service.spec.ts).
    const laborSum = this.pricing.round2(this.pricing.laborGross(labor));
    const partSum = this.pricing.round2(this.pricing.partsGross(parts));
    const total = wo.total_frozen ?? wo.total_cached ?? 0;
    const discountSum = this.pricing.round2(Math.max(0, laborSum + partSum - total));
    const vatRate = s.vatRate;
    const vat =
      vatRate > 0 ? this.pricing.round2((total * vatRate) / (100 + vatRate)) : 0;
    // Installments can arrive after pickup, so paid_amount is live even on a
    // closed order — the calculation used to print a hardcoded 0.00 here while
    // the order document already reported it correctly.
    const paid = wo.paid_amount ?? 0;
    const due = this.pricing.round2(Math.max(0, total - paid));

    const v = wo.vehicle;
    const client = v?.client;
    const companyName = s.companyName || 'Исполнитель (укажите в Настройках)';
    const executor = [
      companyName,
      s.companyInn ? `ИНН: ${s.companyInn}` : '',
      s.companyPhone ? `тел. ${s.companyPhone}` : '',
    ]
      .filter(Boolean)
      .join(', ');

    return {
      pageSize: 'A4',
      pageMargins: [32, 32, 32, 36],
      defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.1 },
      styles: this.styles(),
      content: [
        // --- header: EMT logo (centre) + company requisites (right) ---
        { columns: this.headerColumns(this.logo(), s, companyName), columnGap: 8 },
        { text: 'Предварительная калькуляция', style: 'docTitle', margin: [0, 12, 0, 0] },
        { text: this.calcTitleLine(wo), style: 'docTitle', margin: [0, 1, 0, 10] },

        // --- info table ---
        {
          table: {
            widths: [110, '*'],
            body: [
              this.infoRow('Исполнитель', executor),
              this.infoRow('Владелец', ''),
              this.infoRow(
                'Плательщик',
                client
                  ? `${client.full_name}${client.phone ? `, тел. ${client.phone}` : ''}`
                  : '',
              ),
              this.infoRow(
                'Транспортное средство',
                // Used to print the generation code under the «Марка» label and
                // fall back to the literal 'Mini'.
                `Тип: Легковой автомобиль, Марка: ${v?.make || ''}, ` +
                  `Модель: ${vehicleLabel({ model: v?.model, generation_code: v?.generation_code })}, ` +
                  `Гос. номер: ${v?.plate || ''}, VIN: ${v?.vin || ''}, ` +
                  `Год выпуска: ${v?.year ?? ''}, Пробег: ${v?.mileage ?? ''}`,
              ),
              this.infoRow('Дата начала работ', this.dmy(wo.scheduled_at)),
              this.infoRow('Дата конца работ', this.dmy(wo.closed_at)),
            ],
          },
          layout: this.gridLayout(),
          margin: [0, 0, 0, 8],
        },

        // --- works ---
        this.laborTable(labor),
        // --- parts ---
        this.partsTable(parts),

        // --- totals ---
        {
          columns: [
            {
              width: '*',
              table: {
                widths: ['*', 'auto'],
                body: [
                  this.totalRow('Стоимость работ', this.m(laborSum)),
                  this.totalRow(
                    'Стоимость запчастей и материалов',
                    this.m(partSum),
                  ),
                  this.totalRow('Сумма скидок', this.m(discountSum)),
                ],
              },
              layout: this.gridLayout(),
            },
            { width: 12, text: '' },
            {
              width: '*',
              table: {
                widths: ['*', 'auto'],
                body: [
                  this.totalRow('Итого', this.m(total), true),
                  vatRate > 0
                    ? this.totalRow('В том числе НДС', this.m(vat))
                    : this.totalRow('НДС', 'Без НДС'),
                  vatRate > 0
                    ? this.totalRow('Ставка НДС', `${vatRate}%`)
                    : this.totalRow('', ''),
                  this.totalRow('Остаток к оплате', this.m(due), true),
                  this.totalRow('Оплачено', this.m(paid)),
                ],
              },
              layout: this.gridLayout(),
            },
          ],
          margin: [0, 4, 0, 8],
        },

        // --- words + disclaimer ---
        {
          text: [
            { text: 'Сумма прописью: ', bold: true },
            rublesInWords(total),
            vatRate > 0 ? `. Облагается НДС ${vatRate}%` : '',
          ],
          margin: [0, 0, 0, 6],
        },
        {
          text:
            'Калькуляция не является публичной офертой. Стоимость товаров и услуг ' +
            'действительна на дату формирования калькуляции. На момент прохождения ' +
            'обслуживания стоимость товаров и услуг может измениться.',
          style: 'disclaimer',
        },
      ],
    };
  }

  // ============================== «Заказ наряд» ==============================

  private orderDefinition(wo: WorkOrder, s: DocSettings): TDocumentDefinitions {
    const labor = wo.labor_lines ?? [];
    const parts = wo.part_lines ?? [];
    // Pre-discount figures, as in the calculation — «Сумма скидок» is the gap
    // between them and the total, so the block reconciles on paper.
    const laborSum = this.pricing.round2(this.pricing.laborGross(labor));
    const partSum = this.pricing.round2(this.pricing.partsGross(parts));
    // The order can be printed before close — estimate may still be live.
    const total = wo.total_frozen ?? wo.total_cached ?? 0;
    const discountSum = this.pricing.round2(Math.max(0, laborSum + partSum - total));
    const paid = wo.paid_amount ?? 0;
    const remainder = this.pricing.round2(Math.max(0, total - paid));
    const vatRate = s.vatRate;
    const vat =
      vatRate > 0 ? this.pricing.round2((total * vatRate) / (100 + vatRate)) : 0;

    const docNo = wo.order_doc_number != null ? String(wo.order_doc_number) : '—';
    const docDate = this.dmy(wo.closed_at ?? wo.created_at);
    const v = wo.vehicle;
    const client = v?.client;
    const masterName = wo.assigned_master?.name ?? '';
    const companyName = s.companyName || 'Исполнитель (укажите в Настройках)';
    const executor = [
      companyName,
      s.companyInn ? `ИНН: ${s.companyInn}` : '',
      s.companyPhone || '',
    ]
      .filter(Boolean)
      .join(' ');
    const contact = client
      ? `${client.full_name}${client.phone ? ` тел: ${client.phone}` : ''}`
      : '';

    return {
      pageSize: 'A4',
      pageMargins: [32, 32, 32, 36],
      defaultStyle: { font: 'Roboto', fontSize: 8, lineHeight: 1.1 },
      styles: this.styles(),
      content: [
        // --- header: EMT logo (centre) + company requisites (right) ---
        { columns: this.headerColumns(this.logo(), s, companyName), columnGap: 8 },
        {
          text: `Заказ наряд № ${docNo} от ${docDate}`,
          style: 'docTitle',
          margin: [0, 10, 0, 8],
        },

        // --- info table ---
        {
          table: {
            widths: [120, '*'],
            body: [
              this.infoRow('Исполнитель', executor),
              this.infoRow('Владелец автомобиля', ''),
              this.infoRow('Контакт', contact),
              this.infoRow('Плательщик', contact),
              this.infoRow('Транспортное средство', this.vehicleLine(v)),
              this.infoRow('Механик', masterName || '-'),
              this.infoRow('Причина обращения', wo.complaint?.trim() || '-'),
              this.infoRow(
                'Время начала и конца работ в календаре',
                wo.scheduled_at ? this.dmy(wo.scheduled_at) : '-',
              ),
            ],
          },
          layout: this.gridLayout(),
          margin: [0, 0, 0, 8],
        },

        // --- «работа + её запчасти» blocks, each with its own total ---
        ...this.orderBlocks(wo).map((b) => this.renderBlock(b)),

        // --- totals ---
        {
          columns: [
            {
              width: '*',
              table: {
                widths: ['*', 'auto'],
                body: [
                  this.totalRow('Стоимость работ', this.m(laborSum)),
                  this.totalRow('Стоимость запчастей и материалов', this.m(partSum)),
                  this.totalRow('Сумма скидок', this.m(discountSum)),
                ],
              },
              layout: this.gridLayout(),
            },
            { width: 12, text: '' },
            {
              width: '*',
              table: {
                widths: ['*', 'auto'],
                body: [
                  this.totalRow('Итого', this.m(total), true),
                  this.totalRow('НДС', vatRate > 0 ? this.m(vat) : 'Без НДС'),
                  this.totalRow('Ставка НДС', `${vatRate}%`),
                  this.totalRow('Остаток к оплате', this.m(remainder)),
                  this.totalRow('Оплачено', this.m(paid), true),
                ],
              },
              layout: this.gridLayout(),
            },
          ],
          margin: [0, 4, 0, 8],
        },

        // --- recommendations note + signatures ---
        {
          text: [
            { text: 'Рекомендации клиенту:\n', bold: true },
            wo.recommendation?.trim() || '-',
          ],
          margin: [0, 6, 0, 16],
        },
        {
          columns: [
            {
              width: '*',
              stack: [
                { text: 'Исполнитель:', bold: true, margin: [0, 0, 0, 6] },
                companyName,
                s.companyAddress || '',
                s.companyInn ? `ИНН: ${s.companyInn}` : '',
              ].filter(Boolean) as Content[],
            },
            {
              width: '*',
              stack: [
                { text: 'Заказчик:', bold: true, margin: [0, 0, 0, 6] },
                client?.full_name || '',
                client?.phone || '',
              ].filter(Boolean) as Content[],
            },
          ],
          margin: [0, 0, 0, 28],
        },
        {
          columns: [
            { text: '________________________', width: '*' },
            { text: '________________________', width: '*' },
          ],
        },

        // --- page 2: recommendations + terms ---
        this.recoLaborTable(),
        this.recoPartsTable(),
        { text: 'Общие условия', style: 'secTitle', margin: [0, 10, 0, 3] },
        {
          text:
            'Заказ-наряд не является публичной офертой. Стоимость работ и материалов ' +
            'действительна на дату формирования документа и может измениться на момент ' +
            'обслуживания. Подписывая заказ-наряд, заказчик соглашается с перечнем и ' +
            'стоимостью работ.',
          style: 'disclaimer',
        },
      ],
    };
  }

  // --- shared cell helpers ---

  private vehicleLine(v: WorkOrder['vehicle'] | undefined): string {
    // vehicleLabel without the make gives "Hatch R56" — and collapses the
    // backfilled case where model already IS the generation code.
    const model = vehicleLabel({ model: v?.model, generation_code: v?.generation_code });
    return (
      `Тип: Легковой автомобиль Марка: ${v?.make || ''} Модель: ${model} ` +
      `Гос. номер: ${v?.plate || ''} VIN: ${v?.vin || ''} ` +
      `Год выпуска: ${v?.year ?? ''} Пробег: ${v?.mileage ?? ''}`
    );
  }

  private infoRow(label: string, value: string): TableCell[] {
    return [{ text: label, bold: true }, { text: value || '' }];
  }

  private totalRow(label: string, value: string, bold = false): TableCell[] {
    return [
      { text: label, bold },
      { text: value, alignment: 'right', bold },
    ];
  }

  // --- estimate tables ---
  //
  // Each builder returns plain rows (DocTable) and a thin wrapper turns them
  // into pdfmake content. That split is what makes 600 lines of document code
  // testable under a convention with no e2e tests — the spec asserts on cells,
  // not on rendered bytes.

  private renderTable(t: DocTable): Content {
    const head: TableCell[] = t.head.map((text, i) => ({
      text,
      style: 'th',
      alignment: i === 0 ? 'center' : t.right.includes(i) ? 'right' : 'left',
    }));
    const body: TableCell[][] = [head];
    t.body.forEach((row, i) => {
      // A block heading spanning the whole width, so the estimate reads as
      // «работа + её запчасти» without changing the column set the customer
      // already signed off on.
      const heading = t.headings?.[i];
      if (heading) {
        body.push([
          { text: heading, colSpan: t.head.length, bold: true, fillColor: '#f7f7f7' },
          ...Array.from({ length: t.head.length - 1 }, () => ({ text: '' })),
        ]);
      }
      body.push(
        row.map((text, j) => ({
          text,
          alignment: j === 0 ? 'center' : t.right.includes(j) ? 'right' : 'left',
        })),
      );
    });
    if (t.body.length === 0) body.push(this.emptyRow(t.head.length));
    return {
      table: { headerRows: 1, widths: t.widths, body },
      layout: this.gridLayout(),
      margin: [0, 0, 0, 6],
    };
  }

  /** «Скидка» cell — blank rather than 0.00 when the line carries no discount. */
  private discountCell(gross: number, line: DiscountableLike): string {
    const d = this.pricing.lineDiscount(gross, line);
    return d > 0 ? this.m(d) : '';
  }

  // --- calc («Предварительная калькуляция») ---

  /**
   * The old layout printed `rate_snapshot` twice («Цена за нормо-час» and
   * «Цена за 1 н.ч. без скидки») — the duplicate is dropped and its width goes
   * to the now-meaningful discount column.
   */
  laborRows(labor: WorkOrder['labor_lines']): DocTable {
    return {
      head: ['#', 'Наименование работ', 'Норм.ч.', 'Цена за нормо-час', 'Цена без скидки', 'Скидка', 'Сумма'],
      widths: [14, '*', 34, 52, 52, 46, 56],
      right: [2, 3, 4, 5, 6],
      headings: groupHeadings(labor ?? []),
      body: (labor ?? []).map((l, i) => {
        const gross = this.pricing.laborLineGross(l);
        return [
          String(i + 1),
          l.name,
          l.hours != null ? this.m(l.hours) : '',
          this.m(l.rate_snapshot),
          this.m(gross),
          this.discountCell(gross, l),
          this.m(this.pricing.laborLineTotal(l)),
        ];
      }),
    };
  }

  /**
   * The estimate keeps the article — it is the document the shop works from.
   * The manufacturer sits under the name; a third text column would squeeze the
   * name to about 24 characters on A4.
   */
  partsRows(parts: WorkOrder['part_lines']): DocTable {
    return {
      head: ['#', 'Запчасти и материалы', 'Артикул', 'Кол-во', 'Цена за ед.', 'Цена без скидки', 'Скидка', 'Сумма'],
      widths: [14, '*', 58, 32, 46, 48, 40, 52],
      right: [3, 4, 5, 6, 7],
      headings: groupHeadings(parts ?? []),
      body: (parts ?? []).map((p, i) => {
        const gross = this.pricing.partLineGross(p);
        return [
          String(i + 1),
          p.manufacturer ? `${p.name}\n${p.manufacturer}` : p.name,
          p.catalog_number ?? '',
          this.m(p.qty),
          this.m(p.unit_price),
          this.m(gross),
          this.discountCell(gross, p),
          this.m(this.pricing.partLineTotal(p)),
        ];
      }),
    };
  }

  // --- order («Заказ-наряд») ---

  private laborTable(labor: WorkOrder['labor_lines']): Content {
    return this.renderTable(this.laborRows(labor));
  }

  private partsTable(parts: WorkOrder['part_lines']): Content {
    return this.renderTable(this.partsRows(parts));
  }

  /**
   * The order document restructured as «работа + её запчасти» blocks, each with
   * its own total — this is the mechanic's working copy, so grouping matters
   * more here than matching the calculation's column set.
   *
   * Labour and parts share one column set: «Кол-во» carries normo-hours for a
   * work and quantity+unit for a part.
   */
  orderBlocks(wo: WorkOrder): DocBlock[] {
    const labor = wo.labor_lines ?? [];
    const parts = wo.part_lines ?? [];

    // Preserve the order the lines already come in (loadFull sorts by block).
    const keys: (string | null)[] = [];
    for (const l of [...labor, ...parts]) {
      const k = l.group_key ?? null;
      if (!keys.includes(k)) keys.push(k);
    }
    // Ungrouped lines trail the named blocks.
    keys.sort((a, b) => (a === null ? 1 : 0) - (b === null ? 1 : 0));

    return keys.map((key) => {
      const gl = labor.filter((l) => (l.group_key ?? null) === key);
      const gp = parts.filter((p) => (p.group_key ?? null) === key);
      const name =
        key === null
          ? keys.length > 1
            ? 'Прочие работы и запчасти'
            : 'Работы и запчасти'
          : gl[0]?.group_name ?? gp[0]?.group_name ?? 'Блок';

      const body: string[][] = [];
      let n = 1;
      for (const l of gl) {
        const gross = this.pricing.laborLineGross(l);
        body.push([
          String(n++),
          l.name,
          l.hours != null ? `${this.m(l.hours)} н/ч` : '',
          this.m(l.rate_snapshot),
          this.discountCell(gross, l),
          this.m(this.pricing.laborLineTotal(l)),
        ]);
      }
      for (const part of gp) {
        const gross = this.pricing.partLineGross(part);
        body.push([
          String(n++),
          part.manufacturer ? `${part.name} · ${part.manufacturer}` : part.name,
          `${this.m(part.qty)} ${part.unit === 'l' ? 'л' : 'шт'}`,
          this.m(part.unit_price),
          this.discountCell(gross, part),
          this.m(this.pricing.partLineTotal(part)),
        ]);
      }

      return {
        name,
        total: this.m(this.pricing.netSubtotal(gl, gp)),
        table: {
          head: ['#', 'Наименование', 'Кол-во', 'Цена', 'Скидка', 'Сумма'],
          widths: [14, '*', 56, 64, 44, 60],
          right: [2, 3, 4, 5],
          body,
        },
      };
    });
  }

  /** A block heading with its own total, then the block's lines. */
  private renderBlock(block: DocBlock): Content {
    return {
      stack: [
        {
          columns: [
            { text: block.name, bold: true, fontSize: 9, width: '*' },
            { text: block.total, bold: true, fontSize: 9, alignment: 'right', width: 'auto' },
          ],
          margin: [0, 6, 0, 2],
        },
        this.renderTable(block.table),
      ],
      unbreakable: true,
    } as Content;
  }

  /** Empty «Рекомендованные работы» table (page 2). */
  private recoLaborTable(): Content {
    const head: TableCell[] = [
      { text: '#', style: 'th', alignment: 'center' },
      { text: 'Рекомендованные работы', style: 'th', alignment: 'center' },
      { text: 'Норм.ч.', style: 'th', alignment: 'center' },
      { text: 'Цена за нормо-час', style: 'th', alignment: 'center' },
      { text: 'Скидка', style: 'th', alignment: 'center' },
      { text: 'Сумма', style: 'th', alignment: 'center' },
    ];
    return {
      pageBreak: 'before',
      table: {
        headerRows: 1,
        widths: [14, '*', 50, 70, 44, 50],
        body: [head, this.emptyRow(6)],
      },
      layout: this.gridLayout(),
      margin: [0, 0, 0, 8],
    };
  }

  /** Empty «Рекомендованные запчасти» table (page 2). */
  private recoPartsTable(): Content {
    const head: TableCell[] = [
      { text: '#', style: 'th', alignment: 'center' },
      { text: 'Рекомендованные запчасти', style: 'th', alignment: 'center' },
      { text: 'Цена', style: 'th', alignment: 'center' },
    ];
    return {
      table: { headerRows: 1, widths: [14, '*', 120], body: [head, this.emptyRow(3)] },
      layout: this.gridLayout(),
      margin: [0, 0, 0, 6],
    };
  }

  private emptyRow(cols: number): TableCell[] {
    return Array.from({ length: cols }, () => ({ text: ' ' }));
  }

  /** Thin grey grid resembling the reference document. */
  private gridLayout() {
    return {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => '#bbbbbb',
      vLineColor: () => '#bbbbbb',
      paddingLeft: () => 3,
      paddingRight: () => 3,
      paddingTop: () => 2,
      paddingBottom: () => 2,
    };
  }
}
