// Run with: node --test   (made-up data only, never the real ledger)
const test = require('node:test');
const assert = require('node:assert');
const {migraFoglio} = require('../migrazione.js');

const OPT = {quotaJoint: 56, joint: 'Revolut Joint'};
const foglio = mov => ({mesi: {'2026-03': {mov}}, config: {}});
const migra = (mov, opt) => migraFoglio(foglio(mov), opt || OPT);
const riga = (r, id = 'i00000') => r.mesi['2026-03'].mov[id];

test('ids and amounts of plain rows stay, same input gives the same output', () => {
  const f = foglio({i00000: {d: '2026-03-02', n: 'x', u: 10, c: 'Bar', k: 'Revolut'}});
  const a = migraFoglio(f, OPT), b = migraFoglio(f, OPT);
  assert.deepStrictEqual(a, b);
  assert.deepStrictEqual(a.mesi['2026-03'].mov.i00000, {d: '2026-03-02', n: 'x', u: 10, c: 'Bar', k: 'Revolut'});
});

test('merged categories, with the old name as a label where the spec says so', () => {
  const r = migra({
    i00000: {d: '2026-03-02', n: '', u: 5, c: 'Spesa casa', k: 'Revolut'},
    i00001: {d: '2026-03-02', n: '', u: 5, c: 'Hobby', k: 'Revolut'},
    i00002: {d: '2026-03-02', n: '', u: 5, c: 'Parcheggi', k: 'Revolut'},
    i00003: {d: '2026-03-02', n: '', u: 5, c: 'Visite salute', k: 'Revolut'},
    i00004: {d: '2026-03-02', n: '', u: 5, c: 'Judge Lucca', k: 'Revolut'},
    i00005: {d: '2026-03-02', n: '', u: 5, c: 'Spesa self care', k: 'Revolut'}});
  const m = r.mesi['2026-03'].mov;
  assert.deepStrictEqual([m.i00000.c, m.i00000.l], ['Spesa cibo e casa', undefined]);
  assert.deepStrictEqual([m.i00001.c, m.i00001.l], ['Shopping & Svago', ['hobby']]);
  assert.deepStrictEqual([m.i00002.c, m.i00002.l], ['Auto variabili', ['parcheggio']]);
  assert.deepStrictEqual([m.i00003.c, m.i00003.l], ['Salute', ['visite']]);
  assert.deepStrictEqual([m.i00004.c, m.i00004.l], ['TCG', ['Judge Lucca']]);
  assert.strictEqual(m.i00005.c, 'Self care');
});

test('car insurance and tax become voci of Auto fissi', () => {
  const r = migra({i00000: {d: '2026-03-02', n: '', u: 80, c: 'Bollo auto', k: 'Revolut'}, i00001: {d: '2026-03-02', n: '', u: 80, c: 'Assicurazione auto', k: 'Revolut'}});
  assert.deepStrictEqual([riga(r).c, riga(r).v], ['Auto fissi', 'Bollo']);
  assert.deepStrictEqual([riga(r, 'i00001').c, riga(r, 'i00001').v], ['Auto fissi', 'Assicurazione']);
});

test('income goes to income categories; spending categories with an entry go to Rimborsi', () => {
  const r = migra({
    i00000: {d: '2026-03-02', n: '', e: 900, c: 'Stipendio', k: 'Revolut'},
    i00001: {d: '2026-03-02', n: '', e: 20, c: 'Referral Revolut', k: 'Revolut'},
    i00002: {d: '2026-03-02', n: '', e: 30, c: 'Compravendita', k: 'Paypal'},
    i00003: {d: '2026-03-02', n: '', u: 12, c: 'Compravendita', k: 'Paypal'},
    i00004: {d: '2026-03-02', n: '', e: 15, c: 'Sport', k: 'Revolut'},
    i00005: {d: '2026-03-02', n: '', e: 15, c: 'Investimenti', k: 'Revolut'}});
  const m = r.mesi['2026-03'].mov;
  assert.strictEqual(m.i00000.c, 'Stipendio');
  assert.strictEqual(m.i00001.c, 'Rimborsi');
  assert.deepStrictEqual([m.i00002.c, m.i00002.l], ['Vendita carte', ['Compravendita']]);
  assert.deepStrictEqual([m.i00003.c, m.i00003.l], ['TCG', ['Compravendita']]);
  assert.deepStrictEqual([m.i00004.c, m.i00004.l], ['Rimborsi', ['Sport']]);
  assert.strictEqual(m.i00005.c, 'Investimenti'); // the spec keeps Investimenti as it is
  assert.strictEqual(m.i00005.e, 15);
});

test('Rimborso papa auto is an outgoing payment in the sheet: it goes to Rata auto a papà and is reported', () => {
  const r = migra({i00000: {d: '2026-03-02', n: '', u: 150, c: 'Rimborso papa auto', k: 'Revolut'}});
  assert.strictEqual(riga(r).c, 'Rata auto a papà');
  assert.strictEqual(r.rapporto.rimborsoPapa, 1);
});

