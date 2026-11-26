/* Results: Nepal terminal calculation (TH + IN with credit-hour weights, optional subjects), grade sheets and ledger. */
(function () {
  'use strict';
  var A = window.AMAR, db = A.db, $ = A.$, esc = A.esc, must = A.must, toast = A.toast, state = A.state, V = A.views, G = window.AmarGrading;
  window.AMAR_OPT = {};
  function low(rule) { return rule.rules.slice().sort(function (a, b) { return a.min - b.min; })[0]; }
  function cg(rule, p) { var m = +rule.min_percent || 35; return p < m ? low(rule) : G.gradeFor(rule, p); }
  function fg(rule, w) {          // final subject grade from weighted grade point (upper limit inclusive: 3.6 -> A, above 3.6 -> A+)
    var b = rule.rules.slice().sort(function (x, y) { return y.gp - x.gp; });
    if (w <= 0) return low(rule);
    for (var i = 0; i < b.length - 1; i++) if (w > (b[i + 1].gp || 0)) return b[i];
    return b[b.length - 1];
  }
  /* subject with 2+ parts (theory + internal): weighted GP like the NMSS grade sheet */
  var oSub = G.subjectResult;
  G.subjectResult = function (rule, es, m) {
    var out = oSub(rule, es, m), th = +es.theory_marks || 0, pr = +es.practical_marks || 0, inn = +es.internal_marks || 0;
    if (((th > 0) + (pr > 0) + (inn > 0)) < 2 || out.missing || out.absent) return out;
    var parts = [['th', th, out.theory], ['pr', pr, out.practical], ['in', inn, out.internal]].filter(function (c) { return c[1] > 0; }), full = th + pr + inn, w = 0, ng = false;
    out.parts = {};
    parts.forEach(function (c) { var p = (c[2] || 0) / c[1] * 100, g = cg(rule, p); if (+g.gp === 0) ng = true; w += (+g.gp) * c[1] / full; out.parts[c[0]] = { full: c[1], got: c[2] || 0, grade: g.grade, gp: +g.gp, ch: (out.credit || 0) * c[1] / full }; });
    if (ng) { out.grade = low(rule).grade; out.gp = 0; out.pass = false; out.reason = 'component'; }
    else { var f = fg(rule, w); out.grade = f.grade; out.gp = Math.round(w * 100) / 100; out.pass = true; out.reason = ''; }
    return out;
  };
  function hasMarks(m) { return m && (m.is_absent || m.theory != null || m.practical != null || m.internal != null) && !(m.theory === '' && m.internal === ''); }
  G.studentResult = function (rule, ess, mbs) {   // same maths as grading.js, but uses the weighted subject rule; optional subjects the student does not study are skipped
    var opt = window.AMAR_OPT, list = ess.filter(function (es) { return !(opt[es.class_id + '|' + es.subject_id] && !es.chosen && !hasMarks(mbs[es.subject_id])); });
    var subs = list.map(function (es) { return G.subjectResult(rule, es, mbs[es.subject_id]); }), full = 0, obt = 0, cr = 0, gs = 0, ng = 0, miss = 0, cnt = 0, sg = 0, nocr = !!(list.length && window.AMAR_NOCR[list[0].class_id]);
    subs.forEach(function (s) { if (s.missing) { miss++; return; } if (nocr) s.credit = 0; cnt++; sg += s.gp; full += s.full; obt += s.obtained; cr += s.credit; gs += s.gp * s.credit; if (!s.pass) ng++; });
    var pct = full > 0 ? G.round(obt / full * 100, 2) : 0, gpa = nocr ? (cnt ? G.round(sg / cnt, Number(rule.rounding) || 2) : 0) : (cr > 0 ? G.round(gs / cr, Number(rule.rounding) || 2) : 0), complete = miss === 0 && subs.length > 0;
    if (ng > 0 || subs.some(function (s) { return !s.missing && +s.gp === 0; })) gpa = 0;   // NG or 0 grade point in any subject -> GPA 0.00
    return { subjects: subs, total_full: full, total_obtained: obt, percentage: pct, gpa: gpa, gpa_valid: complete && ng === 0, ng_count: ng, missing_count: miss, complete: complete,
      overall_grade: complete ? G.gradeFor(rule, pct).grade : null, result: !complete ? 'INCOMPLETE' : (ng === 0 ? 'PASS' : 'NG') };
  };
  async function refreshOpt() {
    var r = must(await db.from('class_subjects').select('class_id,subject_id,is_compulsory,opt_slot')); window.AMAR_OPT = {};
    r.forEach(function (x) { if (!x.is_compulsory) window.AMAR_OPT[x.class_id + '|' + x.subject_id] = x.opt_slot || 1; });
    window.AMAR_NOCR = {}; try { (await A.lookups()).classes.forEach(function (c) { if (window.AMAR_EARLY && window.AMAR_EARLY[c.level]) window.AMAR_NOCR[c.id] = 1; }); } catch (e) {}
  }
  window.AMAR_NOCR = window.AMAR_NOCR || {};
  /* the optional-subject map is only refreshed for the screens that calculate results (not for every screen) */
  var optAt = 0;
  ['results', 'reports', 'gradeSheets', 'exams', 'resultsLedger'].forEach(function (k) { var f = V[k]; if (typeof f !== 'function') return;
    V[k] = function () { var a = arguments, t = this, fresh = Date.now() - optAt < 20000; return (fresh ? Promise.resolve() : refreshOpt().then(function () { optAt = Date.now(); }).catch(function () {})).then(function () { return f.apply(t, a); }); }; });

  function f2(x) { return (Math.round(x * 100) / 100).toFixed(2); }
  function csv(name, rows) {
    var t = rows.map(function (r) { return r.map(function (c) { c = c == null ? '' : String(c); return '"' + c.replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + t], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  async function load(exam, cid) {
    await refreshOpt();
    var lk = await A.lookups(true), cls = lk.classes.filter(function (c) { return c.id === cid; })[0], sch = await A.school(), sn = {};
    lk.subjects.forEach(function (s) { sn[s.id] = s; });
    var ess = must(await db.from('exam_subjects').select('*').eq('exam_id', exam.id).eq('class_id', cid));
    var studs = must(await db.from('students').select('id,student_code,full_name,roll_no,admission_no,dob,dob_bs,emis_no,father_name,mother_name').eq('class_id', cid).eq('status', 'active').order('roll_no').order('full_name'));
    var marks = studs.length ? must(await db.from('marks').select('*').eq('exam_id', exam.id).in('student_id', studs.map(function (s) { return s.id; }))) : [];
    var mb = {}; marks.forEach(function (m) { (mb[m.student_id] = mb[m.student_id] || {})[m.subject_id] = m; });
    var rules = []; try { rules = must(await db.from('grading_rules').select('*')); } catch (e) {}
    var rule = G.pickRule(rules, cls.level, exam.academic_year);
    ess.sort(function (a, b) { var oa = window.AMAR_OPT[cid + '|' + a.subject_id] || 0, ob = window.AMAR_OPT[cid + '|' + b.subject_id] || 0; return oa - ob || (sn[a.subject_id].name < sn[b.subject_id].name ? -1 : 1); });
    var chosen = {}, any = {};
    try { if (studs.length) must(await db.from('student_optionals').select('student_id,subject_id').in('student_id', studs.map(function (s) { return s.id; }))).forEach(function (r) { chosen[r.student_id + '|' + r.subject_id] = 1; any[r.student_id] = 1; }); } catch (e) {}
    var syms = {}; try { must(await db.from('exam_symbols').select('student_id,symbol_no').eq('exam_id', exam.id)).forEach(function (r) { syms[r.student_id] = r.symbol_no; }); } catch (e) {}
    var items = studs.map(function (s) {
      var list = any[s.id] ? ess.filter(function (es) { return !window.AMAR_OPT[cid + '|' + es.subject_id] || chosen[s.id + '|' + es.subject_id]; }).map(function (es) { return window.AMAR_OPT[cid + '|' + es.subject_id] ? Object.assign({}, es, { chosen: true }) : es; }) : ess;
      return { s: s, sym: syms[s.id] || '', res: G.studentResult(rule, list, mb[s.id] || {}) }; });
    G.rankAll(items);
    var byS = {}, subjRank = [];   // rank of every student in every subject (same marks = same rank) + subjects ranked by class average
    items.forEach(function (it) { it.res.subjects.forEach(function (sr) { if (sr.missing || sr.absent || !(sr.full > 0)) return; (byS[sr.subject_id] = byS[sr.subject_id] || []).push({ sr: sr, p: sr.obtained / sr.full }); }); });
    Object.keys(byS).forEach(function (id) { var a = byS[id].sort(function (x, y) { return y.p - x.p; }), rk = 0, prev = null;
      a.forEach(function (x, i) { if (prev === null || x.p < prev - 1e-9) { rk = i + 1; prev = x.p; } x.sr.rank = rk; });
      subjRank.push({ id: id, n: a.length, avg: a.reduce(function (t, x) { return t + x.p; }, 0) / a.length * 100, high: a[0].p * 100, pass: a.filter(function (x) { return x.sr.pass; }).length }); });
    subjRank.sort(function (x, y) { return y.avg - x.avg; }).forEach(function (x, i) { x.rank = i + 1; });
    var att = null; try { var sd = must(await db.from('exam_school_days').select('total_days').eq('exam_id', exam.id).eq('class_id', cid).maybeSingle()), ea = studs.length ? must(await db.from('exam_attendance').select('student_id,present_days').eq('exam_id', exam.id).in('student_id', studs.map(function (s) { return s.id; }))) : [], bs = {}; ea.forEach(function (x) { bs[x.student_id] = +x.present_days; }); if (sd) att = { total: +sd.total_days, by: bs }; } catch (e) {}
    return { lay: layOf(sch), att: att, subjRank: subjRank, cls: cls, sch: sch, sn: sn, ess: ess, items: items, rule: rule, pending: marks.filter(function (m) { return m.status !== 'approved'; }).length, sids: studs.map(function (s) { return s.id; }) };
  }
  /* ---------- editable grade-sheet layout (saved in schools.sheet_layout) ---------- */
  var LAYDEF = { logo: true, motto: true, watermark: true, address: '', iemis: '', line1: '{exam} {year}', line2: 'GRADE SHEET', line3: 'GRADE {class}',
    lblBy: 'THE GRADE(S) SECURED BY', lblDob: 'DATE OF BIRTH', lblSymbol: 'SYMBOL NO', lblOf: 'OF', lblIemis: 'IEMIS CODE', lblIn: 'IN THE {exam} OF YEAR {year} ARE GIVEN BELOW.',
    showEmis: true, showDob: true, showRoll: false, showRank: false, showAttendance: true, showDetails: true,
    notes: '1. One Credit Hour Equals 32 Hours.\n2. TH: Theory (Final/External), IN: Internal.', sig1: 'Prepared By', sig1n: '', sig2: 'Checked By', sig2n: '', sig3: 'Approved By', sig3n: '', showIssue: true, issueDate: '', font: 'serif', accent: '#1a1a1a' };
  function layOf(sch) { var o = {}, s = (sch && sch.sheet_layout) || {}; Object.keys(LAYDEF).forEach(function (k) { o[k] = s[k] != null ? s[k] : LAYDEF[k]; }); return o; }
  function roman(n) { var m = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']], s = ''; m.forEach(function (p) { while (n >= p[0]) { s += p[1]; n -= p[0]; } }); return s; }
  function safe(f) { try { var r = f(); return r == null || /invalid|NaN/i.test(String(r)) ? '' : r; } catch (e) { return ''; } }
  function dobBoth(s) { var bsd = s.dob_bs || (s.dob && A.bs ? safe(function () { return A.bs(s.dob); }) : ''), ad = s.dob || (s.dob_bs && A.adOf ? safe(function () { return A.adOf(s.dob_bs); }) : ''); return (bsd ? bsd + ' (B.S.)' : '') + (bsd && ad ? ' &nbsp; ' : '') + (ad ? ad + ' (A.D.)' : ''); }
  function sheetHtml(D, exam, mid, it) {
    var L = D.lay || layOf(D.sch), r = it.res, rule = D.rule, k = 0, rows = '', nc = !!(window.AMAR_NOCR && window.AMAR_NOCR[D.cls.id]), cf = function (x) { return nc ? '-' : String(+(+x).toFixed(2)); };
    var cn = D.cls.name || '', cm = /\d+/.exec(cn), clsTxt = cm ? roman(+cm[0]) : cn.toUpperCase(), tok = function (s) { return esc(String(s || '').replace(/\{exam\}/g, (exam.name || '').toUpperCase()).replace(/\{year\}/g, exam.academic_year || '').replace(/\{class\}/g, clsTxt).replace(/\{school\}/g, (D.sch.name || '').toUpperCase())).replace(/\s+/g, ' ').trim(); };
    r.subjects.forEach(function (sr) {
      if (sr.missing) return; k++;
      var nm = (D.sn[sr.subject_id].name || '').toUpperCase(), opt = window.AMAR_OPT[D.cls.id + '|' + sr.subject_id] ? 'OPT-' + (window.AMAR_OPT[D.cls.id + '|' + sr.subject_id] === 2 ? 'II' : 'I') + ' ' : (D.cls.level >= 9 && D.cls.level <= 10 ? 'COMP. ' : '');
      var dsc = function (g) { var q = rule.rules.filter(function (x) { return x.grade === g; })[0]; return q && q.desc ? esc(String(q.desc).toUpperCase()) : ''; };
      if (!mid) {
        var P = sr.parts ? [['th', 'TH'], ['pr', 'PR'], ['in', 'IN']].filter(function (c) { return sr.parts[c[0]]; }) : [], fgd = sr.absent ? 'Ab*' : sr.grade;
        if (P.length > 1) {
          rows += '<tr class="top"><td class="l">' + opt + esc(nm) + '(' + P[0][1] + ')</td><td>' + cf(sr.parts[P[0][0]].ch) + '</td><td>' + (+sr.parts[P[0][0]].gp) + '</td><td>' + sr.parts[P[0][0]].grade + '</td><td rowspan="' + P.length + '" class="fg">' + fgd + '</td><td rowspan="' + P.length + '" class="rm">' + (sr.absent ? 'ABSENT' : dsc(sr.grade)) + '</td></tr>';
          P.slice(1).forEach(function (c) { rows += '<tr><td class="l">' + opt + esc(nm) + '(' + c[1] + ')</td><td>' + cf(sr.parts[c[0]].ch) + '</td><td>' + (+sr.parts[c[0]].gp) + '</td><td>' + sr.parts[c[0]].grade + '</td></tr>'; });
        } else rows += '<tr class="top"><td class="l">' + opt + esc(nm) + '</td><td>' + cf(sr.credit) + '</td><td>' + (+(+sr.gp).toFixed(2)) + '</td><td>' + fgd + '</td><td class="fg">' + fgd + '</td><td class="rm">' + (sr.absent ? 'ABSENT' : dsc(sr.grade)) + '</td></tr>';
      } else rows += '<tr class="top"><td>' + k + '</td><td class="l">' + opt + esc(nm) + '</td><td>' + cf(sr.credit) + '</td><td>' + (sr.absent ? 'Ab*' : sr.grade) + '</td><td>' + f2(sr.gp) + '</td></tr>';
    });
    var cr = r.subjects.reduce(function (a, x) { return a + (x.missing ? 0 : x.credit); }, 0), head = mid ? '<tr><th>S.N.</th><th>SUBJECTS</th><th>CREDIT HOUR</th><th>OBTAINED GRADE</th><th>GRADE POINT</th></tr>' : '<tr><th>SUBJECTS</th><th>CREDIT<br>HOUR(CH)</th><th>GRADE<br>POINT(GP)</th><th>GRADE</th><th>FINAL<br>GRADE</th><th>REMARKS</th></tr>';
    var foot = mid ? '<tr class="gpa"><td colspan="2"><b>GRADE POINT AVERAGE (GPA)</b></td><td><b>' + cf(cr) + '</b></td><td>-</td><td><b>' + (r.complete ? f2(r.gpa) : '') + '</b></td></tr>' : '<tr class="gpa"><td class="l"></td><td><b>' + cf(cr) + '</b></td><td colspan="4" class="l"><b>GRADE POINT AVERAGE = ' + (r.complete ? f2(r.gpa) : 'INCOMPLETE') + '</b></td></tr>';
    var pd = D.att && D.att.by[it.s.id], attHtml = L.showAttendance && D.att ? '<div class="at"><b>ATTENDANCE</b> &nbsp; School days: <b>' + D.att.total + '</b> &nbsp;|&nbsp; Present: <b>' + (pd == null ? '-' : pd) + '</b>' + (pd != null && D.att.total ? ' &nbsp;|&nbsp; <b>' + Math.round(pd / D.att.total * 1000) / 10 + '%</b>' : '') + '</div>' : '';
    var gt = rule.rules.slice().sort(function (a, b) { return b.min - a.min; }), gr = gt.map(function (g, i) { var hi = i ? gt[i - 1].min : 100; return '<tr><td>' + (i + 1) + '</td><td>' + (i ? g.min + ' TO BELOW ' + hi : g.min + ' TO ' + hi) + '</td><td>' + g.grade + '</td><td>' + esc(String(g.desc || '').toUpperCase()) + '</td><td>' + (+g.gp).toFixed(1) + '</td></tr>'; }).join('');
    var det = L.showDetails ? '<table class="g"><tr><th colspan="5">DETAILS OF GRADE SHEET</th></tr><tr class="gh"><th>S.N.</th><th>ACHIEVEMENT IN PERCENT</th><th>GRADE</th><th>DESCRIPTION</th><th>GRADE POINT</th></tr>' + gr + '</table>' : '';
    var emis = L.showEmis && it.s.emis_no ? ' (' + esc(it.s.emis_no) + ')' : '', roll = L.showRoll && it.s.roll_no ? ' &nbsp; ROLL NO: <b>' + esc(it.s.roll_no) + '</b>' : '', rank = L.showRank && it.rank && r.complete ? ' &nbsp; RANK: <b>' + it.rank + '/' + D.items.length + '</b>' : '';
    var sym = esc(it.sym || it.s.admission_no || it.s.roll_no || (it.s.student_code || '').slice(-6)), issue = L.issueDate || (A.bs && A.today ? safe(function () { return A.bs(A.today()); }) : '');
    var logo = new URL('logo.png', location.href).href, notes = String(L.notes || '').split('\n').filter(Boolean).map(function (x) { return '<div>' + esc(x) + '</div>'; }).join('');
    var sig = function (key, lab, nm, extra) { return '<div class="sc">' + (nm ? '<div class="sn" data-lk="' + key + 'n">' + esc(nm) + '</div>' : '<div class="sn" data-lk="' + key + 'n">&nbsp;</div>') + '<div class="sl" data-lk="' + key + '">' + esc(lab) + '</div>' + (extra || '') + '</div>'; };
    var sigs = '<div class="sg">' + sig('sig1', L.sig1, L.sig1n) + sig('sig2', L.sig2, L.sig2n, L.showIssue ? '<div class="di" data-lk="issueDate">Date of Issue: ' + esc(issue) + '</div>' : '') + sig('sig3', L.sig3, L.sig3n) + '</div>';
    return '<section class="pg ' + (L.font === 'sans' ? 'sans' : '') + '" style="--ac:' + esc(L.accent || '#1a1a1a') + '"><div class="in">' + (L.watermark ? '<img class="wm" src="' + logo + '">' : '') +
      '<div class="hd">' + (L.logo ? '<img class="lg" src="' + logo + '">' : '<span class="lg"></span>') + '<div class="hc">' + (L.motto ? '<i>' + esc(D.sch.motto || '“Education is the part of life”') + '</i>' : '') + '<h1>' + esc(D.sch.name) + '</h1><small data-lk="address">' + esc(L.address || D.sch.address || '') + '</small></div><span class="lg"></span></div>' +
      '<div class="tt"><h2 data-lk="line1">' + tok(L.line1) + '</h2><h3 data-lk="line2">' + tok(L.line2) + '</h3><h4 data-lk="line3">' + tok(L.line3) + '</h4></div>' +
      '<div class="st"><div class="ln"><span class="lb" data-lk="lblBy">' + tok(L.lblBy) + '</span><b class="v c1">' + esc(it.s.full_name.toUpperCase()) + emis + roll + rank + '</b></div>' +
      '<div class="ln">' + (L.showDob ? '<span class="lb" data-lk="lblDob">' + tok(L.lblDob) + '</span><b class="v">' + dobBoth(it.s) + '</b>' : '<span class="lb"></span><b class="v"></b>') + '<span class="lb r" data-lk="lblSymbol">' + tok(L.lblSymbol) + '</span><b class="v w2">' + sym + '</b></div>' +
      '<div class="ln"><span class="lb" data-lk="lblOf">' + tok(L.lblOf) + '</span><b class="v">' + esc((D.sch.name || '').toUpperCase()) + (D.sch.address ? ', ' + esc(D.sch.address.toUpperCase()) : '') + '</b><span class="lb r" data-lk="lblIemis">' + tok(L.lblIemis) + '</span><b class="v w2" data-lk="iemis">' + esc(L.iemis || '') + '</b></div>' +
      '<div class="ln"><span class="lb" data-lk="lblIn">' + tok(L.lblIn) + '</span></div></div>' +
      '<table class="m">' + head + rows + foot + '</table>' + attHtml + '<div class="bt"><div class="nt" data-lk="notes">' + (notes || '<div>&nbsp;</div>') + '</div>' + det + '</div>' + sigs + '</div></section>';
  }
  var CSS = '@page{size:A4 portrait;margin:6mm}*{box-sizing:border-box}body{font-family:"Times New Roman",Georgia,serif;margin:0 auto;color:#111;width:198mm}.pg.sans{font-family:Arial,Helvetica,sans-serif}.pg{--ac:#1a1a1a;position:relative;width:198mm;height:138mm;margin-bottom:3mm;padding:2.5mm;break-inside:avoid;border:2.2px double var(--ac);overflow:hidden}.pg:nth-of-type(2n){break-after:page;margin-bottom:0}.in{height:100%;display:flex;flex-direction:column;position:relative;padding:0 3mm}.wm{position:absolute;left:50%;top:48%;width:46%;transform:translate(-50%,-50%);opacity:.06;pointer-events:none}.in>*{position:relative}.in>.wm{position:absolute}' +
    '.hd{display:flex;align-items:center;justify-content:space-between;gap:6px}.hd .lg{width:46px;height:46px;flex:none}.hc{text-align:center;flex:1}.hc i{font-size:9px;display:block}.hc h1{margin:0;font-size:19px;letter-spacing:.6px;line-height:1.1}.hc small{font-size:9.5px;font-weight:bold}' +
    '.tt{text-align:center;margin:2px 0 3px;border-top:1.4px solid var(--ac);padding-top:2px}.tt h2{margin:0;font-size:14px;letter-spacing:.4px}.tt h3{margin:1px 0;font-size:12.5px}.tt h4{margin:0;font-size:12.5px}.tt h4:empty{display:none}' +
    '.st{font-size:10.5px;margin-bottom:3px}.ln{display:flex;align-items:flex-end;gap:5px;margin:2.5px 0}.lb{white-space:nowrap;font-size:10px}.lb.r{margin-left:8px}.v{flex:1;border-bottom:1px dotted #333;font-size:10.5px;padding:0 4px;min-height:12px}.v.w2{flex:.55}' +
    'table{border-collapse:collapse;width:100%}.m{border:1.4px solid var(--ac)}.m th,.m td{border:1px solid var(--ac);text-align:center;padding:1.5px 3px;font-size:10px;line-height:1.15}.m th{background:#eef1f5;font-weight:bold;font-size:9.5px}.m td.l{text-align:left;font-weight:600;padding-left:5px}.m td.fg{font-weight:bold;font-size:11px}.m td.rm{text-align:left;padding-left:8px;font-size:9px;font-weight:600}.m tr.top td{border-top:1.3px solid var(--ac)}.m tr.gpa td{background:#f4f6f9;font-size:11px;padding:2.5px 4px}' +
    '.at{font-size:9px;border:1px solid var(--ac);padding:1.5px 6px;margin-top:3px;background:#fafafa}.bt{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;margin-top:5px;flex:none}.nt{font-size:8px;line-height:1.35;flex:1}.g{width:56%;border:1.2px solid var(--ac)}.g th,.g td{border:1px solid var(--ac);font-size:7.2px;text-align:left;padding:0 4px;line-height:1.2}.g th{text-align:center;background:#eef1f5}.g tr.gh th{font-size:6.8px}.g td:first-child,.g td:nth-child(3),.g td:last-child{text-align:center}' +
    '.sg{display:flex;justify-content:space-between;gap:14px;margin-top:auto;padding-top:6px;flex:none}.sc{flex:1;text-align:center;font-size:10px}.sn{font-weight:bold;min-height:13px;font-size:10px}.sl{border-top:1px dashed #222;margin:0 6px;padding-top:2px;font-weight:bold}.di{font-size:9px;margin-top:2px;font-weight:bold}';

  /* on-screen preview with Print button (no pop-up needed, works on phones) */
  function printSheets(html, title) {
    var css = '<style>' + CSS.replace(/body\{[^}]*\}/, '.shw{font-family:"Times New Roman",Georgia,serif;color:#111}') + '.shw{width:198mm;margin:0 auto}.shw .pg{background:#fff;border:1px solid #cfd6df;margin-bottom:8px!important}@media print{.shw{zoom:1!important;width:198mm!important}.shw .pg{border:0!important;margin-bottom:3mm!important}}</style>';
    var z0 = Math.min(1, (Math.min(window.innerWidth, document.documentElement.clientWidth || 9999) - 36) / 748);
    var body = css + '<div class="shw" style="zoom:' + z0 + '">' + html + '</div>';
    if (A.printable) A.printable(title || 'Grade sheets', body);
    else A.push({ title: function () { return title || 'Grade sheets'; }, render: function (el) { el.innerHTML = '<div class="noprint" style="margin-bottom:12px"><button class="btn primary" id="pbtn">Print / Save as PDF</button></div><div class="printable">' + body + '</div>'; $('#pbtn', el).onclick = function () { window.print(); }; } });
    var tries = 0;
    (function fit() {
      var w = document.querySelector('.shw');
      if (!w) { if (tries++ < 20) setTimeout(fit, 100); return; }
      try { fitSheets(w); } catch (e) {}
      var nat = w.offsetWidth || 748, avail = Math.min(window.innerWidth, document.documentElement.clientWidth || 9999) - 36;
      w.style.zoom = Math.min(1, avail / nat);
    })();
  }
  /* shrink a sheet's content until it fits its half-page (used for preview and printing) */
  function fitSheets(root) { (root || document).querySelectorAll('.pg').forEach(function (pg) { var inn = pg.querySelector('.in'), z = 1; inn.style.zoom = 1; var n = 0; while (inn.scrollHeight > inn.clientHeight + 1 && z > .5 && n++ < 20) { z -= .03; inn.style.zoom = z; } }); }
  var FITJS = '<script>window.onload=function(){document.querySelectorAll(".pg").forEach(function(pg){var i=pg.querySelector(".in"),z=1,n=0;while(i.scrollHeight>i.clientHeight+1&&z>.5&&n++<20){z-=.03;i.style.zoom=z}});setTimeout(function(){window.print()},300)}<\/script>';
  function loadScript(src, test) { return new Promise(function (res, rej) { if (test()) return res(); var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Could not load the Excel library (internet needed)')); }; document.head.appendChild(s); }); }
  var GCOL = { 'A+': 'FF1B8E4B', 'A': 'FF1B8E4B', 'B+': 'FF1C6FA8', 'B': 'FF1C6FA8', 'C+': 'FFB86E00', 'C': 'FFB86E00', 'D+': 'FFD9480F', 'D': 'FFD9480F', 'NG': 'FFC62828', 'Ab': 'FFC62828' };
  /* Styled Excel (blue headers, borders, zebra rows, coloured grades, frozen header). sheets = [{name, rows, head, merges[{r1,c1,r2,c2} 0-based], widths, left[], grades, groups[[c1,c2]], fills[{col,argb}], title}] */
  async function styledXlsx(sheets, file) {
    await loadScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js', function () { return window.ExcelJS; });
    var wb = new ExcelJS.Workbook(); wb.creator = 'Amar Secondary School';
    var thin = { style: 'thin', color: { argb: 'FFC9D6E6' } }, bd = { top: thin, left: thin, bottom: thin, right: thin };
    sheets.forEach(function (sh) {
      var rows = sh.rows.slice(), head = sh.head || 1, mg = (sh.merges || []).map(function (m) { return { r1: m.r1, c1: m.c1, r2: m.r2, c2: m.c2 }; }), ncol = Math.max.apply(null, rows.map(function (r) { return r.length; }));
      if (sh.title) { rows.unshift([sh.title]); mg.forEach(function (m) { m.r1++; m.r2++; }); mg.push({ r1: 0, c1: 0, r2: 0, c2: ncol - 1 }); head++; }
      var ws = wb.addWorksheet(String(sh.name).slice(0, 31).replace(/[\\\/\?\*\[\]:]/g, '-'), { views: [{ state: 'frozen', ySplit: head, xSplit: sh.freezeX || 0 }] });
      rows.forEach(function (r) { var x = []; for (var i = 0; i < ncol; i++) x.push(r[i] == null ? '' : r[i]); ws.addRow(x); });
      mg.forEach(function (m) { try { ws.mergeCells(m.r1 + 1, m.c1 + 1, m.r2 + 1, m.c2 + 1); } catch (e) {} });
      var w = sh.widths || []; for (var c = 0; c < ncol; c++) { var mx = 6; rows.slice(sh.title ? 1 : 0, 60).forEach(function (r) { var l = String(r[c] == null ? '' : r[c]).split('\n').reduce(function (a, s) { return Math.max(a, s.length); }, 0); if (l > mx) mx = l; }); ws.getColumn(c + 1).width = w[c] || Math.min(34, mx + 3); }
      var left = sh.left || [0], cols = ['FF1F6FB2', 'FF12846F', 'FF7A47D1', 'FFD97706', 'FFC2410C'];
      rows.forEach(function (r, ri) { var row = ws.getRow(ri + 1), isTitle = sh.title && ri === 0, isHead = ri < head && !isTitle;
        row.height = isTitle ? 34 : (isHead ? 24 : (sh.rowHeight || 20));
        for (var c = 0; c < ncol; c++) { var cell = row.getCell(c + 1), v = cell.value;
          cell.border = bd; cell.alignment = { vertical: 'middle', horizontal: left.indexOf(c) >= 0 && !isHead && !isTitle ? 'left' : 'center', wrapText: true };
          if (isTitle) { cell.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123F6B' } }; }
          else if (isHead) { var g = 0; (sh.groups || []).forEach(function (gr, gi) { if (c >= gr[0] && c <= gr[1]) g = gi; }); var argb = sh.groups && ri === head - 2 && sh.groups.some(function (gr) { return c >= gr[0] && c <= gr[1]; }) ? cols[(g + 1) % cols.length] : 'FF1F6FB2'; if (sh.groups && ri === head - 1) argb = (sh.groups.some(function (gr) { return c >= gr[0] && c <= gr[1]; }) ? cols[(g + 1) % cols.length] : 'FF2A86C4');
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; }
          else { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: (ri - head) % 2 ? 'FFF2F7FD' : 'FFFFFFFF' } }; cell.font = { size: 11, color: { argb: 'FF17324D' } };
            if (sh.grades && c >= 5 && GCOL[String(v)]) cell.font = { bold: true, size: 11, color: { argb: GCOL[String(v)] } }; }
          (sh.fills || []).forEach(function (f) { if (f.col === c && !isTitle) { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: f.argb } }; if (!isHead) cell.font = { italic: true, color: { argb: 'FF6B7F95' }, size: 10 }; } });
        } });
      if (sh.title) ws.getRow(1).getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    });
    var buf = await wb.xlsx.writeBuffer(), a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })); a.download = file; document.body.appendChild(a); a.click(); a.remove();
  }
  A.styledXlsx = styledXlsx;
  /* Ledger in the same layout as Gradewise_Result_Report: Subjects row, then S N / Name / Dob / Father / Mother / Symbol and IN, TH, Total grade for every subject */
  async function ledgerXlsx(D, ex) {
    var subs = D.ess.filter(function (es) { return D.items.some(function (it) { return it.res.subjects.some(function (s) { return s.subject_id === es.subject_id && !s.missing; }); }); });
    var h1 = ['Subjects', '', '', '', '', ''], h2 = ['S N', 'Student Name', 'Dob', 'Father Name', 'Mother Name', 'Symbol Number'], mg = [{ r1: 0, c1: 0, r2: 0, c2: 5 }], wd = [6, 26, 12, 24, 22, 13], gr = [];
    subs.forEach(function (es, i) { var c = 6 + i * 7, n = D.sn[es.subject_id].name, o = window.AMAR_OPT[D.cls.id + '|' + es.subject_id]; h1.push((o ? (o === 2 ? 'Optional II  ' : 'Optional I  ') : '') + n, '', '', '', '', '', ''); h2.push('IN', 'IN GP', 'TH', 'TH GP', 'Total', 'GP', 'Rank'); mg.push({ r1: 0, c1: c, r2: 0, c2: c + 6 }); gr.push([c, c + 6]); wd.push(5.5, 6, 5.5, 6, 7, 6, 6); });
    h1.push('', '', ''); h2.push('GPA', 'Result', 'Rank'); wd.push(8, 11, 7);
    var rows = D.items.map(function (it, i) { var r = [i + 1, it.s.full_name, it.s.dob_bs || '', it.s.father_name || '', it.s.mother_name || '', it.s.admission_no || it.s.roll_no || it.s.student_code.slice(-6)];
      subs.forEach(function (es) { var s = it.res.subjects.filter(function (x) { return x.subject_id === es.subject_id; })[0]; if (!s || s.missing) { r.push('', '', '', '', '', '', ''); return; }
        var P = s.parts || {}, pi = P['in'], pt = P.th;
        r.push(pi ? pi.grade : '', pi ? f2(pi.gp) : '', pt ? pt.grade : '', pt ? f2(pt.gp) : '', s.absent ? 'Ab' : s.grade, s.absent ? '' : f2(s.gp), s.rank || ''); });
      return r.concat([it.res.complete ? f2(it.res.gpa) : '', it.res.result, it.rank || '']); });
    var sr2 = [['Rank', 'Subject', 'Students', 'Class average %', 'Highest %', 'Passed']].concat((D.subjRank || []).map(function (x) { return [x.rank, D.sn[x.id].name, x.n, Math.round(x.avg * 100) / 100, Math.round(x.high * 100) / 100, x.pass + ' / ' + x.n]; }));
    await styledXlsx([{ name: 'Gradewise_Result_Report', title: D.sch.name + ' – ' + ex.name + ' – ' + D.cls.name + ' – Gradewise Result Report', rows: [h1, h2].concat(rows), head: 2, merges: mg, widths: wd, left: [1, 3, 4], grades: true, groups: gr, freezeX: 2 }, { name: 'Subject Ranking', title: D.sch.name + ' – ' + ex.name + ' – ' + D.cls.name + ' – Subjects ranked by class average', rows: sr2, head: 1, widths: [7, 30, 11, 16, 12, 11], left: [1] }], D.cls.name + ' - ' + ex.name + ' - Ledger.xlsx');
  }

  /* ---------- Grade sheet layout editor (admin) with live preview ---------- */
  V.sheetLayout = async function (el) {
    el.innerHTML = '<div class="skel"></div>';
    A.dropSchool(); var sch = await A.school(), L = layOf(sch);
    var RULES = [[90, 'A+', 4, 'Outstanding'], [80, 'A', 3.6, 'Excellent'], [70, 'B+', 3.2, 'Very Good'], [60, 'B', 2.8, 'Good'], [50, 'C+', 2.4, 'Satisfactory'], [40, 'C', 2, 'Acceptable'], [35, 'D', 1.6, 'Basic'], [0, 'NG', 0, 'Not Graded']].map(function (x) { return { min: x[0], grade: x[1], gp: x[2], desc: x[3] }; });
    var names = ['Nepali', 'English', 'Mathematics', 'Science & Technology', 'Social Studies', 'Health Physical & Creative Art', 'Hamro Gaurab Hamro Bharatpur'], sn = {}, subs = names.map(function (n, i) { sn['s' + i] = { name: n }; var ch = i === 5 ? 1.5 : i === 6 ? 2 : 2.5; return { subject_id: 's' + i, credit: ch * 2, gp: 3.8, grade: i % 3 === 1 ? 'A' : 'A+', parts: { th: { ch: ch, gp: 3.6, grade: 'A' }, in: { ch: ch, gp: 4, grade: 'A+' } } }; });
    function demo() { return A.sheetHtml({ lay: L, cls: { id: 'x', level: 8, name: 'Class 8' }, sch: Object.assign({}, sch, { name: sch.name || 'AMAR SECONDARY SCHOOL' }), sn: sn, rule: { rules: RULES }, att: { total: 78, by: { s1: 72 } }, items: [1] }, { name: 'Second Terminal Examination', academic_year: '2083' }, false, { s: { id: 's1', full_name: 'Sample Student', admission_no: '100047', emis_no: '3500500608008742', dob_bs: '2067-12-15', dob: '2011-03-29', roll_no: '12' }, res: { complete: true, gpa: 3.78, subjects: subs } }); }
    var T = function (k, lab, hint) { return '<label>' + esc(lab) + '</label><input type="text" data-k="' + k + '" value="' + esc(L[k]) + '" style="width:100%;margin-bottom:6px"' + (hint ? ' placeholder="' + esc(hint) + '"' : '') + '>'; };
    var C = function (k, lab) { return '<label class="row" style="gap:8px;align-items:center;margin:6px 0"><input type="checkbox" data-c="' + k + '"' + (L[k] ? ' checked' : '') + '> ' + esc(lab) + '</label>'; };
    el.innerHTML = '<p class="muted sm"><b>Tap any text on the sheet below to edit it.</b> Changes show instantly. <b>{exam}</b> {year} {class} {school} are replaced automatically.</p>' +
      '<div style="position:sticky;top:6px;z-index:5"><div class="card" style="overflow:hidden;margin-bottom:6px;box-shadow:0 8px 24px rgba(19,41,75,.25)"><div id="lpv" style="transform-origin:top left;width:198mm"></div></div><div class="card" id="lep" style="margin:0 0 8px;box-shadow:0 8px 24px rgba(19,41,75,.18)"></div></div>' +
      '<details><summary class="muted sm" style="padding:8px 2px;cursor:pointer">More options (form)</summary><div class="card"><h4>Heading</h4>' + T('line1', 'Line 1', '{exam} {year}') + T('line2', 'Line 2') + T('line3', 'Line 3 (leave empty to hide)') + T('address', 'School address (empty = use Settings address)') + T('iemis', 'IEMIS code') + C('logo', 'Show school logo') + C('motto', 'Show motto above school name') + C('watermark', 'Faint logo watermark') + '</div>' +
      '<div class="card"><h4>Student details</h4>' + T('lblBy', 'Label: student name') + T('lblDob', 'Label: date of birth') + T('lblSymbol', 'Label: symbol no') + T('lblOf', 'Label: school') + T('lblIemis', 'Label: IEMIS code') + T('lblIn', 'Sentence above the table') + C('showEmis', 'Show EMIS number after the name') + C('showDob', 'Show date of birth') + C('showRoll', 'Show roll number') + C('showRank', 'Show rank') + C('showAttendance', 'Show attendance box') + '</div>' +
      '<div class="card"><h4>Notes and grade table</h4><label>Notes (one per line)</label><textarea data-k="notes" rows="3" style="width:100%">' + esc(L.notes) + '</textarea>' + C('showDetails', 'Show "Details of grade sheet" table') + '</div>' +
      '<div class="card"><h4>Signatures</h4>' + T('sig1', 'Left label') + T('sig1n', 'Left name (optional)') + T('sig2', 'Middle label') + T('sig2n', 'Middle name (optional)') + T('sig3', 'Right label') + T('sig3n', 'Right name / title (optional)') + C('showIssue', 'Show date of issue') + T('issueDate', 'Date of issue (empty = today in BS)', 'e.g. 2083-08-10') + '</div>' +
      '<div class="card"><h4>Style</h4><label>Font</label><select data-k="font" style="width:100%;margin-bottom:6px"><option value="serif">Formal (Times)</option><option value="sans">Clean (Arial)</option></select><label>Border and table colour</label><input type="color" data-k="accent" value="' + esc(L.accent) + '" style="width:100%;height:42px"></div>' +
      '<div class="row" style="gap:8px"></details><div class="row" style="gap:8px"><button class="btn" id="lrs">Reset to default</button><button class="btn primary" id="lsv" style="flex:1">Save layout</button></div>';
    $('select[data-k="font"]', el).value = L.font;
    var st = document.createElement('style'); st.textContent = CSS.replace(/@page\{[^}]*\}/, '').replace('body{', '.lpb{') + '#lpv [data-lk]{cursor:pointer;outline:1px dashed rgba(47,143,208,.55);outline-offset:1px}#lpv [data-lk]:active{background:#e3f1fb}'; el.appendChild(st);
    function paint() { var pv = $('#lpv', el); pv.innerHTML = demo(); pv.classList.add('lpb'); fitSheets(pv); var w = pv.parentNode.clientWidth - 20, nat = pv.scrollWidth || 748, sc = Math.min(1, w / nat); pv.style.transform = 'scale(' + sc + ')'; pv.parentNode.style.height = (pv.scrollHeight * sc + 20) + 'px'; }
    var NM = { line1: 'Heading line 1', line2: 'Heading line 2', line3: 'Heading line 3', address: 'School address', iemis: 'IEMIS code', lblBy: 'Label: student name', lblDob: 'Label: date of birth', lblSymbol: 'Label: symbol no', lblOf: 'Label: school', lblIemis: 'Label: IEMIS', lblIn: 'Sentence above table', notes: 'Notes (one per line)', sig1: 'Left signature label', sig1n: 'Left name', sig2: 'Middle signature label', sig2n: 'Middle name', sig3: 'Right signature label', sig3n: 'Right name / title', issueDate: 'Date of issue (empty = today)' };
    var TG = [['logo', 'Logo'], ['motto', 'Motto'], ['watermark', 'Watermark'], ['showEmis', 'EMIS'], ['showDob', 'Birth date'], ['showRoll', 'Roll'], ['showRank', 'Rank'], ['showAttendance', 'Attendance'], ['showDetails', 'Grade details'], ['showIssue', 'Issue date']];
    function sync(k) { var f = el.querySelector('[data-k="' + k + '"]'); if (f) f.value = L[k] == null ? '' : L[k]; }
    function panel(k) {
      var ep = $('#lep', el), multi = k === 'notes';
      if (!k) {
        ep.innerHTML = '<div class="muted sm" style="margin-bottom:6px">Tap text on the sheet to change it, or switch parts on/off:</div><div class="row" style="gap:6px;flex-wrap:wrap">' + TG.map(function (g) { return '<button class="btn sm" data-tg="' + g[0] + '" style="' + (L[g[0]] ? 'background:#e3f1fb;border-color:#2f8fd0' : 'opacity:.6') + '">' + (L[g[0]] ? '✓ ' : '') + g[1] + '</button>'; }).join('') + (L.line3 ? '' : '<button class="btn sm" data-add="line3">+ Line 3</button>') + '</div>';
        ep.querySelectorAll('[data-tg]').forEach(function (b) { b.onclick = function () { var q = b.getAttribute('data-tg'); L[q] = !L[q]; var c = el.querySelector('[data-c="' + q + '"]'); if (c) c.checked = L[q]; paint(); panel(); }; });
        var ad = ep.querySelector('[data-add]'); if (ad) ad.onclick = function () { L.line3 = 'Sample line'; sync('line3'); paint(); panel('line3'); };
        return;
      }
      ep.innerHTML = '<div class="row" style="gap:8px;align-items:center;margin-bottom:4px"><b style="flex:1;font-size:14px">✏️ ' + esc(NM[k] || k) + '</b><button class="btn primary sm" id="lpd" style="width:auto;min-width:0;padding:8px 16px;flex:none">Done</button></div>' + (multi ? '<textarea id="lpi" rows="4" style="width:100%"></textarea>' : '<input type="text" id="lpi" style="width:100%">');
      var inp = $('#lpi', ep); inp.value = L[k] == null ? '' : L[k];
      inp.oninput = function () { L[k] = inp.value; sync(k); paint(); };
      $('#lpd', ep).onclick = function () { panel(); };
      inp.focus();
    }
    $('#lpv', el).addEventListener('click', function (e) { var t = e.target.closest ? e.target.closest('[data-lk]') : null; if (t) { e.preventDefault(); panel(t.getAttribute('data-lk')); } else panel(); });
    panel();
    el.querySelectorAll('[data-k]').forEach(function (i) { var ev = function () { if (i.getAttribute('data-k')) { L[i.getAttribute('data-k')] = i.value; paint(); } }; i.addEventListener('input', ev); i.addEventListener('change', ev); });
    el.querySelectorAll('[data-c]').forEach(function (i) { i.onchange = function () { L[i.getAttribute('data-c')] = i.checked; paint(); }; });
    $('#lrs', el).onclick = function () { if (!confirm('Go back to the default layout?')) return; L = layOf({}); A.V('sheetLayout')(el); };
    $('#lsv', el).onclick = async function () { try { var r = await db.from('schools').update({ sheet_layout: L }).eq('id', sch.id); if (r.error) { if (/sheet_layout/i.test(r.error.message || '')) throw { message: 'Run SQL step 19 in Supabase first.' }; throw r.error; } A.dropSchool(); toast('✓ Layout saved'); } catch (e) { toast(A.errText(e), true); } };
    paint(); setTimeout(paint, 300);
  };
  A.sheetHtml = sheetHtml; A.SHEET_CSS = CSS; A.fitSheets = fitSheets; A.printSheets = printSheets; A.layOf = layOf; A.LAYDEF = LAYDEF; A.loadResults = load;

  /* Symbol numbers: generate for every student of an exam, then edit any of them */
  V.symbolNos = async function (el) {
    A.skeleton(el);
    var lk = await A.lookups(true), exams = must(await db.from('exams').select('id,name,academic_year').order('created_at'));
    if (!exams.length) { el.innerHTML = '<div class="empty">Create an exam first (open “Marks entry” once).</div>'; return; }
    var classes = lk.classes.slice().sort(function (a, b) { return (a.level || 0) - (b.level || 0) || String(a.name).localeCompare(String(b.name)); });
    el.innerHTML = '<div class="note">Symbol numbers are made for the whole exam. Press <b>Generate</b>, change any number if needed, then <b>Save</b>. They print on the grade sheets.</div>' +
      '<select id="sx" class="search">' + exams.map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + '</option>'; }).join('') + '</select>' +
      '<div class="card"><div class="row" style="gap:8px"><div style="flex:1"><label>Start from</label><input id="sst" type="number" value="1001" style="width:100%"></div><div style="flex:1"><label>Prefix (optional)</label><input id="spf" type="text" placeholder="e.g. A-" style="width:100%"></div></div>' +
      '<label class="row" style="gap:8px;align-items:center;margin:8px 0"><input type="checkbox" id="spc"> Start every class from a new hundred (1001, 1101, 1201…)</label>' +
      '<div class="row" style="gap:8px"><button class="btn" id="sgen" style="flex:1">⚙️ Generate for all students</button><button class="btn primary" id="ssv" style="flex:1">Save</button></div></div><div id="sl"></div>';
    var studs = [], cur = {};
    async function draw() {
      var xid = $('#sx', el).value, sl = $('#sl', el); sl.innerHTML = '<div class="empty">Loading…</div>';
      try {
        studs = must(await db.from('students').select('id,full_name,roll_no,class_id').eq('status', 'active').order('roll_no').order('full_name'));
        cur = {}; must(await db.from('exam_symbols').select('student_id,symbol_no').eq('exam_id', xid)).forEach(function (r) { cur[r.student_id] = r.symbol_no; });
      } catch (e) { sl.innerHTML = '<p class="err">' + esc(/exam_symbols/i.test((e && e.message) || '') ? 'Run SQL step 20 in Supabase first.' : A.errText(e)) + '</p>'; return; }
      sl.innerHTML = classes.map(function (c) {
        var ss = studs.filter(function (s) { return s.class_id === c.id; }); if (!ss.length) return '';
        return '<h4 style="margin:14px 2px 6px">' + esc(A.nm(c)) + ' <span class="muted sm">(' + ss.length + ')</span></h4>' + ss.map(function (s) { return '<div class="card row between" style="gap:8px;padding:8px 12px"><div style="flex:1;min-width:0"><b>' + esc(s.full_name) + '</b><div class="muted sm">Roll ' + esc(s.roll_no || '-') + '</div></div><input class="sy" data-id="' + s.id + '" type="text" value="' + esc(cur[s.id] || '') + '" placeholder="—" style="width:110px;text-align:center;font-weight:700"></div>'; }).join('');
      }).join('') || '<div class="empty">No students.</div>';
    }
    $('#sx', el).onchange = draw;
    $('#sgen', el).onclick = function () {
      var n = parseInt($('#sst', el).value, 10) || 1, pf = $('#spf', el).value || '', hund = $('#spc', el).checked, k = 0;
      classes.forEach(function (c, ci) {
        var ss = studs.filter(function (s) { return s.class_id === c.id; }); if (!ss.length) return;
        if (hund && k) n = (Math.floor((n - 1) / 100) + 1) * 100 + ((parseInt($('#sst', el).value, 10) || 1) % 100); k++;
        ss.sort(function (a, b) { return (parseInt(a.roll_no, 10) || 9999) - (parseInt(b.roll_no, 10) || 9999) || String(a.full_name).localeCompare(String(b.full_name)); }).forEach(function (s) { var i = el.querySelector('.sy[data-id="' + s.id + '"]'); if (i) i.value = pf + (n++); });
      });
      toast('Generated – check, then press Save');
    };
    $('#ssv', el).onclick = async function () {
      var rows = [], seen = {}, dup = [], xid = $('#sx', el).value;
      el.querySelectorAll('.sy').forEach(function (i) { var v = i.value.trim(); i.style.borderColor = ''; if (!v) return; if (seen[v]) { dup.push(v); i.style.borderColor = '#d33'; } seen[v] = 1; rows.push({ exam_id: xid, student_id: i.getAttribute('data-id'), symbol_no: v, updated_at: new Date().toISOString() }); });
      if (dup.length && !confirm('Same symbol number used twice: ' + dup.slice(0, 5).join(', ') + '. Save anyway?')) return;
      try {
        var gone = []; el.querySelectorAll('.sy').forEach(function (i) { if (!i.value.trim() && cur[i.getAttribute('data-id')]) gone.push(i.getAttribute('data-id')); });
        if (gone.length) must(await db.from('exam_symbols').delete().eq('exam_id', xid).in('student_id', gone));
        if (rows.length) must(await db.from('exam_symbols').upsert(rows, { onConflict: 'exam_id,student_id' }));
        toast('✓ Saved ' + rows.length + ' symbol numbers'); draw();
      } catch (e) { toast(/exam_symbols/i.test((e && e.message) || '') ? 'Run SQL step 20 in Supabase first.' : A.errText(e), true); }
    };
    draw();
  };
  V.resultsLedger = async function (el) {
    A.skeleton(el);
    var lk = await A.lookups(true), exams = must(await db.from('exams').select('id,name,exam_type,academic_year').order('created_at'));
    if (A.state.profile.role === 'teacher') {   // class teachers: view and print only, for their own class
      var mine = await A.ctClasses(); lk = Object.assign({}, lk, { classes: lk.classes.filter(function (c) { return mine.indexOf(c.id) >= 0; }) });
      if (!lk.classes.length) { el.innerHTML = '<div class="empty">Only the class teacher can open the ledger and grade sheets of a class.</div>'; return; }
    }
    if (!exams.length || !lk.classes.length) { el.innerHTML = '<div class="empty">Open “Marks entry” once first (it creates the exams and subjects), and add classes.</div>'; return; }
    el.innerHTML = '<div class="note">Pick an exam and a class. Tap <b>Print grade sheets</b> to see and print them (two per page), or tap one student to see only that sheet. You can also or <b>download the ledger</b> (whole class in one Excel/CSV file).</div>' + (A.state.profile.role === 'admin' ? '<button class="btn" id="rsy" style="margin-bottom:8px">🔢 Symbol numbers (generate / edit)</button>' : '') + '<select id="rx" class="search">' + exams.map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + '</option>'; }).join('') + '</select><select id="rc" class="search">' + lk.classes.map(function (c) { return '<option value="' + c.id + '">' + esc(A.nm(c)) + '</option>'; }).join('') + '</select><div id="ro"></div>';
    async function draw() {
      var ex = exams.filter(function (e) { return e.id === $('#rx', el).value; })[0], mid = isMid(ex), box = $('#ro', el); box.innerHTML = '<div class="empty">Loading…</div>';
      try {
        var D = await load(ex, $('#rc', el).value);
        if (!D.items.length) { box.innerHTML = '<div class="empty">No students in this class.</div>'; return; }
        box.innerHTML = '<div class="row" style="margin:10px 0"><button class="btn primary" id="rp">Print grade sheets</button><button class="btn" id="rl">Download ledger (Excel)</button></div>' +
          '<div class="muted sm">' + (D.rule.verified === false ? 'Grading table not verified – check Grading rules. ' : '') + (mid ? 'Mid-term: one grade per subject, half credit hours.' : 'Terminal: theory + internal marks, weighted by credit hours.') + '</div>' +
          D.items.map(function (it, ix) { var r = it.res; return '<div class="card row between" data-one="' + ix + '" style="cursor:pointer"><div><b>' + esc(it.s.full_name) + '</b><div class="muted sm">' + (r.complete ? r.percentage + '% · GPA ' + f2(r.gpa) : 'Marks missing in ' + r.missing_count + ' subject(s)') + '</div></div><span class="chip ' + (r.result === 'PASS' ? 'ok' : 'bad') + '">' + (it.rank ? '#' + it.rank + ' ' : '') + r.result + '</span></div>'; }).join('');
        var isT = A.state.profile.role === 'teacher';   // class teachers only view / print / download
        box.insertAdjacentHTML('afterbegin', (isT ? '' : '<div class="note">' + (D.pending ? '<b>' + D.pending + '</b> marks are waiting for approval. Results can be published only when all marks are approved.' : 'All marks are approved. You can publish the results to parents.') + '</div><div class="row" style="margin-bottom:10px">' + (D.pending ? '<button class="btn primary" id="rap" style="flex:1">Approve all marks</button>' : '') + '<button class="btn primary" id="rpub" style="flex:1">Publish to parents</button></div>'));
        if ($('#rap', box)) $('#rap', box).onclick = async function () { try { must(await db.from('marks').update({ status: 'approved' }).eq('exam_id', ex.id).in('student_id', D.sids)); toast('✓ Approved'); draw(); } catch (e) { toast(A.errText(e), true); } };
        if ($('#rpub', box)) $('#rpub', box).onclick = function () { V.gradeSheets(el); };
        var showSheets = function (items) { try { printSheets(items.map(function (it) { return sheetHtml(D, ex, mid, it); }).join(''), 'Grade sheets – ' + (D.cls.name || '')); } catch (e) { toast('Grade sheet error: ' + (e && e.message || e), true); } };
        $('#rp', box).onclick = function () { showSheets(D.items); };
        box.querySelectorAll('[data-one]').forEach(function (c) { c.onclick = function () { showSheets([D.items[+c.getAttribute('data-one')]]); }; });
        $('#rl', box).onclick = async function () { try { await ledgerXlsx(D, ex); } catch (e) { toast(A.errText(e), true); } };
      } catch (e) { box.innerHTML = '<p class="err">' + esc(A.errText(e)) + '</p>'; }
    }
    if ($('#rsy', el)) $('#rsy', el).onclick = function () { A.push({ title: function () { return 'Symbol numbers'; }, render: A.V('symbolNos') }); };
    $('#rx', el).onchange = draw; $('#rc', el).onchange = draw; draw();
  };
  function isMid(e) { return /mid/i.test((e.name || '') + ' ' + (e.exam_type || '')); }
})();
