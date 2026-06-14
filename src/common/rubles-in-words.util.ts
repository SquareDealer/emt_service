/**
 * Russian "amount in words" for the calculation document ("Сумма прописью").
 * Pure, no deps. Handles gender (рубль м.р., тысяча ж.р.) and plural forms.
 *   rublesInWords(72250) -> "Семьдесят две тысячи двести пятьдесят рублей 00 копеек"
 */

const ONES_M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = [
  'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
  'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать',
];
const TENS = [
  '', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят',
  'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто',
];
const HUNDREDS = [
  '', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот',
  'шестьсот', 'семьсот', 'восемьсот', 'девятьсот',
];

type Forms = readonly [string, string, string]; // 1 / 2-4 / 5-0

interface Scale {
  forms: Forms; // '' triple => no scale word (units)
  feminine: boolean;
}

const SCALES: Scale[] = [
  { forms: ['', '', ''], feminine: false }, // units (рубли — masc)
  { forms: ['тысяча', 'тысячи', 'тысяч'], feminine: true },
  { forms: ['миллион', 'миллиона', 'миллионов'], feminine: false },
  { forms: ['миллиард', 'миллиарда', 'миллиардов'], feminine: false },
  { forms: ['триллион', 'триллиона', 'триллионов'], feminine: false },
];

/** Pick the Russian plural form for `n` from [one, few, many]. */
export function pluralRu(n: number, forms: Forms): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
}

function tripleToWords(n: number, feminine: boolean): string[] {
  const words: string[] = [];
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  if (h) words.push(HUNDREDS[h]);
  if (t === 1) {
    words.push(TEENS[o]);
  } else {
    if (t) words.push(TENS[t]);
    if (o) words.push((feminine ? ONES_F : ONES_M)[o]);
  }
  return words;
}

function intToWords(num: number): string {
  if (num === 0) return 'ноль';
  const groups: number[] = [];
  let n = num;
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const scale = SCALES[i] ?? SCALES[SCALES.length - 1];
    parts.push(...tripleToWords(g, scale.feminine));
    if (scale.forms[0]) parts.push(pluralRu(g, scale.forms));
  }
  return parts.join(' ');
}

const RUB_FORMS: Forms = ['рубль', 'рубля', 'рублей'];
const KOP_FORMS: Forms = ['копейка', 'копейки', 'копеек'];

export function rublesInWords(amount: number): string {
  const totalKop = Math.round(Math.abs(amount) * 100);
  const rub = Math.floor(totalKop / 100);
  const kop = totalKop % 100;
  const phrase =
    `${intToWords(rub)} ${pluralRu(rub, RUB_FORMS)} ` +
    `${String(kop).padStart(2, '0')} ${pluralRu(kop, KOP_FORMS)}`;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}
