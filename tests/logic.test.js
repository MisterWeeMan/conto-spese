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
