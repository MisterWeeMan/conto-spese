// Sheet -> new format migration of 2026 (activity 3.5). Pure, Node only (the page does not load it): the local script
// dati/migra-2026.mjs feeds it the sheet file {mesi: {ym: {mov: {id: row}}}} and writes the result. Never put real data here.
const L = require('./logic.js');
const r2 = x => Math.round(x * 100) / 100;
const cent = x => Math.round(x * 100);

// old name -> [new category, label (null = none), voce (null = none)]. Spec "Migrazione del 2026 dal foglio" + the labels of the 2027 config.
const MAPPA = {
  'Spesa casa': ['Spesa cibo e casa'], 'Spesa cibo': ['Spesa cibo e casa'],
  Hobby: ['Shopping & Svago', 'hobby'], Eventi: ['Shopping & Svago', 'eventi'], Shopping: ['Shopping & Svago', 'shopping'], Vestiti: ['Shopping & Svago', 'vestiti'],
  Parrucchiere: ['Self care'], 'Spesa self care': ['Self care'],
  Medicine: ['Salute', 'medicine'], 'Visite salute': ['Salute', 'visite'],
  'Manutenzione Auto': ['Auto variabili', 'manutenzione'], Parcheggi: ['Auto variabili', 'parcheggio'], Multe: ['Auto variabili', 'multa'],
  'Assicurazione auto': ['Auto fissi', null, 'Assicurazione'], 'Bollo auto': ['Auto fissi', null, 'Bollo'],
  'PAC mensile': ['Investimenti'], 'Rimborso papa auto': ['Rata auto a papà'],
};
['Compravendita', 'Tornei TCG', 'Judge', 'Judge Venezia', 'Judge Lucca', 'Torneo Londra', 'OP17 Anniversary', 'Viaggio Barcellona'].forEach(n => { MAPPA[n] = ['TCG', n]; });
// categories that keep their name: the ones the 2027 config has and the archived ones (no change at all)
const RESTANO = ['Abbonamenti', 'Affitto', 'Animali', 'Autostrada', 'Bar', 'Bollette', 'Bollo bancario', 'Carburante', 'Compleanno', 'Investimenti', 'Pasti fuori', 'Psicologa', 'Regali', 'Sport', 'Tabacchi',
  'Viaggio Jap', 'Vacanze', 'Trasloco', 'Tatuaggio Lione', 'Documenti', 'Check Money', 'Offerte cucci'];
const ENTRATE = {Stipendio: 'Stipendio', 'Rimborso assicurazione': 'Rimborsi', 'Referral Revolut': 'Rimborsi', 'Rimborso papa auto': 'Rimborsi'};
const INVEST = ['Investimenti', 'PAC mensile']; // stay as they are in both directions (spec)

