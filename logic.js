// Pure logic: no DOM, no Firestore. Loaded by index.html (window.CSLogic) and by the tests (require).
(function () {

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
  // by summing the refunds' e against `residuo` when partial refunds are needed. Loans (t:'cr') are not listed;
  // a Joint expense (q set) is not either: the rest of it is the partner's share, already paid from the Joint account.
  function creditiAperti(mesi) {
    var all = [], chiusi = {};
    Object.keys(mesi).sort().forEach(function (ym) {
      movs(mesi, ym).forEach(function (m) { if (m.t === 'rb' && m.r) chiusi[m.r] = 1; else all.push(m); });
    });
    return all.filter(function (m) { return !chiusi[m.id] && m.q == null && credito(m) > 0; })
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

  // Accounts that accept new movements (cfg.conti = [{nome, chiuso, ...}], see cfgNorm).
  function contiAttivi(cfg) { return (cfg.conti || []).filter(function (c) { return !c.chiuso; }); }

  // Categories open to new movements, with their gruppo (cfg.categorie = [{nome, gruppo, ...}], see cfgNorm).
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
    (cfg.salvadanai || []).forEach(function (v) { conBudget[v.nome] = 1; }); // a pot is not a budget: kept out of senza
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

  // Quota of a pot voce {nome, annuale, data 'YYYY-MM', cicli?, cambio?: {da 'YYYY-MM', quota}} in month ym. The goal is spread
  // evenly over the months of the current cycle: from the cycle start (the month after the previous due month, or the pot's
  // opening month apertura if later) to the due month included, so 80 due in September seen from January = 80 / 9. After the
  // due month the next cycle (cicli months, default 12) starts. Cumulative rounding: each month is the cents difference of the
  // running total, so a cycle adds up to the goal exactly. cambio: from its month the quota is that fixed value.
  // shortcut: the cycle follows the calendar only; a payment made early or late does not move it. Upgrade if it matters.
  function quotaVoce(v, ym, apertura) {
    var idx = function (s) { return +s.slice(0, 4) * 12 + +s.slice(5, 7) - 1; }, r = function (x) { return Math.round(x * 100) / 100; };
    var y = idx(ym);
    if (!/^\d{4}-\d{2}/.test(v.data || '')) return 0; // a voce without a valid month saves nothing, rather than NaN everywhere
    if (v.cambio && y >= idx(v.cambio.da)) return v.cambio.quota;
    var c = v.cicli || 12, d0 = idx(v.data), i = y <= d0 ? 0 : Math.ceil((y - d0) / c), due = d0 + i * c;
    var s = Math.max(due - c + 1, apertura ? idx(apertura) : -Infinity), n = due - s + 1, k = y - s + 1;
    return k < 1 ? 0 : r(r(v.annuale * k / n) - r(v.annuale * (k - 1) / n));
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
  function saldoSalvadanaio(mesi, sv, ym) {
    var si = sv.saldoIniziale || {data: '0000-01-01', importo: 0}, a = si.data.slice(0, 7);
    var n = Math.max(0, (+ym.slice(0, 4) - +a.slice(0, 4)) * 12 + (+ym.slice(5) - +a.slice(5)) + 1);
    var tot = si.importo;
    for (var i = 0, y = +a.slice(0, 4), mo = +a.slice(5); i < n; i++, mo++) {
      if (mo > 12) { y++; mo = 1; }
      tot += quotaSalvadanaio(sv, y + '-' + (mo < 10 ? '0' : '') + mo);
    }
    Object.keys(mesi).forEach(function (k) {
      if (k > ym) return;
      movs(mesi, k).forEach(function (m) { if (m.c === sv.nome && m.d >= si.data) tot -= m.u ? mia(m) : -mia(m); });
    });
    return Math.round(tot * 100) / 100;
  }

  // What a new or edited expense m cannot take from its pot: the deepest shortfall of the balance from m's month to the
  // last month with data, with m counted (so a backdated expense cannot sink a later month); 0 when m.c is not a pot in
  // cfg.salvadanai or m is not a plain expense. The movement itself (same id) is replaced by m.
  function ammanco(mesi, cfg, m) {
    var v = (cfg.salvadanai || []).find(function (x) { return x.nome === m.c; });
    if (!v || !(m.u > 0) || m.t) return 0;
    var da = m.d.slice(0, 7), con = {};
    Object.keys(mesi).forEach(function (k) { con[k] = Object.assign({}, mesi[k]); if (m.id) delete con[k][m.id]; });
    con[da] = Object.assign({}, con[da]); con[da][m.id || '_nuovo'] = m;
    var fine = Object.keys(con).concat(da).sort().pop(), min = 0;
    for (var y = +da.slice(0, 4), mo = +da.slice(5); ; mo++) {
      if (mo > 12) { y++; mo = 1; }
      var k = y + '-' + (mo < 10 ? '0' : '') + mo;
      if (k > fine) break;
      min = Math.min(min, saldoSalvadanaio(con, v, k));
    }
    return Math.round(-min * 100) / 100 + 0; // + 0: no -0
  }

  // Plan of month ym (spec: piani/<YYYY-MM>): p = {stipendio, righe: [{nome, importo}]}. One row per budget category
  // (not archived, budget > 0) and per pot; the amount is the edited one in p.righe, else the current monthly budget / pot quota.
  // Rows are ordered by gruppo (Necessarie, Non necessarie, Risparmi, then others). totale = sum of rows, resta = stipendio - totale
  // (negative = plan overspent), pct = share of the stipendio (0 without one). joint = rows that go through the Joint account
  // (category flag `joint`, pot on a Joint account): informational, already inside totale.
  // shortcut: the Joint transfer is not a row of its own (strategia A8 gives it as a figure, and its Joint part of mixed
  // categories like Abbonamenti cannot be derived); saving a plan does not change the pot quotas the balances use.
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
    return {stipendio: stip, righe: righe, gruppi: gruppi, totale: r2(tot), resta: r2(stip - tot), joint: r2(joint)};
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

  var api = {parseAmount: parseAmount, movs: movs, net: net, mia: mia, credito: credito, creditiAperti: creditiAperti, parseEtichette: parseEtichette, etichette: etichette, conEtichetta: conEtichetta, quotaJoint: quotaJoint, quotaMov: quotaMov, contoJoint: contoJoint, cfgNorm: cfgNorm, contiAttivi: contiAttivi, categorieAttive: categorieAttive, saldi: saldi, meseCalc: meseCalc, quotaVoce: quotaVoce, quotaSalvadanaio: quotaSalvadanaio, piano: piano, pianoPrecedente: pianoPrecedente, saldoSalvadanaio: saldoSalvadanaio, ammanco: ammanco, soglieSuperate: soglieSuperate, categorie: categorie, rinomina: rinomina};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.CSLogic = api;
})();
