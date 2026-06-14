import { pluralRu, rublesInWords } from './rubles-in-words.util';

describe('pluralRu', () => {
  const f: [string, string, string] = ['рубль', 'рубля', 'рублей'];
  it('picks the "one" form', () => {
    expect(pluralRu(1, f)).toBe('рубль');
    expect(pluralRu(21, f)).toBe('рубль');
    expect(pluralRu(101, f)).toBe('рубль');
  });
  it('picks the "few" form (2-4)', () => {
    expect(pluralRu(2, f)).toBe('рубля');
    expect(pluralRu(3, f)).toBe('рубля');
    expect(pluralRu(24, f)).toBe('рубля');
  });
  it('picks the "many" form, incl. teens 11-14', () => {
    expect(pluralRu(5, f)).toBe('рублей');
    expect(pluralRu(11, f)).toBe('рублей');
    expect(pluralRu(12, f)).toBe('рублей');
    expect(pluralRu(14, f)).toBe('рублей');
    expect(pluralRu(0, f)).toBe('рублей');
    expect(pluralRu(100, f)).toBe('рублей');
  });
});

describe('rublesInWords', () => {
  it('matches the document sample (72250)', () => {
    expect(rublesInWords(72250)).toBe(
      'Семьдесят две тысячи двести пятьдесят рублей 00 копеек',
    );
  });

  it('handles zero', () => {
    expect(rublesInWords(0)).toBe('Ноль рублей 00 копеек');
  });

  it('handles singular rouble and gendered units', () => {
    expect(rublesInWords(1)).toBe('Один рубль 00 копеек');
    expect(rublesInWords(2)).toBe('Два рубля 00 копеек');
    expect(rublesInWords(21)).toBe('Двадцать один рубль 00 копеек');
  });

  it('handles thousands with feminine gender', () => {
    expect(rublesInWords(1000)).toBe('Одна тысяча рублей 00 копеек');
    expect(rublesInWords(2000)).toBe('Две тысячи рублей 00 копеек');
    expect(rublesInWords(5000)).toBe('Пять тысяч рублей 00 копеек');
  });

  it('handles millions', () => {
    expect(rublesInWords(2_000_000)).toBe('Два миллиона рублей 00 копеек');
    expect(rublesInWords(1_234_567)).toBe(
      'Один миллион двести тридцать четыре тысячи пятьсот шестьдесят семь рублей 00 копеек',
    );
  });

  it('handles kopecks and rounding', () => {
    expect(rublesInWords(123.45)).toBe('Сто двадцать три рубля 45 копеек');
    expect(rublesInWords(100.1)).toBe('Сто рублей 10 копеек');
    expect(rublesInWords(0.05)).toBe('Ноль рублей 05 копеек');
    expect(rublesInWords(1.01)).toBe('Один рубль 01 копейка');
  });
});
