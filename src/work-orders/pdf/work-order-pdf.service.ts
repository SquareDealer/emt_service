import { Injectable } from '@nestjs/common';
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
import { rublesInWords } from '../../common/rubles-in-words.util';
import { PricingService } from '../pricing.service';

const FONTS_DIR = path.join(process.cwd(), 'assets', 'fonts');

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
      width: 'auto',
      style: 'company',
      stack: [
        { text: companyName, bold: true },
        s.companyInn ? `ИНН: ${s.companyInn}` : '',
        s.companyAddress || '',
        s.companyPhone || '',
      ].filter(Boolean) as Content[],
    };
  }

  // ====================== «Предварительная калькуляция» ======================

  private definition(wo: WorkOrder, s: DocSettings): TDocumentDefinitions {
    const labor = wo.labor_lines ?? [];
    const parts = wo.part_lines ?? [];
    const laborSum = labor.reduce((a, l) => a + this.pricing.laborLineTotal(l), 0);
    const partSum = parts.reduce((a, p) => a + this.pricing.partLineTotal(p), 0);
    const subtotal = this.pricing.round2(laborSum + partSum);
    const total = wo.total_frozen ?? wo.total_cached ?? 0;
    const discountSum = this.pricing.round2(Math.max(0, subtotal - total));
    const vatRate = s.vatRate;
    const vat =
      vatRate > 0 ? this.pricing.round2((total * vatRate) / (100 + vatRate)) : 0;

    const docNo = wo.doc_number != null ? String(wo.doc_number) : '—';
    const docDate = this.dmy(wo.closed_at);
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
        // --- header: company requisites (right) ---
        {
          columns: [
            { text: 'STO', bold: true, fontSize: 12, width: '*' },
            this.companyBlock(s, companyName),
          ],
        },
        { text: 'Предварительная калькуляция', style: 'docTitle', margin: [0, 12, 0, 0] },
        { text: `№ ${docNo} от ${docDate}`, style: 'docTitle', margin: [0, 1, 0, 10] },

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
                `Тип: Легковой автомобиль, Марка: ${v?.model || 'Mini'}, ` +
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
                  this.totalRow('Остаток к оплате', this.m(total), true),
                  this.totalRow('Оплачено', this.m(0)),
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
    const laborSum = labor.reduce((a, l) => a + this.pricing.laborLineTotal(l), 0);
    const partSum = parts.reduce((a, p) => a + this.pricing.partLineTotal(p), 0);
    const subtotal = this.pricing.round2(laborSum + partSum);
    // The order can be printed before close — estimate may still be live.
    const total = wo.total_frozen ?? wo.total_cached ?? 0;
    const discountSum = this.pricing.round2(Math.max(0, subtotal - total));
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
        // --- header ---
        {
          columns: [
            { text: '', width: '*' },
            this.companyBlock(s, companyName),
          ],
        },
        { text: 'STO', alignment: 'center', bold: true, fontSize: 16, margin: [0, 2, 0, 0] },
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
              this.infoRow('Причина обращения', wo.title?.trim() || '-'),
              this.infoRow(
                'Время начала и конца работ в календаре',
                wo.scheduled_at ? this.dmy(wo.scheduled_at) : '-',
              ),
            ],
          },
          layout: this.gridLayout(),
          margin: [0, 0, 0, 8],
        },

        // --- works (with Механик column) ---
        this.laborTableOrder(labor, masterName),
        // --- parts ---
        this.partsTableOrder(parts),

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
          text: [{ text: 'Рекомендации клиенту:\n', bold: true }, '-'],
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
    return (
      `Тип: Легковой автомобиль Марка: Mini Модель: ${v?.model || ''} ` +
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

  // --- calc tables ---

  private laborTable(labor: WorkOrder['labor_lines']): Content {
    const head: TableCell[] = [
      { text: '#', style: 'th', alignment: 'center' },
      { text: 'Наименование работ', style: 'th' },
      { text: 'Норм.ч.', style: 'th', alignment: 'right' },
      { text: 'Цена за нормо-час', style: 'th', alignment: 'right' },
      { text: 'Цена за 1 н.ч. без скидки', style: 'th', alignment: 'right' },
      { text: 'Цена без скидки', style: 'th', alignment: 'right' },
      { text: 'Скидка', style: 'th', alignment: 'right' },
      { text: 'Сумма', style: 'th', alignment: 'right' },
    ];
    const body: TableCell[][] = [head];
    (labor ?? []).forEach((l, i) => {
      const lineTotal = this.pricing.laborLineTotal(l);
      body.push([
        { text: String(i + 1), alignment: 'center' },
        { text: l.name },
        { text: l.hours != null ? this.m(l.hours) : '', alignment: 'right' },
        { text: this.m(l.rate_snapshot), alignment: 'right' },
        { text: this.m(l.rate_snapshot), alignment: 'right' },
        { text: this.m(lineTotal), alignment: 'right' },
        { text: '0.00', alignment: 'right' },
        { text: this.m(lineTotal), alignment: 'right' },
      ]);
    });
    if ((labor ?? []).length === 0) body.push(this.emptyRow(8));
    return {
      table: { headerRows: 1, widths: [14, '*', 30, 44, 44, 48, 36, 50], body },
      layout: this.gridLayout(),
      margin: [0, 0, 0, 6],
    };
  }

  private partsTable(parts: WorkOrder['part_lines']): Content {
    const head: TableCell[] = [
      { text: '#', style: 'th', alignment: 'center' },
      { text: 'Запчасти и материалы', style: 'th' },
      { text: 'Кол-во', style: 'th', alignment: 'right' },
      { text: 'Цена за 1 дет. без скидки', style: 'th', alignment: 'right' },
      { text: 'Цена без скидки', style: 'th', alignment: 'right' },
      { text: 'Скидка', style: 'th', alignment: 'right' },
      { text: 'Сумма', style: 'th', alignment: 'right' },
    ];
    const body: TableCell[][] = [head];
    (parts ?? []).forEach((p, i) => {
      const lineTotal = this.pricing.partLineTotal(p);
      body.push([
        { text: String(i + 1), alignment: 'center' },
        { text: p.catalog_number ? `${p.name} · ${p.catalog_number}` : p.name },
        { text: this.m(p.qty), alignment: 'right' },
        { text: this.m(p.unit_price), alignment: 'right' },
        { text: this.m(lineTotal), alignment: 'right' },
        { text: '0.00', alignment: 'right' },
        { text: this.m(lineTotal), alignment: 'right' },
      ]);
    });
    if ((parts ?? []).length === 0) body.push(this.emptyRow(7));
    return {
      table: { headerRows: 1, widths: [14, '*', 34, 50, 48, 36, 50], body },
      layout: this.gridLayout(),
      margin: [0, 0, 0, 6],
    };
  }

  // --- order tables ---

  private laborTableOrder(labor: WorkOrder['labor_lines'], master: string): Content {
    const head: TableCell[] = [
      { text: '#', style: 'th', alignment: 'center' },
      { text: 'Наименование работ', style: 'th' },
      { text: 'Механик', style: 'th' },
      { text: 'Норм.ч.', style: 'th', alignment: 'right' },
      { text: 'Цена за нормо-час', style: 'th', alignment: 'right' },
      { text: 'Скидка', style: 'th', alignment: 'right' },
      { text: 'Сумма', style: 'th', alignment: 'right' },
    ];
    const body: TableCell[][] = [head];
    (labor ?? []).forEach((l, i) => {
      const lineTotal = this.pricing.laborLineTotal(l);
      body.push([
        { text: String(i + 1), alignment: 'center' },
        { text: l.name },
        { text: master },
        { text: l.hours != null ? this.m(l.hours) : '', alignment: 'right' },
        { text: this.m(l.rate_snapshot), alignment: 'right' },
        { text: '0.00', alignment: 'right' },
        { text: this.m(lineTotal), alignment: 'right' },
      ]);
    });
    if ((labor ?? []).length === 0) body.push(this.emptyRow(7));
    return {
      table: { headerRows: 1, widths: [14, '*', 96, 38, 64, 44, 56], body },
      layout: this.gridLayout(),
      margin: [0, 0, 0, 6],
    };
  }

  private partsTableOrder(parts: WorkOrder['part_lines']): Content {
    const head: TableCell[] = [
      { text: '#', style: 'th', alignment: 'center' },
      { text: 'Запчасти и материалы', style: 'th' },
      { text: 'Кол.во', style: 'th', alignment: 'right' },
      { text: 'Цена за единицу', style: 'th', alignment: 'right' },
      { text: 'Скидка', style: 'th', alignment: 'right' },
      { text: 'Сумма', style: 'th', alignment: 'right' },
    ];
    const body: TableCell[][] = [head];
    (parts ?? []).forEach((p, i) => {
      const lineTotal = this.pricing.partLineTotal(p);
      body.push([
        { text: String(i + 1), alignment: 'center' },
        { text: p.catalog_number ? `${p.name} · ${p.catalog_number}` : p.name },
        { text: this.m(p.qty), alignment: 'right' },
        { text: this.m(p.unit_price), alignment: 'right' },
        { text: '0.00', alignment: 'right' },
        { text: this.m(lineTotal), alignment: 'right' },
      ]);
    });
    if ((parts ?? []).length === 0) body.push(this.emptyRow(6));
    return {
      table: { headerRows: 1, widths: [14, '*', 44, 72, 44, 56], body },
      layout: this.gridLayout(),
      margin: [0, 0, 0, 6],
    };
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
