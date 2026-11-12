#!/usr/bin/env node
// AC-11: сквозная проверка закупочной цены и аналитики на живой БД.
// Запуск: API_URL=http://localhost:3000/api DATABASE_URL=postgres://... node scripts/verify-analytics.mjs
// Требует запущенный backend (владелец owner/owner) и psql в PATH. Выходит с кодом 1 на первой ошибке.
// ТОЛЬКО dev-база: скрипт создаёт и закрывает наряд, пользователей, запчасть, шаблон работ.
// Запускается лишь с ALLOW_DESTRUCTIVE_CHECK=1; в конце (даже при падении) деактивирует созданное.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const DB = process.env.DATABASE_URL ?? 'postgres://crm:crm@localhost:5432/tatarin_crm';
const OWNER_LOGIN = process.env.OWNER_LOGIN ?? 'owner';
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? 'owner';

if (process.env.ALLOW_DESTRUCTIVE_CHECK !== '1') {
  console.error('Отказ: скрипт создаёт тестовые данные (наряд, пользователи, запчасть, шаблон работ) и закрывает наряд.\n' +
    'Запускайте только на dev-базе, явно задав ALLOW_DESTRUCTIVE_CHECK=1.');
  process.exit(2);
}

const run = Date.now().toString(36);

const sql = (q) => execFileSync('psql', [DB, '-At', '-c', q], { encoding: 'utf8' }).trim();

async function call(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* не JSON */ }
  return { status: res.status, json, text };
}

async function login(login, password) {
  const r = await call(null, 'POST', '/auth/login', { login, password });
  assert.equal(r.status, 201, `login ${login}: ${r.status} ${r.text}`);
  return r.json.access_token;
}

async function step(n, title, fn) {
  try {
    await fn();
    console.log(`PASS ${n}. ${title}`);
  } catch (e) {
    console.log(`FAIL ${n}. ${title}\n     ${e.message}`);
    failed = true;
    throw e;
  }
}

const ok = (r, status) => assert.equal(r.status, status, `HTTP ${r.status}: ${r.text}`);
const noCost = (v) => assert.ok(!JSON.stringify(v).includes('purchase_price'), 'в ответе есть purchase_price');

let failed = false;
const owner = await login(OWNER_LOGIN, OWNER_PASSWORD);
let rcpt, master, wo, lineId, copyId, tplId, partId, frozen, baseline;
const userIds = [];
let attached = false;

