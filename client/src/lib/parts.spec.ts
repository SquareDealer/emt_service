import { describe, expect, it } from 'vitest';
import { filterParts, manufacturersOf } from './parts';
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
