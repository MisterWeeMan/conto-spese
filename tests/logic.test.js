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
  assert.strictEqual(feb.righe[0].g, 'Spese fisse');
  assert.strictEqual(feb.usc, 10);   // the transfer without category is left out
  assert.strictEqual(feb.ent, 2000);
  assert.deepStrictEqual(feb.senza, [['Stipendio', 2000]]);
});

test('calcola does not carry over across years', () => {
  const mesi = {'2025-12': {a: {d: '2025-12-05', u: 999, c: 'Bar'}}};
  assert.strictEqual(L.calcola(mesi, {budget: {Bar: 120}}, '2026-01').righe[0].residuo, 10);
});