try {
  // Подготовка: приёмщик, мастер, клиент, ТС, наряд мастера.
  for (const [lg, role] of [[`rcpt_${run}`, 'master_receptionist'], [`mstr_${run}`, 'master']]) {
    const u = await call(owner, 'POST', '/users', { name: lg, login: lg, password: 'pass1234', role });
    assert.equal(u.status, 201, `users: ${u.text}`);
    userIds.push(u.json.id);
  }
  rcpt = await login(`rcpt_${run}`, 'pass1234');
  master = await login(`mstr_${run}`, 'pass1234');
  const client = await call(owner, 'POST', '/clients', { full_name: `Проверка ${run}`, phone: `+7999${String(Date.now()).slice(-7)}` });
  ok(client, 201);
  const veh = await call(owner, 'POST', '/vehicles', { client_id: client.json.id, make: 'MINI', model: 'Cooper', plate: `A${run}`.slice(0, 8) });
  ok(veh, 201);
  const wor = await call(master, 'POST', '/work-orders', { vehicle_id: veh.json.id });
  ok(wor, 201);
  wo = wor.json.id;

  await step(1, 'owner: POST /part-templates → purchase_price 520', async () => {
    const r = await call(owner, 'POST', '/part-templates', { name: `Фильтр ${run}`, default_price: 900, purchase_price: 520 });
    ok(r, 201);
    assert.equal(r.json.purchase_price, 520);
    partId = r.json.id;
  });

  await step(2, 'приёмщик: GET /part-templates без purchase_price', async () => {
    const r = await call(rcpt, 'GET', '/part-templates?all=true');
    ok(r, 200);
    assert.ok(r.json.length > 0);
    noCost(r.json);
  });

  await step(3, 'приёмщик: PATCH name → 200, закупка в БД 520.00', async () => {
    const r = await call(rcpt, 'PATCH', `/part-templates/${partId}`, { name: 'Фильтр масляный' });
    ok(r, 200);
    assert.equal(sql(`select purchase_price from part_templates where id='${partId}'`), '520.00');
  });

  await step(4, 'приёмщик: PATCH purchase_price → 403', async () => {
    ok(await call(rcpt, 'PATCH', `/part-templates/${partId}`, { purchase_price: 1 }), 403);
  });

  await step(5, 'мастер: запчасть в наряд → нет purchase_price в ответе, в БД 520.00', async () => {
    const r = await call(master, 'POST', `/work-orders/${wo}/parts`, {
      name: 'Фильтр масляный', unit_price: 900, qty: 1, part_template_id: partId,
    });
    assert.ok(r.status === 201 || r.status === 200, `HTTP ${r.status}: ${r.text}`);
    noCost(r.json);
    const g = await call(master, 'GET', `/work-orders/${wo}`);
    ok(g, 200);
    noCost(g.json);
    lineId = sql(`select id from part_lines where work_order_id='${wo}'`);
    assert.ok(lineId, 'строка не найдена');
    assert.equal(sql(`select purchase_price from part_lines where id='${lineId}'`), '520.00');
  });

  await step(6, 'мастер: PATCH qty=2 → закупка в БД всё ещё 520.00', async () => {
    const r = await call(master, 'PATCH', `/work-orders/${wo}/parts/${lineId}`, { qty: 2 });
    ok(r, 200);
    assert.equal(sql(`select qty from part_lines where id='${lineId}'`), '2.000');
    assert.equal(sql(`select purchase_price from part_lines where id='${lineId}'`), '520.00');
  });

  await step(7, 'owner: наряд, template-preview, /price-list/:tpl/parts без purchase_price', async () => {
    const tpl = await call(owner, 'POST', '/task-templates', { name: `Проверка ${run}`, default_hours: 1 });
    assert.ok(tpl.status < 300, `template: ${tpl.status} ${tpl.text}`);
    tplId = tpl.json.id;
    const att = await call(owner, 'PUT', `/price-list/${tplId}/parts/${partId}`, { is_default: true });
    assert.ok(att.status < 300, `attach: ${att.status} ${att.text}`);
    attached = true;
    const a = await call(owner, 'GET', `/work-orders/${wo}`);
    ok(a, 200); noCost(a.json);
    const p = await call(owner, 'GET', `/work-orders/${wo}/template-preview?template_id=${tplId}`);
    ok(p, 200); noCost(p.json);
    assert.ok(JSON.stringify(p.json).includes(partId), 'запчасть не попала в preview — проверка пуста');
    const l = await call(owner, 'GET', `/price-list/${tplId}/parts`);
    ok(l, 200); noCost(l.json);
    assert.ok(JSON.stringify(l.json).includes(partId), 'запчасть не попала в список связок — проверка пуста');
  });

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const nextStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  const summaryPath = `/analytics/summary?edges=${monthStart},${nextStart}`;

  const summaryTotals = async () => {
    const r = await call(owner, 'GET', summaryPath);
    ok(r, 200);
    return r.json.totals;
  };

  await step(8, 'owner: close → summary: orders +1, parts_cost +1040, unknown_count +0', async () => {
    baseline = await summaryTotals();
    ok(await call(owner, 'POST', `/work-orders/${wo}/close`), 201);
    const t = await summaryTotals();
    assert.equal(t.orders - baseline.orders, 1, JSON.stringify({ baseline, t }));
    assert.equal(t.parts_cost - baseline.parts_cost, 1040, JSON.stringify({ baseline, t }));
    assert.equal(t.unknown_count - baseline.unknown_count, 0, JSON.stringify({ baseline, t }));
    frozen = sql(`select total_frozen from work_orders where id='${wo}'`);
  });

  await step(9, 'owner: duplicate → у строки копии purchase_price 520.00', async () => {
    const r = await call(owner, 'POST', `/work-orders/${wo}/duplicate`, {});
    assert.ok(r.status === 201 || r.status === 200, `HTTP ${r.status}: ${r.text}`);
    copyId = r.json.id;
    assert.equal(sql(`select purchase_price from part_lines where work_order_id='${copyId}'`), '520.00');
  });

  await step(10, 'owner: PATCH /analytics/part-costs по закрытому → {updated:1}, total_frozen прежний', async () => {
    const r = await call(owner, 'PATCH', '/analytics/part-costs', { items: [{ part_line_id: lineId, purchase_price: 600 }] });
    ok(r, 200);
    assert.deepEqual(r.json, { updated: 1 });
    assert.equal(sql(`select purchase_price from part_lines where id='${lineId}'`), '600.00');
    assert.equal(sql(`select total_frozen from work_orders where id='${wo}'`), frozen);
  });

  await step(11, 'приёмщик и мастер: GET /analytics/summary → 403', async () => {
    ok(await call(rcpt, 'GET', summaryPath), 403);
    ok(await call(master, 'GET', summaryPath), 403);
  });

  await step(12, 'owner: edges по убыванию → 400', async () => {
    ok(await call(owner, 'GET', '/analytics/summary?edges=2026-12-01T00:00:00Z,2026-11-01T00:00:00Z'), 400);
  });

  await step(13, 'owner: closed → done, summary вернулся к baseline', async () => {
    ok(await call(owner, 'PATCH', `/work-orders/${wo}/status`, { status: 'done' }), 200);
    const t = await summaryTotals();
    assert.equal(t.orders, baseline.orders, JSON.stringify({ baseline, t }));
    assert.equal(t.parts_cost, baseline.parts_cost, JSON.stringify({ baseline, t }));
    assert.equal(t.unknown_count, baseline.unknown_count, JSON.stringify({ baseline, t }));
  });
  console.log('ALL PASS (13/13)');
} catch (e) {
  if (!failed) console.log(`FAIL (подготовка)\n     ${e.message}`);
  process.exitCode = 1;
} finally {
  // Уборка и при успехе, и при падении; её ошибки печатаются, но не маскируют исходное падение.
  const cleanup = async (what, fn) => {
    try { await fn(); } catch (e) { console.error(`CLEANUP FAIL: ${what}: ${e.message}`); }
  };
  const expectOk = (r, what) => { if (r.status >= 300) throw new Error(`${what}: HTTP ${r.status} ${r.text}`); };
  if (attached) {
    await cleanup('отвязка запчасти от шаблона', async () =>
      expectOk(await call(owner, 'DELETE', `/price-list/${tplId}/parts/${partId}`), 'detach'));
  }
  if (tplId) {
    await cleanup('деактивация шаблона работ', async () =>
      expectOk(await call(owner, 'DELETE', `/task-templates/${tplId}`), 'template'));
  }
  if (partId) {
    await cleanup('деактивация запчасти каталога', async () =>
      expectOk(await call(owner, 'DELETE', `/part-templates/${partId}`), 'part'));
  }
  for (const id of userIds) {
    await cleanup(`деактивация пользователя ${id}`, async () =>
      expectOk(await call(owner, 'PATCH', `/users/${id}`, { is_active: false }), 'user'));
  }
}
