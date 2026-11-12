/**
 * ПРОТОТИП: демо-данные для экрана аналитики. Детерминированный генератор закрытых
 * нарядов за ~2 года. Заменяется ответом `GET /analytics` — форма `MockOrder`
 * намеренно повторяет то, что отдаст сервер (суммы строк уже после всех скидок).
 */

export interface MockLabor {
  name: string;
  hours: number;
  /** Сумма строки после скидки строки и доли скидки наряда. */
  net: number;
}

export interface MockPart {
  id: string;
  name: string;
  manufacturer: string;
  qty: number;
  unit: 'шт' | 'л';
  /** Продажа, после всех скидок. */
  net: number;
  /** Закупка на всю строку. `null` — владелец ещё не указал. */
  cost: number | null;
}

export interface MockOrder {
  id: string;
  docNumber: number;
  closedAt: Date;
  client: string;
  vehicle: string;
  labor: MockLabor[];
  parts: MockPart[];
  /** Сколько всего скидок дано по наряду (уже вычтено из net). */
  discount: number;
}

interface PartSpec {
  name: string;
  manufacturer: string;
  qty: number;
  unit?: 'шт' | 'л';
  price: number;
  cost: number;
}
interface JobSpec {
  name: string;
  hours: number;
  weight: number;
  /** Отклонение фиксированной цены работы от «часы × ставка» (price_override). */
  k?: number;
  parts: PartSpec[];
}

const RATE = 2500;

const JOBS: JobSpec[] = [
  { name: 'Замена масла ДВС', k: 0.9, hours: 0.8, weight: 10, parts: [
    { name: 'Масло моторное 5W-30', manufacturer: 'Motul', qty: 5, unit: 'л', price: 1450, cost: 980 },
    { name: 'Фильтр масляный', manufacturer: 'Mann', qty: 1, price: 950, cost: 520 },
  ] },
  { name: 'Компьютерная диагностика', k: 0.8, hours: 1, weight: 8, parts: [] },
  { name: 'Замена передних тормозных колодок', hours: 1.2, weight: 6, parts: [
    { name: 'Колодки тормозные передние', manufacturer: 'Textar', qty: 1, price: 7800, cost: 5200 },
    { name: 'Датчик износа колодок', manufacturer: 'Bosch', qty: 1, price: 1600, cost: 900 },
  ] },
  { name: 'Замена тормозных дисков и колодок', hours: 2, weight: 4, parts: [
    { name: 'Диск тормозной передний', manufacturer: 'Zimmermann', qty: 2, price: 6900, cost: 4700 },
    { name: 'Колодки тормозные передние', manufacturer: 'Textar', qty: 1, price: 7800, cost: 5200 },
  ] },
  { name: 'Замена свечей зажигания', hours: 0.8, weight: 5, parts: [
    { name: 'Свеча зажигания', manufacturer: 'NGK', qty: 4, price: 1250, cost: 760 },
  ] },
  { name: 'Замена цепи ГРМ', k: 1.18, hours: 8, weight: 2, parts: [
    { name: 'Комплект цепи ГРМ', manufacturer: 'Febi', qty: 1, price: 28500, cost: 19800 },
    { name: 'Сальник коленвала', manufacturer: 'Elring', qty: 1, price: 1200, cost: 600 },
  ] },
  { name: 'Замена помпы и термостата', hours: 4.5, weight: 3, parts: [
    { name: 'Помпа охлаждения', manufacturer: 'Pierburg', qty: 1, price: 14200, cost: 9900 },
    { name: 'Термостат', manufacturer: 'Mahle', qty: 1, price: 9800, cost: 6400 },
    { name: 'Антифриз', manufacturer: 'BMW', qty: 3, unit: 'л', price: 900, cost: 610 },
  ] },
  { name: 'Замена сцепления', k: 1.1, hours: 7, weight: 1.5, parts: [
    { name: 'Комплект сцепления', manufacturer: 'LuK', qty: 1, price: 46000, cost: 34500 },
  ] },
  { name: 'Обслуживание АКПП', hours: 2.5, weight: 3, parts: [
    { name: 'Масло ATF', manufacturer: 'ZF', qty: 7, unit: 'л', price: 2100, cost: 1500 },
    { name: 'Поддон-фильтр АКПП', manufacturer: 'ZF', qty: 1, price: 12500, cost: 8800 },
  ] },
  { name: 'Развал-схождение', k: 1.3, hours: 1.2, weight: 5, parts: [] },
  { name: 'Замена передних рычагов', hours: 3, weight: 3, parts: [
    { name: 'Рычаг передний', manufacturer: 'Lemförder', qty: 2, price: 11800, cost: 8100 },
  ] },
  { name: 'Замена клапанной крышки', hours: 2.2, weight: 3, parts: [
    { name: 'Крышка клапанная', manufacturer: 'Elring', qty: 1, price: 23900, cost: 15300 },
  ] },
  { name: 'Замена турбокомпрессора', k: 1.12, hours: 6, weight: 0.7, parts: [
    { name: 'Турбокомпрессор', manufacturer: 'BorgWarner', qty: 1, price: 98000, cost: 79000 },
  ] },
  { name: 'Заправка кондиционера', k: 1.45, hours: 0.8, weight: 3, parts: [
    { name: 'Хладагент R134a', manufacturer: 'Chemours', qty: 1, price: 1800, cost: 700 },
  ] },
];

