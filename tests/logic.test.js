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

test('rinomina patches only the live movements of that category', () => {
  const mesi = {
    '2026-01': {a: {d: '2026-01-05', u: 10, c: 'Bar'}, b: {d: '2026-01-06', u: 5, c: 'Bar', x: 1}, o: {d: '2026-01-07', u: 1, c: 'Cibo'}},
    '2026-02': {c: {d: '2026-02-01', u: 3, c: 'Cibo'}}
  };
  assert.deepStrictEqual(L.rinomina(mesi, 'Bar', 'Caffè'), {'2026-01': {a: {c: 'Caffè'}}});
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
  assert.strictEqual(L.mia(lab['2027-03'].j), 0);
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

test('meseCalc: an income never lowers the speso of a category, whatever its category', () => {
  const r = L.meseCalc({'2027-03': {a: {d: '2027-03-01', u: 30, c: 'Svago'}, b: {d: '2027-03-02', e: 10, c: 'Svago'}, c: {d: '2027-03-03', e: 900, c: 'Stipendio'}}}, cfgMese, '2027-03');
  assert.strictEqual(r.righe[1].speso, 30);
  assert.deepStrictEqual(r.senza, []); // an income category is not a spent category
});

// Income categories (R3): cfg.categorie entries with entrata: true; only the one with finanzia: true funds the month.
const cfgEntr = {categorie: [...cfgMese.categorie,
  {nome: 'Stipendio', entrata: true, finanzia: true}, {nome: 'Tredicesima', entrata: true}, {nome: 'Vendita carte', entrata: true}, {nome: 'Vecchia entrata', entrata: true, archiviata: true}]};

test('finanziaMese: only an income in a funding category is month; legacy x2, other income and expenses are not', () => {
  assert.strictEqual(L.finanziaMese(cfgEntr, {e: 1500, c: 'Stipendio'}), true);
  assert.strictEqual(L.finanziaMese(cfgEntr, {e: 900, c: 'Tredicesima'}), false);
  assert.strictEqual(L.finanziaMese(cfgEntr, {e: 500, c: 'Stipendio', t: 'x2'}), false); // legacy extra income
  assert.strictEqual(L.finanziaMese(cfgEntr, {e: 50}), false);                           // no category
  assert.strictEqual(L.finanziaMese(cfgEntr, {u: 50, c: 'Stipendio'}), false);           // an expense
});

test('meseCalc: stipendio is the sum of the incomes in funding categories, nothing else touches the month', () => {
  const mesi = {'2027-03': {
    a: {d: '2027-03-01', e: 1500, c: 'Stipendio'}, b: {d: '2027-03-02', e: 200, c: 'Stipendio'},
    c: {d: '2027-03-03', e: 900, c: 'Tredicesima'}, d: {d: '2027-03-04', e: 40, c: 'Vendita carte'},
    e: {d: '2027-03-05', e: 500, c: 'Svago', t: 'x2', b: 'Auto'}, f: {d: '2027-03-06', e: 99, c: 'Stipendio', x: 1}}};
  const r = L.meseCalc(mesi, cfgEntr, '2027-03');
  assert.strictEqual(r.stipendio, 1700);
  assert.strictEqual(r.spendibile, 150);   // identical to a month with no income at all
  assert.strictEqual(L.meseCalc({}, cfgEntr, '2027-03').stipendio, 0);
});

test('categorieAttive leaves out income categories; categorieEntrata lists the active ones', () => {
  assert.deepStrictEqual(L.categorieAttive(cfgEntr).map(c => c.nome), ['Affitto', 'Svago', 'TCG']);
  assert.deepStrictEqual(L.categorieEntrata(cfgEntr).map(c => c.nome), ['Stipendio', 'Tredicesima', 'Vendita carte']);
});

test('validaConfig: income categories have no budget, priority or group; finanzia only on an income category', () => {
  const ok = {categorie: [{nome: 'Stipendio', entrata: true, finanzia: true}, {nome: 'Rimborsi', entrata: true}, {nome: 'Svago', gruppo: 'Non necessarie', budget: 50}]};
  assert.deepStrictEqual(L.validaConfig(ok), []);
  assert.strictEqual(L.validaConfig({categorie: [{nome: 'Rimborsi', entrata: true, budget: 20}]}).length, 1);
  assert.strictEqual(L.validaConfig({categorie: [{nome: 'Rimborsi', entrata: true, taglio: 3}]}).length, 1);
  assert.strictEqual(L.validaConfig({categorie: [{nome: 'Svago', budget: 50, finanzia: true}]}).length, 1);
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

test('contoJoint reads the joint flag of the account, not its name', () => {
  const cfg = {conti: [{nome: 'Revolut Joint'}, {nome: 'Cassa', joint: true}]};
  assert.strictEqual(L.contoJoint(cfg, 'Cassa'), true);
  assert.strictEqual(L.contoJoint(cfg, 'Revolut Joint'), false);
  assert.strictEqual(L.contoJoint(cfg, 'Altro'), false);
});

test('quotaMov: a flagged account gets p and q, an unflagged one with Joint in the name does not', () => {
  const cfg = {quotaJoint: [{da: '2025-01-01', pct: 56}], conti: [{nome: 'Cassa', joint: true}, {nome: 'Revolut Joint'}]};
  assert.deepStrictEqual(L.quotaMov(cfg, {d: '2026-03-01', u: 100, k: 'Cassa'}), {p: 56, q: 56});
  assert.strictEqual(L.quotaMov(cfg, {d: '2026-03-01', u: 100, k: 'Revolut Joint'}), null);
});

test('quotaMov: a stored share q wins over the one in force', () => {
  const cfg = {quotaJoint: [{da: '2025-01-01', pct: 60}], conti: [{nome: 'Cassa', joint: true}]};
  assert.deepStrictEqual(L.quotaMov(cfg, {d: '2026-03-01', u: 50, k: 'Cassa'}, 56), {p: 28, q: 56});
});

test('cfgNorm turns the stored lists of strings into objects and keeps the rest', () => {
  const r = L.cfgNorm({categorie: ['Bar', {nome: 'Zoo', budget: 5}], conti: ['Cassa', {nome: 'J', joint: true}], budget: {Bar: 1200}});
  assert.deepStrictEqual(r.categorie, [{nome: 'Bar'}, {nome: 'Zoo', budget: 5}]);
  assert.deepStrictEqual(r.conti, [{nome: 'Cassa'}, {nome: 'J', joint: true}]);
  assert.deepStrictEqual(L.cfgNorm({}), {categorie: [], conti: []});
});

test('categorie: configured objects keep their fields, used names are added, counts as before', () => {
  const mesi = {'2026-01': {a: {d: '2026-01-05', u: 10, c: 'Bar'}, t: {d: '2026-01-07', u: 50, c: ''}}, '2025-02': {b: {d: '2025-02-01', u: 1, c: 'Bar'}}};
  const cfg = {categorie: [{nome: 'Zoo', gruppo: 'Necessarie', budget: 9}]};
  assert.deepStrictEqual(L.categorie(mesi, cfg, '2026'), [
    {c: 'Bar', nome: 'Bar', n: 2, anno: 1},
    {c: 'Zoo', nome: 'Zoo', gruppo: 'Necessarie', budget: 9, n: 0, anno: 0}
  ]);
});

test('quotaMov: nothing to apply for other accounts, income, transfers or no share in force', () => {
  const cfg = {quotaJoint: [{da: '2025-01-01', pct: 56}], conti: [{nome: 'Joint', joint: true}, {nome: 'Revolut'}]};
  assert.deepStrictEqual(L.quotaMov(cfg, {d: '2026-03-01', u: 33.33, k: 'Joint'}), {p: 18.66, q: 56}); // rounded to the cent
  assert.strictEqual(L.quotaMov(cfg, {d: '2026-03-01', u: 100, k: 'Revolut'}), null);
  assert.strictEqual(L.quotaMov(cfg, {d: '2026-03-01', e: 100, k: 'Joint'}), null);
  assert.strictEqual(L.quotaMov(cfg, {d: '2026-03-01', u: 100, k: 'Joint', t: 'g', a: 'Revolut'}), null);
  assert.strictEqual(L.quotaMov(cfg, {d: '2024-03-01', u: 100, k: 'Joint'}), null);
});

test('creditiAperti: the partner share of a Joint expense (it has q) is not a credit to refund', () => {
  const m = {'2027-01': {j: {d: '2027-01-05', u: 100, p: 56, q: 56, c: 'Bollette', k: 'Joint'}, s: {d: '2027-01-06', u: 60, p: 20, c: 'Cena', k: 'Cash'}}};
  assert.deepStrictEqual(L.creditiAperti(m).map(x => x.id), ['s']);
});

const sv = {nome: 'Auto fissi', gruppo: 'Necessarie', conto: 'Revolut', quota: 20, saldoIniziale: {data: '2026-12-01', importo: 100}};

test('saldoSalvadanaio: initial balance + monthly quotas from its month - expenses on that name', () => {
  const mesi = {'2027-01': {a: {d: '2027-01-10', u: 30, c: 'Auto fissi', k: 'Revolut'}, b: {d: '2027-01-11', u: 99, c: 'Bar'},
    g: {d: '2027-01-12', u: 5, c: 'Auto fissi', t: 'g', a: 'Cash'}, x: {d: '2027-01-13', u: 7, c: 'Auto fissi', x: 1}}};
  assert.strictEqual(L.saldoSalvadanaio(mesi, sv, '2026-12'), 120);
  assert.strictEqual(L.saldoSalvadanaio(mesi, sv, '2027-01'), 110); // 100 + 2 x 20 - 30
  assert.strictEqual(L.saldoSalvadanaio(mesi, sv, '2026-11'), 100); // before the opening month: no quota yet
});

test('saldoSalvadanaio: an expense dated before the opening balance is already inside it; split expenses use my part', () => {
  const mesi = {'2026-12': {o: {d: '2026-11-30', u: 50, c: 'Auto fissi'}, p: {d: '2026-12-05', u: 40, p: 10, c: 'Auto fissi'}}};
  assert.strictEqual(L.saldoSalvadanaio(mesi, sv, '2026-12'), 110); // 100 + 20 - 10
});

test('ammanco: how much of an expense the pot cannot cover (the movement itself is left out when edited)', () => {
  const cfg = {salvadanai: [sv]};
  const mesi = {'2026-12': {a: {d: '2026-12-10', u: 90, c: 'Auto fissi'}}}; // saldo 120 - 90 = 30
  assert.strictEqual(L.ammanco(mesi, cfg, {d: '2026-12-15', u: 50, c: 'Auto fissi'}), 20);
  assert.strictEqual(L.ammanco(mesi, cfg, {d: '2026-12-15', u: 30, c: 'Auto fissi'}), 0);
  assert.strictEqual(L.ammanco(mesi, cfg, {id: 'a', d: '2026-12-10', u: 120, c: 'Auto fissi'}), 0); // editing a: 120 available
  assert.strictEqual(L.ammanco(mesi, cfg, {d: '2026-12-15', u: 500, c: 'Bar'}), 0);   // not a pot
  assert.strictEqual(L.ammanco(mesi, cfg, {d: '2026-12-15', u: 500, c: 'Auto fissi', t: 'g'}), 0);
  assert.strictEqual(L.ammanco(mesi, cfg, {d: '2026-12-15', u: 50, p: 35, c: 'Auto fissi'}), 5); // my part counts
});

test('ammanco: a pot with sottoZero may go below zero, every other pot is still blocked', () => {
  const tcg = {...sv, nome: 'Fondo TCG', sottoZero: true};
  const cfg = {salvadanai: [sv, tcg]};
  assert.strictEqual(L.ammanco({}, cfg, {d: '2026-12-15', u: 500, c: 'Fondo TCG'}), 0);
  assert.strictEqual(L.ammanco({}, cfg, {d: '2026-12-15', u: 500, c: 'Auto fissi'}), 380);
  assert.strictEqual(L.saldoSalvadanaio({'2026-12': {a: {d: '2026-12-15', u: 500, c: 'Fondo TCG'}}}, tcg, '2026-12'), -380); // the raw balance is negative
});

test('meseCalc: a pot is not a budget: its expenses stay out of senza and spendibile', () => {
  const cfg = {categorie: [{nome: 'Bar', budget: 100}], salvadanai: [sv]};
  const mesi = {'2027-01': {a: {d: '2027-01-10', u: 30, c: 'Auto fissi'}, b: {d: '2027-01-11', u: 10, c: 'Bar'}}};
  const r = L.meseCalc(mesi, cfg, '2027-01');
  assert.deepStrictEqual(r.senza, []);
  assert.strictEqual(r.spendibile, 90);
});

test('ammanco: a backdated expense must not sink a later month of the pot', () => {
  const cfg = {salvadanai: [{...sv, quota: 0, saldoIniziale: {data: '2027-01-01', importo: 100}}]};
  const mesi = {'2027-02': {a: {d: '2027-02-10', u: 90, c: 'Auto fissi'}}};
  assert.strictEqual(L.ammanco(mesi, cfg, {d: '2027-01-15', u: 50, c: 'Auto fissi'}), 40); // February would be at -40
  assert.strictEqual(L.ammanco(mesi, cfg, {d: '2027-01-15', u: 10, c: 'Auto fissi'}), 0);
});

// --- pot voci (2.2): one balance, quota = sum of the voci quotas, goal / months to the due month ---
const rev = {nome: 'Revisione', annuale: 80, data: '2027-09', cicli: 24};
const svV = (voci, extra) => Object.assign({nome: 'Auto', conto: 'Revolut', voci: voci, saldoIniziale: {data: '2027-01-01', importo: 0}}, extra);
const somma = (v, da, a) => { var t = 0; for (var m = da; m <= a; m++) t += L.quotaVoce(v, '2027-' + String(m).padStart(2, '0'), '2027-01'); return Math.round(t * 100) / 100; };

test('quotaVoce: goal / months from the start to the due month (80 in September from January = 80 / 9)', () => {
  assert.strictEqual(L.quotaVoce(rev, '2027-01', '2027-01'), 8.89);
  assert.strictEqual(somma(rev, 1, 9), 80); // cents add up exactly: May is 8.88
});

test('quotaVoce: after the due month the next cycle starts (80 / 24), and again on the following due date', () => {
  assert.strictEqual(L.quotaVoce(rev, '2027-10', '2027-01'), 3.33);
  let t = 0; for (let y = 2027 * 12 + 9; y < 2027 * 12 + 9 + 24; y++) t += L.quotaVoce(rev, Math.floor(y / 12) + '-' + String(y % 12 + 1).padStart(2, '0'), '2027-01');
  assert.strictEqual(Math.round(t * 100) / 100, 80); // the whole 24-month cycle (Oct 2027 - Sep 2029) closes the 80 exactly
  assert.strictEqual(L.quotaVoce(rev, '2029-10', '2027-01'), 3.33);
});

test('quotaVoce: default cycle is 12 months; a pot opened mid-cycle spreads the goal over the months left', () => {
  const bollo = {nome: 'Bollo', annuale: 200, data: '2027-09'};
  assert.strictEqual(L.quotaVoce(bollo, '2027-03', '2027-01'), 22.23); // 200 / 9, cumulative cents
  assert.strictEqual(L.quotaVoce(bollo, '2027-10', '2027-01'), 16.67); // 200 / 12
  assert.strictEqual(L.quotaVoce(bollo, '2027-07', '2027-07'), 66.67); // opened in July: 200 / 3
});

test('quotaVoce: a scheduled change replaces the computed quota from its month', () => {
  const v = Object.assign({cambio: {da: '2027-10', quota: 5}}, rev);
  assert.strictEqual(L.quotaVoce(v, '2027-09', '2027-01'), 8.89);
  assert.strictEqual(L.quotaVoce(v, '2027-10', '2027-01'), 5);
});

test('quotaSalvadanaio: sum of the voci quotas; a pot without voci keeps its fixed quota', () => {
  const ass = {nome: 'Assicurazione', annuale: 425, data: '2027-05'};
  assert.strictEqual(L.quotaSalvadanaio(svV([rev, ass]), '2027-01'), 93.89); // 80 / 9 + 425 / 5 (January to May)
  assert.strictEqual(L.quotaSalvadanaio({nome: 'X', quota: 20}, '2027-01'), 20);
  assert.strictEqual(L.quotaSalvadanaio(svV([]), '2027-01'), 0);
});

test('saldoSalvadanaio with voci: one balance, an expense on a voce (v) comes off it', () => {
  const s = svV([rev]);
  assert.strictEqual(L.saldoSalvadanaio({}, s, '2027-09'), 80);
  const mesi = {'2027-09': {a: {d: '2027-09-10', u: 80, c: 'Auto', v: 'Revisione'}}};
  assert.strictEqual(L.saldoSalvadanaio(mesi, s, '2027-09'), 0);
  assert.strictEqual(L.saldoSalvadanaio(mesi, s, '2027-10'), 3.33);
});

test('quotaVoce: a voce without a valid month gives 0, not NaN', () => {
  assert.strictEqual(L.quotaVoce({nome: 'X', annuale: 80}, '2027-01', '2027-01'), 0);
  assert.strictEqual(L.saldoSalvadanaio({}, svV([{nome: 'X', annuale: 80, data: 'boh'}]), '2027-03'), 0);
});

// ---- piano del mese (2.3): made-up numbers ----
const cfgP = {
  categorie: [
    {nome: 'Affitto', gruppo: 'Necessarie', budget: 500, joint: true},
    {nome: 'Svago', gruppo: 'Non necessarie', budget: 100},
    {nome: 'Vecchia', gruppo: 'Non necessarie', budget: 40, archiviata: true},
    {nome: 'TCG', gruppo: 'Non necessarie'},
  ],
  conti: [{nome: 'Revolut'}, {nome: 'Joint', joint: true}],
  salvadanai: [
    {nome: 'Auto', gruppo: 'Necessarie', conto: 'Revolut', quota: 50, saldoIniziale: {data: '2027-01-01', importo: 0}},
    {nome: 'Viaggi', gruppo: 'Risparmi', conto: 'Joint', quota: 60, saldoIniziale: {data: '2027-01-01', importo: 0}},
  ],
};

test('piano: rows come from budgets and pot quotas, grouped with totals and % of the salary; resta = salary - assigned', () => {
  const p = L.piano(cfgP, '2027-01', {stipendio: 1000});
  assert.deepStrictEqual(p.righe.map(r => r.nome), ['Affitto', 'Auto', 'Svago', 'Viaggi']); // archived and no-budget rows left out
  assert.strictEqual(p.totale, 710);
  assert.strictEqual(p.resta, 290);
  assert.deepStrictEqual(p.gruppi.map(g => [g.gruppo, g.totale, g.pct]), [['Necessarie', 550, 0.55], ['Non necessarie', 100, 0.1], ['Risparmi', 60, 0.06]]);
  assert.strictEqual(p.joint, 560); // Affitto (flag) + Viaggi (pot on a Joint account): informational, not added to totale
});

test('piano: the Joint share follows the category flag (R4), the total does not', () => {
  const con = (f) => ({...cfgP, categorie: cfgP.categorie.map(c => c.nome in f ? {...c, joint: f[c.nome]} : c)});
  const off = L.piano(con({Affitto: false}), '2027-01', {stipendio: 1000}), on = L.piano(con({Svago: true}), '2027-01', {stipendio: 1000});
  assert.strictEqual(off.joint, 60); // only the pot on the Joint account is left
  assert.strictEqual(on.joint, 660); // Affitto + Svago + Viaggi
  assert.strictEqual(off.totale, 710); assert.strictEqual(on.totale, 710);
});

test('piano: edited amounts win; an overspent plan gives a negative resta', () => {
  const p = L.piano(cfgP, '2027-01', {stipendio: 600, righe: [{nome: 'Svago', importo: 30}, {nome: 'Ghost', importo: 999}]});
  assert.strictEqual(p.righe.find(r => r.nome === 'Svago').importo, 30);
  assert.strictEqual(p.totale, 640);
  assert.strictEqual(p.resta, -40);
});

test('piano: no salary gives 0% and resta negative; cents do not drift', () => {
  const p = L.piano({categorie: [{nome: 'A', gruppo: 'Necessarie', budget: 0.1}, {nome: 'B', gruppo: 'Necessarie', budget: 0.2}]}, '2027-01', {});
  assert.strictEqual(p.totale, 0.3);
  assert.strictEqual(p.gruppi[0].pct, 0);
  assert.strictEqual(p.resta, -0.3);
});

test('piano: a plan that uses the whole salary gives resta 0, not -0', () => {
  assert.ok(Object.is(L.piano({categorie: [{nome: 'A', gruppo: 'Necessarie', budget: 0.1}, {nome: 'B', gruppo: 'Necessarie', budget: 0.2}]}, '2027-01', {stipendio: 0.3}).resta, 0));
});

test('pianoPrecedente: the latest saved plan before the month, else empty', () => {
  const cfg = {piani: {'2027-01': {stipendio: 1}, '2027-03': {stipendio: 3}}};
  assert.strictEqual(L.pianoPrecedente(cfg, '2027-02').stipendio, 1);
  assert.strictEqual(L.pianoPrecedente(cfg, '2027-03').stipendio, 1);
  assert.strictEqual(L.pianoPrecedente(cfg, '2027-04').stipendio, 3);
  assert.deepStrictEqual(L.pianoPrecedente({}, '2027-01'), {});
});

const cfgOk = {
  categorie: [{nome: 'Affitto', gruppo: 'Necessarie', budget: 500, joint: true}, {nome: 'Svago', gruppo: 'Non necessarie', budget: 100, taglio: 1}, {nome: 'Altro'}],
  conti: [{nome: 'Revolut'}, {nome: 'Joint', joint: true}],
  quotaJoint: [{da: '2026-01-01', pct: 56}], soglie: [80, 100],
  etichette: [{nome: 'sushi', categoria: 'Svago'}, {nome: 'TCG'}],
  salvadanai: [{nome: 'Auto', gruppo: 'Necessarie', conto: 'Revolut', saldoIniziale: {data: '2027-01-01', importo: 5}, voci: [{nome: 'Bollo', annuale: 80, data: '2027-09'}]}],
  piani: {'2027-01': {stipendio: 1000, righe: [{nome: 'Affitto', importo: 500}, {nome: 'Auto', importo: 9}]}},
};

test('validaConfig: a coherent config has no problems', () => {
  assert.deepStrictEqual(L.validaConfig(cfgOk), []);
});

test('validaConfig: reports duplicates, unknown accounts, bad dates, bad plan rows', () => {
  const bad = JSON.parse(JSON.stringify(cfgOk));
  bad.categorie.push({nome: 'affitto', gruppo: 'Boh', budget: -1});
  bad.salvadanai[0].conto = 'Nessuno'; bad.salvadanai[0].voci[0].data = '2027-13';
  bad.quotaJoint = [{da: 'ieri', pct: 120}]; bad.soglie = [0]; bad.salvadanai.push({nome: 'Svago', gruppo: 'Risparmi', conto: 'Revolut', saldoIniziale: {data: '2027-02-31', importo: 0}});
  bad.etichette.push({nome: 'x', categoria: 'Mai'});
  bad.piani['2027-01'].righe.push({nome: 'Fantasma', importo: 1});
  bad.piani['gennaio'] = {stipendio: 1, righe: []};
  const e = L.validaConfig(bad).join('|');
  for (const parte of ['Duplicate category affitto', 'Group Boh', 'Budget -1', 'Account Nessuno', 'Voce Bollo date', 'quotaJoint', 'soglie', 'Label x', 'Plan 2027-01 row Fantasma', 'Plan gennaio', 'Duplicate category or pot svago', 'Opening balance of pot Svago'])
    assert.ok(e.includes(parte), parte + ' not reported in: ' + e);
});

// permettermelo: invented data. Month 2027-01.
const cfgPm = {
  categorie: [
    {nome: 'Spesa', gruppo: 'Necessarie', budget: 300},
    {nome: 'Cinema', gruppo: 'Non necessarie', budget: 40, taglio: 2},
    {nome: 'Svago', gruppo: 'Non necessarie', budget: 100, taglio: 1},
    {nome: 'Regali', gruppo: 'Non necessarie', budget: 50},       // out of the ranking
    {nome: 'Libri', gruppo: 'Non necessarie', budget: 30, taglio: 3},
  ],
  salvadanai: [{nome: 'Vacanze', gruppo: 'Risparmi', conto: 'Revolut', saldoIniziale: {data: '2027-01-01', importo: 500}, quota: 0}],
};
const mesiPm = {'2027-01': {a: {d: '2027-01-05', u: 290, c: 'Spesa'}, b: {d: '2027-01-06', u: 30, c: 'Svago'}, c: {d: '2027-01-07', u: 40, c: 'Libri'}}};

test('permettermelo: fits when the residual covers it, and says what is left', () => {
  const r = L.permettermelo(mesiPm, cfgPm, '2027-01', 'Svago', 50);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.resta, 20);
});

test('permettermelo: the exact residual still fits (resta 0)', () => {
  assert.strictEqual(L.permettermelo(mesiPm, cfgPm, '2027-01', 'Svago', 70).resta, 0);
});

test('permettermelo: one bucket is enough, lowest taglio first, pots and the unranked are left out', () => {
  const r = L.permettermelo(mesiPm, cfgPm, '2027-01', 'Spesa', 25); // residuo 10, manca 15
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.manca, 15);
  assert.deepStrictEqual(r.proposte, [{c: 'Svago', taglio: 1, residuo: 70, prendi: 15}]);
  assert.strictEqual(r.scoperto, 0);
});

test('permettermelo: several buckets in taglio order; an overspent one (residuo <= 0) is skipped', () => {
  const r = L.permettermelo(mesiPm, cfgPm, '2027-01', 'Spesa', 100); // manca 90; Svago 70, Cinema 40, Libri -10
  assert.deepStrictEqual(r.proposte.map(p => [p.c, p.residuo, p.prendi]), [['Svago', 70, 70], ['Cinema', 40, 20]]);
  assert.strictEqual(r.scoperto, 0);
});

test('permettermelo: when the ranked buckets are not enough, scoperto says how much is still missing', () => {
  const r = L.permettermelo(mesiPm, cfgPm, '2027-01', 'Spesa', 200); // manca 190; 70 + 40 = 110
  assert.strictEqual(r.proposte.length, 2);
  assert.strictEqual(r.scoperto, 80);
});

test('permettermelo: no bucket available, and the category itself is never proposed', () => {
  const r = L.permettermelo(mesiPm, cfgPm, '2027-01', 'Libri', 5); // residuo -10, manca 15
  assert.deepStrictEqual(r.proposte.map(p => p.c), ['Svago']);
  const solo = {categorie: [{nome: 'A', budget: 10}, {nome: 'B', budget: 10}]};
  const s = L.permettermelo({}, solo, '2027-01', 'A', 30);
  assert.deepStrictEqual(s.proposte, []);
  assert.strictEqual(s.scoperto, 20);
});

// Extra income (x2): where it goes (b) and the pot balance it feeds. Invented data.
const svX = (nome, importo, obiettivo) => ({nome, conto: 'A', saldoIniziale: {data: '2027-01-01', importo}, quota: 0, ...(obiettivo ? {obiettivo} : {})});
const cfgX = {salvadanai: [svX('Fondo emergenze', 800, 1000), svX('Fondo TCG', 0), svX('Auto', 150, 400), svX('Viaggi', 90, 300), svX('Investimenti', 0)]};

test('saldoSalvadanaio: an extra income assigned to the pot (b) raises its balance, one assigned elsewhere does not', () => {
  const mesi = {'2027-02': {
    a: {d: '2027-02-03', e: 60, t: 'x2', b: 'Auto'},
    b: {d: '2027-02-04', e: 40, t: 'x2', b: 'Viaggi'},
    c: {d: '2027-02-05', e: 25, t: 'x2', b: 'Auto', x: 1},   // deleted
    d: {d: '2026-12-20', e: 99, t: 'x2', b: 'Auto'},        // before the opening date: already in the opening balance
  }};
  assert.strictEqual(L.saldoSalvadanaio(mesi, cfgX.salvadanai[2], '2027-02'), 210);
  assert.strictEqual(L.saldoSalvadanaio(mesi, cfgX.salvadanai[2], '2027-01'), 150); // not yet received
});

test('destinazioneExtra: below the threshold it goes to the buffer, whatever else is short', () => {
  assert.deepStrictEqual(L.destinazioneExtra({}, cfgX, {d: '2027-02-03', e: 99.99}).b, 'Cuscinetto');
});

test('destinazioneExtra: from the threshold up, the emergency fund first if below its goal', () => {
  const r = L.destinazioneExtra({}, cfgX, {d: '2027-02-03', e: 100});
  assert.strictEqual(r.b, 'Fondo emergenze');
  assert.ok(r.motivo);
});

test('destinazioneExtra: emergency fund full -> the pot furthest below its goal, then investments, then the buffer', () => {
  const pieno = {salvadanai: cfgX.salvadanai.map(v => v.nome === 'Fondo emergenze' ? svX(v.nome, 1000, 1000) : v)};
  assert.strictEqual(L.destinazioneExtra({}, pieno, {d: '2027-12-03', e: 200}).b, 'Auto'); // by December the goals are fully due: short 250 vs Viaggi 210
  const senzaObiettivi = {salvadanai: [svX('Auto', 150), svX('Investimenti', 0)]};
  assert.strictEqual(L.destinazioneExtra({}, senzaObiettivi, {d: '2027-02-03', e: 200}).b, 'Investimenti');
  assert.strictEqual(L.destinazioneExtra({}, {salvadanai: [svX('Auto', 150)]}, {d: '2027-02-03', e: 200}).b, 'Cuscinetto');
  assert.strictEqual(L.destinazioneExtra({}, {}, {d: '2027-02-03', e: 200}).b, 'Cuscinetto');
});

test('destinazioneExtra: the balance used is the one at the movement month, extra income already received counts', () => {
  const mesi = {'2027-01': {a: {d: '2027-01-10', e: 300, t: 'x2', b: 'Fondo emergenze'}}}; // 800 + 300 >= 1000
  assert.strictEqual(L.destinazioneExtra(mesi, cfgX, {d: '2027-12-03', e: 150}).b, 'Auto');
});

test('destinazioneExtra: a card sale (label TCG) always goes to the TCG fund, even below the threshold', () => {
  assert.strictEqual(L.destinazioneExtra({}, cfgX, {d: '2027-02-03', e: 30, l: ['tcg']}).b, 'Fondo TCG');
  assert.strictEqual(L.destinazioneExtra({}, {salvadanai: []}, {d: '2027-02-03', e: 30, l: ['TCG']}).b, 'Cuscinetto'); // no fund configured
});

test('destinazioneExtra: a card sale says how much the TCG fund needs to get back to zero when it is negative', () => {
  const mesi = {'2027-02': {a: {d: '2027-02-01', u: 130, c: 'Fondo TCG'}}};
  const cfg = {salvadanai: [{...svX('Fondo TCG', 0), sottoZero: true}]};
  const r = L.destinazioneExtra(mesi, cfg, {d: '2027-02-03', e: 30, l: ['tcg']});
  assert.strictEqual(r.b, 'Fondo TCG');
  assert.match(r.motivo, /130,00/);
  assert.doesNotMatch(L.destinazioneExtra({}, cfg, {d: '2027-02-03', e: 30, l: ['tcg']}).motivo, /zero/); // not negative: plain reason
});

test('destinazioneExtra: threshold and names can be set in cfg.extra', () => {
  const cfg = {...cfgX, extra: {soglia: 20, cuscinetto: 'Riserva'}};
  assert.strictEqual(L.destinazioneExtra({}, cfg, {d: '2027-02-03', e: 19}).b, 'Riserva');
  assert.strictEqual(L.destinazioneExtra({}, cfg, {d: '2027-02-03', e: 20}).b, 'Fondo emergenze');
});

// Emergency fund (B7): months covered, below-goal flag, January/July reminder, note rule. Invented data.
const cfgFE = {
  categorie: [{nome: 'Affitto', gruppo: 'Necessarie', budget: 500}, {nome: 'Spesa', gruppo: 'Necessarie', budget: 200}, {nome: 'Svago', gruppo: 'Non necessarie', budget: 100}],
  salvadanai: [
    {nome: 'Auto', gruppo: 'Necessarie', conto: 'Rev', saldoIniziale: {data: '2027-01-01', importo: 0}, quota: 100},
  ],
  conti: [{nome: 'Rev'}, {nome: 'TR', saldoIniziale: {data: '2027-01-01', importo: 3000}}], // R6: the fund is the balance of its own account
  fondoEmergenze: {conto: 'TR', obiettivo: 6000},
};
test('fondoEmergenze: months covered = balance / monthly necessarie (budgets + pot quotas of that group)', () => {
  const f = L.fondoEmergenze({}, cfgFE, '2027-02'); // necessarie = 500 + 200 + 100 = 800
  assert.strictEqual(f.saldo, 3000);
  assert.strictEqual(f.necessarie, 800);
  assert.strictEqual(f.mesi, 3.75);
  assert.strictEqual(f.seiMesi, 4800);
  assert.strictEqual(f.manca, 3000);
  assert.strictEqual(f.sotto, true);
});
test('fondoEmergenze: a withdrawal lowers the balance, a full fund is not below goal, null without config', () => {
  const mesi = {'2027-02': {a: {d: '2027-02-10', u: 500, k: 'TR', c: 'Salute', n: 'Dentista'}}};
  assert.strictEqual(L.fondoEmergenze(mesi, cfgFE, '2027-02').saldo, 2500);
  assert.strictEqual(L.fondoEmergenze(mesi, cfgFE, '2027-01').saldo, 3000); // as of the end of the month asked
  const pieno = {...cfgFE, fondoEmergenze: {...cfgFE.fondoEmergenze, obiettivo: 3000}};
  assert.strictEqual(L.fondoEmergenze({}, pieno, '2027-02').sotto, false);
  assert.strictEqual(L.fondoEmergenze({}, {categorie: []}, '2027-02'), null);
  assert.strictEqual(L.fondoEmergenze({}, {...cfgFE, conti: [{nome: 'Rev'}]}, '2027-02'), null); // no such account
  assert.ok(L.fondoEmergenze({}, {...cfgFE, fondoEmergenze: {conto: 'TR', sottosaldo: 'Old', obiettivo: 6000}}, '2027-02')); // a leftover sottosaldo is ignored
});
test('fondoEmergenze: reminder only in January and July', () => {
  const p = m => L.fondoEmergenze({}, cfgFE, '2027-' + m).promemoria;
  assert.deepStrictEqual(['01', '02', '06', '07', '12'].map(p), [true, false, false, true, false]);
});
test('usoFondo: an expense or a transfer out of the fund account needs a note, other rows do not', () => {
  const fe = cfgFE;
  assert.strictEqual(L.usoFondoSenzaNota(fe, {k: 'TR', c: 'Salute', u: 50, n: ''}), true);
  assert.strictEqual(L.usoFondoSenzaNota(fe, {k: 'TR', c: 'Salute', u: 50, n: '  '}), true);
  assert.strictEqual(L.usoFondoSenzaNota(fe, {k: 'TR', c: 'Salute', u: 50, n: 'Dentista'}), false);
  assert.strictEqual(L.usoFondoSenzaNota(fe, {k: 'Rev', c: 'Svago', u: 50, n: ''}), false);
  assert.strictEqual(L.usoFondoSenzaNota(fe, {k: 'TR', e: 50, c: 'Rimborsi', n: ''}), false); // income into the fund is not a use
  assert.strictEqual(L.usoFondoSenzaNota(fe, {t: 'g', k: 'TR', a: 'Rev', u: 30}), true);
  assert.strictEqual(L.usoFondoSenzaNota(fe, {t: 'g', k: 'TR', a: 'Rev', u: 30, n: 'car repair'}), false);
  assert.strictEqual(L.usoFondoSenzaNota(fe, {t: 'g', k: 'Rev', a: 'TR', u: 30}), false); // money in: no note needed
});
test('destinazioneExtra: the emergency fund goal comes from cfg.fondoEmergenze and the balance of its account', () => {
  const cfg = {salvadanai: [svX('Fondo emergenze', 5000), svX('Investimenti', 0)], conti: [{nome: 'TR', saldoIniziale: {data: '2027-01-01', importo: 500}}], fondoEmergenze: {conto: 'TR', obiettivo: 1000}};
  assert.strictEqual(L.destinazioneExtra({}, cfg, {d: '2027-02-03', e: 300}).b, 'Fondo emergenze'); // account 500 < 1000, although the pot says 5000
});
test('validaConfig: fondoEmergenze must name an existing account and have a valid goal', () => {
  assert.deepStrictEqual(L.validaConfig(cfgFE), []);
  assert.strictEqual(L.validaConfig({...cfgFE, fondoEmergenze: {conto: 'Nope', obiettivo: 10}}).length, 1);
  assert.strictEqual(L.validaConfig({...cfgFE, fondoEmergenze: {conto: 'TR', obiettivo: -5}}).length, 1);
});

// R1: strict form validation (parseAmount stays lenient, for the sheet import)
test('validaImporto: digits and one decimal separator, max 2 decimals, above zero', () => {
  assert.deepStrictEqual(L.validaImporto('12,50'), {v: 12.5});
  assert.deepStrictEqual(L.validaImporto('12.5'), {v: 12.5});
  assert.deepStrictEqual(L.validaImporto(' 1200 '), {v: 1200});
  assert.deepStrictEqual(L.validaImporto('0,05'), {v: 0.05});
});
test('validaImporto: no thousands separator, no third decimal', () => {
  assert.match(L.validaImporto('1.200').err, /2 decimali/);
  assert.match(L.validaImporto('12,345').err, /2 decimali/);
  assert.match(L.validaImporto('1.234,56').err, /separatore/);
  assert.match(L.validaImporto('1,2,3').err, /separatore/);
  assert.match(L.validaImporto('12 €').err, /cifre/);
  assert.match(L.validaImporto('abc').err, /cifre/);
  assert.match(L.validaImporto('-5').err, /cifre/);
});
test('validaImporto: zero and empty only with the zero option', () => {
  assert.match(L.validaImporto('0').err, /maggiore di zero/);
  assert.match(L.validaImporto('0,00').err, /maggiore di zero/);
  assert.match(L.validaImporto('').err, /importo/);
  assert.deepStrictEqual(L.validaImporto('0', {zero: true}), {v: 0});
  assert.deepStrictEqual(L.validaImporto('0,00', {zero: true}), {v: 0});
  assert.deepStrictEqual(L.validaImporto('', {zero: true}), {v: 0});
  assert.match(L.validaImporto('1.200', {zero: true}).err, /2 decimali/); // zero allowed never loosens the other rules
});
test('validaQuotaJoint: whole numbers from 1 to 99', () => {
  assert.deepStrictEqual(L.validaQuotaJoint('56'), {v: 56});
  assert.deepStrictEqual(L.validaQuotaJoint('1'), {v: 1});
  assert.deepStrictEqual(L.validaQuotaJoint('99'), {v: 99});
  for (const s of ['0', '100', '-3']) assert.match(L.validaQuotaJoint(s).err, /da 1 a 99/);
  for (const s of ['56,5', '56.5', 'abc', '']) assert.ok(L.validaQuotaJoint(s).err);
  assert.match(L.validaQuotaJoint('56,5').err, /interi/);
});

// riordinaTaglio: unique cut priority, insertion with shift; archived categories stay out of the ranking
const cs = (...x) => x.map(([nome, taglio, archiviata]) => ({nome, taglio, archiviata}));
test('riordinaTaglio: a free number changes only that category', () => {
  assert.deepStrictEqual(L.riordinaTaglio(cs(['A', 1], ['B', 3], ['C']), 'C', 2), {C: 2});
});
test('riordinaTaglio: a taken number shifts the whole chain down', () => {
  assert.deepStrictEqual(L.riordinaTaglio(cs(['A', 1], ['B', 2], ['C', 3], ['D', 5], ['E']), 'E', 2), {E: 2, B: 3, C: 4});
});
test('riordinaTaglio: beyond the last number or the same number', () => {
  assert.deepStrictEqual(L.riordinaTaglio(cs(['A', 1], ['B', 2]), 'B', 9), {B: 9});
  assert.deepStrictEqual(L.riordinaTaglio(cs(['A', 1], ['B', 2]), 'B', 2), {});
});
test('riordinaTaglio: moving up shifts the ones in between, leaving the old slot free', () => {
  assert.deepStrictEqual(L.riordinaTaglio(cs(['A', 1], ['B', 2], ['C', 3]), 'C', 1), {C: 1, A: 2, B: 3});
});
test('riordinaTaglio: removing the number does not renumber the others', () => {
  assert.deepStrictEqual(L.riordinaTaglio(cs(['A', 1], ['B', 2], ['C', 3]), 'B', null), {B: null});
  assert.deepStrictEqual(L.riordinaTaglio(cs(['A', 1], ['B']), 'B', null), {});
});
test('riordinaTaglio: archived categories neither collide nor shift', () => {
  assert.deepStrictEqual(L.riordinaTaglio(cs(['A', 1], ['Old', 2, true], ['B', 2]), 'C', 2), {C: 2, B: 3});
  assert.deepStrictEqual(L.riordinaTaglio(cs(['A', 1], ['Old', 2, true]), 'Old', 1), {Old: 1});
});
test('riordinaTaglio: legacy duplicates are separated', () => {
  assert.deepStrictEqual(L.riordinaTaglio(cs(['A', 2], ['B', 2], ['C']), 'C', 2), {C: 2, A: 3, B: 4});
});

test('saldoSalvadanaio: an income with a destination (b) feeds the pot with or without the legacy x2; an income never lowers it', () => {
  const sv = cfgX.salvadanai[2]; // Auto, 150 from 2027-01-01
  const mesi = {'2027-02': {
    a: {d: '2027-02-03', e: 60, c: 'Tredicesima', b: 'Auto'},            // new: plain income with a destination
    b: {d: '2027-02-04', e: 40, c: 'Svago', t: 'x2', b: 'Auto'},         // legacy
    c: {d: '2027-02-05', e: 25, c: 'Auto'},                             // income named like the pot, no destination: not a refund any more
    d: {d: '2027-02-06', e: 30, c: 'Tredicesima', b: 'Viaggi'},          // elsewhere
  }};
  assert.strictEqual(L.saldoSalvadanaio(mesi, sv, '2027-02'), 250);
});

test('destinazioneExtra: an income in the category Vendita carte goes to the TCG fund (name from cfg.extra.carte)', () => {
  assert.strictEqual(L.destinazioneExtra({}, cfgX, {d: '2027-02-03', e: 30, c: 'Vendita carte'}).b, 'Fondo TCG');
  const altro = {...cfgX, extra: {carte: 'Incassi TCG'}};
  assert.strictEqual(L.destinazioneExtra({}, altro, {d: '2027-02-03', e: 30, c: 'Incassi TCG'}).b, 'Fondo TCG');
  assert.strictEqual(L.destinazioneExtra({}, altro, {d: '2027-02-03', e: 30, c: 'Vendita carte'}).b, 'Cuscinetto');
});

// ---- 3.1 Controllo saldi (made-up data) ----
const cfgC = {conti: [
  {nome: 'Banca', saldoIniziale: {data: '2026-11-10', importo: 1000}},
  {nome: 'Cassa'}, {nome: 'Joint', joint: true}, {nome: 'Vecchio', chiuso: true, saldoIniziale: {data: '2026-01-01', importo: 50}}]};
const mesiC = {'2026-11': {
  a: {d: '2026-11-05', u: 999, c: 'X', k: 'Banca'},            // before the opening date: already in the opening balance
  b: {d: '2026-11-12', u: 30, c: 'X', k: 'Banca'},
  c: {d: '2026-11-15', u: 100, t: 'g', k: 'Banca', a: 'Cassa'},
  d: {d: '2026-11-20', u: 200, c: 'X', k: 'Joint', p: 112, q: 56},  // Joint: the whole amount moves the account
  e: {d: '2026-11-21', e: 300, t: 'vj', k: 'Joint'},               // partner top-up
  f: {d: '2026-11-28', u: 5, c: 'X', k: 'Cassa'}}};

test('saldi with cfg: opening balance per account, only rows from its date, Joint at full amounts', () => {
  assert.deepStrictEqual(L.saldi(mesiC, cfgC),
    {Banca: 870, Cassa: 95, Joint: 100, Vecchio: 50});
});

test('saldi with a date: rows after it are left out (balance as of today)', () => {
  assert.strictEqual(L.saldi(mesiC, cfgC, '2026-11-14').Banca, 970);
  assert.strictEqual(L.saldi(mesiC, cfgC, '2026-11-14').Cassa, 0);
});

test('validaImporto neg: signed balance, zero allowed, empty and junk rejected', () => {
  assert.deepStrictEqual(L.validaImporto('-12,50', {neg: true}), {v: -12.5});
  assert.deepStrictEqual(L.validaImporto('0', {neg: true}), {v: 0});
  assert.deepStrictEqual(L.validaImporto('1200', {neg: true}), {v: 1200});
  assert.ok(L.validaImporto('', {neg: true}).err);
  assert.ok(L.validaImporto('-', {neg: true}).err);
  assert.ok(L.validaImporto('--5', {neg: true}).err);
  assert.ok(L.validaImporto('-5', {}).err); // without neg a minus stays an error
});

test('differenzaControllo: bank minus tool, ok within a cent', () => {
  assert.deepStrictEqual(L.differenzaControllo(870, 850.5), {diff: 19.5, ok: false});
  assert.deepStrictEqual(L.differenzaControllo(870, 870), {diff: 0, ok: true});
});

test('controlli: last check, history, and "late" after 7 days; closed accounts are not asked', () => {
  const cfg = {conti: cfgC.conti, controlli: [
    {d: '2026-11-01', k: 'Banca', banca: 1, strumento: 1, diff: 0},
    {d: '2026-11-20', k: 'Banca', banca: 5, strumento: 4, diff: 1},
    {d: '2026-11-19', k: 'Cassa', banca: 0, strumento: 0, diff: 0}]};
  assert.strictEqual(L.ultimoControllo(cfg, 'Banca').d, '2026-11-20');
  assert.deepStrictEqual(L.storicoControlli(cfg, 'Banca', 5).map(c => c.d), ['2026-11-20', '2026-11-01']);
  assert.strictEqual(L.controlloScaduto(cfg, 'Banca', '2026-11-27'), false); // 7 days: still ok
  assert.strictEqual(L.controlloScaduto(cfg, 'Banca', '2026-11-28'), true);
  assert.strictEqual(L.controlloScaduto(cfg, 'Joint', '2026-11-28'), true);  // never checked
  assert.deepStrictEqual(L.controlliInRitardo(cfg, '2026-11-28'), ['Banca', 'Cassa', 'Joint']); // Vecchio is closed
});

test('validaConfig: opening balance of an account and the checks must be valid', () => {
  const base = {conti: [{nome: 'A', saldoIniziale: {data: '2026-11-10', importo: -5}}], controlli: [{d: '2026-11-20', k: 'A', banca: 1, strumento: 1, diff: 0}]};
  assert.deepStrictEqual(L.validaConfig(base), []);
  assert.ok(L.validaConfig({...base, conti: [{nome: 'A', saldoIniziale: {data: 'x', importo: 1}}]}).length);
  assert.ok(L.validaConfig({...base, controlli: [{d: '2026-11-20', k: 'Z', banca: 1, strumento: 1, diff: 0}]}).length);
});

// ---- 3.2 / R6: Trade Republic as two ordinary accounts (fund and investments), investments with paid in and value
const cfgTR = {
  conti: [{nome: 'Rev'}, {nome: 'TRF', saldoIniziale: {data: '2027-01-01', importo: 1000}}, {nome: 'TRI', saldoIniziale: {data: '2027-01-01', importo: 50}}],
  investimenti: {conto: 'TRI', valore: [{d: '2027-03-01', importo: 130}, {d: '2027-02-01', importo: 90}]},
};
const mesiTR = {'2027-01': {
  a: {d: '2027-01-12', u: 50, t: 'g', k: 'Rev', a: 'TRI'},     // monthly plan: into the investments account
  b: {d: '2027-01-15', u: 20, t: 'g', k: 'Rev', a: 'TRF'},     // into the fund
  c: {d: '2027-01-20', u: 30, t: 'g', k: 'TRF', a: 'Rev'}},    // out of the fund
  '2027-02': {
  d: {d: '2027-02-12', u: 50, t: 'g', k: 'Rev', a: 'TRI'},
  e: {d: '2027-02-14', u: 10, c: 'Fee', k: 'TRI'},             // a fee: lowers the balance, is not money put in
  g: {d: '2027-02-20', u: 15, t: 'g', k: 'TRI', a: 'TRF'},     // between the two accounts: an ordinary transfer
  f: {d: '2026-12-20', u: 999, t: 'g', k: 'Rev', a: 'TRI'}}};  // before the opening date: already inside it

test('the two Trade Republic accounts are ordinary rows of saldi(); a transfer between them is an ordinary transfer', () => {
  const s = L.saldi(mesiTR, cfgTR);
  assert.strictEqual(s.TRF, 1000 + 20 - 30 + 15);
  assert.strictEqual(s.TRI, 50 + 50 + 50 - 10 - 15);
});

test('investimenti: versato = opening + net transfers into the account, valore = latest manual value, difference between them', () => {
  const i = L.investimenti(mesiTR, cfgTR, '2027-03-15');
  assert.deepStrictEqual([i.versato, i.valore, i.data, i.diff], [135, 130, '2027-03-01', -5]); // 50 + 50 + 50 - 15, the fee is not paid in
  const prima = L.investimenti(mesiTR, cfgTR, '2027-02-15'); // a later value and the later transfer are not known yet
  assert.deepStrictEqual([prima.versato, prima.valore, prima.data, prima.diff], [150, 90, '2027-02-01', -60]);
  const senza = L.investimenti(mesiTR, {...cfgTR, investimenti: {conto: 'TRI'}}, '2027-03-15');
  assert.deepStrictEqual([senza.valore, senza.diff], [null, null]);  // no value typed yet
  assert.strictEqual(L.investimenti(mesiTR, {...cfgTR, investimenti: undefined}), null);
  assert.strictEqual(L.investimenti(mesiTR, {...cfgTR, investimenti: {conto: 'Nope'}}), null);
  assert.ok(L.investimenti(mesiTR, {...cfgTR, investimenti: {conto: 'TRI', sottosaldo: 'Old'}}, '2027-03-15')); // a leftover sottosaldo is ignored
});

test('fondoEmergenze: the balance is the balance of its account, with the opening balance like any account', () => {
  const cfg = {...cfgTR, categorie: [{nome: 'Affitto', gruppo: 'Necessarie', budget: 500}], fondoEmergenze: {conto: 'TRF', obiettivo: 2000}};
  const f = L.fondoEmergenze(mesiTR, cfg, '2027-02');
  assert.deepStrictEqual([f.saldo, f.necessarie, f.mesi, f.sotto, f.manca], [1005, 500, 2.01, true, 995]);
  assert.strictEqual(L.fondoEmergenze(mesiTR, {...cfg, fondoEmergenze: {conto: 'Nope'}}, '2027-02'), null);
});

test('validaConfig: investments and the fund name an existing account; values must be valid; old sottosaldi are ignored', () => {
  assert.deepStrictEqual(L.validaConfig(cfgTR), []);
  assert.ok(L.validaConfig({...cfgTR, investimenti: {conto: 'Nope'}}).length);                                            // no such account
  assert.ok(L.validaConfig({...cfgTR, investimenti: {conto: 'TRI', valore: [{d: '2027-13-01', importo: 5}]}}).length);
  assert.ok(L.validaConfig({...cfgTR, investimenti: {conto: 'TRI', valore: [{d: '2027-03-01', importo: -5}]}}).length);
  const vecchio = {...cfgTR, conti: [...cfgTR.conti.slice(0, 2), {nome: 'TRI', sottosaldi: [{nome: 'A'}, {nome: 'a'}]}]};
  assert.deepStrictEqual(L.validaConfig(vecchio), []);                                                                    // a leftover sottosaldi list is not even read
});

// ---- 3.3 month closing (made-up data) ----
const cfgCh = () => ({
  categorie: [
    {nome: 'Affitto', gruppo: 'Necessarie', budget: 500},
    {nome: 'Cena', gruppo: 'Non necessarie', budget: 100, taglio: 1},
    {nome: 'Svago', gruppo: 'Non necessarie', budget: 80, taglio: 2},
    {nome: 'Libri', gruppo: 'Non necessarie', budget: 50}
  ],
  salvadanai: [{nome: 'Cuscinetto', gruppo: 'Risparmi', saldoIniziale: {data: '2026-01-01', importo: 40}}, {nome: 'Viaggi', gruppo: 'Risparmi', saldoIniziale: {data: '2026-01-01', importo: 0}}]
});
const mesiCh = {'2026-01': {a: {d: '2026-01-05', u: 500, c: 'Affitto'}, b: {d: '2026-01-06', u: 30, c: 'Cena'}, c: {d: '2026-01-07', u: 120, c: 'Libri'}}};

test('chiusuraProposta: surplus goes to the buffer, an overspend the buffer cannot cover goes to the lowest-taglio bucket with enough residual', () => {
  const p = L.chiusuraProposta(mesiCh, cfgCh(), '2026-01');
  assert.deepStrictEqual(p.voci.map(v => [v.c, v.tipo, v.importo]), [['Svago', 'avanzo', 80], ['Cena', 'avanzo', 70], ['Libri', 'sforo', 70]]);
  assert.deepStrictEqual(p.scelte, {Svago: 'Cuscinetto', Cena: 'Cuscinetto', Libri: 'Cena'});
});

test('chiusuraCalcola: the bucket that covers an overspend gives up that part of its own surplus', () => {
  const r = L.chiusuraCalcola(mesiCh, cfgCh(), '2026-01', {Svago: 'Cuscinetto', Cena: 'Cuscinetto', Libri: 'Cena'});
  const per = c => r.righe.find(x => x.c === c);
  assert.deepStrictEqual([per('Libri').coperto, per('Cena').coperto], [70, 70]);
  assert.deepStrictEqual([r.avanzo, r.sforo, r.scoperto, r.errori], [80, 70, 0, []]);
});

test('chiusuraCalcola: an overspend is never taken below zero from the buffer; the rest is reported as scoperto', () => {
  const r = L.chiusuraCalcola(mesiCh, cfgCh(), '2026-01', {Svago: '', Cena: '', Libri: 'Cuscinetto'});
  assert.strictEqual(r.righe.find(x => x.c === 'Libri').coperto, 40);
  assert.strictEqual(r.scoperto, 30);
  assert.strictEqual(r.errori.length, 1);
});

test('chiusuraCalcola: the emergency fund and non-pots are refused as destination or source', () => {
  const cfg = cfgCh(); cfg.salvadanai.push({nome: 'Fondo emergenze', saldoIniziale: {data: '2026-01-01', importo: 999}});
  const r = L.chiusuraCalcola(mesiCh, cfg, '2026-01', {Svago: 'Fondo emergenze', Cena: 'Affitto', Libri: 'Fondo emergenze'});
  assert.strictEqual(r.errori.length, 3);
  assert.deepStrictEqual(r.righe.map(x => x.a), ['', '', '']);
});

test('saldoSalvadanaio: a saved closing adds the surplus to and takes the overspend from the pot, from its month on', () => {
  const sv = {nome: 'Cuscinetto', saldoIniziale: {data: '2026-01-01', importo: 40}};
  const ch = {'2026-01': {righe: [{c: 'Cena', tipo: 'avanzo', importo: 70, a: 'Cuscinetto', coperto: 20}, {c: 'Libri', tipo: 'sforo', importo: 70, a: 'Cuscinetto', coperto: 30}, {c: 'X', tipo: 'avanzo', importo: 5, a: 'Viaggi', coperto: 0}]}};
  assert.strictEqual(L.saldoSalvadanaio({}, sv, '2026-01'), 40);
  assert.strictEqual(L.saldoSalvadanaio({}, sv, '2026-01', ch), 60);
  assert.strictEqual(L.saldoSalvadanaio({}, sv, '2026-03', ch), 60);
  assert.strictEqual(L.saldoSalvadanaio({}, {nome: 'Cuscinetto', saldoIniziale: {data: '2026-02-01', importo: 0}}, '2026-03', ch), 0);
});

test('chiusuraProposta: a redone closing does not count in the balances it is computed from; no differences = no items', () => {
  const cfg = cfgCh();
  cfg.chiusure = {'2026-01': {righe: [{c: 'Cena', tipo: 'avanzo', importo: 70, a: 'Cuscinetto', coperto: 0}]}};
  assert.strictEqual(L.chiusuraProposta(mesiCh, cfg, '2026-01').scelte.Libri, 'Cena'); // buffer is 40, not 110
  assert.deepStrictEqual(L.chiusuraProposta({}, cfgCh(), '2026-02').voci.length, 4); // nothing spent: every budget is a surplus
  const tutto = {'2026-02': {a: {d: '2026-02-01', u: 500, c: 'Affitto'}, b: {d: '2026-02-01', u: 100, c: 'Cena'}, c: {d: '2026-02-01', u: 80, c: 'Svago'}, d: {d: '2026-02-01', u: 50, c: 'Libri'}}};
  assert.deepStrictEqual(L.chiusuraProposta(tutto, cfgCh(), '2026-02').voci, []);
});

test('chiusuraStato and chiusuraMancante: closed once, reopen only while the next month is open; reminder for the previous month', () => {
  const cfg = {chiusure: {'2026-01': {righe: []}}};
  assert.deepStrictEqual([L.chiusuraStato(cfg, '2026-01').chiusa, L.chiusuraStato(cfg, '2026-01').puoRiaprire], [true, true]);
  assert.strictEqual(L.chiusuraStato({chiusure: {'2026-12': {}, '2027-01': {}}}, '2026-12').puoRiaprire, false);
  assert.strictEqual(L.chiusuraStato(cfg, '2026-02').chiusa, false);
  assert.strictEqual(L.chiusuraMancante(mesiCh, {}, '2026-02'), '2026-01');
  assert.strictEqual(L.chiusuraMancante(mesiCh, cfg, '2026-02'), null);
  assert.strictEqual(L.chiusuraMancante(mesiCh, {}, '2026-03'), null); // February has no movements
});

test('ammanco: a closing that takes money from a pot counts in its balance', () => {
  const cfg = cfgCh(); cfg.chiusure = {'2026-01': {righe: [{c: 'Libri', tipo: 'sforo', importo: 30, a: 'Cuscinetto', coperto: 30}]}};
  assert.strictEqual(L.ammanco({}, cfg, {d: '2026-02-03', u: 25, c: 'Cuscinetto'}), 15);
});

test('meseDelta shifts a month across the year boundary', () => {
  assert.strictEqual(L.meseDelta('2026-01', -1), '2025-12');
  assert.strictEqual(L.meseDelta('2026-12', 1), '2027-01');
});

test('chiusura: a pot cannot give money a later month already spent, and a closing whose money was spent cannot be reopened', () => {
  const cfg = cfgCh();
  cfg.salvadanai[0].saldoIniziale.importo = 100; // buffer
  const mesi = {...mesiCh, '2026-02': {z: {d: '2026-02-10', u: 90, c: 'Cuscinetto'}}}; // 90 spent from the buffer in February
  assert.strictEqual(L.chiusuraProposta(mesi, cfg, '2026-01').pots.Cuscinetto, 10); // 100 now, only 10 left after February
  cfg.chiusure = {'2026-01': {d: '2026-02-01', righe: [{c: 'Cena', tipo: 'avanzo', importo: 70, a: 'Cuscinetto', coperto: 0}]}};
  const mesi2 = {...mesiCh, '2026-02': {z: {d: '2026-02-10', u: 150, c: 'Cuscinetto'}}}; // spent the closing's money too
  assert.strictEqual(L.chiusuraStato(cfg, '2026-01', mesi2).puoRiaprire, false);
  assert.strictEqual(L.chiusuraStato(cfg, '2026-01', mesi).puoRiaprire, true);
});

// ---- 3.4: net worth, its monthly series, summary per group, savings rate (made-up data) ----
const cfgW = () => ({
  conti: [
    {nome: 'Banca', saldoIniziale: {data: '2026-01-01', importo: 1000}},
    {nome: 'Cond', joint: true, saldoIniziale: {data: '2026-01-01', importo: 2000}},
    {nome: 'Fondo', saldoIniziale: {data: '2026-01-01', importo: 300}},
    {nome: 'Inv', saldoIniziale: {data: '2026-01-01', importo: 150}},
  ],
  quotaJoint: [{da: '2026-01-01', pct: 50}],
  investimenti: {conto: 'Inv', valore: [{d: '2026-02-01', importo: 200}]},
});
const pv = (r, nome) => r.componenti.find(c => c.nome === nome).importo;

test('patrimonio: accounts, Joint at my share, the investments account at value instead of its balance', () => {
  const r = L.patrimonio({}, cfgW(), '2026-03-01');
  assert.strictEqual(pv(r, 'Banca'), 1000);
  assert.strictEqual(pv(r, 'Cond'), 1000); // 50% of 2000
  assert.strictEqual(pv(r, 'Fondo'), 300);
  assert.strictEqual(pv(r, 'Inv'), 200); // the value, not the 150 of the balance, and no second line
  assert.strictEqual(r.componenti.filter(c => c.tipo === 'investimenti').length, 1);
  assert.strictEqual(r.totale, 2500);
  assert.strictEqual(L.patrimonio({}, cfgW(), '2026-01-15').totale, 2450); // no value typed yet: the balance
});

test('patrimonio: the Joint uses the share in force at the date; a partner top-up counts only at my share', () => {
  const cfg = cfgW(); cfg.quotaJoint.push({da: '2026-03-01', pct: 60});
  const mesi = {'2026-02': {a: {d: '2026-02-10', e: 400, k: 'Cond', t: 'vj'}}};
  assert.strictEqual(pv(L.patrimonio(mesi, cfg, '2026-02-28'), 'Cond'), 1200); // (2000+400) x 50%
  assert.strictEqual(pv(L.patrimonio(mesi, cfg, '2026-03-31'), 'Cond'), 1440); // x 60%
  assert.strictEqual(L.patrimonio({}, cfgW(), '2026-03-01').componenti.find(c => c.nome === 'Cond').saldo, 2000);
  const sq = cfgW(); sq.quotaJoint = [];
  const r = L.patrimonio({}, sq, '2026-03-01');
  assert.strictEqual(pv(r, 'Cond'), 0); assert.strictEqual(r.senzaQuota, true);
});

test('patrimonio: a transfer between accounts changes nothing; spending does', () => {
  const mesi = {'2026-02': {a: {d: '2026-02-05', u: 100, k: 'Banca', a: 'Fondo', t: 'g'}}};
  assert.strictEqual(L.patrimonio(mesi, cfgW(), '2026-03-01').totale, 2500);
  mesi['2026-02'].b = {d: '2026-02-06', u: 30, k: 'Banca', c: 'X'};
  assert.strictEqual(L.patrimonio(mesi, cfgW(), '2026-03-01').totale, 2470);
});

test('patrimonio: money paid into investments leaves the account; the value decides what it is worth', () => {
  const mesi = {'2026-02': {a: {d: '2026-02-12', u: 50, k: 'Banca', a: 'Inv', t: 'g'}}};
  const r = L.patrimonio(mesi, cfgW(), '2026-03-01'); // value still 200: Banca -50, the investments line unchanged until the value is updated
  assert.strictEqual(r.totale, 2450);
  assert.strictEqual(pv(r, 'Inv'), 200); assert.strictEqual(pv(r, 'Banca'), 950);
});

test('patrimonio: a closed account keeps what it holds; an account not yet opened at the date is left out and flagged', () => {
  const cfg = cfgW(); cfg.conti.push({nome: 'Old', chiuso: true, saldoIniziale: {data: '2026-01-01', importo: 40}});
  assert.strictEqual(pv(L.patrimonio({}, cfg, '2026-03-01'), 'Old'), 40);
  cfg.conti[0].saldoIniziale.data = '2026-02-01';
  const r = L.patrimonio({}, cfg, '2026-01-31');
  assert.strictEqual(r.componenti.some(c => c.nome === 'Banca'), false);
  assert.strictEqual(r.parziale, true);
});

test('patrimonio: an open account without an opening balance is flagged; open credits are shown apart', () => {
  const cfg = cfgW(); delete cfg.conti[0].saldoIniziale;
  assert.deepStrictEqual(L.patrimonio({}, cfg, '2026-03-01').senzaSaldo, ['Banca']);
  assert.deepStrictEqual(L.patrimonio({}, cfgW(), '2026-03-01').senzaSaldo, []);
  const c2 = cfgW(); c2.magazzinoTCG = [{d: '2026-02-10', importo: 80}]; // a leftover of the removed stock field is ignored
  assert.strictEqual(L.patrimonio({}, c2, '2026-02-20').totale, L.patrimonio({}, cfgW(), '2026-02-20').totale);
  assert.strictEqual(L.patrimonio({}, c2, '2026-02-20').componenti.some(c => c.tipo === 'tcg'), false);
  const mesi = {'2026-02': {a: {d: '2026-02-05', u: 100, p: 60, k: 'Banca', c: 'Cena'}}};
  const r = L.patrimonio(mesi, cfgW(), '2026-03-01');
  assert.strictEqual(r.crediti, 40); assert.strictEqual(r.totale, 2400);
});

test('patrimonioSerie: end of every month from the oldest data to today, with the change on the month before', () => {
  const mesi = {'2026-01': {a: {d: '2026-01-10', u: 100, k: 'Banca', c: 'X'}}, '2026-03': {b: {d: '2026-03-03', e: 500, k: 'Banca', c: 'Stip'}}};
  const s = L.patrimonioSerie(mesi, cfgW(), '2026-03-20');
  assert.deepStrictEqual(s.map(x => x.ym), ['2026-01', '2026-02', '2026-03']);
  assert.deepStrictEqual(s.map(x => x.totale), [2350, 2400, 2900]); // Feb: the investments line gets its value (200 vs the balance 150)
  assert.deepStrictEqual(s.map(x => x.delta), [null, 50, 500]);
  assert.strictEqual(s[0].parziale, false);
  const cfg = cfgW(); cfg.conti[0].saldoIniziale.data = '2026-02-01';
  assert.strictEqual(L.patrimonioSerie(mesi, cfg, '2026-03-20')[0].parziale, true);
  assert.deepStrictEqual(L.patrimonioSerie({}, cfgW(), '2026-03-20'), []);
});

const cfgG = () => ({
  categorie: [
    {nome: 'Affitto', gruppo: 'Necessarie', budget: 500}, {nome: 'Cena', gruppo: 'Non necessarie', budget: 200},
    {nome: 'Stipendio', entrata: true, finanzia: true},
  ],
  salvadanai: [
    {nome: 'Cuscinetto', gruppo: 'Risparmi', conto: 'Banca', quota: 100, saldoIniziale: {data: '2026-01-01', importo: 0}},
    {nome: 'Viaggi di coppia', gruppo: 'Risparmi', conto: 'Banca', quota: 50, saldoIniziale: {data: '2026-01-01', importo: 0}},
    {nome: 'Auto', gruppo: 'Necessarie', conto: 'Banca', quota: 30, saldoIniziale: {data: '2026-01-01', importo: 0}},
  ],
  conti: [{nome: 'Banca', saldoIniziale: {data: '2026-01-01', importo: 0}}, {nome: 'Broker'}],
  investimenti: {conto: 'Broker'},
});
const mesiG = () => ({'2026-02': {
  s: {d: '2026-02-05', e: 2000, k: 'Banca', c: 'Stipendio'},
  a: {d: '2026-02-06', u: 500, k: 'Banca', c: 'Affitto'}, b: {d: '2026-02-09', u: 250, k: 'Banca', c: 'Cena'},
  c: {d: '2026-02-12', u: 20, k: 'Banca', c: 'Auto'},
  g: {d: '2026-02-12', u: 50, k: 'Banca', a: 'Broker', t: 'g'},
}});

test('riepilogoGruppi: per group the plan budget, what was spent, the residual and the shares of the salary', () => {
  const r = L.riepilogoGruppi(mesiG(), cfgG(), '2026-02');
  assert.strictEqual(r.stipendio, 2000); assert.strictEqual(r.fonte, 'incassato');
  const g = n => r.gruppi.find(x => x.gruppo === n);
  assert.deepStrictEqual([g('Necessarie').budget, g('Necessarie').speso, g('Necessarie').residuo], [530, 520, 10]);
  assert.deepStrictEqual([g('Non necessarie').budget, g('Non necessarie').speso, g('Non necessarie').residuo], [200, 250, -50]);
  assert.deepStrictEqual([g('Risparmi').budget, g('Risparmi').speso], [150, 0]);
  assert.strictEqual(g('Necessarie').pctSpeso, 0.26); assert.strictEqual(g('Necessarie').pctPiano, 0.265);
  assert.deepStrictEqual(r.gruppi.map(x => x.gruppo), ['Necessarie', 'Non necessarie', 'Risparmi']);
});

test('riepilogoGruppi: without a recorded salary it uses the plan salary of the month, without either the shares are 0', () => {
  const cfg = cfgG(); cfg.piani = {'2026-02': {stipendio: 1800, righe: [{nome: 'Cena', importo: 180}]}};
  const mesi = mesiG(); delete mesi['2026-02'].s;
  const r = L.riepilogoGruppi(mesi, cfg, '2026-02');
  assert.deepStrictEqual([r.stipendio, r.fonte], [1800, 'piano']);
  assert.strictEqual(r.gruppi.find(x => x.gruppo === 'Non necessarie').budget, 180);
  const n = L.riepilogoGruppi(mesi, cfgG(), '2026-02');
  assert.deepStrictEqual([n.stipendio, n.fonte, n.gruppi[0].pctSpeso], [0, 'nessuno', 0]);
});

test('tassoRisparmio: PAC + buffer + couple trips over the salary against the minimum; planned-expense pots do not count', () => {
  const r = L.tassoRisparmio(mesiG(), cfgG(), '2026-02');
  assert.deepStrictEqual([r.pac, r.cuscinetto, r.viaggi, r.risparmio], [50, 100, 50, 200]);
  assert.strictEqual(r.tasso, 0.1); assert.strictEqual(r.minimo, 10); assert.strictEqual(r.sopra, true); // Auto (30) is not savings
  const cfg = cfgG(); cfg.risparmioMin = 12;
  assert.strictEqual(L.tassoRisparmio(mesiG(), cfg, '2026-02').sopra, false);
  assert.strictEqual(L.tassoRisparmio({}, cfgG(), '2026-02').tasso, null); // no salary
});

test('tassoRisparmio: a surplus put in the buffer by the month closing counts, one left on the account does not; withdrawals do not go below 0', () => {
  const cfg = cfgG();
  cfg.chiusure = {'2026-02': {righe: [{c: 'X', tipo: 'avanzo', importo: 60, a: 'Cuscinetto', coperto: 10}, {c: 'Y', tipo: 'avanzo', importo: 70, a: '', coperto: 0}]}};
  assert.strictEqual(L.tassoRisparmio(mesiG(), cfg, '2026-02').cuscinetto, 150);
  const mesi = mesiG(); mesi['2026-02'].w = {d: '2026-02-20', u: 90, k: 'Broker', a: 'Banca', t: 'g'};
  assert.strictEqual(L.tassoRisparmio(mesi, cfgG(), '2026-02').pac, 0);
});

test('validaConfig: the savings minimum; a leftover magazzinoTCG is ignored without errors', () => {
  const ok = Object.assign(cfgW(), {magazzinoTCG: [{d: 'x', importo: 80}], risparmioMin: 10});
  assert.deepStrictEqual(L.validaConfig(ok), []);
  assert.strictEqual(L.validaConfig(Object.assign(cfgW(), {risparmioMin: -3})).length, 1);
});

test('chiusuraStato: a pot with sottoZero never blocks reopening a month', () => {
  const mesi = {'2026-01': {a: {d: '2026-01-20', u: 90, c: 'Fondo TCG'}}};
  const cfg = {chiusure: {'2026-01': {righe: [{c: 'Svago', tipo: 'avanzo', importo: 50, a: 'Fondo TCG', coperto: 0}]}}, salvadanai: [{nome: 'Fondo TCG', conto: 'A', quota: 0, sottoZero: true, saldoIniziale: {data: '2026-01-01', importo: 0}}]};
  assert.strictEqual(L.chiusuraStato(cfg, '2026-01', mesi).puoRiaprire, true);
  delete cfg.salvadanai[0].sottoZero;
  assert.strictEqual(L.chiusuraStato(cfg, '2026-01', mesi).puoRiaprire, false);
});

test('tassoRisparmio: a transfer from the fund account to the investments account counts as PAC (R6)', () => {
  const cfg = {...cfgG(), conti: [{nome: 'Banca'}, {nome: 'Fondo'}, {nome: 'Broker'}]};
  const mesi = mesiG(); mesi['2026-02'].h = {d: '2026-02-15', u: 30, k: 'Fondo', a: 'Broker', t: 'g'};
  assert.strictEqual(L.tassoRisparmio(mesi, cfg, '2026-02').pac, 80); // 50 from the bank + 30 from the fund
});

// --- R7: "in ammanco" = balance under what the plan has matured by now (invented data) ---
const cfgR7 = salv => ({salvadanai: salv});
const regali = (extra) => ({nome: 'Regali', conto: 'A', quota: 10, obiettivo: 240, saldoIniziale: {data: '2027-01-01', importo: 0}, ...extra});

test('mancaRispettoPiano: a pot with a fixed quota and a goal matures goal x months of the year / 12', () => {
  assert.strictEqual(L.mancaRispettoPiano({}, regali({quota: 20}), '2027-04'), 0);   // balance 80, matured 80
  assert.strictEqual(L.mancaRispettoPiano({}, regali(), '2027-04'), 40);             // balance 40, matured 80: late
  assert.strictEqual(L.mancaRispettoPiano({}, regali(), '2027-12'), 120);            // by December the whole goal
  assert.strictEqual(L.mancaRispettoPiano({}, regali({obiettivo: undefined}), '2027-04'), 0); // no goal, no voci: nothing to miss
});

test('mancaRispettoPiano: just filled by an extra income, it is no longer short', () => {
  const mesi = {'2027-03': {a: {d: '2027-03-10', e: 40, t: 'x2', b: 'Regali'}}};
  assert.strictEqual(L.mancaRispettoPiano(mesi, regali(), '2027-04'), 0);
  const poco = {'2027-03': {a: {d: '2027-03-10', e: 25, t: 'x2', b: 'Regali'}}};
  assert.strictEqual(L.mancaRispettoPiano(poco, regali(), '2027-04'), 15);
});

test('mancaRispettoPiano with voci: matured part of every voce of the current cycle', () => {
  const bollo = {nome: 'Bollo', annuale: 200, data: '2027-09'}, tagliando = {nome: 'Tagliando', annuale: 90, data: '2027-12'};
  const sv = svV([bollo, tagliando]);
  assert.strictEqual(L.mancaRispettoPiano({}, sv, '2027-04'), 0); // quotas accrued on schedule
  const spesa = {'2027-03': {a: {d: '2027-03-05', u: 50, c: 'Auto'}}};
  assert.strictEqual(L.mancaRispettoPiano(spesa, sv, '2027-04'), 50); // an unrelated expense leaves the pot behind
});

test('mancaRispettoPiano with voci: a voce already paid in the cycle contributes nothing', () => {
  const bollo = {nome: 'Bollo', annuale: 200, data: '2027-09'};
  const pagato = {'2027-03': {a: {d: '2027-03-05', u: 50, c: 'Auto', v: 'Bollo'}}};
  assert.strictEqual(L.mancaRispettoPiano(pagato, svV([bollo]), '2027-04'), 0);
  const altra = {'2027-03': {a: {d: '2027-03-05', u: 50, c: 'Auto', v: 'Altro'}}}; // another voce: Bollo is not paid
  assert.strictEqual(L.mancaRispettoPiano(altra, svV([bollo]), '2027-04'), 50);
});

test('mancaRispettoPiano with voci: after the due month the next cycle starts from zero', () => {
  const rin = {nome: 'Revisione', annuale: 80, data: '2027-09', cicli: 24};
  const speso = {'2027-09': {a: {d: '2027-09-10', u: 80, c: 'Auto'}}}; // the 80 left the pot at the due date, a new cycle starts
  assert.strictEqual(L.mancaRispettoPiano(speso, svV([rin]), '2027-10'), 0); // matured 3.33 = balance 3.33 (the old cycle would say 80)
});

test('mancaRispettoPiano: the emergency fund needs its whole goal at any time; a sottoZero pot is out', () => {
  const fe = {nome: 'Fondo emergenze', conto: 'A', quota: 0, obiettivo: 1000, saldoIniziale: {data: '2027-01-01', importo: 800}};
  assert.strictEqual(L.mancaRispettoPiano({}, fe, '2027-01', {emergenze: 'Fondo emergenze'}), 200);
  assert.strictEqual(L.mancaRispettoPiano({}, {...regali(), sottoZero: true}, '2027-04'), 0);
});

test('destinazioneExtra (R7): the pot furthest behind its plan wins and the reason says how much is missing', () => {
  const cfg = cfgR7([regali(), regali({nome: 'Viaggi', quota: 5}), svX('Investimenti', 0)]); // Regali short 40, Viaggi short 60
  const r = L.destinazioneExtra({}, cfg, {d: '2027-04-03', e: 200});
  assert.strictEqual(r.b, 'Viaggi');
  assert.match(r.motivo, /60,00/);
});

test('destinazioneExtra (R7): pots on schedule are skipped, then investments, then the buffer', () => {
  const inRegola = cfgR7([regali({quota: 20}), svX('Investimenti', 0)]);
  assert.strictEqual(L.destinazioneExtra({}, inRegola, {d: '2027-04-03', e: 200}).b, 'Investimenti');
  assert.strictEqual(L.destinazioneExtra({}, cfgR7([regali({quota: 20})]), {d: '2027-04-03', e: 200}).b, 'Cuscinetto');
});

// Initial credit and instalment refunds (3.6)
const iniz = {'2027-01': {c1: {d: '2027-01-01', u: 1000, t: 'cr', n: 'Opening credit'}}, '2027-02': {r1: {d: '2027-02-10', e: 300, t: 'rb', r: 'c1', k: 'Cash'}, r2: {d: '2027-02-20', e: 200, t: 'rb', r: 'c1', k: 'Cash'}}};

test('creditiAperti lists a loan (cr) with initial, refunded and what is left; partial refunds are added up', () => {
  const r = L.creditiAperti(iniz);
  assert.deepStrictEqual(r.map(x => [x.id, x.importo, x.rimborsato, x.residuo]), [['c1', 1000, 500, 500]]);
});

test('creditiAperti: a loan closes only when the refunds reach its amount; a deleted refund reopens it', () => {
  const m = JSON.parse(JSON.stringify(iniz));
  m['2027-02'].r2.e = 700;
  assert.deepStrictEqual(L.creditiAperti(m), []);
  m['2027-02'].r2.x = 1;
  assert.strictEqual(L.creditiAperti(m)[0].residuo, 700);
});

test('creditiAperti: ignoring one movement shows the credit as it was before that refund (editing it)', () => {
  assert.strictEqual(L.creditiAperti(iniz, 'r2')[0].residuo, 700);
});

test('creditiAperti: a split expense still closes with any refund (regression of 1.5)', () => {
  const m = JSON.parse(JSON.stringify(split));
  m['2027-02'].b1.e = 5;
  assert.deepStrictEqual(L.creditiAperti(m).map(x => x.id), ['b2']);
  assert.strictEqual(L.creditiAperti(m)[0].tipo, 'sp');
});

test('saldi: an initial credit without account moves no account balance and leaves no blank row', () => {
  const s = L.saldi(iniz, {conti: [{nome: 'Cash'}]});
  assert.deepStrictEqual(s, {Cash: 500});
});

test('azzeraPiano counts months and live movements to delete and the config parts to clear', () => {
  const mesi = {'2027-01': {a: {d: '2027-01-02', u: 1}, b: {d: '2027-01-03', u: 1, x: 1}}, '2027-02': {c: {d: '2027-02-01', e: 5}}};
  const cfg = {controlli: [{}, {}], chiusure: {'2027-01': {}}, piani: {'2027-01': {}, '2027-02': {}}, categorie: [{nome: 'A'}]};
  const r = L.azzeraPiano(mesi, cfg, {controlli: true, chiusure: true, piani: true});
  assert.deepStrictEqual([r.mesi, r.mov, r.controlli, r.chiusure, r.piani], [2, 2, 2, 1, 2]);
  assert.deepStrictEqual(r.campi, ['controlli', 'chiusure', 'piani']);
  assert.deepStrictEqual(r.nomiMesi, ['2027-01', '2027-02']);
  const n = L.azzeraPiano(mesi, cfg, {controlli: false, chiusure: true, piani: false});
  assert.deepStrictEqual([n.campi, n.controlli, n.piani], [['chiusure'], 0, 0]);
  assert.deepStrictEqual(L.azzeraPiano({}, {}, {controlli: true, chiusure: true, piani: true}), {mesi: 0, mov: 0, controlli: 0, chiusure: 0, piani: 0, campi: [], nomiMesi: []});
});

// 4.1: saldo dell'etichetta (made-up data)
const mesiTcg = {
  '2027-03': {
    a1: {d: '2027-03-05', u: 30, c: 'TCG', k: 'Revolut', l: ['TCG', 'Torneo']},
    a2: {d: '2027-03-12', u: 80, p: 40, q: 50, c: 'TCG', k: 'Joint', l: ['tcg', 'Judge']},
    a3: {d: '2027-03-20', e: 120, c: 'Vendita carte', k: 'Revolut', l: ['TCG', 'Compravendita'], t: 'x2', b: 'Fondo TCG'},
    a4: {d: '2027-03-21', u: 500, a: 'Risparmi', k: 'Revolut', t: 'g', l: ['TCG']},
    a5: {d: '2027-03-22', e: 40, k: 'Joint', t: 'vj', l: ['TCG']},
    a6: {d: '2027-03-23', u: 9, c: 'Spesa', k: 'Revolut', l: ['Altro']},
    a7: {d: '2027-03-24', u: 15, c: 'TCG', k: 'Revolut', l: ['TCG'], x: 1},
  },
  '2027-04': {
    b1: {d: '2027-04-02', u: 20, c: 'TCG', k: 'Revolut', l: ['TCG']},
    b2: {d: '2027-04-09', e: 100, c: 'Vendita carte', k: 'Revolut', l: ['TCG', 'Compravendita']},
  },
  '2028-01': {c1: {d: '2028-01-03', u: 10, c: 'TCG', k: 'Revolut', l: ['TCG']}},
};

test('saldoEtichetta: income minus expense, my share on the Joint, transfers/top-ups/deleted left out', () => {
  const r = L.saldoEtichetta(mesiTcg, 'TCG', '2027-03');
  assert.deepStrictEqual([r.entrate, r.uscite, r.saldo, r.n], [120, 70, 50, 3]);
});

test('saldoEtichetta: period is all, a year or a month; the label ignores case', () => {
  assert.strictEqual(L.saldoEtichetta(mesiTcg, 'tcg').saldo, 50 + 80 - 10);
  assert.strictEqual(L.saldoEtichetta(mesiTcg, 'TCG', '2027').saldo, 50 + 80);
  assert.strictEqual(L.saldoEtichetta(mesiTcg, 'TCG', '2027-04').saldo, 80);
  assert.deepStrictEqual(L.saldoEtichetta(mesiTcg, 'TCG', '2029'), {entrate: 0, uscite: 0, saldo: 0, n: 0, sotto: [], categorie: []});
});

test('saldoEtichetta: detail by the other labels of the same movement and by category', () => {
  const r = L.saldoEtichetta(mesiTcg, 'TCG', '2027-03');
  assert.deepStrictEqual(r.sotto.map(x => [x.l, x.saldo, x.n]), [['Compravendita', 120, 1], ['Judge', -40, 1], ['Torneo', -30, 1]]);
  assert.deepStrictEqual(r.categorie.map(x => [x.c, x.entrate, x.uscite, x.saldo]), [['Vendita carte', 120, 0, 120], ['TCG', 0, 70, -70]]);
  const solo = L.saldoEtichetta(mesiTcg, 'TCG', '2027-04');
  assert.deepStrictEqual(solo.sotto.map(x => [x.l, x.saldo]), [['Compravendita', 100], ['', -20]]);
});

test('saldoEtichetta: a loss is a negative balance; any other label works', () => {
  assert.strictEqual(L.saldoEtichetta({'2027-05': {z: {d: '2027-05-01', u: 25, l: ['Gara']}}}, 'Gara').saldo, -25);
});

test('Fondo TCG: a card sale feeds it, below zero it is to be won back, and the suggestion says how much', () => {
  const cfg = {salvadanai: [{nome: 'Fondo TCG', gruppo: 'Non necessarie', conto: 'Revolut', saldoIniziale: {data: '2027-03-01', importo: 0}, quota: 0, sottoZero: true}]};
  const mesi = {'2027-03': {s: {d: '2027-03-02', u: 60, c: 'Fondo TCG', k: 'Revolut'}}};
  const sv = cfg.salvadanai[0];
  assert.strictEqual(L.saldoSalvadanaio(mesi, sv, '2027-03'), -60);
  const dest = L.destinazioneExtra(mesi, cfg, {d: '2027-03-20', e: 25, l: ['TCG']});
  assert.strictEqual(dest.b, 'Fondo TCG');
  assert.match(dest.motivo, /mancano 60,00/);
  mesi['2027-03'].v = {d: '2027-03-20', e: 25, c: 'Vendita carte', b: 'Fondo TCG', k: 'Revolut', l: ['TCG']};
  assert.strictEqual(L.saldoSalvadanaio(mesi, sv, '2027-03'), -35);
  assert.strictEqual(L.saldoEtichetta(mesi, 'TCG').saldo, 25); // the fund spend has no TCG label: only the labelled sale counts
});

// ---- 4.2: due-date coverage (B11) and end-of-year projection ----
const potCompleanno = (extra) => Object.assign({nome: 'Compleanno', gruppo: 'Non necessarie', conto: 'Revolut', saldoIniziale: {data: '2026-01-01', importo: 0},
  voci: [{nome: 'Regali', annuale: 200, data: '2026-06', cambio: {da: '2026-01', quota: 25}}]}, extra);

test('scadenze: a yearly voce the pot cannot reach is flagged with how much is missing (150 of 200 -> 50)', () => {
  const cfg = {salvadanai: [potCompleanno()]};
  assert.deepStrictEqual(L.scadenze({}, cfg, '2026-01-15'),
    [{salvadanaio: 'Compleanno', voce: 'Regali', data: '2026-06', importo: 200, saldoPrevisto: 150, manca: 50, mesi: 5}]);
  cfg.salvadanai[0].saldoIniziale.importo = 100; // 100 more in the pot: covered
  const r = L.scadenze({}, cfg, '2026-01-15');
  assert.deepStrictEqual([r[0].saldoPrevisto, r[0].manca], [250, 0]);
});

test('scadenze: a voce already paid in its cycle is not listed; a later voce sees the earlier payment taken out', () => {
  const cfg = {salvadanai: [potCompleanno()]};
  const pagata = {'2026-01': {a: {d: '2026-01-10', u: 200, c: 'Compleanno', v: 'Regali', k: 'Revolut'}}};
  assert.deepStrictEqual(L.scadenze(pagata, cfg, '2026-01-15'), []);
  const due = {nome: 'Auto', gruppo: 'Necessarie', conto: 'Revolut', saldoIniziale: {data: '2026-01-01', importo: 0}, voci: [
    {nome: 'B', annuale: 150, data: '2026-04', cambio: {da: '2026-01', quota: 20}}, {nome: 'A', annuale: 100, data: '2026-03', cambio: {da: '2026-01', quota: 30}}]};
  const r = L.scadenze({}, {salvadanai: [due]}, '2026-01-05');
  assert.deepStrictEqual(r.map(x => [x.voce, x.data, x.saldoPrevisto, x.manca]), [['A', '2026-03', 150, 0], ['B', '2026-04', 100, 50]]);
});

test('scadenze: the Fondo TCG (sottoZero) and the emergency fund have none', () => {
  const cfg = {salvadanai: [potCompleanno({nome: 'Fondo TCG', sottoZero: true}), potCompleanno({nome: 'Fondo emergenze'})]};
  assert.deepStrictEqual(L.scadenze({}, cfg, '2026-01-15'), []);
});

const cfgAnno = () => ({
  categorie: [{nome: 'Spesa', gruppo: 'Necessarie', budget: 300}],
  conti: [{nome: 'Revolut', saldoIniziale: {data: '2026-09-01', importo: 1000}}],
  salvadanai: [{nome: 'Fondo', gruppo: 'Risparmi', conto: 'Revolut', saldoIniziale: {data: '2026-09-01', importo: 0}, quota: 50}],
});
const spesa = (d, u) => ({d: d, u: u, c: 'Spesa', k: 'Revolut'});

test('proiezioneAnno: no data says so instead of inventing figures; pots are still projected', () => {
  const r = L.proiezioneAnno({}, cfgAnno(), '2026-11-15');
  assert.strictEqual(r.ritmo.ok, false);
  assert.strictEqual(r.budget, null);
  assert.strictEqual(r.patrimonio.ok, false);
  assert.deepStrictEqual(r.mesi, ['2026-11', '2026-12']);
  assert.deepStrictEqual([r.salvadanai[0].saldi, r.salvadanai[0].finale], [[150, 200], 200]); // Sep, Oct, Nov = 150, then Dec
});

test('proiezioneAnno: only the current month of data is not enough for a pace', () => {
  const r = L.proiezioneAnno({'2026-11': {a: spesa('2026-11-03', 80)}}, cfgAnno(), '2026-11-15');
  assert.strictEqual(r.ritmo.ok, false);
  assert.strictEqual(r.ritmo.mesiDati, 0);
});

test('proiezioneAnno: full months give the pace; budget, pots and net worth follow it', () => {
  const mesi = {'2026-09': {a: spesa('2026-09-05', 150)}, '2026-10': {a: spesa('2026-10-05', 250)}, '2026-11': {a: spesa('2026-11-03', 100)}};
  const cfg = cfgAnno();
  const noPiano = L.proiezioneAnno(mesi, cfg, '2026-11-15');
  assert.strictEqual(noPiano.ritmo.ok, true);
  assert.strictEqual(noPiano.ritmo.mesiDati, 2);
  assert.strictEqual(noPiano.patrimonio.ok, false); // no saved plan
  cfg.piani = {'2026-10': {stipendio: 1000, righe: [{nome: 'Spesa', importo: 300}, {nome: 'Fondo', importo: 50}]}};
  const r = L.proiezioneAnno(mesi, cfg, '2026-11-15');
  // pace = (150 + 250) / 2 = 200; November has 100 so far -> 200 expected; December 200
  assert.deepStrictEqual(r.budget, [{ym: '2026-11', budget: 300, speso: 200, spendibile: 100}, {ym: '2026-12', budget: 300, speso: 200, spendibile: 100}]);
  // net worth today 1000 - 150 - 250 - 100 = 500; rest of November -100 -> 400; December +50 (pot) +100 (unspent budget) -> 550
  assert.deepStrictEqual(r.patrimonio, {ok: true, oggi: 500, fine: 550, serie: [{ym: '2026-11', totale: 400}, {ym: '2026-12', totale: 550}], parziale: false});
});

test('proiezioneAnno: a pot whose voce falls due before the money is there ends the year below zero', () => {
  const cfg = {salvadanai: [{nome: 'Auto', gruppo: 'Necessarie', conto: 'Revolut', saldoIniziale: {data: '2026-01-01', importo: 0},
    voci: [{nome: 'Bollo', annuale: 600, data: '2026-12', cambio: {da: '2026-01', quota: 10}}]}]};
  const r = L.proiezioneAnno({}, cfg, '2026-11-15');
  assert.deepStrictEqual([r.salvadanai[0].saldi, r.salvadanai[0].finale, r.salvadanai[0].sotto], [[110, -480], -480, true]);
  assert.strictEqual(r.scoperte, 1);
  assert.strictEqual(r.scadenze[0].manca, 480);
});

test('proiezioneAnno: no accounts means no net worth projection; a voce due this month and the month of December work', () => {
  const mesi = {'2026-10': {a: spesa('2026-10-05', 150)}}, cfg = cfgAnno();
  cfg.piani = {'2026-10': {stipendio: 1000, righe: [{nome: 'Spesa', importo: 300}]}};
  cfg.conti = [];
  const r = L.proiezioneAnno(mesi, cfg, '2026-12-10');
  assert.strictEqual(r.patrimonio.ok, false);
  assert.deepStrictEqual(r.mesi, ['2026-12']);
  const due = {nome: 'Auto', gruppo: 'Necessarie', conto: 'Revolut', saldoIniziale: {data: '2026-01-01', importo: 0}, voci: [{nome: 'Bollo', annuale: 100, data: '2026-12', cambio: {da: '2026-01', quota: 5}}]};
  const s = L.scadenze({}, {salvadanai: [due]}, '2026-12-10'); // due this month: balance of the month (12 x 5 = 60), 40 missing
  assert.deepStrictEqual(s.map(x => [x.data, x.saldoPrevisto, x.manca, x.mesi]), [['2026-12', 60, 40, 0]]);
});

// ---- 4.3: quarterly review (revisione dei conti), made-up data ----
test('trimestre helpers: id, months, last day', () => {
  assert.strictEqual(L.trimestreDi('2027-05'), '2027-Q2');
  assert.deepStrictEqual(L.trimestreMesi('2027-Q4'), ['2027-10', '2027-11', '2027-12']);
  assert.strictEqual(L.trimestreFine('2027-Q1'), '2027-03-31');
  assert.strictEqual(L.trimestreFine('2027-Q2'), '2027-06-30');
});

const rvCfg = {
  categorie: [{nome: 'Stipendio', entrata: true, finanzia: true}, {nome: 'Affitto', gruppo: 'Necessarie', budget: 500}, {nome: 'Svago', gruppo: 'Non necessarie', budget: 100}],
  salvadanai: [{nome: 'Cuscinetto', gruppo: 'Risparmi', conto: 'A', quota: 20, saldoIniziale: {data: '2027-01-01', importo: 0}}],
  conti: [{nome: 'A', saldoIniziale: {data: '2027-01-01', importo: 0}}, {nome: 'Joint', joint: true, saldoIniziale: {data: '2027-01-01', importo: 0}},
    {nome: 'TRF', saldoIniziale: {data: '2027-01-01', importo: 1000}}],
  fondoEmergenze: {conto: 'TRF', obiettivo: 1000}, quotaJoint: [{da: '2027-01-01', pct: 60}],
  obiettivi: [{nome: 'Svago', attuale: 100, desiderato: 120}, {nome: 'Rata auto', attuale: 150, desiderato: 200}]
};
const rvMese = (ym, svago) => ({[ym + 'a']: {d: ym + '-05', e: 1000, k: 'A', c: 'Stipendio'}, [ym + 'b']: {d: ym + '-06', u: 500, k: 'A', c: 'Affitto'}, [ym + 'c']: {d: ym + '-07', u: svago, k: 'A', c: 'Svago'}});

test('revisioneTrimestre: a full quarter gives monthly surplus, overspends and the buffer', () => {
  const mesi = {'2027-01': rvMese('2027-01', 150), '2027-02': rvMese('2027-02', 90), '2027-03': rvMese('2027-03', 130)};
  const r = L.revisioneTrimestre(mesi, rvCfg, '2027-Q1');
  assert.strictEqual(r.trimestre, '2027-Q1');
  assert.strictEqual(r.mesiConDati, 3);
  assert.deepStrictEqual(r.mesi.map(m => m.avanzo), [350, 410, 370]); // salary - spent in budget categories
  assert.deepStrictEqual(r.mesi.map(m => m.stipendio), [1000, 1000, 1000]);
  assert.deepStrictEqual(r.sforamenti, [{c: 'Svago', volte: 2, totale: 80}]);
  const g = r.mesi[0].gruppi.find(x => x.gruppo === 'Non necessarie');
  assert.strictEqual(g.speso, 150); assert.strictEqual(g.pctSpeso, 0.15);
  assert.strictEqual(r.cuscinetto.inizio, 0); assert.strictEqual(r.cuscinetto.fine, 60); assert.strictEqual(r.cuscinetto.movimento, 60); // opening balance 0 + 3 quotas of 20
  assert.strictEqual(r.mesi[0].risparmio.risparmio, 20);
});

test('revisioneTrimestre: a missing month is marked, nothing invented', () => {
  const mesi = {'2027-01': rvMese('2027-01', 50), '2027-03': rvMese('2027-03', 50)};
  const r = L.revisioneTrimestre(mesi, rvCfg, '2027-Q1');
  assert.strictEqual(r.mesiConDati, 2);
  assert.deepStrictEqual(r.mesi.map(m => m.dati), [true, false, true]);
  assert.strictEqual(r.mesi[1].avanzo, undefined);
  assert.deepStrictEqual(r.sforamenti, []);
});

test('revisioneTrimestre: no data at all', () => {
  const r = L.revisioneTrimestre({}, rvCfg, '2027-Q1');
  assert.strictEqual(r.mesiConDati, 0);
  assert.ok(r.mesi.every(m => !m.dati));
  assert.strictEqual(r.fondo.ok, true); // the fund balance exists from its opening balance, with no interest
  assert.strictEqual(r.fondo.rendimento, 0);
});

test('revisioneTrimestre: emergency fund interest = end - start - net transfers; above goal', () => {
  const mesi = {'2027-02': {t1: {d: '2027-02-10', t: 'g', k: 'A', a: 'TRF', u: 100}, i1: {d: '2027-03-31', e: 12.5, k: 'TRF', c: 'Interessi', n: 'interest'}},
    '2027-03': {t2: {d: '2027-03-02', t: 'g', k: 'TRF', a: 'A', u: 30}}};
  const f = L.revisioneTrimestre(mesi, rvCfg, '2027-Q1').fondo;
  assert.strictEqual(f.inizio, 1000); assert.strictEqual(f.fine, 1082.5); assert.strictEqual(f.versamenti, 70);
  assert.strictEqual(f.rendimento, 12.5); assert.strictEqual(f.sopra, 82.5);
  // no opening balance: not enough data
  const senza = {...rvCfg, conti: rvCfg.conti.map(c => c.nome === 'TRF' ? {nome: 'TRF'} : c)};
  assert.strictEqual(L.revisioneTrimestre(mesi, senza, '2027-Q1').fondo.ok, false);
  assert.strictEqual(L.revisioneTrimestre(mesi, {...rvCfg, fondoEmergenze: undefined}, '2027-Q1').fondo.ok, false);
});

test('revisioneTrimestre: Joint share in force and Joint spending of the quarter', () => {
  const mesi = {'2027-01': {j1: {d: '2027-01-10', u: 100, p: 60, q: 60, k: 'Joint', c: 'Svago'}, j2: {d: '2027-03-10', u: 50, p: 30, q: 60, k: 'Joint', c: 'Svago'}, v: {d: '2027-01-11', e: 40, t: 'vj', k: 'Joint'}}};
  const j = L.revisioneTrimestre(mesi, rvCfg, '2027-Q1').joint;
  assert.strictEqual(j.pct, 60); assert.strictEqual(j.da, '2027-01-01');
  assert.strictEqual(j.speso, 150); assert.strictEqual(j.miaParte, 90); assert.strictEqual(j.n, 2);
  assert.strictEqual(L.revisioneTrimestre(mesi, {...rvCfg, quotaJoint: []}, '2027-Q1').joint.pct, null);
});

test('revisioneTrimestre: goals with distance and linked bucket', () => {
  const o = L.revisioneTrimestre({}, rvCfg, '2027-Q1').obiettivi;
  assert.deepStrictEqual(o.map(x => [x.nome, x.distanza]), [['Svago', 20], ['Rata auto', 50]]);
  assert.deepStrictEqual(o[0].collegato, ['categoria']);
  assert.deepStrictEqual(o[1].collegato, []);
  assert.deepStrictEqual(L.obiettivoCollegato(rvCfg, 'cuscinetto'), ['salvadanaio']);
});

test('trimestreDefault and promemoriaRevisione: before and after the due date, already recorded', () => {
  assert.strictEqual(L.trimestreDefault('2027-03-23'), '2026-Q4'); // more than 7 days before the end: last concluded
  assert.strictEqual(L.trimestreDefault('2027-03-24'), '2027-Q1'); // 7 days before
  assert.strictEqual(L.trimestreDefault('2027-04-10'), '2027-Q1');
  assert.strictEqual(L.trimestreDefault('2027-06-30'), '2027-Q2');
  assert.strictEqual(L.promemoriaRevisione({}, '2027-03-23'), null);
  assert.deepStrictEqual(L.promemoriaRevisione({}, '2027-03-24'), {trimestre: '2027-Q1', fine: '2027-03-31', giorni: 7});
  assert.strictEqual(L.promemoriaRevisione({}, '2027-04-10').trimestre, '2027-Q1'); // after the due date, until recorded
  assert.strictEqual(L.promemoriaRevisione({revisioni: [{trimestre: '2027-Q1', data: '2027-03-30', decisioni: ''}]}, '2027-04-10'), null);
  assert.strictEqual(L.promemoriaRevisione({}, '2026-12-28'), null); // the first review is 2027-Q1: test data before it
  assert.strictEqual(L.promemoriaRevisione({revisioni: [{trimestre: '2027-Q1', data: '2027-03-30', decisioni: ''}]}, '2027-06-25').trimestre, '2027-Q2');
});

test('validaRevisione and revisioniCon', () => {
  const ok = {trimestre: '2027-Q1', data: '2027-03-30', decisioni: 'Wait', obiettivi: [{nome: 'Svago', azione: 'alzo', a: 120, da: '2027-04'}, {nome: 'Rata auto', azione: 'rimando'}]};
  assert.deepStrictEqual(L.validaRevisione(ok, rvCfg), []);
  assert.ok(L.validaRevisione({...ok, trimestre: '2027-Q5'}, rvCfg).length);
  assert.ok(L.validaRevisione({...ok, data: '2027-13-01'}, rvCfg).length);
  assert.ok(L.validaRevisione({...ok, obiettivi: [{nome: 'Nope', azione: 'rimando'}]}, rvCfg).length);
  assert.ok(L.validaRevisione({...ok, obiettivi: [{nome: 'Svago', azione: 'alzo', a: 0, da: '2027-04'}]}, rvCfg).length);
  assert.ok(L.validaRevisione({...ok, obiettivi: [{nome: 'Svago', azione: 'boh'}]}, rvCfg).length);
  const lista = L.revisioniCon([{trimestre: '2027-Q2', data: '2027-06-30', decisioni: 'b'}, {trimestre: '2027-Q1', data: '2027-03-30', decisioni: 'a'}], {...ok, decisioni: 'new'});
  assert.deepStrictEqual(lista.map(r => r.trimestre), ['2027-Q1', '2027-Q2']); // replaces the same quarter, sorted
  assert.strictEqual(lista[0].decisioni, 'new');
});

test('validaConfig checks obiettivi and revisioni', () => {
  assert.deepStrictEqual(L.validaConfig(rvCfg), []);
  assert.ok(L.validaConfig({...rvCfg, obiettivi: [{nome: 'X', attuale: -1, desiderato: 5}]}).length);
  assert.ok(L.validaConfig({...rvCfg, obiettivi: [{nome: 'X', attuale: 1, desiderato: 'a'}]}).length);
  assert.ok(L.validaConfig({...rvCfg, revisioni: [{trimestre: 'bad', data: '2027-03-30'}]}).length);
  assert.deepStrictEqual(L.validaConfig({...rvCfg, revisioni: [{trimestre: '2027-Q1', data: '2027-03-30', decisioni: 'x', obiettivi: []}]}), []); // a valid review passes
});
