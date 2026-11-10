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

  // Same rule as the sheet's Budget tab: what was not spent (or overspent) in the
  // previous months of the year carries over. residuo = annual/12 * month + net YTD.
  function calcola(mesi, cfg, ym) {
    var Y = +ym.slice(0, 4), M = +ym.slice(5, 7), ytd = {}, mese = {}, ent = 0, usc = 0;
    for (var i = 1; i <= M; i++) movs(mesi, Y + '-' + pad(i)).forEach(function (m) {
      if (!m.c) return; // no category = transfer between accounts, left out of totals as in the sheet
      ytd[m.c] = (ytd[m.c] || 0) + net(m);
      if (i === M) { mese[m.c] = (mese[m.c] || 0) + net(m); ent += m.e || 0; usc += m.u || 0; }
    });
    var budget = cfg.budget || {}, gruppi = cfg.gruppi || {};
    var righe = Object.entries(budget).filter(function (p) { return p[1] > 0; }).map(function (p) {
      var c = p[0], speso = -(mese[c] || 0), residuo = p[1] / 12 * M + (ytd[c] || 0);
      return {c: c, g: gruppi[c] || 'Altro', speso: speso, disp: residuo + speso, residuo: residuo};
    });
    var senza = Object.entries(mese).filter(function (p) { return !(budget[p[0]] > 0); })
      .sort(function (a, b) { return a[1] - b[1]; });
    return {righe: righe, senza: senza, ent: ent, usc: usc};
  }

  var api = {parseAmount: parseAmount, movs: movs, net: net, calcola: calcola};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.CSLogic = api;
})();
