import { describe, expect, it } from 'vitest';
import { parsePrice } from './price';

describe('parsePrice', () => {
  it.each([['520', 520], ['12,5', 12.5], ['12,55', 12.55], ['1 250,40', 1250.4], ['0', 0]])('parsePrice(%s) = %s', (raw, v) => {
    expect(parsePrice(raw)).toEqual({ kind: 'ok', value: v });
  });
  it.each(['abc', '-3', '1e30', '9999999999.999', '12,5,1', '12,555', '12.555'])('parsePrice(%s) невалидно', (raw) => {
    expect(parsePrice(raw)).toEqual({ kind: 'invalid' });
  });
  it.each(['', '   '])('parsePrice(%p) пусто', (raw) => {
    expect(parsePrice(raw)).toEqual({ kind: 'empty' });
  });
  it('верхний предел включительно', () => {
    expect(parsePrice('9999999999.99')).toEqual({ kind: 'ok', value: 9_999_999_999.99 });
  });
});
