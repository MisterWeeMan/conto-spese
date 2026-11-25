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
  assert.strictEqual(L.destinazioneExtra({}, pieno, {d: '2027-02-03', e: 200}).b, 'Auto'); // short 250 vs Viaggi 210
  const senzaObiettivi = {salvadanai: [svX('Auto', 150), svX('Investimenti', 0)]};
  assert.strictEqual(L.destinazioneExtra({}, senzaObiettivi, {d: '2027-02-03', e: 200}).b, 'Investimenti');
  assert.strictEqual(L.destinazioneExtra({}, {salvadanai: [svX('Auto', 150)]}, {d: '2027-02-03', e: 200}).b, 'Cuscinetto');
  assert.strictEqual(L.destinazioneExtra({}, {}, {d: '2027-02-03', e: 200}).b, 'Cuscinetto');
});

test('destinazioneExtra: the balance used is the one at the movement month, extra income already received counts', () => {
  const mesi = {'2027-01': {a: {d: '2027-01-10', e: 300, t: 'x2', b: 'Fondo emergenze'}}}; // 800 + 300 >= 1000
  assert.strictEqual(L.destinazioneExtra(mesi, cfgX, {d: '2027-02-03', e: 150}).b, 'Auto');
});

test('destinazioneExtra: a card sale (label TCG) always goes to the TCG fund, even below the threshold', () => {
  assert.strictEqual(L.destinazioneExtra({}, cfgX, {d: '2027-02-03', e: 30, l: ['tcg']}).b, 'Fondo TCG');
  assert.strictEqual(L.destinazioneExtra({}, {salvadanai: []}, {d: '2027-02-03', e: 30, l: ['TCG']}).b, 'Cuscinetto'); // no fund configured
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
    {nome: 'Fondo emergenze', gruppo: 'Risparmi', conto: 'TR', saldoIniziale: {data: '2027-01-01', importo: 3000}, quota: 0},
    {nome: 'Auto', gruppo: 'Necessarie', conto: 'Rev', saldoIniziale: {data: '2027-01-01', importo: 0}, quota: 100},
  ],
  fondoEmergenze: {conto: 'TR', sottosaldo: 'Fondo emergenze', obiettivo: 6000},
};
test('fondoEmergenze: months covered = balance / monthly necessarie (budgets + pot quotas of that group, not the fund itself)', () => {
  const f = L.fondoEmergenze({}, cfgFE, '2027-02'); // necessarie = 500 + 200 + 100 = 800
  assert.strictEqual(f.saldo, 3000);
  assert.strictEqual(f.necessarie, 800);
  assert.strictEqual(f.mesi, 3.75);
  assert.strictEqual(f.seiMesi, 4800);
  assert.strictEqual(f.manca, 3000);
  assert.strictEqual(f.sotto, true);
});
test('fondoEmergenze: a withdrawal lowers the balance, a full fund is not below goal, null without config', () => {
  const mesi = {'2027-02': {a: {d: '2027-02-10', u: 500, c: 'Fondo emergenze', n: 'Dentista'}}};
  assert.strictEqual(L.fondoEmergenze(mesi, cfgFE, '2027-02').saldo, 2500);
  const pieno = {...cfgFE, fondoEmergenze: {...cfgFE.fondoEmergenze, obiettivo: 3000}};
  assert.strictEqual(L.fondoEmergenze({}, pieno, '2027-02').sotto, false);
  assert.strictEqual(L.fondoEmergenze({}, {categorie: []}, '2027-02'), null);
  assert.strictEqual(L.fondoEmergenze({}, {...cfgFE, salvadanai: []}, '2027-02'), null); // no pot with that name
});
test('fondoEmergenze: reminder only in January and July', () => {
  const p = m => L.fondoEmergenze({}, cfgFE, '2027-' + m).promemoria;
  assert.deepStrictEqual(['01', '02', '06', '07', '12'].map(p), [true, false, false, true, false]);
});
test('usoFondo: a plain expense from the fund needs a note, other rows do not', () => {
  const fe = cfgFE;
  assert.strictEqual(L.usoFondoSenzaNota(fe, {c: 'Fondo emergenze', u: 50, n: ''}), true);
  assert.strictEqual(L.usoFondoSenzaNota(fe, {c: 'Fondo emergenze', u: 50, n: '  '}), true);
  assert.strictEqual(L.usoFondoSenzaNota(fe, {c: 'Fondo emergenze', u: 50, n: 'Dentista'}), false);
  assert.strictEqual(L.usoFondoSenzaNota(fe, {c: 'Svago', u: 50, n: ''}), false);
  assert.strictEqual(L.usoFondoSenzaNota(fe, {c: 'Fondo emergenze', e: 50, t: 'x2', n: ''}), false); // income into the fund is not a use
});
test('destinazioneExtra: the emergency fund goal can come from cfg.fondoEmergenze', () => {
  const cfg = {salvadanai: [svX('Fondo emergenze', 800), svX('Investimenti', 0)], fondoEmergenze: {sottosaldo: 'Fondo emergenze', obiettivo: 1000}};
  assert.strictEqual(L.destinazioneExtra({}, cfg, {d: '2027-02-03', e: 300}).b, 'Fondo emergenze');
});
test('validaConfig: fondoEmergenze must name an existing pot and have a valid goal', () => {
  const ok = {...cfgFE, conti: [{nome: 'TR'}, {nome: 'Rev'}]};
  assert.deepStrictEqual(L.validaConfig(ok), []);
  assert.strictEqual(L.validaConfig({...ok, fondoEmergenze: {sottosaldo: 'Nope', obiettivo: 10}}).length, 1);
  assert.strictEqual(L.validaConfig({...ok, fondoEmergenze: {sottosaldo: 'Fondo emergenze', obiettivo: -5}}).length, 1);
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
