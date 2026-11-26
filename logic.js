// Pure logic: no DOM, no Firestore. Loaded by index.html (window.CSLogic) and by the tests (require).
(function () {

  // "12,50" / "12.50" / "1.234,56" -> euro; null when it is not a positive amount
  function parseAmount(s) {
    s = String(s).replace(/[\s€]/g, '');
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '');
    var n = Math.round(parseFloat(s.replace(',', '.')) * 100) / 100;
    return n > 0 ? n : null;
  }

  // Strict check for the form fields in euro (parseAmount stays lenient, for the sheet import): digits and ONE decimal
  // separator, at most 2 decimals, no thousands separator. opts.zero admits 0 and an empty field (0 = "none").
  // -> {v} or {err}
  function validaImporto(s, opts) {
    s = String(s).trim();
    var zero = opts && opts.zero;
    if (opts && opts.neg) { // signed balance (bank check): optional leading minus, zero allowed, empty not
      var neg = /^[-−]/.test(s), r = neg ? validaImporto(s.slice(1), {zero: true}) : validaImporto(s, {zero: true});
      if (!s || (neg && !s.slice(1).trim())) return {err: 'Scrivi un importo'};
      return r.err ? r : {v: neg && r.v ? -r.v : r.v};
    }
    if (!s) return zero ? {v: 0} : {err: 'Scrivi un importo'};
    if (/[.,].*[.,]/.test(s)) return {err: 'Un solo separatore decimale, niente separatore delle migliaia: scrivi 1200 oppure 1200,50'};
    var m = /^(\d+)(?:[.,](\d+))?$/.exec(s);
    if (!m) return {err: 'Scrivi solo cifre e un separatore decimale (virgola o punto)'};
    if (m[2] && m[2].length > 2) return {err: 'Al massimo 2 decimali (niente separatore delle migliaia: 1200, non 1.200)'};
    var v = parseFloat(m[1] + '.' + (m[2] || '0'));
    return v > 0 || zero ? {v: v} : {err: 'Scrivi un importo maggiore di zero'};
  }
  // Joint share in percent: whole numbers 1..99
  function validaQuotaJoint(s) {
    s = String(s).trim();
    if (!/^\d+$/.test(s)) return {err: 'La quota accetta solo numeri interi da 1 a 99, senza decimali'};
    var v = +s;
    return v >= 1 && v <= 99 ? {v: v} : {err: 'La quota va da 1 a 99'};
  }

  // mesi = { 'YYYY-MM': { <id>: {d, n, e, u, c, k, x} } }; x = deleted (tombstone)
  function movs(mesi, ym) {
    return Object.entries(mesi[ym] || {})
      .filter(function (p) { return p[1] && !p[1].x && p[1].d; })
      .map(function (p) { return Object.assign({id: p[0]}, p[1]); });
  }

  function net(m) { return (m.e || 0) - (m.u || 0); }

  // My part of a movement: p if set, else u (e for income). Transfers (g), partner top-ups (vj)
  // credits (cr), refunds (rb) and legacy extra income (x2) are not mine.
  function mia(m) {
    if (m.t === 'g' || m.t === 'vj' || m.t === 'cr' || m.t === 'rb' || m.t === 'x2') return 0;
    return m.p != null ? m.p : (m.u || m.e || 0);
  }

  // Money others owe me on a split expense: u - p in cents, never negative; else 0.
  function credito(m) { return m.p != null && m.u ? Math.max(0, Math.round((m.u - m.p) * 100) / 100) : 0; }

  // Open credits over all months, oldest first: split expenses (u - p > 0, tipo 'sp') and loans (t:'cr', tipo 'cr': the amount is u; the initial
  // credit has no account). Live refunds (t:'rb', r: id) point at them. A loan is open until its refunds add up to its amount (partial refunds
  // allowed); a split expense is closed by any live refund (shortcut: the spec has no partial refunds for them). A Joint expense (q set) is not a
  // credit: the rest of it is the partner's share, already paid from the Joint account. escludi (optional movement id) is left out of the
  // refunds, to show a credit as it was before the refund being edited.
  function creditiAperti(mesi, escludi) {
    var all = [], rimb = {};
    Object.keys(mesi).sort().forEach(function (ym) {
      movs(mesi, ym).forEach(function (m) {
        if (m.t === 'rb' && m.r) { if (m.id !== escludi) rimb[m.r] = Math.round(((rimb[m.r] || 0) + (m.e || 0)) * 100) / 100; } else all.push(m);
      });
    });
    var out = [];
    all.forEach(function (m) {
      var cr = m.t === 'cr', importo = cr ? m.u || 0 : m.q == null ? credito(m) : 0, r = rimb[m.id];
      if (!(importo > 0) || (!cr && r !== undefined)) return;
      var resta = Math.round((importo - (r || 0)) * 100) / 100;
      if (resta > 0) out.push({id: m.id, d: m.d, c: m.c, k: m.k, n: m.n, tipo: cr ? 'cr' : 'sp', importo: importo, rimborsato: r || 0, residuo: resta});
    });
    return out;
  }

  // "TCG, Torneo,, tcg" -> ['TCG', 'Torneo']: trimmed, no empties, repeats ignoring case dropped
  function parseEtichette(s) {
    var seen = {};
    return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(function (x) {
      var k = x.toLowerCase(); if (!x || seen[k]) return false; return (seen[k] = 1);
    });
  }

  // Labels in use by live movements, [{l, n}] by name; the same label in another case counts as one (first spelling kept).
  function etichette(mesi) {
    var n = {}, nome = {};
    Object.keys(mesi).forEach(function (ym) {
      movs(mesi, ym).forEach(function (m) {
        (m.l || []).forEach(function (l) { var k = l.toLowerCase(); nome[k] = nome[k] || l; n[k] = (n[k] || 0) + 1; });
      });
    });
    return Object.keys(n).map(function (k) { return {l: nome[k], n: n[k]}; })
      .sort(function (a, b) { return a.l.localeCompare(b.l, 'it'); });
  }

  // The movements carrying label l (ignoring case).
  function conEtichetta(list, l) {
    l = String(l).toLowerCase();
    return list.filter(function (m) { return (m.l || []).some(function (x) { return x.toLowerCase() === l; }); });
  }

  // Balance of a label (4.1), information only: not a budget, it never enters the spendibile or the plan. periodo = '' (all), 'YYYY' or 'YYYY-MM'.
  // Live movements carrying l (ignoring case): entrate = e, uscite = my part (mia, so the Joint counts my share); transfers, partner top-ups,
  // loans and refunds are left out; an income of any kind (also x2 or a category that does not fund the month) counts. saldo = entrate - uscite.
  // sotto = the other labels of the same movements ({l: '' = only l}), categorie = by category ('' = none); a movement with several labels
  // counts under each, so these lists do not add up to the total. Each list is sorted by size of the balance.
  function saldoEtichetta(mesi, l, periodo) {
    var r = {entrate: 0, uscite: 0, saldo: 0, n: 0, sotto: [], categorie: []}, low = String(l).toLowerCase(), sotto = {}, cat = {};
    var c2 = function (x) { return Math.round(x * 100) / 100; };
    var add = function (o, k, e, u) { var t = o[k] = o[k] || {entrate: 0, uscite: 0, n: 0}; t.entrate = c2(t.entrate + e); t.uscite = c2(t.uscite + u); t.n++; };
    Object.keys(mesi).filter(function (ym) { return ym.indexOf(periodo || '') === 0; }).forEach(function (ym) {
      conEtichetta(movs(mesi, ym), l).forEach(function (m) {
        if (m.t === 'g' || m.t === 'vj' || m.t === 'cr' || m.t === 'rb') return;
        var e = m.e > 0 ? m.e : 0, u = m.u > 0 ? mia(m) : 0;
        if (!e && !u) return;
        r.entrate = c2(r.entrate + e); r.uscite = c2(r.uscite + u); r.n++;
        var altre = (m.l || []).filter(function (x) { return x.toLowerCase() !== low; });
        (altre.length ? altre : ['']).forEach(function (x) { add(sotto, x, e, u); });
        add(cat, m.c || '', e, u);
      });
    });
    r.saldo = c2(r.entrate - r.uscite);
    var lista = function (o, key) {
      return Object.keys(o).map(function (k) { var t = o[k]; t.saldo = c2(t.entrate - t.uscite); t[key] = k; return t; })
        .sort(function (a, b) { return Math.abs(b.saldo) - Math.abs(a.saldo) || (a[key] < b[key] ? -1 : 1); });
    };
    r.sotto = lista(sotto, 'l'); r.categorie = lista(cat, 'c');
    return r;
  }

  // Joint share (pct) in force on date 'YYYY-MM-DD': the entry with the latest `da` not after it, else null.
  function quotaJoint(cfg, data) {
    var best = null;
    (cfg.quotaJoint || []).forEach(function (q) { if (q.da <= data && (!best || q.da > best.da)) best = q; });
    return best ? best.pct : null;
  }

  // True when the account named k carries the joint flag in cfg.conti.
  function contoJoint(cfg, k) { return (cfg.conti || []).some(function (c) { return c.nome === k && !!c.joint; }); }

  // {p, q} to store on an expense on a Joint account: q = the stored share if given, else the one in force on m.d;
  // p = u x q to the cent; u stays whole. null when nothing applies (not Joint, not a plain expense, no share).
  function quotaMov(cfg, m, qFissa) {
    var q = m.u > 0 && !m.t && contoJoint(cfg, m.k) ? (qFissa != null ? qFissa : quotaJoint(cfg, m.d)) : null;
    return q == null ? null : {p: Math.round(m.u * q) / 100, q: q};
  }

  // Stored config -> the shape the page uses: categories and accounts as objects (older data holds plain names).
  // The old annual `budget`, `gruppi` and `colori` fields pass through untouched and are ignored.
  function cfgNorm(raw) {
    var o = Object.assign({}, raw), obj = function (x) { return typeof x === 'string' ? {nome: x} : x; };
    o.categorie = (o.categorie || []).map(obj); o.conti = (o.conti || []).map(obj);
    return o;
  }


  // Problems of a config before it is loaded (stored shape of spec 'spese_config/main'): list of messages, empty = ok.
  // Plan rows must name a budget category or a pot. shortcut: no check of amounts against the salary; the plan page shows 'resta'.
  function validaConfig(c) {
    var err = [], real = function (s) { return !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s; }, ym = /^\d{4}-(0[1-9]|1[0-2])$/, day = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
    var gruppi = ['Necessarie', 'Non necessarie', 'Risparmi'], num = function (x) { return typeof x === 'number' && isFinite(x); };
    var uniq = function (list, what) {
      var seen = {};
      (list || []).forEach(function (x) { var k = String(x.nome || '').toLowerCase(); if (!k) err.push(what + ' without name'); else if (seen[k]) err.push('Duplicate ' + what + ' ' + k); seen[k] = 1; });
    };
    uniq(c.categorie, 'category'); uniq(c.conti, 'account'); uniq(c.salvadanai, 'pot');
    uniq((c.categorie || []).concat(c.salvadanai || []), 'category or pot'); // a name must mean one bucket
    (c.categorie || []).forEach(function (x) {
      if (x.gruppo && gruppi.indexOf(x.gruppo) < 0) err.push('Group ' + x.gruppo + ' of ' + x.nome + ' is unknown');
      if (x.budget != null && !(num(x.budget) && x.budget >= 0)) err.push('Budget ' + x.budget + ' of ' + x.nome + ' is not valid');
      if (x.entrata && (x.budget > 0 || x.taglio > 0 || x.gruppo)) err.push('Income category ' + x.nome + ' has no budget, priority or group');
      if (x.finanzia && !x.entrata) err.push('Category ' + x.nome + ' funds the month but is not an income category');
    });
    var conti = (c.conti || []).map(function (x) { return x.nome; });
    (c.salvadanai || []).forEach(function (v) {
      if (conti.indexOf(v.conto) < 0) err.push('Account ' + v.conto + ' of pot ' + v.nome + ' does not exist');
      if (gruppi.indexOf(v.gruppo) < 0) err.push('Group ' + v.gruppo + ' of pot ' + v.nome + ' is unknown');
      if (!v.saldoIniziale || !day.test(v.saldoIniziale.data) || !real(v.saldoIniziale.data) || !num(v.saldoIniziale.importo)) err.push('Opening balance of pot ' + v.nome + ' is not valid');
      (v.voci || []).forEach(function (x) {
        if (!ym.test(x.data || '') || !(x.annuale > 0)) err.push('Voce ' + x.nome + ' date or amount is not valid (pot ' + v.nome + ')');
        if (x.cambio && !(ym.test(x.cambio.da || '') && num(x.cambio.quota))) err.push('Voce ' + x.nome + ' cambio is not valid');
      });
    });
    (c.conti || []).forEach(function (x) {
      var s = x.saldoIniziale;
      if (s && (!day.test(s.data || '') || !real(s.data) || !num(s.importo))) err.push('Opening balance of account ' + x.nome + ' is not valid');
    });
    (c.controlli || []).forEach(function (x) {
      if (!day.test(x.d || '') || !real(x.d) || conti.indexOf(x.k) < 0 || !num(x.banca) || !num(x.strumento) || !num(x.diff)) err.push('Check ' + x.d + ' ' + x.k + ' is not valid');
    });
    (c.obiettivi || []).forEach(function (o) {
      if (!o.nome || !num(o.attuale) || o.attuale < 0 || !num(o.desiderato) || o.desiderato < 0) err.push('Goal ' + (o.nome || '?') + ' is not valid');
    });
    (c.revisioni || []).forEach(function (r) {
      if (!trimReg.test(r.trimestre || '') || !day.test(r.data || '') || !real(r.data)) err.push('Review ' + r.trimestre + ' is not valid');
    });
    if (c.ricorrenti != null && !Array.isArray(c.ricorrenti)) err.push('ricorrenti is not a list');
    (Array.isArray(c.ricorrenti) ? c.ricorrenti : []).forEach(function (r) { validaRicorrente(r || {}).forEach(function (e) { err.push('Recurring ' + ((r && r.nome) || '?') + ': ' + e); }); });
    if (c.ricorrentiSaltate != null && !(Array.isArray(c.ricorrentiSaltate) && c.ricorrentiSaltate.every(function (k) { return typeof k === 'string'; }))) err.push('ricorrentiSaltate is not a list of keys');
    var inv = c.investimenti;
    if (inv && conti.indexOf(inv.conto) < 0) err.push('investimenti: account ' + inv.conto + ' does not exist');
    (inv && inv.valore || []).forEach(function (v) { if (!day.test(v.d || '') || !real(v.d) || !num(v.importo) || v.importo < 0) err.push('investimenti: value ' + v.d + ' is not valid'); });
    if (c.risparmioMin != null && !(num(c.risparmioMin) && c.risparmioMin >= 0 && c.risparmioMin <= 100)) err.push('risparmioMin is not valid');
    var fe = c.fondoEmergenze;
    if (fe && conti.indexOf(fe.conto) < 0) err.push('fondoEmergenze: account ' + fe.conto + ' does not exist');
    if (fe && fe.obiettivo != null && !(num(fe.obiettivo) && fe.obiettivo >= 0)) err.push('fondoEmergenze: goal is not valid');
    (c.quotaJoint || []).forEach(function (q) { if (!day.test(q.da || '') || !real(q.da) || !(q.pct > 0 && q.pct <= 100)) err.push('quotaJoint entry ' + q.da + ' is not valid'); });
    (c.soglie || []).forEach(function (s) { if (!(s > 0)) err.push('soglie value ' + s + ' is not valid'); });
    var cat = (c.categorie || []).map(function (x) { return x.nome; });
    var buste = cat.concat((c.salvadanai || []).map(function (v) { return v.nome; }));
    (c.etichette || []).forEach(function (l) { if (!l.nome || (l.categoria && buste.indexOf(l.categoria) < 0)) err.push('Label ' + l.nome + ' is not valid'); });
    Object.keys(c.piani || {}).forEach(function (k) {
      var p = c.piani[k];
      if (!ym.test(k)) { err.push('Plan ' + k + ' is not a month'); return; }
      if (!num(p.stipendio)) err.push('Plan ' + k + ' has no salary');
      (p.righe || []).forEach(function (r) { if (buste.indexOf(r.nome) < 0 || !num(r.importo)) err.push('Plan ' + k + ' row ' + r.nome + ' is not valid'); });
    });
    return err;
  }

  // Accounts that accept new movements (cfg.conti = [{nome, chiuso, ...}], see cfgNorm).
  function contiAttivi(cfg) { return (cfg.conti || []).filter(function (c) { return !c.chiuso; }); }

  // Categories open to new movements, with their gruppo (cfg.categorie = [{nome, gruppo, ...}], see cfgNorm).
  function categorieAttive(cfg) { return (cfg.categorie || []).filter(function (c) { return !c.archiviata && !c.entrata; }); }

  // Income categories open to new movements (entrata: true); the one with finanzia: true is the salary that funds the month.
  function categorieEntrata(cfg) { return (cfg.categorie || []).filter(function (c) { return !c.archiviata && c.entrata; }); }

  // True when m is an income in a category that funds the month. Any other income (other income categories, no category, the
  // legacy t:'x2') never touches the month. Archived categories still count: old salaries stay salaries.
  function finanziaMese(cfg, m) {
    if (!(m.e > 0) || m.u || m.t) return false;
    return (cfg.categorie || []).some(function (c) { return c.nome === m.c && c.entrata && c.finanzia; });
  }

  // Balance per account over all months. A transfer (t:'g') moves u from k to a; every other row moves k by e - u,
  // so the old two-row transfer still reads right. On the Joint it is the real account balance (whole amounts, partner
  // top-ups), not my share. cfg (optional): an account with saldoIniziale {data, importo} starts from it and counts only
  // rows dated from that day on (earlier rows are inside it); every account of cfg appears (0 without rows), a closed one keeps its historical balance.
  // finoA (optional 'YYYY-MM-DD'): rows after it are left out (balance as of that day).
  // shortcut: rows without k count under ''.
  function saldi(mesi, cfg, finoA) {
    var s = {}, si = {};
    (cfg && cfg.conti || []).forEach(function (c) { si[c.nome] = c.saldoIniziale; s[c.nome] = c.saldoIniziale ? c.saldoIniziale.importo : 0; });
    function add(k, v, d) {
      if (si[k] && d < si[k].data) return;
      s[k || ''] = Math.round(((s[k || ''] || 0) + v) * 100) / 100;
    }
    Object.keys(mesi).forEach(function (ym) {
      movs(mesi, ym).forEach(function (m) {
        if (finoA && m.d > finoA) return;
        if (m.t === 'cr' && !m.k) return; // initial credit: no account
        if (m.t === 'g') { add(m.k, -(m.u || 0), m.d); add(m.a, m.u || 0, m.d); } else add(m.k, net(m), m.d);
      });
    });
    return s;
  }

  // "Azzera i dati di prova" (3.6): what a reset would delete. opz = {controlli, chiusure, piani} (which config parts to clear).
  // -> {mesi: month documents, mov: live movements, controlli/chiusure/piani: entries cleared (0 if not chosen), campi: config fields to delete, nomiMesi}.
  // Never lists categories, accounts, pots, Joint share, thresholds, goals, voci, emergency fund or investments: they are not touched.
  function azzeraPiano(mesi, cfg, opz) {
    var r = {mesi: 0, mov: 0, controlli: 0, chiusure: 0, piani: 0, campi: [], nomiMesi: Object.keys(mesi || {}).sort()};
    r.mesi = r.nomiMesi.length;
    r.nomiMesi.forEach(function (ym) { r.mov += movs(mesi, ym).length; });
    ['controlli', 'chiusure', 'piani'].forEach(function (f) {
      var v = cfg && cfg[f];
      if (!opz || !opz[f] || !v || !Object.keys(v).length) return;
      r[f] = Object.keys(v).length; r.campi.push(f);
    });
    return r;
  }

  // Bank check (spec 'controlli'): difference = bank balance - tool balance; ok within a cent. No correcting movement is
  // ever created: the difference only says a movement is probably missing.
  function differenzaControllo(banca, strumento) {
    var diff = Math.round((banca - strumento) * 100) / 100;
    return {diff: diff, ok: Math.abs(diff) < 0.005};
  }
  function storicoControlli(cfg, k, n) {
    return (cfg.controlli || []).filter(function (c) { return c.k === k; }).sort(function (a, b) { return b.d < a.d ? -1 : b.d > a.d ? 1 : 0; }).slice(0, n || 5);
  }
  function ultimoControllo(cfg, k) { return storicoControlli(cfg, k, 1)[0] || null; }
  function giorniTra(a, b) { return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8))) / 864e5); }
  // True when account k was never checked or its last check is more than 7 days before oggi.
  function controlloScaduto(cfg, k, oggi) { var u = ultimoControllo(cfg, k); return !u || giorniTra(u.d, oggi) > 7; }
  // Open accounts whose check is late (closed accounts are not asked for new checks).
  function controlliInRitardo(cfg, oggi) {
    return (cfg.conti || []).filter(function (c) { return !c.chiuso && controlloScaduto(cfg, c.nome, oggi); }).map(function (c) { return c.nome; });
  }

  // Investments (B8, R6) = cfg.investimenti {conto, valore: [{d, importo}]}: conto is an ordinary account (Trade Republic Investimenti).
  // versato = its opening balance + the transfers into it, minus the ones out of it, dated from its opening date up to finoA (optional):
  // money put in, so a fee or interest on the account is not "versato". valore = the latest manual value dated up to finoA with its date;
  // diff = valore - versato, the gain or loss. valore, data and diff are null until a value is typed. null when there is no config or the account does not exist.
  function investimenti(mesi, cfg, finoA) {
    var i = cfg.investimenti, c = i && (cfg.conti || []).find(function (x) { return x.nome === i.conto; });
    if (!c) return null;
    var versato = c.saldoIniziale ? c.saldoIniziale.importo : 0;
    Object.keys(mesi).forEach(function (ym) { movs(mesi, ym).forEach(function (m) { if (!(finoA && m.d > finoA) && !(c.saldoIniziale && m.d < c.saldoIniziale.data)) versato += versamento(m, i.conto); }); });
    versato = Math.round(versato * 100) / 100;
    var v = (i.valore || []).filter(function (x) { return !finoA || x.d <= finoA; }).sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; }).pop();
    return {versato: versato, valore: v ? v.importo : null, data: v ? v.d : null, diff: v ? Math.round((v.importo - versato) * 100) / 100 : null};
  }
  // What the row m moves into account conto as money put in: a transfer into it +u, out of it -u, anything else 0.
  function versamento(m, conto) { return m.t !== 'g' ? 0 : m.a === conto ? m.u || 0 : m.k === conto ? -(m.u || 0) : 0; }

  // Month figures with MONTHLY budgets, no carry-over (spec rules 2-4). cfg.categorie = [{nome, gruppo, budget, archiviata}];
  // the budget of a Joint category is already my share, and mia() already reads p. righe: categories with budget and
  // not archived; senza: other categories used in the month; spendibile: sum of the residuals (overspent counts negative).
  // shortcut: duplicate category names are not checked, the Joint flag is unused (budget = my share, as in strategia-2027),
  // overspent budgets are not clamped; revisit if the spec says otherwise.
  // Only expenses count as speso: an income never lowers it (R3). stipendio = incomes of the month in funding categories
  // (finanziaMese), informational: the spendibile stays the sum of the residuals, no income of any kind enters it.
  function meseCalc(mesi, cfg, ym) {
    var speso = {}, stipendio = 0;
    movs(mesi, ym).forEach(function (m) {
      if (finanziaMese(cfg, m)) stipendio += m.e;
      if (!m.c || !m.u) return;
      speso[m.c] = Math.round(((speso[m.c] || 0) + mia(m)) * 100) / 100;
    });
    var righe = [], spendibile = 0, conBudget = {};
    (cfg.salvadanai || []).forEach(function (v) { conBudget[v.nome] = 1; }); // a pot is not a budget: kept out of senza
    (cfg.categorie || []).forEach(function (c) {
      if (c.archiviata || !(c.budget > 0)) return;
      var s = speso[c.nome] || 0, residuo = Math.round((c.budget - s) * 100) / 100;
      conBudget[c.nome] = 1; spendibile += residuo;
      righe.push({c: c.nome, gruppo: c.gruppo, budget: c.budget, speso: s, residuo: residuo, pct: s / c.budget});
    });
    var senza = Object.keys(speso).filter(function (c) { return !conBudget[c] && speso[c]; })
      .map(function (c) { return {c: c, speso: speso[c]}; }).sort(function (a, b) { return b.speso - a.speso; });
    return {righe: righe, senza: senza, spendibile: Math.round(spendibile * 100) / 100, stipendio: Math.round(stipendio * 100) / 100};
  }

  // Thresholds newly crossed in month ym between two states of mesi (spec rule 5): [{c, soglia, pct}], one per category,
  // the highest crossed (70% -> 110% gives only 100). cfg.soglie in percent, default [80, 100]; reaching a threshold counts.
  function soglieSuperate(prima, dopo, cfg, ym) {
    var soglie = (cfg.soglie || [80, 100]).slice().sort(function (a, b) { return b - a; });
    var prev = {};
    meseCalc(prima, cfg, ym).righe.forEach(function (r) { prev[r.c] = r; });
    var out = [];
    meseCalc(dopo, cfg, ym).righe.forEach(function (r) {
      var oltre = function (x, s) { return x.speso * 100 >= s * x.budget; };
      var s = soglie.find(function (s) { return oltre(r, s); });
      if (s !== undefined && !oltre(prev[r.c], s)) out.push({c: r.c, soglia: s, pct: r.pct});
    });
    return out;
  }

  // "Can I afford it?" (spec rule 12): would an expense of `importo` in category c fit the residual of month ym?
  // → {ok, residuo, resta} when it fits (resta = what is left), else {ok:false, residuo, manca, proposte: [{c, taglio, residuo, prendi}], scoperto}.
  // proposte: other buckets with a taglio and a positive residuo, lowest taglio first, until manca is covered (prendi = how much to
  // take from each); scoperto = what the proposals still cannot cover. Buckets without a taglio (necessary or out of the ranking)
  // and pots are never proposed. Writes nothing: it is only a hint. shortcut: a category without budget counts as residuo 0;
  // a pot as c is not handled (the page offers only categories); the necessary buckets are never proposed, even when scoperto > 0.
  function permettermelo(mesi, cfg, ym, c, importo) {
    var r2 = function (x) { return Math.round(x * 100) / 100; }, righe = meseCalc(mesi, cfg, ym).righe;
    var mia = righe.find(function (r) { return r.c === c; }), residuo = mia ? mia.residuo : 0;
    if (residuo >= importo - 0.005) return {ok: true, residuo: residuo, resta: r2(residuo - importo)};
    var manca = r2(importo - residuo), rimane = manca, proposte = [];
    var tagliabili = (cfg.categorie || []).filter(function (x) { return x.taglio > 0 && x.nome !== c; });
    righe.map(function (r) { return {r: r, t: tagliabili.find(function (x) { return x.nome === r.c; })}; })
      .filter(function (x) { return x.t && x.r.residuo > 0; })
      .sort(function (a, b) { return a.t.taglio - b.t.taglio || a.r.c.localeCompare(b.r.c, 'it'); })
      .forEach(function (x) {
        if (rimane <= 0.005) return;
        var prendi = Math.min(x.r.residuo, rimane); rimane = r2(rimane - prendi);
        proposte.push({c: x.r.c, taglio: x.t.taglio, residuo: x.r.residuo, prendi: prendi});
      });
    return {ok: false, residuo: residuo, manca: manca, proposte: proposte, scoperto: rimane};
  }

  // Quota of a pot voce {nome, annuale, data 'YYYY-MM', cicli?, cambio?: {da 'YYYY-MM', quota}} in month ym. The goal is spread
  // evenly over the months of the current cycle: from the cycle start (the month after the previous due month, or the pot's
  // opening month apertura if later) to the due month included, so 80 due in September seen from January = 80 / 9. After the
  // due month the next cycle (cicli months, default 12) starts. Cumulative rounding: each month is the cents difference of the
  // running total, so a cycle adds up to the goal exactly. cambio: from its month the quota is that fixed value.
  // shortcut: the cycle follows the calendar only; a payment made early or late does not move it. Upgrade if it matters.
  function quotaVoce(v, ym, apertura) {
    var idx = function (s) { return +s.slice(0, 4) * 12 + +s.slice(5, 7) - 1; }, r = function (x) { return Math.round(x * 100) / 100; };
    var y = idx(ym), cy = cicloVoce(v, ym, apertura);
    if (!cy) return 0; // a voce without a valid month saves nothing, rather than NaN everywhere
    if (v.cambio && y >= idx(v.cambio.da)) return v.cambio.quota;
    var n = cy.due - cy.s + 1, k = y - cy.s + 1;
    return k < 1 ? 0 : r(r(v.annuale * k / n) - r(v.annuale * (k - 1) / n));
  }
  // Cycle of voce v that contains month ym: {s, due} as month indexes (year x 12 + month - 1), null without a valid due month.
  function cicloVoce(v, ym, apertura) {
    var idx = function (s) { return +s.slice(0, 4) * 12 + +s.slice(5, 7) - 1; };
    if (!/^\d{4}-\d{2}/.test(v.data || '')) return null;
    var y = idx(ym), c = v.cicli || 12, d0 = idx(v.data), due = d0 + (y <= d0 ? 0 : Math.ceil((y - d0) / c)) * c;
    return {s: Math.max(due - c + 1, apertura ? idx(apertura) : -Infinity), due: due};
  }

  // Monthly quota of pot sv in month ym: the sum of its voci, or the fixed sv.quota when it has none.
  function quotaSalvadanaio(sv, ym) {
    if (!(sv.voci && sv.voci.length)) return sv.quota || 0;
    var ap = sv.saldoIniziale && sv.saldoIniziale.data.slice(0, 7), t = 0;
    sv.voci.forEach(function (v) { t += quotaVoce(v, ym, ap); });
    return Math.round(t * 100) / 100;
  }

  // Balance of pot sv ({nome, quota | voci, saldoIniziale: {data, importo}}) at the end of month ym: opening balance + quota of
  // every month from the opening month to ym (both included) - my part of the expenses with c = sv.nome dated from the
  // opening date to the end of ym (the voce v is only a label: one balance). Rows before the opening date are already inside
  // the opening balance. The raw balance is returned, never clamped: ammanco() keeps it from going below zero at registration.
  function saldoSalvadanaio(mesi, sv, ym, chiusure) {
    var si = sv.saldoIniziale || {data: '0000-01-01', importo: 0}, a = si.data.slice(0, 7);
    var n = Math.max(0, (+ym.slice(0, 4) - +a.slice(0, 4)) * 12 + (+ym.slice(5) - +a.slice(5)) + 1);
    var tot = si.importo;
    for (var i = 0, y = +a.slice(0, 4), mo = +a.slice(5); i < n; i++, mo++) {
      if (mo > 12) { y++; mo = 1; }
      tot += quotaSalvadanaio(sv, y + '-' + (mo < 10 ? '0' : '') + mo);
    }
    Object.keys(mesi).forEach(function (k) {
      if (k > ym) return;
      movs(mesi, k).forEach(function (m) {
        if (m.d < si.data) return;
        if (m.b && m.e && !m.u && (!m.t || m.t === 'x2')) { if (m.b === sv.nome) tot += m.e; } // income assigned to this pot (x2 = legacy)
        else if (m.c === sv.nome && m.u) tot -= mia(m);
      });
    });
    Object.keys(chiusure || {}).forEach(function (k) { // month closings (3.3): surplus put in / overspend taken from this pot
      if (k > ym || k < a) return;
      ((chiusure[k] || {}).righe || []).forEach(function (r) {
        if (r.a === sv.nome) tot += r.tipo === 'avanzo' ? r.importo - (r.coperto || 0) : -(r.coperto || 0);
      });
    });
    return Math.round(tot * 100) / 100;
  }

  // R7: how far pot sv is behind its plan at the end of month ym, in euro (0 when on schedule). Matured need = for a pot with voci,
  // the quotas of every voce from the start of its current cycle up to ym (0 for a voce already paid in the cycle: an expense with v =
  // its name); for a pot with only a goal, obiettivo x month of the year / 12; for the emergency pot (extra.emergenze) the whole goal
  // (obiettivoFondo, else its own). A sottoZero pot is out (a negative balance is "da recuperare"). saldo = balance override.
  // shortcut: the cycle follows the calendar (as quotaVoce) and a due month passed unpaid is forgotten; upgrade if a late payment
  // must keep the voce short.
  // shortcut: a goal-only pot is prorated on the calendar year even if it was opened mid-year; set the opening balance accordingly.
  function mancaRispettoPiano(mesi, sv, ym, extra, obiettivoFondo, saldo) {
    if (sv.sottoZero) return 0;
    var need = 0, ap = sv.saldoIniziale && sv.saldoIniziale.data.slice(0, 7);
    var idx = function (s) { return +s.slice(0, 4) * 12 + +s.slice(5, 7) - 1; }, y = idx(ym);
    if (extra && sv.nome === extra.emergenze) need = obiettivoFondo > 0 ? obiettivoFondo : sv.obiettivo || 0;
    else if (sv.voci && sv.voci.length) sv.voci.forEach(function (v) {
      var c = cicloVoce(v, ym, ap);
      if (!c || vocePagata(mesi, sv, v, c, y)) return;
      for (var k = c.s; k <= y; k++) need += quotaVoce(v, meseDelta(ym, k - y), ap);
    });
    else if (sv.obiettivo > 0) need = sv.obiettivo * +ym.slice(5, 7) / 12;
    return Math.max(0, Math.round((need - (saldo !== undefined ? saldo : saldoSalvadanaio(mesi, sv, ym))) * 100) / 100);
  }

  // ym shifted by n months ('2026-01', -1 → '2025-12').
  function meseDelta(ym, n) {
    var i = +ym.slice(0, 4) * 12 + +ym.slice(5) - 1 + n;
    return Math.floor(i / 12) + '-' + ('0' + (i % 12 + 1)).slice(-2);
  }
  // Lowest balance of pot sv from month ym to the last month with data (or ym): what a closing may take away without a later month going negative.
  function saldoMinimoDa(mesi, sv, ym, chiusure) {
    var fine = Object.keys(mesi).concat(ym).sort().pop(), min = Infinity;
    for (var k = ym; k <= fine; k = meseDelta(k, 1)) min = Math.min(min, saldoSalvadanaio(mesi, sv, k, chiusure));
    return min;
  }

  // Month closing (3.3, spec rule 13): surplus and overspend of the budget categories of month ym, never decided automatically.
  // chiusuraProposta suggests a choice for each, chiusuraCalcola applies the user's choices (scelte = {category: a}).
  // Surplus: a = pot name (the buffer, cfg.extra.cuscinetto, by default) or '' = savings that stay on the account.
  // Overspend: a = a pot (its balance at the end of the month, never below zero) or a bucket with a taglio that has a surplus
  // (its residual); '' = not covered. The emergency fund is never a source nor a destination (use a transfer for it).
  // shortcut: an overspend is covered by one source only: if short, the rest stays "scoperto" and is reported.
  function chiusuraBase(mesi, cfg, ym) {
    var r2 = function (x) { return Math.round(x * 100) / 100; }, ex = cfg.extra || {}, fe = ex.emergenze || 'Fondo emergenze'; // a pot of that name (if any) is never a source nor a destination
    var sc = Object.assign({}, cfg.chiusure), pots = {}, taglio = {}, busta = {};
    delete sc[ym]; // the closing being made or redone does not count in its own balances
    (cfg.salvadanai || []).forEach(function (v) { if (v.nome !== fe) pots[v.nome] = Math.max(0, saldoMinimoDa(mesi, v, ym, sc)); });
    (cfg.categorie || []).forEach(function (c) { if (c.taglio > 0 && !c.archiviata) taglio[c.nome] = c.taglio; });
    var voci = meseCalc(mesi, cfg, ym).righe.filter(function (r) { return Math.abs(r.residuo) > 0.005; })
      .map(function (r) { return {c: r.c, tipo: r.residuo > 0 ? 'avanzo' : 'sforo', importo: r2(Math.abs(r.residuo))}; })
      .sort(function (a, b) { return (a.tipo === b.tipo ? 0 : a.tipo === 'avanzo' ? -1 : 1) || b.importo - a.importo || a.c.localeCompare(b.c, 'it'); });
    voci.forEach(function (v) { if (v.tipo === 'avanzo' && taglio[v.c]) busta[v.c] = v.importo; });
    return {voci: voci, pots: pots, busta: busta, taglio: taglio, cus: ex.cuscinetto || 'Cuscinetto', r2: r2};
  }
  // → {voci: [{c, tipo: 'avanzo'|'sforo', importo}], scelte: {c: a}}. Surplus → the buffer (or '' without it). Overspend → the buffer if
  // it has enough, else the first bucket by taglio whose surplus is enough, else '' (scoperto). Running balances, so two overspends do not use the same money.
  function chiusuraProposta(mesi, cfg, ym) {
    var b = chiusuraBase(mesi, cfg, ym), scelte = {}, pots = Object.assign({}, b.pots), busta = Object.assign({}, b.busta);
    var cus = b.cus in pots ? b.cus : '';
    var ordine = Object.keys(busta).sort(function (x, y) { return b.taglio[x] - b.taglio[y] || x.localeCompare(y, 'it'); });
    b.voci.forEach(function (v) {
      if (v.tipo === 'avanzo') { scelte[v.c] = cus; return; }
      var da = cus && pots[cus] >= v.importo - 0.005 ? cus : ordine.find(function (n) { return busta[n] >= v.importo - 0.005; }) || '';
      if (da === cus && da) pots[da] = b.r2(pots[da] - v.importo); else if (da) busta[da] = b.r2(busta[da] - v.importo);
      scelte[v.c] = da;
    });
    return {voci: b.voci, scelte: scelte, pots: b.pots, buste: b.busta}; // pots = balance of each pot usable as source or destination, buste = surplus of the buckets with a taglio
  }
  // → {righe: [{c, tipo, importo, a, coperto}], errori: [text], avanzo, sforo, scoperto}. Surplus: coperto = what overspends took from
  // that bucket (importo - coperto goes to a). Overspend: coperto = what its source gave (importo - coperto = scoperto).
  function chiusuraCalcola(mesi, cfg, ym, scelte) {
    var b = chiusuraBase(mesi, cfg, ym), r2 = b.r2, errori = [], pots = Object.assign({}, b.pots), busta = Object.assign({}, b.busta);
    var righe = b.voci.map(function (v) { return {c: v.c, tipo: v.tipo, importo: v.importo, a: (scelte || {})[v.c] || '', coperto: 0}; });
    righe.forEach(function (r) {
      if (r.tipo !== 'sforo' || !r.a) return;
      var d = r.a in pots ? pots : r.a in busta ? busta : null;
      if (!d) { errori.push(r.c + ': ' + r.a + ' non può coprire lo sforo'); r.a = ''; return; }
      r.coperto = r2(Math.min(r.importo, d[r.a])); d[r.a] = r2(d[r.a] - r.coperto);
      if (r.coperto < r.importo - 0.005) errori.push(r.c + ': ' + r.a + ' copre solo ' + r.coperto.toFixed(2).replace('.', ',') + ' € su ' + r.importo.toFixed(2).replace('.', ',') + ' €');
    });
    righe.forEach(function (r) {
      if (r.tipo !== 'avanzo') return;
      if (r.c in b.busta) r.coperto = r2(b.busta[r.c] - busta[r.c]);
      if (r.a && !(r.a in b.pots)) { errori.push(r.c + ': ' + r.a + ' non è un salvadanaio valido'); r.a = ''; }
    });
    var sum = function (t, f) { return r2(righe.filter(function (r) { return r.tipo === t; }).reduce(function (s, r) { return s + f(r); }, 0)); };
    return {righe: righe, errori: errori, avanzo: sum('avanzo', function (r) { return r.importo - r.coperto; }), sforo: sum('sforo', function (r) { return r.importo; }), scoperto: sum('sforo', function (r) { return r.importo - r.coperto; })};
  }
  // A month is closed once; it can be reopened only while the next month is not closed.
  // With mesi it also refuses to reopen when the money the closing put in a pot was already spent (a balance would go negative).
  function chiusuraStato(cfg, ym, mesi) {
    var ch = cfg.chiusure || {}, sc = Object.assign({}, ch), chiusa = !!ch[ym], motivo = '';
    delete sc[ym];
    if (chiusa && ch[meseDelta(ym, 1)]) motivo = 'Il mese dopo è già chiuso: riaprilo prima.';
    else if (chiusa && mesi) (cfg.salvadanai || []).some(function (v) {
      if (v.sottoZero) return false; // a pot allowed below zero never blocks a reopening
      var senza = saldoMinimoDa(mesi, v, ym, sc);
      if (senza >= -0.005 || senza >= saldoMinimoDa(mesi, v, ym, ch)) return false; // only a negative the closing itself prevents
      return (motivo = v.nome + ' andrebbe sotto zero: i soldi di questa chiusura sono già stati spesi.');
    });
    return {chiusa: chiusa, puoRiaprire: chiusa && !motivo, motivo: motivo};
  }
  // Month before ym when it has movements and is not closed (the home reminder), else null.
  function chiusuraMancante(mesi, cfg, ym) {
    var prev = meseDelta(ym, -1);
    return movs(mesi, prev).length > 0 && !(cfg.chiusure || {})[prev] ? prev : null;
  }

  // Suggested destination (b) of an extra income m {d, e, l?}: {b, motivo}. It only proposes, the user chooses. Names and threshold
  // come from cfg.extra {soglia: 100, carte, cuscinetto, emergenze, investimenti, tcg}. Card sales (label TCG or category cfg.extra.carte, default 'Vendita carte') go to the TCG fund; below
  // the threshold the buffer; from it up: the emergency fund if below its sv.obiettivo, the pot furthest behind its plan
  // (mancaRispettoPiano, R7), the investments pot, the buffer. Pots are skipped when missing from cfg.salvadanai.
  // shortcut: "touched" = emergency fund under its obiettivo; the buffer is only a name (not a pot), so its residual does not grow.
  function destinazioneExtra(mesi, cfg, m) {
    var x = Object.assign({soglia: 100, cuscinetto: 'Cuscinetto', emergenze: 'Fondo emergenze', investimenti: 'Investimenti', tcg: 'Fondo TCG', carte: 'Vendita carte'}, cfg.extra);
    var pots = cfg.salvadanai || [], ym = m.d.slice(0, 7);
    var ha = function (n) { return pots.some(function (v) { return v.nome === n; }); };
    var fe = cfg.fondoEmergenze || {}; // the fund goal set in 2.7 wins over the pot's own obiettivo
    // shortcut: the fund is an account (R6); this step applies only if a pot named cfg.extra.emergenze exists, whose goal and balance are then the fund's.
    var manca = function (v) { var f = v.nome === x.emergenze && fondoEmergenze(mesi, cfg, ym); return mancaRispettoPiano(mesi, v, ym, x, fe.obiettivo, f ? f.saldo : saldoSalvadanaio(mesi, v, ym, cfg.chiusure)); };
    if (((m.l || []).some(function (l) { return String(l).toLowerCase() === 'tcg'; }) || (m.c && m.c === x.carte)) && ha(x.tcg)) {
      var neg = -saldoSalvadanaio(mesi, pots.find(function (v) { return v.nome === x.tcg; }), ym, cfg.chiusure);
      return {b: x.tcg, motivo: 'Vendita di carte: va al fondo TCG' + (neg > 0.005 ? '; al fondo mancano ' + neg.toFixed(2).replace('.', ',') + ' € per tornare a zero' : '')};
    }
    if (m.e < x.soglia) return {b: x.cuscinetto, motivo: 'Sotto ' + x.soglia + ' €: nel cuscinetto'};
    var em = pots.find(function (v) { return v.nome === x.emergenze; });
    if (em && manca(em) > 0.005) return {b: em.nome, motivo: 'Il fondo emergenze è sotto il suo obiettivo'};
    var corto = pots.filter(function (v) { return (!em || v.nome !== em.nome) && manca(v) > 0.005; })
      .sort(function (a, b) { return manca(b) - manca(a); })[0];
    if (corto) return {b: corto.nome, motivo: 'Salvadanaio in ammanco: mancano ' + manca(corto).toFixed(2).replace('.', ',') + ' € rispetto al piano'};
    if (ha(x.investimenti)) return {b: x.investimenti, motivo: 'Niente da rimettere a posto: livello 3-5 anni'};
    return {b: x.cuscinetto, motivo: 'Nessun altro posto: nel cuscinetto'};
  }

  // Emergency fund (spec rule 15, B7) at the end of month ym. cfg.fondoEmergenze = {conto, obiettivo}: conto is the ordinary account
  // that holds the fund (R6, Trade Republic Fondo); the balance is that account's balance (saldi) at the end of the month. necessarie =
  // monthly budgets of the Necessarie categories + quotas of the Necessarie pots (as the plan counts them). mesi = saldo / necessarie
  // (2 decimals, 0 without necessarie); seiMesi = 6 x necessarie, the check of the January/July reminder; sotto = balance under the
  // goal (a use must be put back first). null when the config or the account is missing.
  // shortcut: the goal is a fixed number, not tied to seiMesi; the check is only shown in January and July (no push notification).
  function fondoEmergenze(mesi, cfg, ym) {
    var fe = cfg.fondoEmergenze, r2 = function (x) { return Math.round(x * 100) / 100; };
    if (!fe || !(cfg.conti || []).some(function (c) { return c.nome === fe.conto; })) return null;
    var nec = 0;
    (cfg.categorie || []).forEach(function (c) { if (!c.archiviata && c.gruppo === 'Necessarie' && c.budget > 0) nec += c.budget; });
    (cfg.salvadanai || []).forEach(function (v) { if (v.gruppo === 'Necessarie') nec += quotaSalvadanaio(v, ym); });
    nec = r2(nec);
    var saldo = saldi(mesi, cfg, ym + '-31')[fe.conto] || 0, ob = fe.obiettivo || 0;
    return {saldo: saldo, obiettivo: ob, necessarie: nec, mesi: nec > 0 ? r2(saldo / nec) : 0, seiMesi: r2(6 * nec),
      manca: r2(Math.max(0, ob - saldo)), sotto: saldo < ob, promemoria: ym.slice(5) === '01' || ym.slice(5) === '07'};
  }

  // True when m is an expense from the emergency fund account or a transfer out of it, without a note (every use needs one, spec rule 15).
  function usoFondoSenzaNota(cfg, m) {
    var fe = cfg.fondoEmergenze;
    if (!fe || !(m.u > 0) || String(m.n || '').trim()) return false;
    return m.k === fe.conto && (!m.t || m.t === 'g');
  }

  // What a new or edited expense m cannot take from its pot: the deepest shortfall of the balance from m's month to the
  // last month with data, with m counted (so a backdated expense cannot sink a later month); 0 when m.c is not a pot in
  // cfg.salvadanai or m is not a plain expense. The movement itself (same id) is replaced by m.
  function ammanco(mesi, cfg, m) {
    var v = (cfg.salvadanai || []).find(function (x) { return x.nome === m.c; });
    if (!v || v.sottoZero || !(m.u > 0) || m.t) return 0; // sottoZero (the TCG fund): a negative balance is money to win back
    var da = m.d.slice(0, 7), con = {};
    Object.keys(mesi).forEach(function (k) { con[k] = Object.assign({}, mesi[k]); if (m.id) delete con[k][m.id]; });
    con[da] = Object.assign({}, con[da]); con[da][m.id || '_nuovo'] = m;
    var fine = Object.keys(con).concat(da).sort().pop(), min = 0;
    for (var y = +da.slice(0, 4), mo = +da.slice(5); ; mo++) {
      if (mo > 12) { y++; mo = 1; }
      var k = y + '-' + (mo < 10 ? '0' : '') + mo;
      if (k > fine) break;
      min = Math.min(min, saldoSalvadanaio(con, v, k, cfg.chiusure));
    }
    return Math.round(-min * 100) / 100 + 0; // + 0: no -0
  }

  // Plan of month ym (spec: piani/<YYYY-MM>): p = {stipendio, righe: [{nome, importo}]}. One row per budget category
  // (not archived, budget > 0) and per pot; the amount is the edited one in p.righe, else the current monthly budget / pot quota.
  // Rows are ordered by gruppo (Necessarie, Non necessarie, Risparmi, then others). totale = sum of rows, resta = stipendio - totale
  // (negative = plan overspent), pct = share of the stipendio (0 without one). joint = rows that go through the Joint account
  // (category flag `joint`, pot on a Joint account): informational, already inside totale.
  // shortcut: the Joint transfer is not a row of its own (strategia A8 gives it as a figure, and a category is wholly Joint or not, see Abbonamenti Condivisi); saving a plan does not change the pot quotas the balances use.
  function piano(cfg, ym, p) {
    p = p || {};
    var r2 = function (x) { return Math.round(x * 100) / 100; }, mod = {};
    (p.righe || []).forEach(function (r) { mod[r.nome] = r.importo; });
    var righe = [];
    (cfg.categorie || []).forEach(function (c) {
      if (!c.archiviata && c.budget > 0) righe.push({nome: c.nome, tipo: 'budget', gruppo: c.gruppo || '', importo: mod[c.nome] != null ? mod[c.nome] : c.budget, joint: !!c.joint});
    });
    (cfg.salvadanai || []).forEach(function (v) {
      righe.push({nome: v.nome, tipo: 'salvadanaio', gruppo: v.gruppo || '', importo: mod[v.nome] != null ? mod[v.nome] : quotaSalvadanaio(v, ym), joint: contoJoint(cfg, v.conto)});
    });
    var ordine = ['Necessarie', 'Non necessarie', 'Risparmi'], pos = function (g) { var i = ordine.indexOf(g); return i < 0 ? ordine.length : i; };
    righe = righe.map(function (r, i) { return {r: r, i: i}; })
      .sort(function (a, b) { return pos(a.r.gruppo) - pos(b.r.gruppo) || a.i - b.i; }).map(function (x) { return x.r; });
    var stip = p.stipendio || 0, tot = 0, joint = 0, gr = {}, gruppi = [];
    righe.forEach(function (r) {
      tot += r.importo; if (r.joint) joint += r.importo;
      var g = gr[r.gruppo];
      if (!g) { g = gr[r.gruppo] = {gruppo: r.gruppo, totale: 0}; gruppi.push(g); }
      g.totale = r2(g.totale + r.importo);
    });
    gruppi.forEach(function (g) { g.pct = stip > 0 ? g.totale / stip : 0; });
    return {stipendio: stip, righe: righe, gruppi: gruppi, totale: r2(tot), resta: r2(stip - tot) + 0, joint: r2(joint)};
  }

  // The latest saved plan before month ym (cfg.piani = {'YYYY-MM': plan}), to start a new month from; {} when there is none.
  function pianoPrecedente(cfg, ym) {
    var k = Object.keys(cfg.piani || {}).filter(function (x) { return x < ym; }).sort().pop();
    return k ? cfg.piani[k] : {};
  }

  // Every category: configured (object fields kept) or used by a live movement.
  // n = live movements using it, anno = those in the given year ('YYYY').
  function categorie(mesi, cfg, anno) {
    var info = {};
    var get = function (nome) { return info[nome] = info[nome] || {c: nome, nome: nome, n: 0, anno: 0}; };
    (cfg.categorie || []).forEach(function (c) { Object.assign(get(c.nome), c); });
    Object.keys(mesi).forEach(function (ym) {
      movs(mesi, ym).forEach(function (m) {
        if (!m.c) return;
        var r = get(m.c); r.n++;
        if (ym.slice(0, 4) === String(anno)) r.anno++;
      });
    });
    return Object.keys(info).sort(function (a, b) { return a.localeCompare(b, 'it'); }).map(function (k) { return info[k]; });
  }

  // Per-month merge patch that moves the live movements of category da to a: {ym: {id: {c: a}}}
  function rinomina(mesi, da, a) {
    var out = {};
    Object.keys(mesi).forEach(function (ym) {
      movs(mesi, ym).forEach(function (m) {
        if (m.c === da) (out[ym] = out[ym] || {})[m.id] = {c: a};
      });
    });
    return out;
  }

  // Cut priority (taglio, 1 = cut first) is unique among active categories. Returns only the changes {nome: taglio|null}.
  // A taken number moves the chain below it down by one; removing a number leaves a gap (no renumbering); archived
  // categories keep their number and stay out of the ranking.
  function riordinaTaglio(categorie, nome, nuovo) {
    var me = categorie.filter(function (c) { return c.nome === nome; })[0] || {};
    var out = {};
    if ((me.taglio || null) === (nuovo || null)) return out;
    out[nome] = nuovo || null;
    if (!nuovo || me.archiviata) return out;
    var cur = nuovo;
    categorie.filter(function (c) { return c.nome !== nome && !c.archiviata && c.taglio > 0 && c.taglio >= nuovo; })
      .sort(function (a, b) { return a.taglio - b.taglio || a.nome.localeCompare(b.nome, 'it'); })
      .some(function (c) { if (c.taglio > cur) return true; out[c.nome] = ++cur; return false; });
    return out;
  }

  // ---- 3.4: net worth, summary per group, savings rate ----

  // Net worth (spec rule 11) as of finoA (optional 'YYYY-MM-DD'): the balance of every account (closed ones keep what they hold),
  // the Joint at my share in force on that date (saldi() holds the whole account, partner top-ups included: only my share counts),
  // the investments account at its latest typed value in place of its balance (R6: one line, so it is never counted twice; its balance
  // until a first value is typed; the emergency fund is an ordinary account line, pots are already inside their accounts).
  // → {totale, componenti: [{nome, tipo: 'conto'|'investimenti', importo, saldo, quota?}], crediti, parziale, senzaSaldo, senzaQuota}.
  // crediti = open credits at that date, shown apart and NOT in the total. parziale = an account is missing its opening balance (open
  // accounts only) or was not yet opened at finoA, so the figure is incomplete. senzaQuota = a Joint account with no share in force (counts 0).
  // shortcut: the Joint line is balance x share, so a top-up by the partner counts at my share; a precise split of who put what needs
  // per-person deposits. An account not yet opened at finoA is left out, not estimated.
  function patrimonio(mesi, cfg, finoA) {
    var r2 = function (x) { return Math.round(x * 100) / 100; }, sal = saldi(mesi, cfg, finoA), pct = quotaJoint(cfg, finoA || '9999-12-31');
    var inv = investimenti(mesi, cfg, finoA), comp = [], senzaSaldo = [], parziale = false, senzaQuota = false;
    (cfg.conti || []).forEach(function (c) {
      var si = c.saldoIniziale;
      if (si && finoA && si.data > finoA) { parziale = true; return; }
      if (!si && !c.chiuso) { senzaSaldo.push(c.nome); parziale = true; }
      var saldo = sal[c.nome] || 0, importo = saldo, riga = {nome: c.nome, tipo: 'conto', saldo: saldo};
      if (inv && c.nome === cfg.investimenti.conto) { riga.tipo = 'investimenti'; if (inv.valore != null) importo = inv.valore; }
      if (c.joint) { riga.quota = pct; if (pct == null) senzaQuota = true; importo = pct == null ? 0 : r2(importo * pct / 100); }
      riga.importo = importo; comp.push(riga);
    });
    var crediti = creditiAperti(mesi).filter(function (x) { return !finoA || x.d <= finoA; }).reduce(function (t, x) { return t + x.residuo; }, 0);
    return {totale: r2(comp.reduce(function (t, x) { return t + x.importo; }, 0)), componenti: comp, crediti: r2(crediti), parziale: parziale, senzaSaldo: senzaSaldo, senzaQuota: senzaQuota};
  }

  // Net worth at the end of every month from the oldest month with movements to the month of oggi ('YYYY-MM-DD'; the last point is
  // as of oggi): [{ym, totale, delta (change on the month before, null for the first), parziale}]. Empty without movements.
  function patrimonioSerie(mesi, cfg, oggi) {
    var primo = Object.keys(mesi).filter(function (k) { return movs(mesi, k).length; }).sort()[0], out = [];
    if (!primo) return out;
    for (var k = primo; k <= oggi.slice(0, 7); k = meseDelta(k, 1)) {
      var p = patrimonio(mesi, cfg, k === oggi.slice(0, 7) ? oggi : k + '-31');
      out.push({ym: k, totale: p.totale, delta: out.length ? Math.round((p.totale - out[out.length - 1].totale) * 100) / 100 : null, parziale: p.parziale});
    }
    return out;
  }

  // Salary of month ym and where it comes from: the incomes of the month in a funding category ('incassato'), else the salary of
  // that month's plan ('piano'), else 0 ('nessuno'). Plus the plan rows (the month's own plan, else the latest before) at that salary.
  function statoMese(mesi, cfg, ym) {
    var inc = meseCalc(mesi, cfg, ym).stipendio, own = (cfg.piani || {})[ym], p = own || pianoPrecedente(cfg, ym);
    var stip = inc > 0 ? inc : own && own.stipendio > 0 ? own.stipendio : 0;
    return {stipendio: stip, fonte: inc > 0 ? 'incassato' : stip > 0 ? 'piano' : 'nessuno', piano: piano(cfg, ym, {righe: p.righe, stipendio: stip})};
  }

  // Summary per group of month ym (3.4): for each group (Necessarie, Non necessarie, Risparmi) the budget (the plan rows of the month:
  // category budgets and pot quotas), what I spent in those categories and pots (my part, `mia`), the residual, and two shares of the
  // salary: pctSpeso = speso / stipendio, pctPiano = budget / stipendio (the planned split, about 50/30/20). Shares are 0 without a salary.
  // → {stipendio, fonte, gruppi: [{gruppo, budget, speso, residuo, pctSpeso, pctPiano}]}.
  // shortcut: spending in categories without a budget or archived is not in any group.
  function riepilogoGruppi(mesi, cfg, ym) {
    var r2 = function (x) { return Math.round(x * 100) / 100; }, s = statoMese(mesi, cfg, ym), sp = {}, gr = {}, out = [];
    movs(mesi, ym).forEach(function (m) { if (m.c && m.u) sp[m.c] = (sp[m.c] || 0) + mia(m); });
    s.piano.righe.forEach(function (r) {
      var g = gr[r.gruppo];
      if (!g) { g = gr[r.gruppo] = {gruppo: r.gruppo, budget: 0, speso: 0}; out.push(g); }
      g.budget += r.importo; g.speso += sp[r.nome] || 0;
    });
    out.forEach(function (g) {
      g.budget = r2(g.budget); g.speso = r2(g.speso); g.residuo = r2(g.budget - g.speso);
      g.pctSpeso = s.stipendio > 0 ? g.speso / s.stipendio : 0; g.pctPiano = s.stipendio > 0 ? g.budget / s.stipendio : 0;
    });
    return {stipendio: s.stipendio, fonte: s.fonte, gruppi: out};
  }

  // Savings rate of month ym (spec rule 14, B12): (PAC + buffer + couple trips) / salary. PAC = money put into the investments
  // account in the month (transfers into it minus transfers out, never below 0); buffer and couple trips = what goes into those pots in the month:
  // their row in the month's plan (the quota without a plan) plus the surplus the month closing put in them. Pots for planned expenses
  // do not count; a surplus left on the account ('' in the closing) does not either. Names: cfg.extra.cuscinetto ('Cuscinetto') and
  // cfg.extra.viaggi ('Viaggi di coppia'). minimo = cfg.risparmioMin in percent (default 10).
  // → {stipendio, pac, cuscinetto, viaggi, risparmio, tasso (null without a salary), minimo, sopra}.
  // shortcut: a PAC registered as an expense in a category (the sheet's way) does not count: register it as a transfer to the investments account.
  function tassoRisparmio(mesi, cfg, ym) {
    var r2 = function (x) { return Math.round(x * 100) / 100; }, s = statoMese(mesi, cfg, ym), ex = cfg.extra || {}, inv = cfg.investimenti, pac = 0;
    movs(mesi, ym).forEach(function (m) { if (inv) pac += versamento(m, inv.conto); });
    var chius = ((cfg.chiusure || {})[ym] || {}).righe || [];
    var pot = function (nome) {
      var riga = s.piano.righe.filter(function (r) { return r.tipo === 'salvadanaio' && r.nome === nome; })[0], tot = riga ? riga.importo : 0;
      chius.forEach(function (r) { if (r.tipo === 'avanzo' && r.a === nome) tot += r.importo - (r.coperto || 0); });
      return r2(tot);
    };
    var cus = pot(ex.cuscinetto || 'Cuscinetto'), via = pot(ex.viaggi || 'Viaggi di coppia'), p = Math.max(0, r2(pac)), tot = r2(p + cus + via);
    var minimo = cfg.risparmioMin != null ? cfg.risparmioMin : 10;
    return {stipendio: s.stipendio, pac: p, cuscinetto: cus, viaggi: via, risparmio: tot, tasso: s.stipendio > 0 ? tot / s.stipendio : null, minimo: minimo, sopra: s.stipendio > 0 && tot * 100 >= minimo * s.stipendio};
  }

  // ---- 4.2: due-date coverage (B11) and end-of-year projection ----

  // True when voce v of pot sv (cycle c, see cicloVoce) already has an expense in that cycle up to month index y.
  function vocePagata(mesi, sv, v, c, y) {
    var idx = function (s) { return +s.slice(0, 4) * 12 + +s.slice(5, 7) - 1; };
    return Object.keys(mesi).some(function (k) { return movs(mesi, k).some(function (m) { return m.c === sv.nome && m.v === v.nome && m.u && idx(m.d) >= c.s && idx(m.d) <= y; }); });
  }

  // Month by month projection of pot sv from month ym0 (its balance at the end of ym0, as saldoSalvadanaio) to month fine: each later month
  // adds its quota (quotaSalvadanaio: voci, scheduled changes), then the voci falling due that month are paid in list order. A voce already paid in
  // the cycle of ym0 is not paid again. -> {saldi: {ym: balance after the payments}, pagamenti: [{voce, data, importo, saldoPrima}]}.
  // shortcut: closings not yet made are unknown (no surplus or overspend); payments are the full annuale, the balance may go below zero here (a real
  // expense would be refused by ammanco and covered by another bucket).
  function proiettaSalvadanaio(mesi, sv, cfg, ym0, fine) {
    var idx = function (s) { return +s.slice(0, 4) * 12 + +s.slice(5, 7) - 1; }, r2 = function (x) { return Math.round(x * 100) / 100; };
    var ap = sv.saldoIniziale && sv.saldoIniziale.data.slice(0, 7), bal = saldoSalvadanaio(mesi, sv, ym0, cfg.chiusure), saldi = {}, pag = [];
    var pagata = (sv.voci || []).map(function (v) { var c = cicloVoce(v, ym0, ap); return c && vocePagata(mesi, sv, v, c, idx(ym0)) ? c.due : -1; });
    for (var k = ym0; k <= fine; k = meseDelta(k, 1)) {
      if (k > ym0 && (!ap || k >= ap)) bal = r2(bal + quotaSalvadanaio(sv, k));
      (sv.voci || []).forEach(function (v, i) {
        var c = cicloVoce(v, k, ap);
        if (!c || c.due !== idx(k) || c.due === pagata[i]) return;
        pag.push({voce: v.nome, data: k, importo: v.annuale, saldoPrima: bal});
        bal = r2(bal - v.annuale);
      });
      saldi[k] = bal;
    }
    return {saldi: saldi, pagamenti: pag};
  }

  // Pots that can have due dates: with voci, not sottoZero (Fondo TCG), not the emergency fund pot.
  function salvadanaiConScadenze(cfg) {
    var fe = (cfg.extra && cfg.extra.emergenze) || 'Fondo emergenze';
    return (cfg.salvadanai || []).filter(function (v) { return !v.sottoZero && v.nome !== fe && v.voci && v.voci.length; });
  }

  // Coverage of the due dates (B11, spec rule 16) from today oggi ('YYYY-MM-DD'): every payment of every voce from this month up to the last next due
  // date (at most 36 months) -> [{salvadanaio, voce, data 'YYYY-MM', importo, saldoPrevisto, manca, mesi}] by date. saldoPrevisto = the pot balance just before
  // paying (balance now + the quotas up to that month - the earlier payments); manca = what is not covered, max(0, importo - max(0, saldoPrevisto)) so a
  // voce is not charged with the shortfall of an earlier one; mesi = months left from this one to the due month (0 = due this month).
  function scadenze(mesi, cfg, oggi) {
    var ym0 = oggi.slice(0, 7), idx = function (s) { return +s.slice(0, 4) * 12 + +s.slice(5, 7) - 1; }, r2 = function (x) { return Math.round(x * 100) / 100; };
    var pots = salvadanaiConScadenze(cfg), n = 0;
    pots.forEach(function (sv) {
      var ap = sv.saldoIniziale && sv.saldoIniziale.data.slice(0, 7);
      sv.voci.forEach(function (v) { var c = cicloVoce(v, ym0, ap); if (c) n = Math.max(n, Math.min(36, c.due - idx(ym0))); });
    });
    var fine = meseDelta(ym0, n), out = [];
    pots.forEach(function (sv) {
      proiettaSalvadanaio(mesi, sv, cfg, ym0, fine).pagamenti.forEach(function (p) {
        out.push({salvadanaio: sv.nome, voce: p.voce, data: p.data, importo: p.importo, saldoPrevisto: p.saldoPrima,
          manca: r2(Math.max(0, p.importo - Math.max(0, p.saldoPrima))), mesi: idx(p.data) - idx(ym0)});
      });
    });
    return out.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : a.salvadanaio.localeCompare(b.salvadanaio, 'it') || a.voce.localeCompare(b.voce, 'it'); });
  }

  // "How do I end the year?" from today oggi to December of the same year. Pace (ritmo) = the average monthly spending of each budget category over the
  // complete months (before the current one) that have movements; no such month = not enough data. -> {mesi: [ym0..Dec], ritmo: {ok, mesiDati},
  // budget: [{ym, budget, speso, spendibile}] or null, salvadanai: [{nome, sottoZero, saldi (per month), finale, sotto}], scadenze, scoperte (how many
  // not covered), patrimonio: {ok, motivo?, oggi, fine, serie: [{ym, totale}], parziale}}.
  // budget: the current month spends max(what is already spent, pace), the later ones the pace; budgets are the category budgets (the plan edits are not read).
  // patrimonio: needs the pace and at least one saved plan. Net worth now (patrimonio) - the rest of this month's spending up to the pace - the voci
  // still to pay this month; each later month adds the plan's pot rows (what goes to the pots) and the unspent plan budgets (plan amount - pace), minus the voci paid
  // that month. A pot quota alone does not move net worth: the money stays in the account until a voce is paid.
  // shortcut: the salary of the current month is assumed already received; incomes other than salary, PAC registered as an expense and closings not yet made are not foreseen.
  function proiezioneAnno(mesi, cfg, oggi) {
    var ym0 = oggi.slice(0, 7), r2 = function (x) { return Math.round(x * 100) / 100; }, fine = ym0.slice(0, 4) + '-12', ms = [];
    for (var k = ym0; k <= fine; k = meseDelta(k, 1)) ms.push(k);
    var completi = Object.keys(mesi).filter(function (k) { return k < ym0 && movs(mesi, k).length; }), medie = {};
    completi.forEach(function (k) { meseCalc(mesi, cfg, k).righe.forEach(function (r) { medie[r.c] = (medie[r.c] || 0) + r.speso / completi.length; }); });
    var ritmo = {ok: completi.length > 0, mesiDati: completi.length};
    var mc = meseCalc(mesi, cfg, ym0).righe, budget = null;
    if (ritmo.ok) budget = ms.map(function (ym) {
      var b = 0, s = 0;
      mc.forEach(function (r) { b += r.budget; s += ym === ym0 ? Math.max(r.speso, medie[r.c] || 0) : medie[r.c] || 0; });
      return {ym: ym, budget: r2(b), speso: r2(s), spendibile: r2(b - s)};
    });
    var pots = (cfg.salvadanai || []).map(function (sv) { return {sv: sv, p: proiettaSalvadanaio(mesi, sv, cfg, ym0, fine)}; });
    var salvadanai = pots.map(function (x) {
      var saldi = ms.map(function (k) { return x.p.saldi[k]; }), finale = saldi[saldi.length - 1];
      return {nome: x.sv.nome, sottoZero: !!x.sv.sottoZero, saldi: saldi, finale: finale, sotto: !x.sv.sottoZero && finale < -0.005};
    });
    var sc = scadenze(mesi, cfg, oggi);
    var pat = {ok: false, motivo: !ritmo.ok ? 'Servono almeno un mese completo con movimenti oltre a quello in corso.' : !Object.keys(cfg.piani || {}).length ? 'Manca il piano del mese: salvane uno dalla pagina Piano del mese.' : !(cfg.conti || []).length ? 'Non ci sono conti: il patrimonio di partenza sarebbe zero.' : ''};
    if (!pat.motivo) {
      var p0 = patrimonio(mesi, cfg, oggi), pagati = function (k) { return pots.reduce(function (t, x) { return t + x.p.pagamenti.filter(function (q) { return q.data === k; }).reduce(function (u, q) { return u + q.importo; }, 0); }, 0); };
      var tot = p0.totale - mc.reduce(function (t, r) { return t + Math.max(0, (medie[r.c] || 0) - r.speso); }, 0) - pagati(ym0), serie = [{ym: ym0, totale: r2(tot)}];
      ms.slice(1).forEach(function (k) {
        var pr = piano(cfg, k, (cfg.piani || {})[k] || pianoPrecedente(cfg, k)), n = -pagati(k);
        pr.righe.forEach(function (r) { n += r.tipo === 'salvadanaio' ? r.importo : r.importo - (medie[r.nome] || 0); });
        tot += n; serie.push({ym: k, totale: r2(tot)});
      });
      pat = {ok: true, oggi: p0.totale, fine: serie[serie.length - 1].totale, serie: serie, parziale: p0.parziale};
    }
    return {mesi: ms, ritmo: ritmo, budget: budget, salvadanai: salvadanai, scadenze: sc, scoperte: sc.filter(function (x) { return x.manca > 0.005; }).length, patrimonio: pat};
  }

  // ---- 4.3: quarterly review of the accounts (B5) ----

  var PRIMA_REVISIONE = '2027-Q1'; // quarters before it are test data: no reminder
  var trimReg = /^\d{4}-Q[1-4]$/;
  function trimestreDi(ym) { return ym.slice(0, 4) + '-Q' + Math.ceil(+ym.slice(5, 7) / 3); }
  function trimestreMesi(t) { var m = (+t.slice(6) - 1) * 3 + 1; return [0, 1, 2].map(function (i) { return t.slice(0, 4) + '-' + ('0' + (m + i)).slice(-2); }); }
  function trimestreFine(t) { var l = trimestreMesi(t)[2]; return l + '-' + (l.slice(5) === '03' || l.slice(5) === '12' ? '31' : '30'); }
  // The quarter to review on day oggi: the one ending within 7 days (or already ended and not yet followed by the next window), else the last concluded.
  // shortcut: from 7 days before a quarter ends the previous one is forgotten, even if it was never recorded.
  function trimestreDefault(oggi) {
    var q = trimestreDi(oggi.slice(0, 7));
    return giorniTra(oggi, trimestreFine(q)) <= 7 ? q : trimestreDi(meseDelta(trimestreMesi(q)[0], -1));
  }
  // Home reminder: the quarter to review when its review is not recorded and it is not before the first one; null otherwise. No push notification.
  function promemoriaRevisione(cfg, oggi) {
    var t = trimestreDefault(oggi);
    if (t < PRIMA_REVISIONE || (cfg.revisioni || []).some(function (r) { return r.trimestre === t; })) return null;
    return {trimestre: t, fine: trimestreFine(t), giorni: giorniTra(oggi, trimestreFine(t))};
  }
  // The buckets a goal of that name matches (it only suggests where to edit the quota: nothing is changed by itself).
  function obiettivoCollegato(cfg, nome) {
    var n = String(nome).toLowerCase(), out = [];
    if (categorieAttive(cfg).some(function (c) { return c.nome.toLowerCase() === n; })) out.push('categoria');
    if ((cfg.salvadanai || []).some(function (v) { return v.nome.toLowerCase() === n; })) out.push('salvadanaio');
    return out;
  }
  // Figures of quarter t from the app's own data. Months without movements are {ym, dati: false}: nothing is invented.
  // → {trimestre, mesiConDati, mesi: [{ym, dati, stipendio, speso, avanzo (null without a salary), gruppi, risparmio}], sforamenti: categories over budget
  // in 2+ months, cuscinetto {inizio, fine, movimento} | null, fondo {ok, ...}, joint {pct, da, speso, miaParte, n}, obiettivi}.
  // avanzo = salary received - spent in budget categories (pots are not in it). shortcut: no check that the salary arrived in the month it is for.
  function revisioneTrimestre(mesi, cfg, t) {
    var r2 = function (x) { return Math.round(x * 100) / 100; }, ms = trimestreMesi(t), sforo = {};
    var out = ms.map(function (ym) {
      if (!movs(mesi, ym).length) return {ym: ym, dati: false};
      var mc = meseCalc(mesi, cfg, ym), speso = 0;
      mc.righe.forEach(function (r) { speso += r.speso; });
      chiusuraProposta(mesi, cfg, ym).voci.forEach(function (v) { if (v.tipo === 'sforo') { var s = sforo[v.c] || (sforo[v.c] = {c: v.c, volte: 0, totale: 0}); s.volte++; s.totale = r2(s.totale + v.importo); } });
      var rg = riepilogoGruppi(mesi, cfg, ym);
      return {ym: ym, dati: true, stipendio: mc.stipendio, speso: r2(speso), avanzo: mc.stipendio > 0 ? r2(mc.stipendio - speso) : null,
        gruppi: rg.gruppi, stipendioRif: rg.stipendio, risparmio: tassoRisparmio(mesi, cfg, ym)};
    });
    var cus = (cfg.salvadanai || []).filter(function (v) { return v.nome === ((cfg.extra || {}).cuscinetto || 'Cuscinetto'); })[0], cuscinetto = null;
    if (cus && cus.saldoIniziale && cus.saldoIniziale.data.slice(0, 7) <= ms[0]) {
      var i = saldoSalvadanaio(mesi, cus, meseDelta(ms[0], -1), cfg.chiusure), f = saldoSalvadanaio(mesi, cus, ms[2], cfg.chiusure);
      cuscinetto = {nome: cus.nome, inizio: i, fine: f, movimento: r2(f - i)};
    }
    var fe = cfg.fondoEmergenze, fc = fe && (cfg.conti || []).filter(function (c) { return c.nome === fe.conto; })[0], fondo = {ok: false};
    if (fc && fc.saldoIniziale && fc.saldoIniziale.data <= ms[0] + '-01') {
      var ini = saldi(mesi, cfg, meseDelta(ms[0], -1) + '-31')[fc.nome], fin = saldi(mesi, cfg, ms[2] + '-31')[fc.nome], ver = 0;
      ms.forEach(function (ym) { movs(mesi, ym).forEach(function (m) { ver += versamento(m, fc.nome); }); });
      fondo = {ok: true, conto: fc.nome, inizio: ini, fine: fin, versamenti: r2(ver), rendimento: r2(fin - ini - ver), obiettivo: fe.obiettivo || 0, sopra: fe.obiettivo > 0 ? r2(fin - fe.obiettivo) : null};
    }
    var fine = trimestreFine(t), q = null;
    (cfg.quotaJoint || []).forEach(function (x) { if (x.da <= fine && (!q || x.da > q.da)) q = x; });
    var joint = {pct: q ? q.pct : null, da: q ? q.da : null, speso: 0, miaParte: 0, n: 0};
    ms.forEach(function (ym) { movs(mesi, ym).forEach(function (m) { if (m.u && !m.t && contoJoint(cfg, m.k)) { joint.speso += m.u; joint.miaParte += mia(m); joint.n++; } }); });
    joint.speso = r2(joint.speso); joint.miaParte = r2(joint.miaParte);
    return {trimestre: t, mesiConDati: out.filter(function (m) { return m.dati; }).length, mesi: out,
      sforamenti: Object.keys(sforo).map(function (k) { return sforo[k]; }).filter(function (s) { return s.volte >= 2; }).sort(function (a, b) { return b.volte - a.volte || a.c.localeCompare(b.c, 'it'); }),
      cuscinetto: cuscinetto, fondo: fondo, joint: joint,
      obiettivi: (cfg.obiettivi || []).map(function (o) { return {nome: o.nome, attuale: o.attuale, desiderato: o.desiderato, distanza: r2(o.desiderato - o.attuale), collegato: obiettivoCollegato(cfg, o.nome)}; })};
  }
  // Problems of a review before it is saved: r = {trimestre, data, decisioni, obiettivi: [{nome, azione: 'alzo' (a, da) | 'rimando'}]}.
  function validaRevisione(r, cfg) {
    var err = [], day = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, nomi = (cfg.obiettivi || []).map(function (o) { return o.nome; });
    if (!trimReg.test(r.trimestre || '')) err.push('Quarter is not valid');
    if (!day.test(r.data || '') || isNaN(Date.parse(r.data)) || new Date(r.data).toISOString().slice(0, 10) !== r.data) err.push('Date is not valid');
    (r.obiettivi || []).forEach(function (o) {
      if (nomi.indexOf(o.nome) < 0) err.push('Goal ' + o.nome + ' does not exist');
      if (o.azione !== 'alzo' && o.azione !== 'rimando') err.push('Goal ' + o.nome + ': action is not valid');
      if (o.azione === 'alzo' && !(typeof o.a === 'number' && isFinite(o.a) && o.a > 0 && /^\d{4}-(0[1-9]|1[0-2])$/.test(o.da || ''))) err.push('Goal ' + o.nome + ': amount or month is not valid');
    });
    return err;
  }
  // The list of reviews with r in it: replaces the one of the same quarter, sorted by quarter.
  function revisioniCon(lista, r) {
    return (lista || []).filter(function (x) { return x.trimestre !== r.trimestre; }).concat([r]).sort(function (a, b) { return a.trimestre < b.trimestre ? -1 : a.trimestre > b.trimestre ? 1 : 0; });
  }

  // ---- 4.4 recurring templates: cfg.ricorrenti = [{id, nome, tipo: spesa|entrata|giroconto, importo, categoria, conto, aConto?, giorno, cadenza: mensile|annuale|mesi (+ ogni),
  // da, fino?, etichette?, nota?}]. The tool never writes by itself: it proposes the occurrences due, the user confirms (rc = '<id>:<date>' on the movement) or skips (cfg.ricorrentiSaltate).
  function validaRicorrente(r) {
    var err = [], day = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, real = function (s) { return day.test(s || '') && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s; };
    if (!r.id || String(r.id).indexOf(':') >= 0) err.push('Identificativo non valido');
    if (!String(r.nome || '').trim()) err.push('Scrivi il nome');
    if (['spesa', 'entrata', 'giroconto'].indexOf(r.tipo) < 0) err.push('Tipo non valido');
    if (!(typeof r.importo === 'number' && r.importo > 0)) err.push('Importo non valido');
    if (!r.conto) err.push('Scegli il conto');
    if ((r.tipo === 'spesa' || r.tipo === 'entrata') && !r.categoria) err.push('Scegli la categoria');
    if (r.tipo === 'giroconto' && (!r.aConto || r.aConto === r.conto)) err.push('Scegli due conti diversi');
    if (!(r.giorno >= 1 && r.giorno <= 31 && r.giorno % 1 === 0)) err.push('Il giorno va da 1 a 31');
    if (['mensile', 'annuale', 'mesi'].indexOf(r.cadenza) < 0) err.push('Cadenza non valida');
    if (r.cadenza === 'mesi' && !(r.ogni >= 2 && r.ogni <= 24 && r.ogni % 1 === 0)) err.push('Ogni quanti mesi: da 2 a 24');
    if (!real(r.da)) err.push('Data di inizio non valida');
    if (r.fino && (!real(r.fino) || r.fino < r.da)) err.push('La data di fine non è valida o precede l\'inizio');
    return err;
  }
  function giorniDopo(d, n) { var t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  // Dates of a valid template from its start up to lim (and its end): the day of the month, or the last day of a shorter month; the cycle is anchored on the month of `da`.
  function dateRicorrente(r, lim) {
    var step = r.cadenza === 'annuale' ? 12 : r.cadenza === 'mesi' ? r.ogni : 1, out = [], y = +r.da.slice(0, 4), m = +r.da.slice(5, 7) - 1;
    if (r.fino && r.fino < lim) lim = r.fino;
    for (;; m += step) {
      var yy = y + Math.floor(m / 12), mm = m % 12, ult = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
      var d = yy + '-' + ('0' + (mm + 1)).slice(-2) + '-' + ('0' + Math.min(r.giorno, ult)).slice(-2);
      if (d > lim) return out;
      if (d >= r.da) out.push(d);
    }
  }
  // Occurrences overdue or due within 3 days with no live movement carrying their rc and not skipped: {proposte: [{...template, modelloId, data, chiave, avviso}], vecchie}.
  // At most the last 3 per template; `vecchie` counts the older ones left out. shortcut: a confirmed movement that is later deleted makes its occurrence due again.
  function ricorrentiDovute(cfg, mesi, oggi) {
    var fatte = {}, lim = giorniDopo(oggi, 3), out = [], vecchie = 0;
    Object.keys(mesi || {}).forEach(function (ym) { movs(mesi, ym).forEach(function (m) { if (m.rc) fatte[m.rc] = 1; }); });
    (cfg.ricorrentiSaltate || []).forEach(function (k) { fatte[k] = 1; });
    (cfg.ricorrenti || []).forEach(function (r) {
      if (validaRicorrente(r).length) return;
      var chiuso = function (k) { return (cfg.conti || []).some(function (c) { return c.nome === k && c.chiuso; }); };
      var avviso = chiuso(r.conto) ? 'Conto chiuso: ' + r.conto : r.aConto && chiuso(r.aConto) ? 'Conto chiuso: ' + r.aConto
        : (cfg.categorie || []).some(function (c) { return c.nome === r.categoria && c.archiviata; }) ? 'Categoria archiviata: ' + r.categoria : '';
      var dovute = dateRicorrente(r, lim).filter(function (d) { return !fatte[r.id + ':' + d]; });
      vecchie += Math.max(0, dovute.length - 3);
      dovute.slice(-3).forEach(function (d) { out.push(Object.assign({}, r, {modelloId: r.id, data: d, chiave: r.id + ':' + d, avviso: avviso})); });
    });
    out.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : a.nome.localeCompare(b.nome, 'it'); });
    return {proposte: out, vecchie: vecchie};
  }
  // The movement a proposal becomes, with every field the form writes: {m} (plus {err} when Joint has no share in force). `importo` overrides the template's amount.
  function movimentoRicorrente(cfg, occ, importo) {
    var imp = importo != null ? importo : occ.importo, g = occ.tipo === 'giroconto', ent = occ.tipo === 'entrata';
    var m = {d: occ.data, n: occ.nota || occ.nome, e: ent ? imp : 0, u: ent ? 0 : imp, c: g ? '' : occ.categoria, k: occ.conto, a: g ? occ.aConto : '', r: '', b: '', p: null, q: null, l: (occ.etichette || []).slice(), v: '', t: g ? 'g' : '', x: 0, rc: occ.chiave};
    if (occ.tipo === 'spesa' && contoJoint(cfg, m.k)) {
      var jq = quotaMov(cfg, m);
      if (!jq) return {m: m, err: 'Nessuna quota del Joint valida a questa data: impostala in Configurazione'}; // m without p/q, so the form can still open
      Object.assign(m, jq);
    }
    return {m: m};
  }

  var api = {ricorrentiDovute: ricorrentiDovute, movimentoRicorrente: movimentoRicorrente, validaRicorrente: validaRicorrente, trimestreDi: trimestreDi, trimestreMesi: trimestreMesi, trimestreFine: trimestreFine, trimestreDefault: trimestreDefault, promemoriaRevisione: promemoriaRevisione, obiettivoCollegato: obiettivoCollegato, revisioneTrimestre: revisioneTrimestre, validaRevisione: validaRevisione, revisioniCon: revisioniCon, scadenze: scadenze, proiezioneAnno: proiezioneAnno, saldoEtichetta: saldoEtichetta, azzeraPiano: azzeraPiano, patrimonio: patrimonio, patrimonioSerie: patrimonioSerie, riepilogoGruppi: riepilogoGruppi, tassoRisparmio: tassoRisparmio, meseDelta: meseDelta, chiusuraProposta: chiusuraProposta, chiusuraCalcola: chiusuraCalcola, chiusuraStato: chiusuraStato, chiusuraMancante: chiusuraMancante, riordinaTaglio: riordinaTaglio, parseAmount: parseAmount, validaImporto: validaImporto, validaQuotaJoint: validaQuotaJoint, movs: movs, net: net, mia: mia, credito: credito, creditiAperti: creditiAperti, parseEtichette: parseEtichette, etichette: etichette, conEtichetta: conEtichetta, quotaJoint: quotaJoint, quotaMov: quotaMov, contoJoint: contoJoint, cfgNorm: cfgNorm, validaConfig: validaConfig, contiAttivi: contiAttivi, categorieAttive: categorieAttive, categorieEntrata: categorieEntrata, finanziaMese: finanziaMese, saldi: saldi, investimenti: investimenti, giorniTra: giorniTra, differenzaControllo: differenzaControllo, ultimoControllo: ultimoControllo, storicoControlli: storicoControlli, controlloScaduto: controlloScaduto, controlliInRitardo: controlliInRitardo, meseCalc: meseCalc, quotaVoce: quotaVoce, mancaRispettoPiano: mancaRispettoPiano, quotaSalvadanaio: quotaSalvadanaio, piano: piano, pianoPrecedente: pianoPrecedente, saldoSalvadanaio: saldoSalvadanaio, fondoEmergenze: fondoEmergenze, usoFondoSenzaNota: usoFondoSenzaNota, destinazioneExtra: destinazioneExtra, ammanco: ammanco, soglieSuperate: soglieSuperate, permettermelo: permettermelo, categorie: categorie, rinomina: rinomina};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.CSLogic = api;
})();
