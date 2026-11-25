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

test('mia: a Joint expense counts only my share', () => {
  assert.strictEqual(L.mia({d: '2026-03-01', u: 100, p: 56, q: 56, c: 'Bollette', k: 'Joint'}), 56);
});

test('mia: old movements, transfers, top-ups and credits', () => {
  assert.strictEqual(L.mia({d: '2026-03-01', u: 12.5}), 12.5);          // no new fields: same as before
  assert.strictEqual(L.mia({d: '2026-03-01', e: 30}), 30);              // income
  assert.strictEqual(L.mia({d: '2026-03-01', u: 200, k: 'A', a: 'B', t: 'g'}), 0);
  assert.strictEqual(L.mia({d: '2026-03-01', e: 150, k: 'Joint', t: 'vj'}), 0);
  assert.strictEqual(L.mia({d: '2026-03-01', u: 40, t: 'cr'}), 0);
});

test('credito is what others owe on a split expense', () => {
  assert.strictEqual(L.credito({d: '2026-03-01', u: 90, p: 30}), 60);
  assert.strictEqual(L.credito({d: '2026-03-01', u: 90}), 0);
  assert.strictEqual(L.credito({d: '2026-03-01', e: 50}), 0);
});

test('movs keeps the optional fields p, q, l, a, t untouched', () => {
  const mesi = {'2026-03': {a: {d: '2026-03-01', u: 100, p: 56, q: 56, l: ['x', 'y'], a: 'B', t: 'g'}}};
  assert.deepStrictEqual(L.movs(mesi, '2026-03')[0], {id: 'a', d: '2026-03-01', u: 100, p: 56, q: 56, l: ['x', 'y'], a: 'B', t: 'g'});
});

test('mia and credito: p of zero means everything is credit', () => {
  assert.strictEqual(L.mia({d: '2026-03-01', u: 50, p: 0}), 0);
  assert.strictEqual(L.credito({d: '2026-03-01', u: 50, p: 0}), 50);
});

test('credito is rounded to cents and never negative', () => {
  assert.strictEqual(L.credito({d: '2026-03-01', u: 100, p: 56.1}), 43.9);
  assert.strictEqual(L.credito({d: '2026-03-01', u: 50, p: 80}), 0);
});

test('quotaJoint picks the latest share that started on or before the date', () => {
  const cfg = {quotaJoint: [{da: '2026-06-01', pct: 60}, {da: '2025-01-01', pct: 56}, {da: '2027-01-01', pct: 50}]};
  assert.strictEqual(L.quotaJoint(cfg, '2025-12-31'), 56);
  assert.strictEqual(L.quotaJoint(cfg, '2026-06-01'), 60);
  assert.strictEqual(L.quotaJoint(cfg, '2026-12-31'), 60);
  assert.strictEqual(L.quotaJoint(cfg, '2027-01-01'), 50);
  assert.strictEqual(L.quotaJoint(cfg, '2024-12-31'), null);
  assert.strictEqual(L.quotaJoint({}, '2026-01-01'), null);
});

test('contiAttivi leaves out closed accounts', () => {
  const cfg = {conti: [{nome: 'A'}, {nome: 'Old', chiuso: true}, {nome: 'B', chiuso: false}]};
  assert.deepStrictEqual(L.contiAttivi(cfg).map(c => c.nome), ['A', 'B']);
  assert.deepStrictEqual(L.contiAttivi({}), []);
});

test('categorieAttive leaves out archived categories and keeps the group', () => {
  const cfg = {categorie: [{nome: 'Spesa', gruppo: 'Necessarie'}, {nome: 'Viaggio Jap', gruppo: 'Viaggi', archiviata: true}]};
  assert.deepStrictEqual(L.categorieAttive(cfg), [{nome: 'Spesa', gruppo: 'Necessarie'}]);
  assert.deepStrictEqual(L.categorieAttive({}), []);
});

