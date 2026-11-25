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
  // and credits (cr) are not mine.
  function mia(m) {
    if (m.t === 'g' || m.t === 'vj' || m.t === 'cr') return 0;
    return m.p != null ? m.p : (m.u || m.e || 0);
  }

  // Money others owe me on a split expense: u - p in cents, never negative; else 0.
  function credito(m) { return m.p != null && m.u ? Math.max(0, Math.round((m.u - m.p) * 100) / 100) : 0; }

  // Joint share (pct) in force on date 'YYYY-MM-DD': the entry with the latest `da` not after it, else null.
  function quotaJoint(cfg, data) {
    var best = null;
    (cfg.quotaJoint || []).forEach(function (q) { if (q.da <= data && (!best || q.da > best.da)) best = q; });
    return best ? best.pct : null;
  }

  // Accounts that accept new movements. shortcut: reads the new cfg.conti ({nome, chiuso}); the stored
  // config is still a list of strings until the migration.
  function contiAttivi(cfg) { return (cfg.conti || []).filter(function (c) { return !c.chiuso; }); }

  // Categories open to new movements, with their gruppo. shortcut: new cfg.categorie ({nome, gruppo, ...});
  // not the same as categorie() below, which still reads the old list of strings.
  function categorieAttive(cfg) { return (cfg.categorie || []).filter(function (c) { return !c.archiviata; }); }

  // Same rule as the sheet's Budget tab: what was not spent (or overspent) in the
  // previous months of the year carries over. residuo = annual/12 * month + net YTD.
  function calcola(mesi, cfg, ym) {
    var Y = +ym.slice(0, 4), M = +ym.slice(5, 7), ytd = {}, mese = {}, ent = 0, usc = 0;
    for (var i = 1; i <= M; i++) movs(mesi, Y + '-' + pad(i)).forEach(function (m) {
      if (!m.c) return; // no category = transfer between accounts, left out of totals as in the sheet
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

  var api = {parseAmount: parseAmount, movs: movs, net: net, mia: mia, credito: credito, quotaJoint: quotaJoint, contiAttivi: contiAttivi, categorieAttive: categorieAttive, calcola: calcola, categorie: categorie, rinomina: rinomina};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.CSLogic = api;
})();
