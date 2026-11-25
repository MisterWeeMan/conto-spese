// Pure logic: no DOM, no Firestore. Loaded by index.html (window.CSLogic) and by the tests (require).
(function () {
  var pad = function (n) { return String(n).padStart(2, '0'); };

  // "12,50" / "12.50" / "1.234,56" -> euro; null when it is not a positive amount
  function parseAmount(s) {
    s = String(s).replace(/[\s€]/g, '');
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '');
    var n = Math.round(parseFloat(s.replace(',', '.')) * 100) / 100;
    return n > 0 ? n : null;
  }

  // mesi = { 'YYYY-MM': { <id>: {d, n, e, u, c, k, x} } }; x = deleted (tombstone)
  function movs(mesi, ym) {
    return Object.entries(mesi[ym] || {})
      .filter(function (p) { return p[1] && !p[1].x && p[1].d; })
      .map(function (p) { return Object.assign({id: p[0]}, p[1]); });
  }

  function net(m) { return (m.e || 0) - (m.u || 0); }

  // My part of a movement: p if set, else u (e for income). Transfers (g), partner top-ups (vj)
  // credits (cr), refunds (rb) and extra income (x2) are not mine.
  function mia(m) {
    if (m.t === 'g' || m.t === 'vj' || m.t === 'cr' || m.t === 'rb' || m.t === 'x2') return 0;
    return m.p != null ? m.p : (m.u || m.e || 0);
  }

  // Money others owe me on a split expense: u - p in cents, never negative; else 0.
  function credito(m) { return m.p != null && m.u ? Math.max(0, Math.round((m.u - m.p) * 100) / 100) : 0; }

  // Open credits over all months: split expenses (u - p > 0) with no live refund pointing at them (t:'rb', r:id).
  // shortcut: a refund closes the whole credit, whatever its amount (the spec has no partial refunds); upgrade
  // by summing the refunds' e against `residuo` when partial refunds are needed. Loans (t:'cr') are not listed.
  function creditiAperti(mesi) {
    var all = [], chiusi = {};
    Object.keys(mesi).sort().forEach(function (ym) {
      movs(mesi, ym).forEach(function (m) { if (m.t === 'rb' && m.r) chiusi[m.r] = 1; else all.push(m); });
    });
    return all.filter(function (m) { return !chiusi[m.id] && credito(m) > 0; })
      .map(function (m) { return {id: m.id, d: m.d, c: m.c, k: m.k, n: m.n, residuo: credito(m)}; });
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

  // Joint share (pct) in force on date 'YYYY-MM-DD': the entry with the latest `da` not after it, else null.
  function quotaJoint(cfg, data) {
    var best = null;
    (cfg.quotaJoint || []).forEach(function (q) { if (q.da <= data && (!best || q.da > best.da)) best = q; });
    return best ? best.pct : null;
  }

  // {p, q} to store on a new expense on the Joint account: q = share in force on m.d, p = u x q to the cent;
  // u stays whole. null when nothing applies. shortcut: Joint = account whose name contains 'joint', the
  // config has no flag for it yet; revisit when the new cfg.conti is wired (1.7).
  function quotaMov(cfg, m) {
    var q = m.u > 0 && !m.t && /joint/i.test(m.k || '') ? quotaJoint(cfg, m.d) : null;
    return q == null ? null : {p: Math.round(m.u * q) / 100, q: q};
  }

  // Accounts that accept new movements. shortcut: reads the new cfg.conti ({nome, chiuso}); the stored
  // config is still a list of strings until the migration.
  function contiAttivi(cfg) { return (cfg.conti || []).filter(function (c) { return !c.chiuso; }); }

  // Categories open to new movements, with their gruppo. shortcut: new cfg.categorie ({nome, gruppo, ...});
  // not the same as categorie() below, which still reads the old list of strings.
  function categorieAttive(cfg) { return (cfg.categorie || []).filter(function (c) { return !c.archiviata; }); }

  // Balance per account over all months. A transfer (t:'g') moves u from k to a; every other row moves k by e - u,
  // so the old two-row transfer still reads right. shortcut: no opening balances, rows without k count under ''.
  function saldi(mesi) {
    var s = {};
    function add(k, v) { s[k || ''] = Math.round(((s[k || ''] || 0) + v) * 100) / 100; }
    Object.keys(mesi).forEach(function (ym) {
      movs(mesi, ym).forEach(function (m) {
        if (m.t === 'g') { add(m.k, -(m.u || 0)); add(m.a, m.u || 0); } else add(m.k, net(m));
      });
    });
    return s;
  }

  // Same rule as the sheet's Budget tab: what was not spent (or overspent) in the
  // previous months of the year carries over. residuo = annual/12 * month + net YTD.
  function calcola(mesi, cfg, ym) {
    var Y = +ym.slice(0, 4), M = +ym.slice(5, 7), ytd = {}, mese = {}, ent = 0, usc = 0;
    for (var i = 1; i <= M; i++) movs(mesi, Y + '-' + pad(i)).forEach(function (m) {
      if (!m.c || m.t === 'g' || m.t === 'rb' || m.t === 'vj') return; // no category (old two-row transfer), transfer, refund or partner top-up: left out of totals
      ytd[m.c] = (ytd[m.c] || 0) + net(m);
      if (i === M) { mese[m.c] = (mese[m.c] || 0) + net(m); ent += m.e || 0; usc += m.u || 0; }
    });
    var budget = cfg.budget || {};
    var righe = Object.entries(budget).filter(function (p) { return p[1] > 0; }).map(function (p) {
      var c = p[0], speso = -(mese[c] || 0), residuo = p[1] / 12 * M + (ytd[c] || 0);
      return {c: c, speso: speso, disp: residuo + speso, residuo: residuo};
    });
    var senza = Object.entries(mese).filter(function (p) { return !(budget[p[0]] > 0); })
      .sort(function (a, b) { return a[1] - b[1]; });
    return {righe: righe, senza: senza, ent: ent, usc: usc};
  }

  // Month figures with MONTHLY budgets, no carry-over (spec rules 2-4). cfg.categorie = [{nome, gruppo, budget, archiviata}];
  // the budget of a Joint category is already my share, and mia() already reads p. righe: categories with budget and
  // not archived; senza: other categories used in the month; spendibile: sum of the residuals (overspent counts negative).
  // shortcut: duplicate category names are not checked, the Joint flag is unused (budget = my share, as in strategia-2027),
  // overspent budgets are not clamped; revisit if the spec says otherwise.
  // An income row with a category lowers its speso (old-style refund); extra income never reaches here (mia = 0).
  function meseCalc(mesi, cfg, ym) {
    var speso = {};
    movs(mesi, ym).forEach(function (m) {
      if (!m.c) return;
      var v = m.u ? mia(m) : -mia(m);
      speso[m.c] = Math.round(((speso[m.c] || 0) + v) * 100) / 100;
    });
    var righe = [], spendibile = 0, conBudget = {};
    (cfg.categorie || []).forEach(function (c) {
      if (c.archiviata || !(c.budget > 0)) return;
      var s = speso[c.nome] || 0, residuo = Math.round((c.budget - s) * 100) / 100;
      conBudget[c.nome] = 1; spendibile += residuo;
      righe.push({c: c.nome, gruppo: c.gruppo, budget: c.budget, speso: s, residuo: residuo, pct: s / c.budget});
    });
    var senza = Object.keys(speso).filter(function (c) { return !conBudget[c] && speso[c]; })
      .map(function (c) { return {c: c, speso: speso[c]}; }).sort(function (a, b) { return b.speso - a.speso; });
    return {righe: righe, senza: senza, spendibile: Math.round(spendibile * 100) / 100};
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

  // Every category: configured, with a budget, or used by a live movement.
  // n = live movements using it, anno = those in the given year ('YYYY').
  function categorie(mesi, cfg, anno) {
    var n = {}, na = {}, budget = cfg.budget || {};
    (cfg.categorie || []).forEach(function (c) { n[c] = 0; });
    Object.keys(budget).forEach(function (c) { if (budget[c] > 0) n[c] = 0; });
    Object.keys(mesi).forEach(function (ym) {
      movs(mesi, ym).forEach(function (m) {
        if (!m.c) return;
        n[m.c] = (n[m.c] || 0) + 1;
        if (ym.slice(0, 4) === String(anno)) na[m.c] = (na[m.c] || 0) + 1;
      });
    });
    return Object.keys(n).sort(function (a, b) { return a.localeCompare(b, 'it'); })
      .map(function (c) { return {c: c, n: n[c], anno: na[c] || 0}; });
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

  var api = {parseAmount: parseAmount, movs: movs, net: net, mia: mia, credito: credito, creditiAperti: creditiAperti, parseEtichette: parseEtichette, etichette: etichette, conEtichetta: conEtichetta, quotaJoint: quotaJoint, quotaMov: quotaMov, contiAttivi: contiAttivi, categorieAttive: categorieAttive, saldi: saldi, calcola: calcola, meseCalc: meseCalc, soglieSuperate: soglieSuperate, categorie: categorie, rinomina: rinomina};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.CSLogic = api;
})();