test('saldi: a one-row transfer moves only the two account balances', () => {
  const mesi = {'2026-03': {
    a: {d: '2026-03-01', e: 1000, c: 'Stipendio', k: 'Banca'},
    b: {d: '2026-03-02', u: 30, c: 'Spesa', k: 'Banca'},
    g: {d: '2026-03-03', u: 200, k: 'Banca', a: 'Cassa', t: 'g'}
  }};
  assert.deepStrictEqual(L.saldi(mesi), {Banca: 770, Cassa: 200});
});

test('saldi: the old two-row transfer reads as before; deleted rows are ignored', () => {
  const mesi = {'2026-03': {
    o: {d: '2026-03-03', u: 50, k: 'Banca'},
    i: {d: '2026-03-03', e: 50, k: 'Cassa'},
    x: {d: '2026-03-04', u: 99, k: 'Cassa', x: 1}
  }};
  assert.deepStrictEqual(L.saldi(mesi), {Banca: -50, Cassa: 50});
});

test('calcola leaves a transfer out of every total, even with a category by mistake', () => {
  const mesi = {'2026-03': {g: {d: '2026-03-03', u: 200, k: 'Banca', a: 'Cassa', t: 'g', c: 'Spesa'}}};
  const r = L.calcola(mesi, {budget: {Spesa: 120}}, '2026-03');
  assert.strictEqual(r.usc, 0);
  assert.ok(r.righe[0].speso === 0); // === so that -0 passes
  assert.deepStrictEqual(r.senza, []);
});

test('quotaMov: a Joint expense keeps u whole and gets p and q from the share in force on its date', () => {
  const cfg = {quotaJoint: [{da: '2025-01-01', pct: 56}, {da: '2027-01-01', pct: 50}]};
  assert.deepStrictEqual(L.quotaMov(cfg, {d: '2026-03-01', u: 100, k: 'Revolut Joint'}), {p: 56, q: 56});
  assert.deepStrictEqual(L.quotaMov(cfg, {d: '2027-03-01', u: 100, k: 'Revolut Joint'}), {p: 50, q: 50});
  assert.deepStrictEqual(L.quotaMov(cfg, {d: '2026-03-01', u: 33.33, k: 'Joint'}), {p: 18.66, q: 56}); // rounded to the cent
});

test('quotaMov: nothing to apply for other accounts, income, transfers or no share in force', () => {
  const cfg = {quotaJoint: [{da: '2025-01-01', pct: 56}]};
  assert.strictEqual(L.quotaMov(cfg, {d: '2026-03-01', u: 100, k: 'Revolut'}), null);
  assert.strictEqual(L.quotaMov(cfg, {d: '2026-03-01', e: 100, k: 'Joint'}), null);
  assert.strictEqual(L.quotaMov(cfg, {d: '2026-03-01', u: 100, k: 'Joint', t: 'g', a: 'Revolut'}), null);
  assert.strictEqual(L.quotaMov(cfg, {d: '2024-03-01', u: 100, k: 'Joint'}), null);
});

test('mia: a refund (rb) is not my income', () => {
  assert.strictEqual(L.mia({t: 'rb', e: 20, r: 'a1'}), 0);
});

const split = {
  '2027-01': {a1: {d: '2027-01-05', u: 60, p: 20, c: 'Cena', k: 'Cash'}, a2: {d: '2027-01-06', u: 30, c: 'Cena', k: 'Cash'}},
  '2027-02': {b1: {d: '2027-02-02', e: 40, t: 'rb', r: 'a1', c: 'Cena', k: 'Cash'}, b2: {d: '2027-02-03', u: 50, p: 10, c: 'Cena', k: 'Cash'}}
};

test('creditiAperti lists split expenses not yet refunded, with the amount still owed', () => {
  const r = L.creditiAperti(split);
  assert.deepStrictEqual(r.map(x => [x.id, x.residuo]), [['b2', 40]]);
});

test('creditiAperti: a refund closes the whole credit, whatever its amount', () => {
  const m = JSON.parse(JSON.stringify(split));
  m['2027-02'].b1.e = 5;
  assert.deepStrictEqual(L.creditiAperti(m).map(x => x.id), ['b2']);
});

