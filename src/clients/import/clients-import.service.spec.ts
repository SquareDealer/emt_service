import * as iconv from 'iconv-lite';
import { ClientsImportService } from './clients-import.service';
import { normalizePhone } from '../../common/phone.util';

describe('phone normalization', () => {
  it('8 + 10 digits -> +7', () => {
    expect(normalizePhone('8(999)123-45-67')).toBe('+79991234567');
  });
  it('strips spaces and keeps +7', () => {
    expect(normalizePhone('+7 999 123 45 67')).toBe('+79991234567');
  });
  it('bare 11 digits starting 7', () => {
    expect(normalizePhone('79991234567')).toBe('+79991234567');
  });
  it('bare 10 digits -> +7', () => {
    expect(normalizePhone('9991234567')).toBe('+79991234567');
  });
  it('empty -> empty', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(null)).toBe('');
  });
});

describe('ClientsImportService static parsers', () => {
  it('parseDate ДД.ММ.ГГГГ', () => {
    const d = ClientsImportService.parseDate('15.03.2024');
    expect(d).toBeDefined();
    expect(d!.toISOString().startsWith('2024-03-15')).toBe(true);
  });
  it('parseDate ISO', () => {
    const d = ClientsImportService.parseDate('2024-03-15');
    expect(d!.toISOString().startsWith('2024-03-15')).toBe(true);
  });
  it('parseDate empty -> undefined', () => {
    expect(ClientsImportService.parseDate('')).toBeUndefined();
  });
  it('parseNumber tolerates spaces', () => {
    expect(ClientsImportService.parseNumber('145 000')).toBe(145000);
  });
  it('parseNumber comma decimal', () => {
    expect(ClientsImportService.parseNumber('1234,56')).toBe(1234.56);
  });
  it('parseNumber comma thousands grouping', () => {
    expect(ClientsImportService.parseNumber('145,000')).toBe(145000);
    expect(ClientsImportService.parseNumber('1,234,567')).toBe(1234567);
  });
  it('detectDelimiter picks ;', () => {
    expect(ClientsImportService.detectDelimiter('a;b;c')).toBe(';');
  });
  it('detectDelimiter picks ,', () => {
    expect(ClientsImportService.detectDelimiter('a,b,c')).toBe(',');
  });
  it('splitLine handles quoted field with delimiter', () => {
    expect(ClientsImportService.splitLine('"Иванов, И.",+7999', ',')).toEqual([
      'Иванов, И.',
      '+7999',
    ]);
  });
  it('decodes CP1251', () => {
    const buf = iconv.encode('Иван Иванов', 'win1251');
    expect(ClientsImportService.decode(buf)).toBe('Иван Иванов');
  });
  it('decodes UTF-8 with BOM', () => {
    const buf = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('Тест', 'utf8'),
    ]);
    expect(ClientsImportService.decode(buf)).toBe('Тест');
  });
});

describe('ClientsImportService.import — dedup & report', () => {
  function makeService() {
    const phones = new Set<string>();
    const created: any[] = [];
    const clientsMock = {
      findByPhone: (phone: string) =>
        Promise.resolve(phones.has(phone) ? { id: 'existing' } : null),
      create: (input: any) => {
        phones.add(input.phone);
        const c = { ...input, id: String(created.length) };
        created.push(c);
        return Promise.resolve(c);
      },
    };
    return { svc: new ClientsImportService(clientsMock as any), created };
  }

  const CSV =
    'ФИО,телефон,дата создания,кол-во закрытых сделок,сумма закрытых сделок\n' +
    'Иван Иванов,+79991234567,15.03.2024,12,145000\n' +
    'Пётр Петров,8(999)123-45-67,01.01.2023,3,5000\n'; // same phone as Ivan -> dup

  it('skips header, dedups intra-file, fills aggregates', async () => {
    const { svc, created } = makeService();
    const report = await svc.import(Buffer.from(CSV, 'utf8'));
    expect(report.total).toBe(2);
    expect(report.added).toBe(1);
    expect(report.skipped_duplicates).toBe(1);
    expect(created[0].source).toBe('csv_import');
    expect(created[0].imported_deals_count).toBe(12);
    expect(created[0].imported_deals_sum).toBe(145000);
    expect(created[0].created_at!.toISOString().startsWith('2024-03-15')).toBe(true);
  });

  it('re-import produces no new rows (dedup vs store)', async () => {
    const { svc, created } = makeService();
    await svc.import(Buffer.from(CSV, 'utf8'));
    const before = created.length;
    const report2 = await svc.import(Buffer.from(CSV, 'utf8'));
    expect(created.length).toBe(before);
    expect(report2.added).toBe(0);
    expect(report2.skipped_duplicates).toBe(2);
  });

  it('reports broken rows without aborting', async () => {
    const { svc } = makeService();
    const bad =
      'ФИО,телефон\n' +
      'Без Телефона,\n' +
      ',+79990000000\n' +
      'Хороший Клиент,+79995554433\n';
    const report = await svc.import(Buffer.from(bad, 'utf8'));
    expect(report.added).toBe(1);
    expect(report.errors.length).toBe(2);
  });
});