// opt: {quotaJoint: 56, joint: 'Revolut Joint', sottosaldi: ['TradeRepublic']}
function migraFoglio(file, opt) {
  const q = opt.quotaJoint, rap = {giroconti: 0, ambigui: [], spaiati: [], senzaConto: [], nonMappate: {}, jointRicostruite: 0, rimborsoPapa: 0, crediti: 0, rimborsiPrestiti: 0,
    entrateInSpesa: 0, giroSenzaSS: 0};
  const sub = opt.sottosaldi || [];
  const mesi = {}, daParte = {}, prima = {}; // prima: flat copy of the input for the balances
  const put = (dest, ym, id, r) => { (dest[ym] = dest[ym] || {mov: {}}).mov[id] = r; };
  const extraJoint = {}, extraJointMese = {}, paired = {}, senza = {}; // for the quadratura identities
  const sum = (o, k, v) => { o[k] = r2((o[k] || 0) + v); };

  const rows = [];
  Object.keys(file.mesi).sort().forEach(ym => Object.keys(file.mesi[ym].mov).forEach(id => {
    const r = file.mesi[ym].mov[id];
    (prima[ym] = prima[ym] || {})[id] = r;
    if (!r.k) { rap.senzaConto.push(id); put(daParte, ym, id, r); sum(senza, ym + '|e', r.e || 0); sum(senza, ym + '|u', r.u || 0); } else rows.push({ym, id, r});
  }));

  // uncategorised rows: pair one in + one out, same day and amount, different accounts
  const gruppi = {};
  rows.filter(x => !x.r.c).forEach(x => { const k = x.r.d + '|' + cent(x.r.e || x.r.u); (gruppi[k] = gruppi[k] || []).push(x); });
  const fuori = {}, unito = {}; // id -> true: handled
  Object.keys(gruppi).forEach(k => {
    const g = gruppi[k], e = g.filter(x => x.r.e), u = g.filter(x => x.r.u);
    if (e.length === 1 && u.length === 1 && e[0].r.k !== u[0].r.k) {
      const ur = u[0].r, er = e[0].r;
      unito[e[0].id] = true;
      put(mesi, u[0].ym, u[0].id, Object.assign({}, ur, {n: ur.n || er.n, a: er.k, t: 'g'}));
      fuori[u[0].id] = true;
      rap.giroconti++; sum(paired, u[0].ym, ur.u);
      if (sub.includes(ur.k) || sub.includes(er.k)) rap.giroSenzaSS++;
    } else if (e.length && u.length && g.length > 2) g.forEach(x => rap.ambigui.push(x.id));
    else g.forEach(x => rap.spaiati.push(x.id));
  });

  rows.forEach(({ym, id, r}) => {
    if (unito[id] || fuori[id]) return;
    const o = Object.assign({}, r), nome = r.c, entra = !!r.e;
    if (nome === 'Prestiti') { o.t = entra ? 'rb' : 'cr'; o.c = ''; if (entra) rap.rimborsiPrestiti++; else rap.crediti++; }
    else if (nome) {
      const m = MAPPA[nome], noto = m || RESTANO.includes(nome) || ENTRATE[nome];
      if (!noto) rap.nonMappate[nome] = (rap.nonMappate[nome] || 0) + 1;
      if (entra && !INVEST.includes(nome) && noto) {
        // an entry: income categories only (R3); an entry in a spending category becomes a refund, the old name kept as a label
        if (ENTRATE[nome]) o.c = ENTRATE[nome];
        else if (nome === 'Compravendita') { o.c = 'Vendita carte'; o.l = ['Compravendita']; }
        else { o.c = 'Rimborsi'; o.l = [(m && m[1]) || nome]; rap.entrateInSpesa++; }
      } else if (m) {
        o.c = m[0];
        if (m[1]) o.l = [m[1]];
        if (m[2]) o.v = m[2];
        if (nome === 'Rimborso papa auto') rap.rimborsoPapa++;
      }
    }
    // Joint: the sheet holds my part; the new format wants the whole amount, my part p and the share q
    if (r.k === opt.joint && o.c && !o.t && o.u > 0) {
      o.p = r.u; o.u = r2(r.u * 100 / q); o.q = q;
      rap.jointRicostruite++; sum(extraJoint, r.k, o.u - o.p); sum(extraJointMese, ym, o.u - o.p);
    }
    put(mesi, ym, id, o);
  });

  // quadratura: counts and totals per month, balance per account, before and after; the identities say what must match
  const stat = (flat, ym) => {
    const s = {n: 0, e: 0, u: 0, g: 0};
    Object.values(flat[ym] || {}).forEach(r => { s.n++; if (r.t === 'g') s.g = r2(s.g + r.u); else { s.e = r2(s.e + (r.e || 0)); s.u = r2(s.u + (r.u || 0)); } });
    return s;
  };
  const dopoFlat = {};
  Object.keys(mesi).forEach(ym => { dopoFlat[ym] = mesi[ym].mov; });
  const saldiPrima = L.saldi(prima, {}), saldiDopo = L.saldi(dopoFlat, {});
  const senzaSaldo = saldiPrima[''] || 0; delete saldiPrima[''];
  const quadraMesi = {}; let ok = true;
  Object.keys(prima).sort().forEach(ym => {
    const a = stat(prima, ym), b = stat(dopoFlat, ym);
    quadraMesi[ym] = {prima: {n: a.n, e: a.e, u: a.u}, dopo: b};
    if (r2(a.e - (paired[ym] || 0) - (senza[ym + '|e'] || 0)) !== b.e || r2(a.u - (paired[ym] || 0) - (senza[ym + '|u'] || 0) + (extraJointMese[ym] || 0)) !== b.u) ok = false;
  });
  Object.keys(saldiPrima).concat(Object.keys(saldiDopo)).forEach(k => { if (r2((saldiPrima[k] || 0) - (extraJoint[k] || 0)) !== r2(saldiDopo[k] || 0)) ok = false; });
  rap.quadra = {mesi: quadraMesi, saldiPrima, saldiDopo, extraJoint, senzaSaldo, ok};
  return {mesi, daParte, rapporto: rap};
}

module.exports = {migraFoglio};