test('creditiAperti: a deleted refund reopens the credit, a deleted expense is not listed', () => {
  const m = JSON.parse(JSON.stringify(split));
  m['2027-02'].b1.x = 1; m['2027-02'].b2.x = 1;
  assert.deepStrictEqual(L.creditiAperti(m).map(x => x.id), ['a1']);
});

test('calcola leaves refunds out of the month totals', () => {
  const r = L.calcola(split, {budget: {Cena: 1200}}, '2027-02');
  assert.strictEqual(r.ent, 0);
});

const lab = {'2027-03': {
  a: {d: '2027-03-01', u: 10, c: 'Cena', k: 'Revolut', l: ['TCG', 'Torneo']},
  b: {d: '2027-03-02', u: 5, c: 'Cena', k: 'Revolut', l: ['tcg']},
  c: {d: '2027-03-03', u: 7, c: 'Cena', k: 'Revolut'},
  d: {d: '2027-03-04', u: 9, c: 'Cena', k: 'Revolut', l: ['Vecchia'], x: 1},
  j: {d: '2027-03-05', e: 100, k: 'Revolut Joint', t: 'vj'},
}};

test('parseEtichette splits on commas, trims, drops empties and repeats', () => {
  assert.deepStrictEqual(L.parseEtichette(' TCG, Torneo ,, tcg ,'), ['TCG', 'Torneo']);
  assert.deepStrictEqual(L.parseEtichette(''), []);
});

test('etichette lists the labels in use with their count, ignoring case and deleted movements', () => {
  assert.deepStrictEqual(L.etichette(lab), [{l: 'TCG', n: 2}, {l: 'Torneo', n: 1}]);
});

test('conEtichetta keeps the movements that carry the label, ignoring case', () => {
  const r = L.conEtichetta(L.movs(lab, '2027-03'), 'tcg');
  assert.deepStrictEqual(r.map(m => m.id), ['a', 'b']);
});

test('a partner top-up lands only in the Joint balance, not in the totals', () => {
  assert.strictEqual(L.saldi(lab)['Revolut Joint'], 100);
  const r = L.calcola(lab, {budget: {Cena: 1200}}, '2027-03');
  assert.strictEqual(r.ent, 0);
  assert.strictEqual(L.mia(lab['2027-03'].j), 0);
  // even with a category by mistake it stays out
  const m = {'2027-03': {j: {d: '2027-03-05', e: 100, c: 'Cena', k: 'Revolut Joint', t: 'vj'}}};
  assert.strictEqual(L.calcola(m, {budget: {Cena: 1200}}, '2027-03').ent, 0);
});

test('mia: an extra income (x2) is not mine', () => {
  assert.strictEqual(L.mia({t: 'x2', e: 500}), 0);
});

const cfgMese = {categorie: [
  {nome: 'Affitto', gruppo: 'Necessarie', budget: 100, joint: true},
  {nome: 'Svago', gruppo: 'Extra', budget: 50},
  {nome: 'Vecchia', gruppo: 'Extra', budget: 30, archiviata: true},
  {nome: 'TCG', gruppo: 'Extra'},
]};
const mesiMese = {
  '2027-03': {
    a: {d: '2027-03-01', u: 100, p: 56, q: 56, c: 'Affitto', k: 'Joint'},
    b: {d: '2027-03-02', u: 20, c: 'Svago'},
    c: {d: '2027-03-03', u: 10, c: 'Svago', x: 1},                    // deleted
    d: {d: '2027-03-04', u: 200, k: 'A', a: 'B', t: 'g'},             // transfer
    e: {d: '2027-03-05', e: 150, k: 'Joint', t: 'vj'},                // partner top-up
    f: {d: '2027-03-06', e: 500, c: 'Svago', t: 'x2'},                // extra income
    g: {d: '2027-03-07', e: 20, c: 'Svago', t: 'rb', r: 'zz'},        // refund
    h: {d: '2027-03-08', u: 12, c: 'TCG'},
    i: {d: '2027-03-09', u: 60, p: 20, c: 'Svago'},                   // split: 40 is credit
  },
  '2027-02': {j: {d: '2027-02-10', u: 90, c: 'Svago'}},               // other month: no carry-over
};