const VEHICLES: [string, number][] = [
  ['MINI Cooper S · R56', 9],
  ['MINI Cooper · F56', 7],
  ['MINI Countryman · R60', 6],
  ['MINI Countryman · F60', 4],
  ['MINI Clubman · R55', 3],
  ['MINI Clubman · F54', 2],
  ['BMW 1 · F20', 2],
  ['BMW 3 · F30', 1.5],
  ['Volkswagen Golf', 1],
  ['Audi A3', 0.8],
];

const SURNAMES = [
  'Васильев', 'Гарипов', 'Нуриев', 'Соколов', 'Хайруллин', 'Петров', 'Ахметов', 'Зайцев',
  'Мухаметшин', 'Орлов', 'Сафин', 'Кузнецов', 'Галиев', 'Морозов', 'Валиев', 'Егоров',
  'Шакиров', 'Никитин', 'Закиров', 'Фёдоров', 'Каримов', 'Белов', 'Юсупов', 'Тихонов',
];
const INITIALS = ['А. Р.', 'Д. И.', 'М. С.', 'Т. Н.', 'Р. Ф.', 'Е. В.'];

interface ClientSpec {
  name: string;
  vehicle: string;
  /** Постоянные клиенты приезжают чаще. */
  weight: number;
}

function buildClients(rnd: () => number): ClientSpec[] {
  const out: ClientSpec[] = [];
  for (let i = 0; i < 84; i++) {
    out.push({
      name: `${SURNAMES[i % SURNAMES.length]} ${INITIALS[Math.floor(i / SURNAMES.length + i) % INITIALS.length]}`,
      vehicle: pick(rnd, VEHICLES, (v) => v[1])[0],
      weight: rnd() < 0.2 ? 4 : 1,
    });
  }
  return out;
}

/** mulberry32 — маленький детерминированный PRNG, чтобы цифры не прыгали между рендерами. */
function prng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rnd: () => number, items: T[], weight: (t: T) => number): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = rnd() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function generateOrders(now = new Date()): MockOrder[] {
  const rnd = prng(20261112);
  const out: MockOrder[] = [];
  const clients = buildClients(rnd);
  const DAYS = 800;
  let doc = 1040;
  let partSeq = 0;

  for (let back = DAYS; back >= 0; back--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    if (day.getDay() === 0) continue; // воскресенье — выходной
    // лёгкий рост год к году + сезонность (весна и осень плотнее)
    const season = 1 + 0.22 * Math.cos(((day.getMonth() - 3) / 6) * Math.PI * 2);
    const growth = 0.85 + 0.3 * (1 - back / DAYS);
    const load = season * growth * (day.getDay() === 6 ? 0.6 : 1);
    const r = rnd();
    const count = r < 0.16 / load ? 0 : r < 0.55 / load ? 1 : r < 0.88 / load ? 2 : 3;

    for (let k = 0; k < count; k++) {
      const hour = 10 + Math.floor(rnd() * 9);
      const closedAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, Math.floor(rnd() * 60));
      if (closedAt > now) continue;

      const client = pick(rnd, clients, (c) => c.weight);
      const jobCount = rnd() < 0.55 ? 1 : rnd() < 0.8 ? 2 : 3;
      const jobs = new Set<JobSpec>();
      while (jobs.size < jobCount) jobs.add(pick(rnd, JOBS, (j) => j.weight));

      const discountPct = rnd() < 0.16 ? (rnd() < 0.6 ? 5 : 10) : 0;
      const k1 = 1 - discountPct / 100;
      let gross = 0;
      const labor: MockLabor[] = [];
      const parts: MockPart[] = [];
      // Свежие наряды владелец чаще не успел дозаполнить.
      const missChance = back < 21 ? 0.3 : 0.05;

      for (const job of jobs) {
        const hours = round2(job.hours * (0.9 + rnd() * 0.3));
        const g = round2(job.hours * RATE * (job.k ?? 1));
        gross += g;
        labor.push({ name: job.name, hours, net: round2(g * k1) });
        for (const p of job.parts) {
          const jitter = 0.94 + rnd() * 0.14;
          const pg = round2(p.qty * p.price * jitter);
          gross += pg;
          parts.push({
            id: `p${++partSeq}`,
            name: p.name,
            manufacturer: p.manufacturer,
            qty: p.qty,
            unit: p.unit ?? 'шт',
            net: round2(pg * k1),
            cost: rnd() < missChance ? null : round2(p.qty * p.cost * (0.96 + rnd() * 0.1)),
          });
        }
      }

      out.push({
        id: `wo${doc}`,
        docNumber: doc++,
        closedAt,
        client: client.name,
        vehicle: client.vehicle,
        labor,
        parts,
        discount: round2(gross * (1 - k1)),
      });
    }
  }
  return out;
}
