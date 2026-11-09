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
  async function loadCS() { return must(await db.from('class_subjects').select('class_id,subject_id,is_compulsory,opt_slot')); }

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
      p.c.forEach(function (n) { out.push({ class_id: c.id, subject_id: id[n], is_compulsory: true }); });
      p.o.forEach(function (n) { out.push({ class_id: c.id, subject_id: id[n], is_compulsory: false, opt_slot: slotOf(n, c.level) }); }); });
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
      var cid = $('#cs', el).value, cs = await loadCS(), mine = {}; cs.filter(function (r) { return r.class_id === cid; }).forEach(function (r) { mine[r.subject_id] = r.is_compulsory ? 'c' : (r.opt_slot === 2 ? 'o2' : 'o1'); });
      var subs = lk.subjects.slice().sort(function (a, b) { return (mine[b.id] ? 1 : 0) - (mine[a.id] ? 1 : 0) || (mine[a.id] === 'c' ? -1 : 0) - (mine[b.id] === 'c' ? -1 : 0); });
      $('#cl', el).innerHTML = subs.map(function (s) { var v = mine[s.id] || 'n';
        return '<div class="card row between"><b>' + esc(A.nm(s)) + '</b><select data-s="' + s.id + '" class="mini-sel"><option value="c"' + (v === 'c' ? ' selected' : '') + '>Compulsory</option><option value="o1"' + (v === 'o1' ? ' selected' : '') + '>Optional I</option><option value="o2"' + (v === 'o2' ? ' selected' : '') + '>Optional II</option><option value="n"' + (v === 'n' ? ' selected' : '') + '>Not taught</option></select></div>'; }).join('') +
        '<div class="row mt"><input id="ns" class="search" placeholder="New subject name"><button class="btn small" id="nsb">＋ Add</button></div>' +
        '<button class="btn mt" id="rs">↺ Reset this class to Nepal defaults</button>';
      el.querySelectorAll('[data-s]').forEach(function (sel) { sel.onchange = async function () {
        try { var sid = sel.getAttribute('data-s');
          if (sel.value === 'n') must(await db.from('class_subjects').delete().eq('class_id', cid).eq('subject_id', sid));
          else must(await db.from('class_subjects').upsert({ class_id: cid, subject_id: sid, is_compulsory: sel.value === 'c', opt_slot: sel.value === 'o2' ? 2 : (sel.value === 'o1' ? 1 : null) }, { onConflict: 'class_id,subject_id' }));
          toast('✓ ' + 'Saved'); } catch (e) { toast(A.errText(e), true); } }; });
      $('#nsb', el).onclick = async function () { var n = $('#ns', el).value.trim(); if (!n) return;
        try { var sch = await A.school(); must(await db.from('subjects').upsert({ school_id: sch.id, name: n }, { onConflict: 'school_id,name' })); lk = await A.lookups(true); draw(); } catch (e) { toast(A.errText(e), true); } };
      $('#rs', el).onclick = async function () { if (!confirm('Reset subjects of this class to the Nepal defaults?')) return;
        try { await ensureDefaults(cid, true); draw(); } catch (e) { toast(A.errText(e), true); } };
    }
    $('#cs', el).onchange = draw; draw();
  };

  /* ----- Marks entry: make sure exams and subject setup exist (Nepal credit hours), then open the normal screen ----- */
  var CORE5 = ['Nepali', 'English', 'Mathematics', 'Science and Technology'];
  function isMid(e) { return /mid/i.test((e.name || '') + ' ' + (e.exam_type || '')); }
  async function prepare() {
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
          var l = lvl[r.class_id], band = l >= 4 && l <= 10, n = sname[r.subject_id], cr = band ? (CORE5.indexOf(n) >= 0 ? 5 : 4) : 4, comp = band && !mid;
          add.push({ exam_id: e.id, class_id: r.class_id, subject_id: r.subject_id, theory_marks: comp ? 75 : 100, practical_marks: 0, internal_marks: comp ? 25 : 0, pass_marks: 0, credit_hours: mid ? cr / 2 : cr }); });
        for (var i = 0; i < add.length; i += 200) must(await db.from('exam_subjects').insert(add.slice(i, i + 200)));
      }
    }
    try { var cs0 = must(await db.from('class_subjects').select('class_id,subject_id,opt_slot').eq('is_compulsory', false).is('opt_slot', null)); if (cs0.length) { var l0 = await A.lookups(), nm0 = {}, lv0 = {}; l0.subjects.forEach(function (x) { nm0[x.id] = x.name; }); l0.classes.forEach(function (x) { lv0[x.id] = x.level; }); must(await db.from('class_subjects').upsert(cs0.map(function (r) { return { class_id: r.class_id, subject_id: r.subject_id, is_compulsory: false, opt_slot: slotOf(nm0[r.subject_id], lv0[r.class_id]) }; }), { onConflict: 'class_id,subject_id' })); } } catch (e3) {}
  }

  /* ----- Marks entry screen: compulsory subjects + Optional I / Optional II ----- */
  V.marksEntry = async function (el) {
    A.skeleton(el);
    try { await prepare(); } catch (e) { toast(A.errText(e), true); }
    var lk = await A.lookups(true), admin = state.profile.role === 'admin', sub = {};
    lk.subjects.forEach(function (x) { sub[x.id] = x; });
    var exams = must(await db.from('exams').select('id,name,exam_type,status').order('created_at')).filter(function (e) { return e.status !== 'published'; });
    var mine = admin ? null : must(await db.from('teacher_assignments').select('class_id,subject_id'));
    var classes = lk.classes.filter(function (c) { return admin || mine.some(function (a) { return a.class_id === c.id; }); }).sort(function (a, b) { return a.level - b.level; });
    if (!exams.length || !classes.length) { el.innerHTML = '<div class="empty">No exam or class available yet.</div>'; return; }
    el.innerHTML = '<div class="note"><b>1</b> Choose exam &amp; class &nbsp;·&nbsp; <b>2</b> Tap a subject &nbsp;·&nbsp; <b>3</b> Type marks and press Save</div>' +
      '<div class="row"><select id="mx" class="search">' + exams.map(function (e) { return '<option value="' + e.id + '">' + esc(e.name) + '</option>'; }).join('') + '</select><select id="mc" class="search">' + classes.map(function (c) { return '<option value="' + c.id + '">' + esc(A.nm(c)) + '</option>'; }).join('') + '</select></div><div id="mb"></div>';
    var box = $('#mb', el);
    async function home() {
      var ex = exams.filter(function (e) { return e.id === $('#mx', el).value; })[0], cid = $('#mc', el).value;
      var cs = (await loadCS()).filter(function (r) { return r.class_id === cid; }), allow = null;
      if (!admin) { var m = mine.filter(function (a) { return a.class_id === cid; }); if (!m.some(function (a) { return !a.subject_id; })) { allow = {}; m.forEach(function (a) { allow[a.subject_id] = 1; }); } }
      function ok(r) { return !allow || allow[r.subject_id]; }
      var comp = cs.filter(function (r) { return r.is_compulsory && ok(r); }), o = { 1: [], 2: [] };
      cs.filter(function (r) { return !r.is_compulsory && ok(r); }).forEach(function (r) { o[r.opt_slot === 2 ? 2 : 1].push(r); });
      var hint = [''];
      box.innerHTML = '<h4 class="sec">Compulsory subjects (' + comp.length + ')</h4><div class="subgrid">' + comp.map(function (r) { return '<button class="subbtn" data-s="' + r.subject_id + '"><span>' + esc(A.nm(sub[r.subject_id])) + '</span></button>'; }).join('') + '</div>' +
        '<h4 class="sec">Optional subjects</h4><div class="subgrid">' + [1, 2].filter(function (n) { return o[n].length; }).map(function (n) { return '<button class="subbtn opt" data-o="' + n + '"><span>Optional ' + (n === 1 ? 'I' : 'II') + '</span><small>' + o[n].length + ' choice(s)</small></button>'; }).join('') + '</div>' +
        (admin ? '<button class="btn" id="asg" style="margin-top:14px">👥 Choose each student’s Optional I / II subject</button>' : '');
      box.querySelectorAll('[data-s]').forEach(function (b) { b.onclick = function () { sheet(ex, cid, b.getAttribute('data-s'), null); }; });
      box.querySelectorAll('[data-o]').forEach(function (b) { b.onclick = function () { pick(ex, cid, +b.getAttribute('data-o'), o[+b.getAttribute('data-o')]); }; });
      if ($('#asg', box)) $('#asg', box).onclick = function () { assign(cid, o); };
    }
    async function students(cid) { return must(await db.from('students').select('id,full_name,roll_no').eq('class_id', cid).eq('status', 'active').order('roll_no').order('full_name')); }
    async function pick(ex, cid, slot, opts) {
      var st = await students(cid), so = st.length ? must(await db.from('student_optionals').select('student_id,slot,subject_id').eq('slot', slot).in('student_id', st.map(function (x) { return x.id; }))) : [], cnt = {};
      so.forEach(function (r) { cnt[r.subject_id] = (cnt[r.subject_id] || 0) + 1; });
      box.innerHTML = '<button class="btn small" id="bk">← Back</button><h4 class="sec">Optional ' + (slot === 1 ? 'I' : 'II') + ' – choose the subject</h4><div class="subgrid">' + opts.map(function (r) { return '<button class="subbtn opt" data-s="' + r.subject_id + '"><span>' + esc(A.nm(sub[r.subject_id])) + '</span><small>' + (cnt[r.subject_id] || 0) + ' students</small></button>'; }).join('') + '</div>';
      $('#bk', box).onclick = home; box.querySelectorAll('[data-s]').forEach(function (b) { b.onclick = function () { sheet(ex, cid, b.getAttribute('data-s'), slot); }; });
    }
    async function assign(cid, o) {
      var st = await students(cid), so = st.length ? must(await db.from('student_optionals').select('student_id,slot,subject_id').in('student_id', st.map(function (x) { return x.id; }))) : [], cur = {};
      so.forEach(function (r) { cur[r.student_id + '|' + r.slot] = r.subject_id; });
      function sel(n, sid) { return '<select class="mini-sel" data-st="' + sid + '" data-sl="' + n + '"><option value="">Optional ' + (n === 1 ? 'I' : 'II') + ': —</option>' + o[n].map(function (r) { return '<option value="' + r.subject_id + '"' + (cur[sid + '|' + n] === r.subject_id ? ' selected' : '') + '>' + esc(A.nm(sub[r.subject_id])) + '</option>'; }).join('') + '</select>'; }
      box.innerHTML = '<button class="btn small" id="bk">← Back</button><div class="note">Choose the Optional I and Optional II subject of every student. It saves automatically.</div>' + st.map(function (s) { return '<div class="card"><b>' + (s.roll_no ? s.roll_no + '. ' : '') + esc(s.full_name) + '</b><div class="row" style="margin-top:8px">' + sel(1, s.id) + sel(2, s.id) + '</div></div>'; }).join('');
      $('#bk', box).onclick = home;
      box.querySelectorAll('select[data-st]').forEach(function (x) { x.onchange = async function () {
        try { var q = db.from('student_optionals'), sid = x.getAttribute('data-st'), sl = +x.getAttribute('data-sl');
          if (!x.value) must(await q.delete().eq('student_id', sid).eq('slot', sl)); else must(await q.upsert({ student_id: sid, slot: sl, subject_id: x.value }, { onConflict: 'student_id,slot' })); toast('✓ Saved'); } catch (e) { toast(A.errText(e), true); } }; });
    }
    async function sheet(ex, cid, sid, slot) {
      var st = await students(cid);
      if (slot) { var so = st.length ? must(await db.from('student_optionals').select('student_id').eq('slot', slot).eq('subject_id', sid).in('student_id', st.map(function (x) { return x.id; }))) : [], got = {}; so.forEach(function (r) { got[r.student_id] = 1; }); st = st.filter(function (x) { return got[x.id]; }); }
      var es = must(await db.from('exam_subjects').select('*').eq('exam_id', ex.id).eq('class_id', cid).eq('subject_id', sid))[0];
      if (!es) { must(await db.from('exam_subjects').insert({ exam_id: ex.id, class_id: cid, subject_id: sid, theory_marks: 100, practical_marks: 0, internal_marks: 0, pass_marks: 0, credit_hours: 4 })); es = must(await db.from('exam_subjects').select('*').eq('exam_id', ex.id).eq('class_id', cid).eq('subject_id', sid))[0]; }
      var mk = {}; if (st.length) must(await db.from('marks').select('*').eq('exam_id', ex.id).eq('subject_id', sid).in('student_id', st.map(function (x) { return x.id; }))).forEach(function (r) { mk[r.student_id] = r; });
      var P = [['theory', 'TH', +es.theory_marks], ['practical', 'PR', +es.practical_marks], ['internal', 'IN', +es.internal_marks]].filter(function (p) { return p[2] > 0; });
      var full = P.reduce(function (a, p) { return a + p[2]; }, 0);
      box.innerHTML = '<button class="btn small" id="bk">← Back</button><div class="card"><h3 style="margin:0">' + esc(A.nm(sub[sid])) + (slot ? ' <span class="chip">Optional ' + (slot === 1 ? 'I' : 'II') + '</span>' : '') + '</h3><div class="muted sm">' + P.map(function (p) { return p[1] + ' ' + p[2]; }).join(' + ') + ' = ' + full + ' marks &nbsp;·&nbsp; ' + es.credit_hours + ' credit hours</div>' +
        (admin ? '<details style="margin-top:8px"><summary>⚙ Change full marks / credit hours</summary><div class="row" style="margin-top:8px"><input id="eth" type="number" class="search" placeholder="Theory" value="' + es.theory_marks + '"><input id="ein" type="number" class="search" placeholder="Internal" value="' + es.internal_marks + '"><input id="ech" type="number" step="0.25" class="search" placeholder="Credit hours" value="' + es.credit_hours + '"><button class="btn small" id="esv">Update</button></div></details>' : '') + '</div>' +
        (st.length ? st.map(function (s) { var m = mk[s.id] || {};
          return '<div class="mk" data-id="' + s.id + '"><div class="nm"><h4>' + (s.roll_no ? s.roll_no + '. ' : '') + esc(s.full_name) + '</h4></div><div class="in">' + P.map(function (p) { return '<input type="number" inputmode="decimal" step="0.25" min="0" max="' + p[2] + '" data-k="' + p[0] + '" placeholder="' + p[1] + '/' + p[2] + '" value="' + (m[p[0]] == null ? '' : m[p[0]]) + '">'; }).join('') + '<label class="ab"><input type="checkbox" data-ab' + (m.is_absent ? ' checked' : '') + '> Ab</label></div></div>'; }).join('') + '<button class="btn primary" id="sv" style="margin-top:12px;width:100%">💾 Save marks</button>'
          : '<div class="empty">' + (slot ? 'No student has this optional subject yet. Go back and use “Choose each student’s Optional I / II subject”.' : 'No students in this class.') + '</div>');
      $('#bk', box).onclick = function () { slot ? pick(ex, cid, slot, null) : home(); };
      if (slot) $('#bk', box).onclick = home;
      if ($('#esv', box)) $('#esv', box).onclick = async function () { try { must(await db.from('exam_subjects').update({ theory_marks: +$('#eth', box).value || 0, internal_marks: +$('#ein', box).value || 0, credit_hours: +$('#ech', box).value || 0 }).eq('id', es.id)); toast('✓ Updated'); sheet(ex, cid, sid, slot); } catch (e) { toast(A.errText(e), true); } };
      if ($('#sv', box)) $('#sv', box).onclick = async function () {
        var rows = [], bad = 0;
        box.querySelectorAll('.mk').forEach(function (r) { r.classList.remove('bad'); var ab = r.querySelector('[data-ab]').checked, row = { exam_id: ex.id, student_id: r.getAttribute('data-id'), subject_id: sid, is_absent: ab }, any = ab;
          P.forEach(function (p) { var v = r.querySelector('[data-k="' + p[0] + '"]').value; if (v !== '') { any = true; if (+v < 0 || +v > p[2]) { bad++; r.classList.add('bad'); } row[p[0]] = +v; } else row[p[0]] = null; });
          if (any) rows.push(row); });
        if (bad) return toast('Some marks are above the full marks', true);
        if (!rows.length) return toast('Type some marks first', true);
        try { for (var i = 0; i < rows.length; i += 100) must(await db.from('marks').upsert(rows.slice(i, i + 100), { onConflict: 'exam_id,student_id,subject_id' })); toast('✓ Saved ' + rows.length + ' students'); } catch (e) { toast(A.errText(e), true); }
      };
    }
    $('#mx', el).onchange = home; $('#mc', el).onchange = home; home();
  };
})();
