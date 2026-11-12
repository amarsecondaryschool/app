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
    var subs = list.map(function (es) { return G.subjectResult(rule, es, mbs[es.subject_id]); }), full = 0, obt = 0, cr = 0, gs = 0, ng = 0, miss = 0;
    subs.forEach(function (s) { if (s.missing) { miss++; return; } full += s.full; obt += s.obtained; cr += s.credit; gs += s.gp * s.credit; if (!s.pass) ng++; });
    var pct = full > 0 ? G.round(obt / full * 100, 2) : 0, gpa = cr > 0 ? G.round(gs / cr, Number(rule.rounding) || 2) : 0, complete = miss === 0 && subs.length > 0;
    return { subjects: subs, total_full: full, total_obtained: obt, percentage: pct, gpa: gpa, gpa_valid: complete && ng === 0, ng_count: ng, missing_count: miss, complete: complete,
      overall_grade: complete ? G.gradeFor(rule, pct).grade : null, result: !complete ? 'INCOMPLETE' : (ng === 0 ? 'PASS' : 'NG') };
  };
  async function refreshOpt() {
    var r = must(await db.from('class_subjects').select('class_id,subject_id,is_compulsory,opt_slot')); window.AMAR_OPT = {};
    r.forEach(function (x) { if (!x.is_compulsory) window.AMAR_OPT[x.class_id + '|' + x.subject_id] = x.opt_slot || 1; });
  }
  Object.keys(V).forEach(function (k) { var f = V[k]; if (typeof f === 'function') V[k] = function () { var a = arguments, t = this; return refreshOpt().catch(function () {}).then(function () { return f.apply(t, a); }); }; });

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
    var studs = must(await db.from('students').select('id,student_code,full_name,roll_no,admission_no,dob_bs,father_name,mother_name').eq('class_id', cid).eq('status', 'active').order('roll_no').order('full_name'));
    var marks = studs.length ? must(await db.from('marks').select('*').eq('exam_id', exam.id).in('student_id', studs.map(function (s) { return s.id; }))) : [];
    var mb = {}; marks.forEach(function (m) { (mb[m.student_id] = mb[m.student_id] || {})[m.subject_id] = m; });
    var rules = []; try { rules = must(await db.from('grading_rules').select('*')); } catch (e) {}
    var rule = G.pickRule(rules, cls.level, exam.academic_year);
    ess.sort(function (a, b) { var oa = window.AMAR_OPT[cid + '|' + a.subject_id] || 0, ob = window.AMAR_OPT[cid + '|' + b.subject_id] || 0; return oa - ob || (sn[a.subject_id].name < sn[b.subject_id].name ? -1 : 1); });
    var chosen = {}, any = {};
    try { if (studs.length) must(await db.from('student_optionals').select('student_id,subject_id').in('student_id', studs.map(function (s) { return s.id; }))).forEach(function (r) { chosen[r.student_id + '|' + r.subject_id] = 1; any[r.student_id] = 1; }); } catch (e) {}
    var items = studs.map(function (s) {
      var list = any[s.id] ? ess.filter(function (es) { return !window.AMAR_OPT[cid + '|' + es.subject_id] || chosen[s.id + '|' + es.subject_id]; }).map(function (es) { return window.AMAR_OPT[cid + '|' + es.subject_id] ? Object.assign({}, es, { chosen: true }) : es; }) : ess;
      return { s: s, res: G.studentResult(rule, list, mb[s.id] || {}) }; });
    G.rankAll(items);
    return { cls: cls, sch: sch, sn: sn, ess: ess, items: items, rule: rule };
  }
  function sheetHtml(D, exam, mid, it) {
    var r = it.res, rule = D.rule, k = 0, rows = '';
    r.subjects.forEach(function (sr) {
      if (sr.missing) return; k++;
      var nm = (D.sn[sr.subject_id].name || '').toUpperCase(), opt = window.AMAR_OPT[D.cls.id + '|' + sr.subject_id] ? 'OPT-' + (window.AMAR_OPT[D.cls.id + '|' + sr.subject_id] === 2 ? 'II' : 'I') + ' ' : (D.cls.level >= 9 && D.cls.level <= 10 ? 'COMP. ' : '');
      if (!mid && sr.parts) {
        var L = [['th', 'TH'], ['pr', 'PR'], ['in', 'IN']].filter(function (c) { return sr.parts[c[0]]; });
        rows += '<tr><td rowspan="' + L.length + '">' + k + '</td><td class="l">' + opt + esc(nm) + ' (' + L[0][1] + ')</td><td>' + f2(sr.parts[L[0][0]].ch) + '</td><td>' + f2(sr.parts[L[0][0]].gp).replace(/0$/, '') + '</td><td>' + sr.parts[L[0][0]].grade + '</td><td rowspan="' + L.length + '">' + sr.grade + '</td></tr>';
        L.slice(1).forEach(function (c) { rows += '<tr><td class="l">' + opt + esc(nm) + ' (' + c[1] + ')</td><td>' + f2(sr.parts[c[0]].ch) + '</td><td>' + f2(sr.parts[c[0]].gp).replace(/0$/, '') + '</td><td>' + sr.parts[c[0]].grade + '</td></tr>'; });
      } else rows += '<tr><td>' + k + '</td><td class="l">' + opt + esc(nm) + '</td><td>' + f2(sr.credit) + '</td><td>' + (sr.absent ? 'Ab*' : sr.grade) + '</td><td>' + f2(sr.gp) + '</td></tr>';
    });
    var cr = r.subjects.reduce(function (a, x) { return a + (x.missing ? 0 : x.credit); }, 0), head = mid ? '<tr><th>S.N.</th><th>SUBJECTS</th><th>CREDIT HOUR</th><th>OBTAINED GRADE</th><th>GRADE POINT</th></tr>' : '<tr><th>S.N.</th><th>SUBJECTS</th><th>CREDIT HOUR</th><th>GRADE POINT</th><th>GRADE</th><th>FINAL GRADE</th></tr>';
    var foot = mid ? '<tr><td colspan="2"><b>GRADE POINT AVERAGE (GPA)</b></td><td><b>' + f2(cr) + '</b></td><td>-</td><td><b>' + (r.complete ? f2(r.gpa) : '') + '</b></td></tr>' : '<tr><td colspan="2"><b>GRADE POINT AVERAGE (GPA)</b></td><td><b>' + f2(cr) + '</b></td><td colspan="3"><b>' + (r.complete ? f2(r.gpa) + ' &nbsp; (' + esc(fg(rule, r.gpa).desc || '') + ')' : 'INCOMPLETE') + '</b></td></tr>';
    var gt = rule.rules.slice().sort(function (a, b) { return b.min - a.min; }), gr = gt.map(function (g, i) { var hi = i ? gt[i - 1].min : 100; return '<tr><td>' + (i ? g.min + ' to below ' + hi : g.min + ' to ' + hi) + '</td><td>' + g.grade + '</td><td>' + esc(g.desc || '') + '</td><td>' + f2(+g.gp).replace(/0$/, '') + '</td></tr>'; }).join('');
    return '<section class="pg' + (k > 9 ? ' dense' : '') + '"><div class="c"><img class="lg" src="' + new URL('logo.png', location.href).href + '"><i>“Education is the part of life”</i><h1>' + esc(D.sch.name) + '</h1><b>' + esc(D.sch.address || 'Bharatpur -22, Padampokhari, Chitwan') + ' | Estd.: 2012</b><h2>' + esc(exam.name.toUpperCase()) + ' - ' + esc(exam.academic_year || '') + '</h2><h3><u>Grade - Sheet</u></h3></div>' +
      '<div class="who"><span>Name of Student: <b>' + esc(it.s.full_name) + '</b></span><span>SYMBOL NO: <b>' + esc(it.s.admission_no || it.s.roll_no || it.s.student_code.slice(-6)) + '</b></span><span>CLASS: <b>' + esc(D.cls.name.replace(/^Class\s*/, '')) + '</b></span></div>' +
      '<table class="m">' + head + rows + foot + '</table><div class="bt"><ol><li>One Credit Hour Equals 32 Clock Hours.</li><li>TH = Theory, IN = Internal (CAS), Ab* = Absent.</li><li>GPA = (Σ[Credit Hour × Grade Point]) / Total Credit Hour</li></ol>' +
      '<table class="g"><tr><th>Intervals in %</th><th>Grade</th><th>Detail</th><th>G.P.</th></tr>' + gr + '</table></div><div class="sg"><span>Class Teacher</span><span>Principal</span></div></section>';
  }
  var CSS = '@page{size:A4 portrait;margin:6mm}*{box-sizing:border-box}body{font-family:"Times New Roman",serif;margin:0}.pg{border:1.5px solid #000;padding:6px 10px;height:137mm;margin-bottom:4mm;display:flex;flex-direction:column;overflow:hidden;break-inside:avoid}.pg:nth-of-type(2n){break-after:page;margin-bottom:0}.c{text-align:center;position:relative}.lg{position:absolute;left:2px;top:0;width:54px;height:54px}.c i{font-size:9px}.c h1{margin:0;font-size:20px;letter-spacing:.5px}.c b{font-size:10px}.c h2{margin:1px 0;font-size:12.5px}.c h3{margin:1px 0 3px;font-size:12px}.who{display:flex;justify-content:space-between;border-top:1.5px solid #000;padding:3px 0;font-size:12px}table{border-collapse:collapse;width:100%}.m th,.m td{border:1px solid #000;text-align:center;padding:2px;font-size:11px}.m td.l{text-align:left;font-weight:bold;padding-left:6px}.dense .m th,.dense .m td{font-size:9.5px;padding:0 3px}.bt{display:flex;justify-content:space-between;align-items:flex-end;font-size:8px;margin-top:auto}.bt ol{padding-left:12px;margin:0}.g{width:44%}.g th,.g td{border:1px solid #000;font-size:7.5px;text-align:center;padding:0 3px}.sg{display:flex;justify-content:space-between;margin-top:14px;font-weight:bold;font-size:11px;padding:0 30px}';
  function ensureXlsx() { return new Promise(function (res, rej) { if (window.XLSX) return res(); var s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = res; s.onerror = function () { rej(new Error('Could not load the Excel library (internet needed)')); }; document.head.appendChild(s); }); }
  /* Ledger in the same layout as Gradewise_Result_Report: Subjects row, then S N / Name / Dob / Father / Mother / Symbol and IN, TH, Total grade for every subject */
  async function ledgerXlsx(D, ex) {
    await ensureXlsx();
    var subs = D.ess.filter(function (es) { return D.items.some(function (it) { return it.res.subjects.some(function (s) { return s.subject_id === es.subject_id && !s.missing; }); }); });
    var h1 = ['Subjects', '', '', '', '', ''], h2 = ['S N', 'Student Name', 'Dob', 'Father Name', 'Mother Name', 'Symbol Number'], mg = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }], wc = [{ wch: 6 }, { wch: 26 }, { wch: 12 }, { wch: 24 }, { wch: 22 }, { wch: 13 }];
    subs.forEach(function (es, i) { var c = 6 + i * 3, n = D.sn[es.subject_id].name, o = window.AMAR_OPT[D.cls.id + '|' + es.subject_id]; h1.push((o ? (o === 2 ? 'Optional II ' : 'Optional I ') : '') + n, '', ''); h2.push('IN', 'TH', 'Total'); mg.push({ s: { r: 0, c: c }, e: { r: 0, c: c + 2 } }); wc.push({ wch: 6 }, { wch: 6 }, { wch: 7 }); });
    h1.push('', '', ''); h2.push('GPA', 'Result', 'Rank'); wc.push({ wch: 7 }, { wch: 10 }, { wch: 6 });
    var rows = D.items.map(function (it, i) { var r = [i + 1, it.s.full_name, it.s.dob_bs || '', it.s.father_name || '', it.s.mother_name || '', it.s.admission_no || it.s.roll_no || it.s.student_code.slice(-6)];
      subs.forEach(function (es) { var s = it.res.subjects.filter(function (x) { return x.subject_id === es.subject_id; })[0]; if (!s || s.missing) { r.push('', '', ''); return; }
        r.push(s.parts && s.parts['in'] ? s.parts['in'].grade : '', s.parts && s.parts.th ? s.parts.th.grade : '', s.absent ? 'Ab' : s.grade); });
      return r.concat([it.res.complete ? f2(it.res.gpa) : '', it.res.result, it.rank || '']); });
    var ws = XLSX.utils.aoa_to_sheet([h1, h2].concat(rows)); ws['!merges'] = mg; ws['!cols'] = wc;
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Gradewise_Result_Report'); XLSX.writeFile(wb, D.cls.name + ' - ' + ex.name + ' - Ledger.xlsx');
  }
  V.resultsLedger = async function (el) {
    A.skeleton(el);
    var lk = await A.lookups(true), exams = must(await db.from('exams').select('id,name,exam_type,academic_year').order('created_at'));
    if (!exams.length || !lk.classes.length) { el.innerHTML = '<div class="empty">Open “Marks entry” once first (it creates the exams and subjects), and add classes.</div>'; return; }
    el.innerHTML = '<div class="note">Pick an exam and a class. You can <b>print the grade sheets</b> (one page per student) or <b>download the ledger</b> (whole class in one Excel/CSV file).</div><select id="rx" class="search">' + exams.map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + '</option>'; }).join('') + '</select><select id="rc" class="search">' + lk.classes.map(function (c) { return '<option value="' + c.id + '">' + esc(A.nm(c)) + '</option>'; }).join('') + '</select><div id="ro"></div>';
    async function draw() {
      var ex = exams.filter(function (e) { return e.id === $('#rx', el).value; })[0], mid = isMid(ex), box = $('#ro', el); box.innerHTML = '<div class="empty">Loading…</div>';
      try {
        var D = await load(ex, $('#rc', el).value);
        if (!D.items.length) { box.innerHTML = '<div class="empty">No students in this class.</div>'; return; }
        box.innerHTML = '<div class="row" style="margin:10px 0"><button class="btn primary" id="rp">Print grade sheets</button><button class="btn" id="rl">Download ledger (Excel)</button></div>' +
          '<div class="muted sm">' + (D.rule.verified === false ? 'Grading table not verified – check Grading rules. ' : '') + (mid ? 'Mid-term: one grade per subject, half credit hours.' : 'Terminal: theory + internal marks, weighted by credit hours.') + '</div>' +
          D.items.map(function (it) { var r = it.res; return '<div class="card row between"><div><b>' + esc(it.s.full_name) + '</b><div class="muted sm">' + (r.complete ? r.percentage + '% · GPA ' + f2(r.gpa) : 'Marks missing in ' + r.missing_count + ' subject(s)') + '</div></div><span class="chip ' + (r.result === 'PASS' ? 'ok' : 'bad') + '">' + (it.rank ? '#' + it.rank + ' ' : '') + r.result + '</span></div>'; }).join('');
        $('#rp', box).onclick = function () { var w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print', true); w.document.write('<html><head><title>Grade sheets</title><style>' + CSS + '</style></head><body>' + D.items.map(function (it) { return sheetHtml(D, ex, mid, it); }).join('') + '</body></html>'); w.document.close(); setTimeout(function () { w.print(); }, 400); };
        $('#rl', box).onclick = async function () { try { await ledgerXlsx(D, ex); } catch (e) { toast(A.errText(e), true); } };
      } catch (e) { box.innerHTML = '<p class="err">' + esc(A.errText(e)) + '</p>'; }
    }
    $('#rx', el).onchange = draw; $('#rc', el).onchange = draw; draw();
  };
  function isMid(e) { return /mid/i.test((e.name || '') + ' ' + (e.exam_type || '')); }
})();
