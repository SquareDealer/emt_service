import { describe, expect, it } from 'vitest';
import { filterParts, manufacturersOf, partTemplateBody } from './parts';
import type { PartTemplate } from './types';

const part = (id: string, name: string, manufacturer: string | null, catalog_number: string | null): PartTemplate => ({
  id,
  name,
  manufacturer,
  catalog_number,
  unit: 'pcs',
  default_price: null,
  active: true,
});

const parts = [
  part('p1', 'Фильтр масляный', 'MANN', 'W712/95'),
  part('p2', 'Фильтр масляный', 'Mahle', 'OX 171/2D'),
  part('p3', 'Масло 5W-30', 'Castrol', '15669A'),
  part('p4', 'Прокладка пробки', null, null),
];

const ids = (list: PartTemplate[]) => list.map((p) => p.id);

describe('filterParts', () => {
  it('returns everything, in the incoming order, when nothing is asked', () => {
    expect(ids(filterParts(parts, { q: '', manufacturer: null }))).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(ids(filterParts(parts, { q: '   ', manufacturer: null }))).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('needs every word of the query, but each may sit in a different field', () => {
    expect(ids(filterParts(parts, { q: 'фильтр mann', manufacturer: null }))).toEqual(['p1']);
    expect(ids(filterParts(parts, { q: 'mann фильтр', manufacturer: null }))).toEqual(['p1']);
    expect(ids(filterParts(parts, { q: 'фильтр castrol', manufacturer: null }))).toEqual([]);
  });

  it('searches the article, ignoring case', () => {
    expect(ids(filterParts(parts, { q: 'w712', manufacturer: null }))).toEqual(['p1']);
    expect(ids(filterParts(parts, { q: 'ФИЛЬТР', manufacturer: null }))).toEqual(['p1', 'p2']);
  });

  it('narrows to one manufacturer, and combines with the query', () => {
    expect(ids(filterParts(parts, { q: '', manufacturer: 'Castrol' }))).toEqual(['p3']);
    expect(ids(filterParts(parts, { q: 'фильтр', manufacturer: 'Mahle' }))).toEqual(['p2']);
    expect(ids(filterParts(parts, { q: 'масло', manufacturer: 'MANN' }))).toEqual([]);
  });

  it('drops excluded ids', () => {
    expect(ids(filterParts(parts, { q: '', manufacturer: null, excludeIds: new Set(['p1']) }))).toEqual(['p2', 'p3', 'p4']);
  });

  it('finds a part from the tail of a catalog larger than the old 100-row page', () => {
    const many150 = Array.from({ length: 150 }, (_, i) => part(`m${i}`, `Деталь хвост-${i}`, 'ACME', `A-${i}`));
    expect(ids(filterParts(many150, { q: 'хвост-149', manufacturer: null }))).toEqual(['m149']);
  });
});

describe('manufacturersOf', () => {
  it('lists unique non-empty manufacturers, sorted', () => {
    expect(
      manufacturersOf([
        part('a', 'x', 'MANN', null),
        part('b', 'x', null, null),
        part('c', 'x', 'Castrol', null),
        part('d', 'x', 'MANN', null),
        part('e', 'x', '  ', null),
      ]),
    ).toEqual(['Castrol', 'MANN']);
  });
});

describe('partTemplateBody', () => {
  const tpl = part('p9', 'Фильтр', 'Mann', 'W712');
  const f = { name: 'Фильтр', manufacturer: 'Mann', catalog_number: 'W712', unit: 'pcs' as const, price: '950', purchase: '520' };

  it('приёмщик: ключа purchase_price нет, даже если поле заполнено', () => {
    expect(partTemplateBody(f, { owner: false })).not.toHaveProperty('purchase_price');
  });
  it('приёмщик правит запись с закупкой: ключа нет', () => {
    expect(partTemplateBody({ ...f, purchase: '' }, { owner: false, initial: { ...tpl, purchase_price: 520 } }))
      .not.toHaveProperty('purchase_price');
  });
  it('владелец создаёт: закупка числом', () => {
    expect(partTemplateBody(f, { owner: true }).purchase_price).toBe(520);
  });
  it('владелец создаёт с пустой закупкой: ключа нет', () => {
    expect(partTemplateBody({ ...f, purchase: '' }, { owner: true })).not.toHaveProperty('purchase_price');
  });
  it('владелец не менял закупку при правке: ключа нет', () => {
    expect(partTemplateBody(f, { owner: true, initial: { ...tpl, purchase_price: 520 } })).not.toHaveProperty('purchase_price');
  });
  it('владелец очистил закупку при правке: null', () => {
    expect(partTemplateBody({ ...f, purchase: '' }, { owner: true, initial: { ...tpl, purchase_price: 520 } }).purchase_price).toBeNull();
  });
  it('закупка 0 — валидное значение, не «пусто»', () => {
    expect(partTemplateBody({ ...f, purchase: '0' }, { owner: true }).purchase_price).toBe(0);
  });
  it('невалидная закупка у владельца: ключа нет', () => {
    expect(partTemplateBody({ ...f, purchase: 'abc' }, { owner: true })).not.toHaveProperty('purchase_price');
    expect(partTemplateBody({ ...f, purchase: '1e5' }, { owner: true, initial: { ...tpl, purchase_price: 520 } }))
      .not.toHaveProperty('purchase_price');
  });
  it('запятая как десятичный разделитель', () => {
    expect(partTemplateBody({ ...f, purchase: '520,5' }, { owner: true }).purchase_price).toBe(520.5);
  });
  it('остальные поля собираются как раньше', () => {
    expect(partTemplateBody(f, { owner: false })).toEqual({ name: 'Фильтр', manufacturer: 'Mann', catalog_number: 'W712', unit: 'pcs', default_price: 950 });
  });
  it('пустые поля: null, цена не 0', () => {
    expect(partTemplateBody({ name: ' Х ', manufacturer: ' ', catalog_number: '', unit: 'l', price: '', purchase: '' }, { owner: false }))
      .toEqual({ name: 'Х', manufacturer: null, catalog_number: null, unit: 'l', default_price: null });
  });
});
