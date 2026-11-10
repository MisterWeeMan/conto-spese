// Run with: node --test   (made-up data only, never the real ledger)
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

test('parseAmount accepts Italian and dotted decimals, rejects non-positive', () => {
  assert.strictEqual(L.parseAmount('1.234,56'), 1234.56);
  assert.strictEqual(L.parseAmount('12.5'), 12.5);
  assert.strictEqual(L.parseAmount('7,05 €'), 7.05);
  assert.strictEqual(L.parseAmount('abc'), null);
  assert.strictEqual(L.parseAmount('0'), null);
});

test('movs skips deleted movements', () => {
  const mesi = {'2026-01': {a: {d: '2026-01-05', u: 10}, b: {d: '2026-01-06', u: 5, x: 1}}};
  assert.deepStrictEqual(L.movs(mesi, '2026-01').map(m => m.id), ['a']);
});

test('calcola carries the unspent budget over to the next months', () => {
  const mesi = {
    '2026-01': {a: {d: '2026-01-05', u: 62.69, c: 'Abbonamenti'}},
    '2026-02': {b: {d: '2026-02-03', u: 10, c: 'Abbonamenti'}, t: {d: '2026-02-04', u: 500, c: ''}, s: {d: '2026-02-09', e: 2000, c: 'Stipendio'}}
  };
  const cfg = {budget: {Abbonamenti: 480}, gruppi: {Abbonamenti: 'Spese fisse'}};
  const gen = L.calcola(mesi, cfg, '2026-01').righe[0];
  assert.ok(Math.abs(gen.residuo - (40 - 62.69)) < 0.005);
  const feb = L.calcola(mesi, cfg, '2026-02');
  assert.ok(Math.abs(feb.righe[0].residuo - (80 - 72.69)) < 0.005); // 2 months of budget minus spent since January
  assert.ok(Math.abs(feb.righe[0].disp - (80 - 62.69)) < 0.005);    // available this month
  assert.ok(!('g' in feb.righe[0])); // groups are gone: the old stored gruppi field is ignored
  assert.strictEqual(feb.usc, 10);   // the transfer without category is left out
  assert.strictEqual(feb.ent, 2000);
  assert.deepStrictEqual(feb.senza, [['Stipendio', 2000]]);
});

test('categorie merges configured, budgeted and used categories, counting live movements overall and in the given year', () => {
  const mesi = {
    '2025-12': {z: {d: '2025-12-01', u: 1, c: 'Bar'}},
    '2026-01': {a: {d: '2026-01-05', u: 10, c: 'Bar'}, b: {d: '2026-01-06', u: 5, c: 'Bar', x: 1}, t: {d: '2026-01-07', u: 50, c: ''}},
    '2026-02': {c: {d: '2026-02-01', u: 3, c: 'Bar'}}
  };
  const cfg = {categorie: ['Zoo'], budget: {Affitto: 1200, Vecchia: 0}, gruppi: {Affitto: 'Spese fisse'}, colori: {Bar: '#aa3300'}};
  assert.deepStrictEqual(L.categorie(mesi, cfg, '2026'), [
    {c: 'Affitto', n: 0, anno: 0},
    {c: 'Bar', n: 3, anno: 2},
    {c: 'Zoo', n: 0, anno: 0}
  ]);
});

test('rinomina patches only the live movements of that category', () => {
  const mesi = {
    '2026-01': {a: {d: '2026-01-05', u: 10, c: 'Bar'}, b: {d: '2026-01-06', u: 5, c: 'Bar', x: 1}, o: {d: '2026-01-07', u: 1, c: 'Cibo'}},
    '2026-02': {c: {d: '2026-02-01', u: 3, c: 'Cibo'}}
  };
  assert.deepStrictEqual(L.rinomina(mesi, 'Bar', 'Caffè'), {'2026-01': {a: {c: 'Caffè'}}});
});

test('calcola does not carry over across years', () => {
  const mesi = {'2025-12': {a: {d: '2025-12-05', u: 999, c: 'Bar'}}};
  assert.strictEqual(L.calcola(mesi, {budget: {Bar: 120}}, '2026-01').righe[0].residuo, 10);
});
