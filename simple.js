/* Simple layer: Nepal subjects (compulsory / optional, editable), marks-entry auto setup, safe grading fallback. */
(function () {
  'use strict';
  var A = window.AMAR, db = A.db, $ = A.$, esc = A.esc, must = A.must, toast = A.toast, state = A.state, V = A.views, G = window.AmarGrading;

  /* ----- default grading table if the admin has not saved one yet (marked NOT verified) ----- */
  var pick = G.pickRule;
  G.pickRule = function (rules, level, year) {
    return pick(rules, level, year) || { is_active: true, verified: false, class_from: 0, class_to: 12, min_percent: 35, min_component_percent: 0, rounding: 2,
      rules: [['A+', 90, 4, 'Outstanding'], ['A', 80, 3.6, 'Excellent'], ['B+', 70, 3.2, 'Very Good'], ['B', 60, 2.8, 'Good'], ['C+', 50, 2.4, 'Satisfactory'], ['C', 40, 2.0, 'Acceptable'], ['D', 35, 1.6, 'Partially Acceptable'], ['NG', 0, 0, 'Not Graded']]
        .map(function (r) { return { grade: r[0], min: r[1], gp: r[2], desc: r[3], desc_ne: r[3] }; }) };
  };

  /* ----- Nepal curriculum defaults (editable in the app: Subjects) ----- */
  var NE = { 'Nepali': 'नेपाली', 'English': 'अंग्रेजी', 'Mathematics': 'गणित', 'Our Surroundings': 'हाम्रो सेरोफेरो', 'Science and Technology': 'विज्ञान तथा प्रविधि', 'Social Studies': 'सामाजिक अध्ययन',
    'Health Physical and Creative Arts': 'स्वास्थ्य, शारीरिक तथा सिर्जनात्मक कला', 'Local Subject': 'स्थानीय विषय', 'Computer Science': 'कम्प्युटर विज्ञान', 'Optional Mathematics': 'ऐच्छिक गणित', 'Accountancy': 'लेखा',
    'Economics': 'अर्थशास्त्र', 'Population and Environment Education': 'जनसंख्या तथा वातावरण शिक्षा', 'Social Studies and Life Skills': 'सामाजिक अध्ययन तथा जीवन कौशल', 'Physics': 'भौतिक विज्ञान',
    'Chemistry': 'रसायन विज्ञान', 'Biology': 'जीवविज्ञान', 'Business Studies': 'व्यवसाय अध्ययन', 'Business Mathematics': 'व्यवसाय गणित', 'Marketing': 'मार्केटिङ', 'Sociology': 'समाजशास्त्र' };
  var CORE6 = ['Nepali', 'English', 'Mathematics', 'Science and Technology', 'Social Studies', 'Health Physical and Creative Arts'];
  var SLOT2 = { 'Computer Science': 2, 'Population and Environment Education': 2, 'Local Subject': 2, 'Chemistry': 2, 'Economics': 2, 'Business Mathematics': 2, 'Marketing': 2, 'Biology': 2 };
  function slotOf(n, l) { return l >= 9 && l <= 10 ? (SLOT2[n] || 1) : (l >= 11 ? (SLOT2[n] || 1) : (n === 'Local Subject' ? 2 : 1)); }
  function plan(l) {
    if (l <= 3) return { c: ['Nepali', 'English', 'Mathematics', 'Our Surroundings'], o: l ? ['Local Subject'] : [] };
    if (l <= 5) return { c: CORE6, o: ['Local Subject'] };
    if (l <= 8) return { c: CORE6, o: ['Computer Science', 'Local Subject'] };
    if (l <= 10) return { c: ['Nepali', 'English', 'Mathematics', 'Science and Technology', 'Social Studies'], o: ['Optional Mathematics', 'Computer Science', 'Accountancy', 'Economics', 'Population and Environment Education'] };
    return { c: ['Nepali', 'English', 'Social Studies and Life Skills'], o: ['Physics', 'Chemistry', 'Biology', 'Mathematics', 'Computer Science', 'Accountancy', 'Business Studies', 'Economics', 'Business Mathematics', 'Marketing', 'Sociology'] };
  }
  async function loadCS() { var r = await db.from('class_subjects').select('class_id,subject_id,is_compulsory,opt_slot,theory_marks,internal_marks,credit_hours'); if (r.error) r = await db.from('class_subjects').select('class_id,subject_id,is_compulsory,opt_slot'); return must(r); }
  var CORE5B = ['Nepali', 'English', 'Mathematics', 'Science and Technology'];
  function dflt(l, n) { var b = l >= 4 && l <= 10; return { th: b ? 75 : 100, inn: b ? 25 : 0, ch: b ? (CORE5B.indexOf(n) >= 0 ? 5 : 4) : 4 }; }
  async function syncExam(cid, sid, th, inn, ch) {   // push new marks / credit hours to this class+subject in every unpublished exam
    var ex = must(await db.from('exams').select('id,name,exam_type,status')).filter(function (e) { return e.status !== 'published'; });
    for (var i = 0; i < ex.length; i++) { var mid = isMid(ex[i]); await db.from('exam_subjects').update({ theory_marks: mid ? th + inn : th, internal_marks: mid ? 0 : inn, credit_hours: mid ? ch / 2 : ch }).eq('exam_id', ex[i].id).eq('class_id', cid).eq('subject_id', sid); }
  }

  async function ensureDefaults(onlyClass, force) {
    if (state.profile.role !== 'admin') return;
    var lk = await A.lookups(), cs = await loadCS(), sch = await A.school(), have = {};
    cs.forEach(function (r) { have[r.class_id] = 1; });
    var classes = lk.classes.filter(function (c) { return onlyClass ? c.id === onlyClass : !have[c.id]; });
    if (!classes.length) return;
    var names = {}; classes.forEach(function (c) { var p = plan(c.level); p.c.concat(p.o).forEach(function (n) { names[n] = 1; }); });
    must(await db.from('subjects').upsert(Object.keys(names).map(function (n) { return { school_id: sch.id, name: n, name_ne: NE[n] || null }; }), { onConflict: 'school_id,name' }));
    lk = await A.lookups(true);
    var id = {}; lk.subjects.forEach(function (s) { id[s.name] = s.id; });
    if (force) must(await db.from('class_subjects').delete().eq('class_id', onlyClass));
    var out = []; classes.forEach(function (c) { var p = plan(c.level);
      p.c.forEach(function (n) { out.push({ class_id: c.id, subject_id: id[n], is_compulsory: true, theory_marks: dflt(c.level, n).th, internal_marks: dflt(c.level, n).inn, credit_hours: dflt(c.level, n).ch }); });
      p.o.forEach(function (n) { out.push({ class_id: c.id, subject_id: id[n], is_compulsory: false, opt_slot: slotOf(n, c.level), theory_marks: dflt(c.level, n).th, internal_marks: dflt(c.level, n).inn, credit_hours: dflt(c.level, n).ch }); }); });
    must(await db.from('class_subjects').upsert(out, { onConflict: 'class_id,subject_id' }));
  }

  /* ----- Subjects screen: choose a class, set each subject to Not taught / Compulsory / Optional ----- */
  V.classSubjects = async function (el) {
    A.skeleton(el);
    try { await ensureDefaults(); } catch (e) { el.innerHTML = '<p class="err">' + esc(A.errText(e)) + '<br>Run 7_subjects.sql in Supabase first.</p>'; return; }
    var lk = await A.lookups(true);
    if (!lk.classes.length) { el.innerHTML = '<div class="empty">Add classes first (Menu → Import/Export, or Classes).</div>'; return; }
    el.innerHTML = '<div class="note">Pick a class. For each subject choose <b>Compulsory</b>, <b>Optional I</b>, <b>Optional II</b> or <b>Not taught</b>. Marks entry uses this list: all compulsory subjects, plus Optional I and Optional II (each student picks one subject in each). These are the usual Nepal (CDC / NEB) subjects – change anything to match your school.</div>' +
      '<select id="cs" class="search">' + lk.classes.map(function (c) { return '<option value="' + c.id + '">' + esc(A.nm(c)) + '</option>'; }).join('') + '</select><div id="cl"></div>';
    async function draw() {
      var cid = $('#cs', el).value, cs = await loadCS(), mine = {}, csm = {}; cs.filter(function (r) { return r.class_id === cid; }).forEach(function (r) { csm[r.subject_id] = r; }); cs.filter(function (r) { return r.class_id === cid; }).forEach(function (r) { mine[r.subject_id] = r.is_compulsory ? 'c' : (r.opt_slot === 2 ? 'o2' : 'o1'); });
      var subs = lk.subjects.slice().sort(function (a, b) { return (mine[b.id] ? 1 : 0) - (mine[a.id] ? 1 : 0) || (mine[a.id] === 'c' ? -1 : 0) - (mine[b.id] === 'c' ? -1 : 0); });
      $('#cl', el).innerHTML = subs.map(function (s) { var v = mine[s.id] || 'n', cl0 = lk.classes.filter(function (c) { return c.id === cid; })[0], d = dflt(cl0.level, s.name), q = csm[s.id] || {};
        function nv(x, y) { return x != null ? x : y; }
        return '<div class="card"><div class="row between"><b style="flex:1">' + esc(A.nm(s)) + '</b><select data-s="' + s.id + '" class="mini-sel"><option value="c"' + (v === 'c' ? ' selected' : '') + '>Compulsory</option><option value="o1"' + (v === 'o1' ? ' selected' : '') + '>Optional I</option><option value="o2"' + (v === 'o2' ? ' selected' : '') + '>Optional II</option><option value="n"' + (v === 'n' ? ' selected' : '') + '>Not taught</option></select><button class="btn small danger" data-ds="' + s.id + '" style="margin-left:6px"></button></div>' +
          (v === 'n' ? '' : '<div class="mrow"><label>Theory marks<input type="number" data-f="' + s.id + '" value="' + nv(q.theory_marks, d.th) + '"></label><label>Internal marks<input type="number" data-f="' + s.id + '" value="' + nv(q.internal_marks, d.inn) + '"></label><label>Credit hours<input type="number" step="0.25" data-f="' + s.id + '" value="' + nv(q.credit_hours, d.ch) + '"></label></div>') + '</div>'; }).join('') +
        '<div class="row mt"><input id="ns" class="search" placeholder="New subject name"><button class="btn small" id="nsb">＋ Add</button></div>' +
        '<button class="btn primary mt" id="cpy" style="width:100%">Copy this setup to ALL other classes</button><button class="btn mt" id="rs" style="width:100%">Reset this class to Nepal defaults</button>';
      el.querySelectorAll('[data-s]').forEach(function (sel) { sel.onchange = async function () {
        try { var sid = sel.getAttribute('data-s');
          if (sel.value === 'n') must(await db.from('class_subjects').delete().eq('class_id', cid).eq('subject_id', sid));
          else must(await db.from('class_subjects').upsert({ class_id: cid, subject_id: sid, is_compulsory: sel.value === 'c', opt_slot: sel.value === 'o2' ? 2 : (sel.value === 'o1' ? 1 : null) }, { onConflict: 'class_id,subject_id' }));
          toast('✓ ' + 'Saved'); } catch (e) { toast(A.errText(e), true); } }; });
      $('#nsb', el).onclick = async function () { var n = $('#ns', el).value.trim(); if (!n) return;
        try { var sch = await A.school(); must(await db.from('subjects').upsert({ school_id: sch.id, name: n }, { onConflict: 'school_id,name' })); lk = await A.lookups(true); draw(); } catch (e) { toast(A.errText(e), true); } };
      el.querySelectorAll('[data-f]').forEach(function (inp) { inp.onchange = async function () { try {
        var sid = inp.getAttribute('data-f'), v3 = Array.prototype.map.call(el.querySelectorAll('[data-f="' + sid + '"]'), function (x) { return +x.value || 0; });
        must(await db.from('class_subjects').update({ theory_marks: v3[0], internal_marks: v3[1], credit_hours: v3[2] }).eq('class_id', cid).eq('subject_id', sid));
        await syncExam(cid, sid, v3[0], v3[1], v3[2]); toast('✓ Saved'); } catch (e) { toast(A.errText(e), true); } }; });
      el.querySelectorAll('[data-ds]').forEach(function (b) { b.onclick = async function () { if (!confirm('Delete this subject from the whole school?')) return;
        try { must(await db.from('subjects').delete().eq('id', b.getAttribute('data-ds'))); lk = await A.lookups(true); draw(); } catch (e) { toast(A.errText(e), true); } }; });
      $('#cpy', el).onclick = async function () { if (!confirm('Copy Compulsory / Optional I / Optional II of this class to ALL other classes?')) return;
        try { var rows = (await loadCS()).filter(function (r) { return r.class_id === cid; }), others = lk.classes.filter(function (c) { return c.id !== cid; });
          must(await db.from('class_subjects').delete().in('class_id', others.map(function (c) { return c.id; }))); var out = [];
          others.forEach(function (c) { rows.forEach(function (r) { out.push({ class_id: c.id, subject_id: r.subject_id, is_compulsory: r.is_compulsory, opt_slot: r.opt_slot, theory_marks: r.theory_marks, internal_marks: r.internal_marks, credit_hours: r.credit_hours }); }); });
          must(await db.from('class_subjects').insert(out)); toast('✓ Copied to ' + others.length + ' classes'); } catch (e) { toast(A.errText(e), true); } };
      $('#rs', el).onclick = async function () { if (!confirm('Reset subjects of this class to the Nepal defaults?')) return;
        try { await ensureDefaults(cid, true); draw(); } catch (e) { toast(A.errText(e), true); } };
    }
    $('#cs', el).onchange = draw; draw();
  };

  /* ----- Marks entry: make sure exams and subject setup exist (Nepal credit hours), then open the normal screen ----- */
  var CORE5 = ['Nepali', 'English', 'Mathematics', 'Science and Technology'];
  function isMid(e) { return /mid/i.test((e.name || '') + ' ' + (e.exam_type || '')); }
  async function prepare() {
    if (state.profile.role !== 'admin') return;   // only the admin creates the marks setup
    {
      await ensureDefaults();
      var lk = await A.lookups(true), lvl = {}; lk.classes.forEach(function (c) { lvl[c.id] = c.level; });
      var sname = {}; lk.subjects.forEach(function (x) { sname[x.id] = x.name; });
      var ex = must(await db.from('exams').select('id,name,exam_type').eq('status', 'draft'));
      if (!ex.length && state.profile.role === 'admin') {
        must(await db.from('exams').insert([{ name: 'Mid Terminal Exam', exam_type: 'mid_terminal', academic_year: '2083' }, { name: 'Final Terminal Exam', exam_type: 'final_terminal', academic_year: '2083' }]));
        ex = must(await db.from('exams').select('id,name,exam_type').eq('status', 'draft'));
      }
      var cs = await loadCS();
      for (var k = 0; k < ex.length; k++) {
        var e = ex[k], mid = isMid(e), ids = Object.keys(lvl).filter(function (c) { return lvl[c] >= 4 && lvl[c] <= 10; });
        if (ids.length && state.profile.role === 'admin') {   // replace my old plain defaults (100 marks, 4 CH) when no marks exist yet
          var mc = await db.from('marks').select('id', { count: 'exact', head: true }).eq('exam_id', e.id);
          if (!mc.error && !mc.count) await db.from('exam_subjects').delete().eq('exam_id', e.id).in('class_id', ids).eq('theory_marks', 100).eq('internal_marks', 0).eq('practical_marks', 0).eq('pass_marks', 35).eq('credit_hours', 4);
        }
        var have = {}; must(await db.from('exam_subjects').select('class_id,subject_id').eq('exam_id', e.id)).forEach(function (r) { have[r.class_id + '|' + r.subject_id] = 1; });
        var add = []; cs.forEach(function (r) { if (have[r.class_id + '|' + r.subject_id]) return;
          var d = dflt(lvl[r.class_id], sname[r.subject_id]), th = r.theory_marks != null ? +r.theory_marks : d.th, inn = r.internal_marks != null ? +r.internal_marks : d.inn, ch = r.credit_hours != null ? +r.credit_hours : d.ch;
          add.push({ exam_id: e.id, class_id: r.class_id, subject_id: r.subject_id, theory_marks: mid ? th + inn : th, practical_marks: 0, internal_marks: mid ? 0 : inn, pass_marks: 0, credit_hours: mid ? ch / 2 : ch }); });
        for (var i = 0; i < add.length; i += 200) must(await db.from('exam_subjects').insert(add.slice(i, i + 200)));
      }
    }
    try { var cs0 = must(await db.from('class_subjects').select('class_id,subject_id,opt_slot').eq('is_compulsory', false).is('opt_slot', null)); if (cs0.length) { var l0 = await A.lookups(), nm0 = {}, lv0 = {}; l0.subjects.forEach(function (x) { nm0[x.id] = x.name; }); l0.classes.forEach(function (x) { lv0[x.id] = x.level; }); must(await db.from('class_subjects').upsert(cs0.map(function (r) { return { class_id: r.class_id, subject_id: r.subject_id, is_compulsory: false, opt_slot: slotOf(nm0[r.subject_id], lv0[r.class_id]) }; }), { onConflict: 'class_id,subject_id' })); } } catch (e3) {}
  }

  /* ----- Marks entry: just Exam, Class, Subject (compulsory subjects + Optional I + Optional II) ----- */
  var PRI = ['English', 'Nepali', 'Mathematics', 'Science and Technology', 'Social Studies'];
  V.marksEntry = async function (el) {
    A.skeleton(el);
    try { await prepare(); } catch (e) { toast(A.errText(e), true); }
    var lk = await A.lookups(true), admin = state.profile.role === 'admin', sub = {};
    lk.subjects.forEach(function (x) { sub[x.id] = x; });
    var exams = must(await db.from('exams').select('id,name,exam_type,status').order('created_at')).filter(function (e) { return e.status !== 'published'; });
    var mine = admin ? null : must(await db.from('teacher_assignments').select('class_id,subject_id'));
    var classes = lk.classes.filter(function (c) { return admin || mine.some(function (a) { return a.class_id === c.id; }); }).sort(function (a, b) { return a.level - b.level; });
    if (!exams.length || !classes.length) { el.innerHTML = '<div class="empty">No exam or class available yet.</div>'; return; }
    function opts(a, f) { return a.map(f).join(''); }
    el.innerHTML = '<div class="pick"><label>Exam</label><select id="mx">' + opts(exams, function (e) { return '<option value="' + e.id + '">' + esc(e.name) + '</option>'; }) + '</select>' +
      '<label>Class</label><select id="mc">' + opts(classes, function (c) { return '<option value="' + c.id + '">' + esc(A.nm(c)) + '</option>'; }) + '</select>' +
      '<label>Subject</label><select id="ms"></select></div><div id="mb"></div>';
    var box = $('#mb', el);
    function cur() { return { ex: exams.filter(function (e) { return e.id === $('#mx', el).value; })[0], cid: $('#mc', el).value, v: $('#ms', el).value }; }
    async function allowed(cid) { if (admin) return null; var m = mine.filter(function (a) { return a.class_id === cid; }); if (m.some(function (a) { return !a.subject_id; })) return null; var o = {}; m.forEach(function (a) { o[a.subject_id] = 1; }); return o; }
    async function fillSubjects() {
      var cid = $('#mc', el).value, cs = (await loadCS()).filter(function (r) { return r.class_id === cid; }), al = await allowed(cid);
      function ok(r) { return !al || al[r.subject_id]; }
      var comp = cs.filter(function (r) { return r.is_compulsory && ok(r); }).sort(function (a, b) { var x = PRI.indexOf(sub[a.subject_id].name), y = PRI.indexOf(sub[b.subject_id].name); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || (sub[a.subject_id].name < sub[b.subject_id].name ? -1 : 1); });
      var o1 = cs.filter(function (r) { return !r.is_compulsory && (r.opt_slot === 2 ? 2 : 1) === 1 && ok(r); }).length, o2 = cs.filter(function (r) { return !r.is_compulsory && r.opt_slot === 2 && ok(r); }).length;
      $('#ms', el).innerHTML = opts(comp, function (r) { return '<option value="' + r.subject_id + '">' + esc(A.nm(sub[r.subject_id])) + '</option>'; }) + (o1 ? '<option value="o1">Optional I</option>' : '') + (o2 ? '<option value="o2">Optional II</option>' : '');
      sheet();
    }
    async function students(cid) { return must(await db.from('students').select('id,full_name,roll_no').eq('class_id', cid).eq('status', 'active').order('roll_no').order('full_name')); }
    async function sheet() {
      var c = cur(), ex = c.ex, cid = c.cid, v = c.v; if (!v) { box.innerHTML = '<div class="empty">No subjects set for this class. Open Subjects and set them first.</div>'; return; }
      box.innerHTML = '<div class="empty">Loading…</div>';
      try {
        var isOpt = v === 'o1' || v === 'o2', slot = v === 'o1' ? 1 : 2, st = await students(cid), cs = (await loadCS()).filter(function (r) { return r.class_id === cid; }), al = await allowed(cid);
        var ids = isOpt ? cs.filter(function (r) { return !r.is_compulsory && (r.opt_slot === 2 ? 2 : 1) === slot && (!al || al[r.subject_id]); }).map(function (r) { return r.subject_id; }) : [v];
        var ess = must(await db.from('exam_subjects').select('*').eq('exam_id', ex.id).eq('class_id', cid).in('subject_id', ids));
        if (!ess.length && !admin) { box.innerHTML = '<div class="empty">Marks setup is not ready yet. Ask the admin to open Marks entry once.</div>'; return; }
        if (!ess.length) { must(await db.from('exam_subjects').insert(ids.map(function (i) { return { exam_id: ex.id, class_id: cid, subject_id: i, theory_marks: 100, practical_marks: 0, internal_marks: 0, pass_marks: 0, credit_hours: 4 }; }))); ess = must(await db.from('exam_subjects').select('*').eq('exam_id', ex.id).eq('class_id', cid).in('subject_id', ids)); }
        var es0 = ess[0], sid = st.map(function (x) { return x.id; }), so = {}, mk = {};
        if (isOpt && sid.length) must(await db.from('student_optionals').select('student_id,subject_id').eq('slot', slot).in('student_id', sid)).forEach(function (r) { so[r.student_id] = r.subject_id; });
        if (sid.length) must(await db.from('marks').select('*').eq('exam_id', ex.id).in('subject_id', ids).in('student_id', sid)).forEach(function (r) { mk[r.student_id] = r; });
        var P = [['theory', 'TH', +es0.theory_marks], ['practical', 'PR', +es0.practical_marks], ['internal', 'IN', +es0.internal_marks]].filter(function (p) { return p[2] > 0; }), full = P.reduce(function (a, p) { return a + p[2]; }, 0);
        var title = isOpt ? 'Optional ' + (slot === 1 ? 'I' : 'II') : A.nm(sub[v]);
        box.innerHTML = '<div class="card"><h3 style="margin:0">' + esc(title) + '</h3><div class="muted sm">' + P.map(function (p) { return p[1] + ' ' + p[2]; }).join(' + ') + ' = <b>' + full + '</b> marks &nbsp;·&nbsp; <b>' + es0.credit_hours + '</b> credit hours</div>' + (admin ? '' : '<div class="note" style="margin:8px 0 0">Saved marks are locked. Only the admin can change them.</div>') +
          '</div>' +
          (st.length ? st.map(function (s) { var m = mk[s.id] || {};
            return '<div class="mk" data-id="' + s.id + '"><div class="nm"><h4>' + (s.roll_no ? s.roll_no + '. ' : '') + esc(s.full_name) + '</h4>' +
              (isOpt ? '<select class="mini-sel" data-so="' + s.id + '"><option value="">— choose subject —</option>' + opts(ids, function (i) { return '<option value="' + i + '"' + (so[s.id] === i ? ' selected' : '') + '>' + esc(A.nm(sub[i])) + '</option>'; }) + '</select>' : '') +
              '</div><div class="in">' + opts(P, function (p) { return '<label class="mf"><small>' + p[1] + ' · ' + p[2] + '</small><input type="number" inputmode="decimal" step="0.25" min="0" max="' + p[2] + '" data-k="' + p[0] + '" value="' + (m[p[0]] == null ? '' : m[p[0]]) + '"' + (!admin && m[p[0]] != null ? ' disabled' : '') + '></label>'; }) + '<label class="ab"><input type="checkbox" data-ab' + (m.is_absent ? ' checked' : '') + (!admin && m.is_absent ? ' disabled' : '') + '><span>Absent</span></label></div></div>'; }).join('') + '<button class="btn primary" id="sv" style="margin-top:12px;width:100%">Save marks</button>' : '<div class="empty">No students in this class.</div>');
        box.querySelectorAll('select[data-so]').forEach(function (x) { x.onchange = async function () { try { var s = x.getAttribute('data-so'); if (!x.value) must(await db.from('student_optionals').delete().eq('student_id', s).eq('slot', slot)); else must(await db.from('student_optionals').upsert({ student_id: s, slot: slot, subject_id: x.value }, { onConflict: 'student_id,slot' })); toast('✓ Subject saved'); } catch (e) { toast(A.errText(e), true); } }; });
        if ($('#sv', box)) $('#sv', box).onclick = async function () {
          var rows = [], bad = 0, dels = [];
          box.querySelectorAll('.mk').forEach(function (r) { r.classList.remove('bad'); var stid = r.getAttribute('data-id'); if (!admin && mk[stid] && (mk[stid].is_absent || mk[stid].theory != null || mk[stid].practical != null || mk[stid].internal != null)) return; var ab = r.querySelector('[data-ab]').checked, subj = v, any = ab, row = { exam_id: ex.id, student_id: stid, is_absent: ab, status: admin ? 'approved' : 'submitted' };
            if (isOpt) subj = r.querySelector('[data-so]').value;
            P.forEach(function (p) { var x = r.querySelector('[data-k="' + p[0] + '"]').value; if (x !== '') { any = true; if (+x < 0 || +x > p[2]) { bad++; r.classList.add('bad'); } row[p[0]] = +x; } else row[p[0]] = null; });
            if (!any) return; if (!subj) { bad++; r.classList.add('bad'); return; }
            row.subject_id = subj; rows.push(row); if (mk[stid] && mk[stid].subject_id !== subj) dels.push(stid); });
          if (bad) return toast('Check the red rows: marks above full marks, or optional subject not chosen', true);
          if (!rows.length) return toast('Type some marks first', true);
          try { for (var i = 0; i < dels.length; i++) await db.from('marks').delete().eq('exam_id', ex.id).eq('student_id', dels[i]).in('subject_id', ids);
            for (var j = 0; j < rows.length; j += 100) must(await db.from('marks').upsert(rows.slice(j, j + 100), { onConflict: 'exam_id,student_id,subject_id' })); toast('✓ Saved ' + rows.length + ' students'); sheet(); } catch (e) { toast(A.errText(e), true); }
        };
      } catch (e) { box.innerHTML = '<p class="err">' + esc(A.errText(e)) + '</p>'; }
    }
    $('#mx', el).onchange = sheet; $('#ms', el).onchange = sheet; $('#mc', el).onchange = fillSubjects; fillSubjects();
  };
})();
