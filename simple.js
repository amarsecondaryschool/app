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
  function plan(l) {
    if (l <= 3) return { c: ['Nepali', 'English', 'Mathematics', 'Our Surroundings'], o: l ? ['Local Subject'] : [] };
    if (l <= 5) return { c: CORE6, o: ['Local Subject'] };
    if (l <= 8) return { c: CORE6, o: ['Computer Science', 'Local Subject'] };
    if (l <= 10) return { c: ['Nepali', 'English', 'Mathematics', 'Science and Technology', 'Social Studies'], o: ['Optional Mathematics', 'Computer Science', 'Accountancy', 'Economics', 'Population and Environment Education'] };
    return { c: ['Nepali', 'English', 'Social Studies and Life Skills'], o: ['Physics', 'Chemistry', 'Biology', 'Mathematics', 'Computer Science', 'Accountancy', 'Business Studies', 'Economics', 'Business Mathematics', 'Marketing', 'Sociology'] };
  }
  async function loadCS() { return must(await db.from('class_subjects').select('class_id,subject_id,is_compulsory')); }

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
      p.o.forEach(function (n) { out.push({ class_id: c.id, subject_id: id[n], is_compulsory: false }); }); });
    must(await db.from('class_subjects').upsert(out, { onConflict: 'class_id,subject_id' }));
  }

  /* ----- Subjects screen: choose a class, set each subject to Not taught / Compulsory / Optional ----- */
  V.classSubjects = async function (el) {
    A.skeleton(el);
    try { await ensureDefaults(); } catch (e) { el.innerHTML = '<p class="err">' + esc(A.errText(e)) + '<br>Run 7_subjects.sql in Supabase first.</p>'; return; }
    var lk = await A.lookups(true);
    if (!lk.classes.length) { el.innerHTML = '<div class="empty">Add classes first (Menu → Import/Export, or Classes).</div>'; return; }
    el.innerHTML = '<div class="note">Pick a class. For each subject choose <b>Compulsory</b>, <b>Optional</b> or <b>Not taught</b>. Marks entry uses this list. These are the usual Nepal (CDC / NEB) subjects – change anything to match your school.</div>' +
      '<select id="cs" class="search">' + lk.classes.map(function (c) { return '<option value="' + c.id + '">' + esc(A.nm(c)) + '</option>'; }).join('') + '</select><div id="cl"></div>';
    async function draw() {
      var cid = $('#cs', el).value, cs = await loadCS(), mine = {}; cs.filter(function (r) { return r.class_id === cid; }).forEach(function (r) { mine[r.subject_id] = r.is_compulsory ? 'c' : 'o'; });
      var subs = lk.subjects.slice().sort(function (a, b) { return (mine[b.id] ? 1 : 0) - (mine[a.id] ? 1 : 0) || (mine[a.id] === 'c' ? -1 : 0) - (mine[b.id] === 'c' ? -1 : 0); });
      $('#cl', el).innerHTML = subs.map(function (s) { var v = mine[s.id] || 'n';
        return '<div class="card row between"><b>' + esc(A.nm(s)) + '</b><select data-s="' + s.id + '" class="mini-sel"><option value="c"' + (v === 'c' ? ' selected' : '') + '>Compulsory</option><option value="o"' + (v === 'o' ? ' selected' : '') + '>Optional</option><option value="n"' + (v === 'n' ? ' selected' : '') + '>Not taught</option></select></div>'; }).join('') +
        '<div class="row mt"><input id="ns" class="search" placeholder="New subject name"><button class="btn small" id="nsb">＋ Add</button></div>' +
        '<button class="btn mt" id="rs">↺ Reset this class to Nepal defaults</button>';
      el.querySelectorAll('[data-s]').forEach(function (sel) { sel.onchange = async function () {
        try { var sid = sel.getAttribute('data-s');
          if (sel.value === 'n') must(await db.from('class_subjects').delete().eq('class_id', cid).eq('subject_id', sid));
          else must(await db.from('class_subjects').upsert({ class_id: cid, subject_id: sid, is_compulsory: sel.value === 'c' }, { onConflict: 'class_id,subject_id' }));
          toast('✓ ' + 'Saved'); } catch (e) { toast(A.errText(e), true); } }; });
      $('#nsb', el).onclick = async function () { var n = $('#ns', el).value.trim(); if (!n) return;
        try { var sch = await A.school(); must(await db.from('subjects').upsert({ school_id: sch.id, name: n }, { onConflict: 'school_id,name' })); lk = await A.lookups(true); draw(); } catch (e) { toast(A.errText(e), true); } };
      $('#rs', el).onclick = async function () { if (!confirm('Reset subjects of this class to the Nepal defaults?')) return;
        try { await ensureDefaults(cid, true); draw(); } catch (e) { toast(A.errText(e), true); } };
    }
    $('#cs', el).onchange = draw; draw();
  };

  /* ----- Marks entry: make sure an exam and the subject setup exist, then open the normal screen ----- */
  var origMarks = V.marksEntry;
  V.marksEntry = async function (el) {
    A.skeleton(el);
    try {
      await ensureDefaults();
      var ex = must(await db.from('exams').select('id').eq('status', 'draft'));
      if (!ex.length && state.profile.role === 'admin') {
        must(await db.from('exams').insert({ name: 'First Terminal Exam', exam_type: 'first_terminal', academic_year: '2083' }));
        ex = must(await db.from('exams').select('id').eq('status', 'draft'));
      }
      if (ex.length) {
        var cs = await loadCS(), ids = ex.map(function (x) { return x.id; }), have = {};
        must(await db.from('exam_subjects').select('exam_id,class_id,subject_id').in('exam_id', ids)).forEach(function (r) { have[r.exam_id + '|' + r.class_id + '|' + r.subject_id] = 1; });
        var add = []; ids.forEach(function (e) { cs.forEach(function (r) { if (!have[e + '|' + r.class_id + '|' + r.subject_id]) add.push({ exam_id: e, class_id: r.class_id, subject_id: r.subject_id, theory_marks: 100, practical_marks: 0, internal_marks: 0, pass_marks: 35, credit_hours: 4 }); }); });
        for (var i = 0; i < add.length; i += 200) must(await db.from('exam_subjects').insert(add.slice(i, i + 200)));
      }
    } catch (e) { toast(A.errText(e), true); }
    return origMarks(el);
  };
})();