test('meseCalc: monthly budget, no carry-over, only my share', () => {
  const r = L.meseCalc(mesiMese, cfgMese, '2027-03');
  assert.deepStrictEqual(r.righe.map(x => x.c), ['Affitto', 'Svago']); // archived and no-budget out
  assert.deepStrictEqual(r.righe[0], {c: 'Affitto', gruppo: 'Necessarie', budget: 100, speso: 56, residuo: 44, pct: 0.56});
  assert.deepStrictEqual(r.righe[1], {c: 'Svago', gruppo: 'Extra', budget: 50, speso: 40, residuo: 10, pct: 0.8});
});

test('meseCalc: spendibile is the sum of residuals, an overspent budget counts negative', () => {
  assert.strictEqual(L.meseCalc(mesiMese, cfgMese, '2027-03').spendibile, 54);
  const over = {'2027-03': {a: {d: '2027-03-01', u: 70, c: 'Svago'}}};
  assert.strictEqual(L.meseCalc(over, cfgMese, '2027-03').spendibile, 100 - 20);
});

test('meseCalc: categories without budget are listed apart', () => {
  assert.deepStrictEqual(L.meseCalc(mesiMese, cfgMese, '2027-03').senza, [{c: 'TCG', speso: 12}]);
});

test('meseCalc: empty month', () => {
  const r = L.meseCalc({}, cfgMese, '2027-04');
  assert.strictEqual(r.spendibile, 150);
  assert.deepStrictEqual(r.senza, []);
});

test('meseCalc: an old-style income with a category lowers its speso', () => {
  const r = L.meseCalc({'2027-03': {a: {d: '2027-03-01', u: 30, c: 'Svago'}, b: {d: '2027-03-02', e: 10, c: 'Svago'}}}, cfgMese, '2027-03');
  assert.strictEqual(r.righe[1].speso, 20);
});

// soglieSuperate: thresholds newly crossed by a movement (made-up data, budget 100)
const cfgSoglie = {categorie: [{nome: 'Svago', gruppo: 'Extra', budget: 100}, {nome: 'Libero', gruppo: 'Extra'}]};
const mm = (u, c) => ({'2027-03': {a: {d: '2027-03-01', u, c: c || 'Svago'}}});
const sup = (prima, dopo, cfg) => L.soglieSuperate(prima, dopo, cfg || cfgSoglie, '2027-03');

test('soglieSuperate: 79% to 81% warns 80; already past 80 stays quiet', () => {
  assert.deepStrictEqual(sup(mm(79), mm(81)), [{c: 'Svago', soglia: 80, pct: 0.81}]);
  assert.deepStrictEqual(sup(mm(81), mm(85)), []);
});

test('soglieSuperate: reaching a threshold counts; 70% to 110% gives only the highest', () => {
  assert.deepStrictEqual(sup(mm(95), mm(100)), [{c: 'Svago', soglia: 100, pct: 1}]);
  assert.deepStrictEqual(sup(mm(70), mm(110)), [{c: 'Svago', soglia: 100, pct: 1.1}]);
});

test('soglieSuperate: no budget, no warning; cfg.soglie overrides the default', () => {
  assert.deepStrictEqual(sup(mm(0, 'Libero'), mm(500, 'Libero')), []);
  assert.deepStrictEqual(sup(mm(40), mm(60), {...cfgSoglie, soglie: [50]}), [{c: 'Svago', soglia: 50, pct: 0.6}]);
});

test('soglieSuperate: an edit is before vs after of the same id; a lower amount never warns', () => {
  assert.deepStrictEqual(sup(mm(90), mm(70)), []);
  assert.deepStrictEqual(sup(mm(50), mm(85)), [{c: 'Svago', soglia: 80, pct: 0.85}]);
});