test('Prestiti: out = credit (cr), in = refund (rb), both without category', () => {
  const r = migra({i00000: {d: '2026-03-02', n: '', u: 50, c: 'Prestiti', k: 'Revolut'}, i00001: {d: '2026-03-09', n: '', e: 20, c: 'Prestiti', k: 'Contanti'}});
  assert.deepStrictEqual([riga(r).t, riga(r).c, riga(r).u], ['cr', '', 50]);
  assert.deepStrictEqual([riga(r, 'i00001').t, riga(r, 'i00001').c, riga(r, 'i00001').e], ['rb', '', 20]);
  assert.deepStrictEqual([r.rapporto.crediti, r.rapporto.rimborsiPrestiti], [1, 1]);
});

test('a transfer of two rows becomes one row g, k from, a to, ids kept stable', () => {
  const r = migra({
    i00000: {d: '2026-03-05', n: 'su', e: 100, c: '', k: 'Revolut Joint'},
    i00001: {d: '2026-03-05', n: 'su', u: 100, c: '', k: 'Revolut'}});
  assert.deepStrictEqual(r.mesi['2026-03'].mov, {i00001: {d: '2026-03-05', n: 'su', u: 100, c: '', k: 'Revolut', a: 'Revolut Joint', t: 'g'}});
  assert.strictEqual(r.rapporto.giroconti, 1);
});

test('ambiguous or unpaired uncategorised rows are kept as they are and listed, never guessed', () => {
  const r = migra({
    i00000: {d: '2026-03-05', n: '', e: 100, c: '', k: 'A'}, i00001: {d: '2026-03-05', n: '', e: 100, c: '', k: 'B'},
    i00002: {d: '2026-03-05', n: '', u: 100, c: '', k: 'C'},
    i00003: {d: '2026-03-07', n: '', e: 7, c: '', k: 'Padel'},
    i00004: {d: '2026-03-08', n: '', e: 9, c: '', k: 'A'}, i00005: {d: '2026-03-08', n: '', u: 9, c: '', k: 'A'}});
  assert.strictEqual(Object.keys(r.mesi['2026-03'].mov).length, 6);
  assert.ok(Object.values(r.mesi['2026-03'].mov).every(x => !x.t));
  assert.deepStrictEqual(r.rapporto.ambigui.sort(), ['i00000', 'i00001', 'i00002']);
  assert.deepStrictEqual(r.rapporto.spaiati.sort(), ['i00003', 'i00004', 'i00005']);
  assert.strictEqual(r.rapporto.giroconti, 0);
});

test('a Joint expense is rebuilt to the whole amount with my part p and the share q', () => {
  const r = migra({i00000: {d: '2026-03-02', n: '', u: 56, c: 'Bollette', k: 'Revolut Joint'}, i00001: {d: '2026-03-02', n: '', u: 7, c: 'Bar', k: 'Revolut Joint'}});
  assert.deepStrictEqual([riga(r).u, riga(r).p, riga(r).q], [100, 56, 56]);
  assert.deepStrictEqual([riga(r, 'i00001').u, riga(r, 'i00001').p, riga(r, 'i00001').q], [12.5, 7, 56]);
  assert.strictEqual(r.rapporto.jointRicostruite, 2);
});

test('rows without an account are set aside and not imported', () => {
  const r = migra({i00000: {d: '2026-03-02', n: '', u: 5, c: 'Bar'}, i00001: {d: '2026-03-02', n: '', u: 6, c: 'Bar', k: 'Revolut'}});
  assert.deepStrictEqual(Object.keys(r.mesi['2026-03'].mov), ['i00001']);
  assert.deepStrictEqual(r.rapporto.senzaConto, ['i00000']);
  assert.deepStrictEqual(Object.keys(r.daParte['2026-03'].mov), ['i00000']);
});

test('unknown categories stay as they are and are reported as not mapped', () => {
  const r = migra({i00000: {d: '2026-03-02', n: '', u: 5, c: 'Mai vista', k: 'Revolut'}});
  assert.strictEqual(riga(r).c, 'Mai vista');
  assert.deepStrictEqual(r.rapporto.nonMappate, {'Mai vista': 1});
});

test('Padel and archived categories are untouched', () => {
  const r = migra({i00000: {d: '2026-03-02', n: '', u: 5, c: 'Viaggio Jap', k: 'Padel'}});
  assert.deepStrictEqual(riga(r), {d: '2026-03-02', n: '', u: 5, c: 'Viaggio Jap', k: 'Padel'});
  assert.deepStrictEqual(r.rapporto.nonMappate, {});
});

test('quadratura: balances per account match, except Joint by the rebuilt amount', () => {
  const r = migra({
    i00000: {d: '2026-03-05', n: '', e: 100, c: '', k: 'Revolut Joint'}, i00001: {d: '2026-03-05', n: '', u: 100, c: '', k: 'Revolut'},
    i00002: {d: '2026-03-06', n: '', u: 56, c: 'Bollette', k: 'Revolut Joint'}, i00003: {d: '2026-03-06', n: '', e: 900, c: 'Stipendio', k: 'Revolut'}});
  const q = r.rapporto.quadra;
  assert.deepStrictEqual(q.saldiPrima, {'Revolut Joint': 44, Revolut: 800});
  assert.deepStrictEqual(q.saldiDopo, {'Revolut Joint': 0, Revolut: 800});
  assert.strictEqual(q.ok, true);
  assert.deepStrictEqual(q.mesi['2026-03'].prima, {n: 4, e: 1000, u: 156});
  assert.deepStrictEqual(q.mesi['2026-03'].dopo, {n: 3, e: 900, u: 100, g: 100});
});
