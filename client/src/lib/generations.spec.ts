import { describe, expect, it } from 'vitest';
import { genLabel, groupGenerations } from './generations';
import type { VehicleGeneration } from './types';

const gen = (p: Partial<VehicleGeneration>): VehicleGeneration => ({
  id: 'g',
  make: 'MINI',
  model: 'Cooper',
  code: null,
  years: null,
  sort: 0,
  active: true,
  ...p,
});

const list = [
  gen({ id: 'r56', code: 'R56', years: '2006–2013' }),
  gen({ id: 'f56', code: 'F56', years: '2014–н.в.' }),
  gen({ id: 'e90', make: 'BMW', model: '3 серии', code: 'E90', years: '2005–2012' }),
  gen({ id: 'cm', model: 'Countryman', code: 'R60', years: '2010–2016' }),
];

describe('genLabel', () => {
  it('joins make, model and code', () => {
    expect(genLabel(list[0])).toBe('MINI Cooper R56');
  });

  it('leaves no trailing space when the code is missing', () => {
    expect(genLabel(gen({ code: null }))).toBe('MINI Cooper');
  });
});

describe('groupGenerations', () => {
  it('groups everything by make when the query is empty, keeping the incoming order', () => {
    expect(groupGenerations(list, '')).toEqual([
      { make: 'MINI', items: [list[0], list[1], list[3]] },
      { make: 'BMW', items: [list[2]] },
    ]);
  });

  it('finds a generation by its code, case-insensitively', () => {
    expect(groupGenerations(list, 'r56')).toEqual([{ make: 'MINI', items: [list[0]] }]);
  });

  it('searches the years', () => {
    expect(groupGenerations(list, '2014')).toEqual([{ make: 'MINI', items: [list[1]] }]);
  });

  it('searches make and model, and drops the groups left empty', () => {
    expect(groupGenerations(list, 'bmw').map((g) => g.make)).toEqual(['BMW']);
    expect(groupGenerations(list, 'country')[0].items).toEqual([list[3]]);
  });

  it('needs every word of the query to match', () => {
    expect(groupGenerations(list, 'mini f56')).toEqual([{ make: 'MINI', items: [list[1]] }]);
    expect(groupGenerations(list, 'bmw r56')).toEqual([]);
  });

  it('ignores stray whitespace', () => {
    expect(groupGenerations(list, '  R60 ')[0].items).toEqual([list[3]]);
  });
});
