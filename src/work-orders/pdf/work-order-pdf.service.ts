import { Injectable } from '@nestjs/common';
import * as path from 'path';
import PdfPrinter from 'pdfmake';
import type {
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

/**
 * Renders the "Предварительная калькуляция" PDF from a frozen work order,
 * mirroring the reference layout (Васильев.pdf). Cyrillic via vendored DejaVu
 * (mapped onto pdfmake's default "Roboto" font name). Source of truth for the
 * total is `total_frozen`; line math reuses PricingService.
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

  async build(wo: WorkOrder, settings: DocSettings): Promise<Buffer> {
    const def = this.definition(wo, settings);
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
      styles: {
        company: { fontSize: 7, alignment: 'right', color: '#333333' },
        docTitle: { fontSize: 13, bold: true, alignment: 'center' },
        th: { fontSize: 7, bold: true, fillColor: '#f0f0f0' },
        cell: { fontSize: 8 },
        secTitle: { fontSize: 9, bold: true, margin: [0, 8, 0, 3] },
        disclaimer: { fontSize: 7, color: '#555555', italics: true },
      },
      content: [
        // --- header: company requisites (right) ---
        {
          columns: [
            { text: 'STO', bold: true, fontSize: 12, width: '*' },
            {
              width: 'auto',
              style: 'company',
              stack: [
                { text: companyName, bold: true },
                s.companyInn ? `ИНН: ${s.companyInn}` : '',
                s.companyAddress || '',
                s.companyPhone || '',
              ].filter(Boolean) as Content[],
            },
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

  private infoRow(label: string, value: string): TableCell[] {
    return [{ text: label, bold: true }, { text: value || '' }];
  }

  private totalRow(label: string, value: string, bold = false): TableCell[] {
    return [
      { text: label, bold },
      { text: value, alignment: 'right', bold },
    ];
  }

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
        {
          text: p.catalog_number ? `${p.name} · ${p.catalog_number}` : p.name,
        },
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
