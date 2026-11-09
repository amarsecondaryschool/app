/* Exams, marks entry, grading rules, grade sheets, report cards, reports, results, ID card. */
(function () {
  'use strict';
  var A = window.AMAR, t = A.t, esc = A.esc, db = A.db, $ = A.$, must = A.must, toast = A.toast, state = A.state, V = A.views, G = window.AmarGrading;

  A.saFns = A.saFns || [];
  A.studentActions = function (r, ro) { var o = []; A.saFns.forEach(function (f) { o = o.concat(f(r, ro) || []); }); return o; };

  async function getRules() { return must(await db.from('grading_rules').select('*').eq('is_active', true)); }
  async function ruleFor(level, year) { var r = G.pickRule(await getRules(), level, year); if (!r) throw new Error(t('err_no_rule')); return r; }
  function fmt(n) { return n === null || n === undefined ? '–' : String(Math.round(n * 100) / 100); }
  function yesno(v) { return v ? t('yes') : t('no'); }

  /* =========================================================  EXAMS (admin) */
  V.exams = async function (el) {
    A.skeleton(el);
    async function draw() {
      var rows = must(await db.from('exams').select('*').order('created_at', { ascending: false }));
      el.innerHTML = '<button class="btn primary mb" id="xadd">＋ ' + esc(t('add_exam')) + '</button>' + (rows.length ? rows.map(function (x) {
        return '<div class="card tap" data-id="' + x.id + '"><div class="row between"><h4>' + esc(A.nm(x)) + '</h4><span class="chip ' + (x.status === 'published' ? 'ok' : 'warn') + '">' + esc(t('ex_' + x.status)) + '</span></div>' +
          '<div class="muted xs">' + esc(t('et_' + x.exam_type)) + (x.academic_year ? ' · ' + esc(x.academic_year) : '') + (x.start_date ? ' · ' + esc(A.fmtDate(x.start_date)) : '') + '</div>' +
          (x.is_locked ? '<span class="chip bad">🔒 ' + esc(t('locked')) + '</span>' : '') + '</div>';
      }).join('') : A.emptyMsg());
      $('#xadd', el).onclick = function () { examForm(null, draw); };
      el.querySelectorAll('.card.tap').forEach(function (c) {
        c.onclick = function () {
          var x = rows.filter(function (r) { return r.id === c.getAttribute('data-id'); })[0];
          A.sheet(A.nm(x), [
            { icon: '📚', label: t('exam_subjects'), fn: function () { A.push({ title: function () { return A.nm(x); }, render: function (e) { return setup(e, x); } }); } },
            { icon: '✏️', label: t('edit'), fn: function () { examForm(x, draw); } },
            { icon: x.is_locked ? '🔓' : '🔒', label: t(x.is_locked ? 'unlock' : 'lock'), fn: async function () { try { must(await db.from('exams').update({ is_locked: !x.is_locked }).eq('id', x.id)); draw(); } catch (e) { toast(A.errText(e), true); } } },
            { icon: x.status === 'published' ? '↩️' : '📣', label: t(x.status === 'published' ? 'unpublish' : 'publish_exam'), fn: async function () {
              if (!confirm(t('confirm_action'))) return;
              try { must(await db.from('exams').update({ status: x.status === 'published' ? 'draft' : 'published' }).eq('id', x.id)); draw(); } catch (e) { toast(A.errText(e), true); } } },
            { icon: '🗑️', label: t('delete'), fn: async function () { if (!confirm(t('confirm_delete'))) return; try { must(await db.from('exams').delete().eq('id', x.id)); draw(); } catch (e) { toast(A.errText(e), true); } } }]);
        };
      });
    }
    await draw();
  };
  function examForm(x, after) {
    A.push({ title: function () { return t(x ? 'edit' : 'add_exam'); }, render: function (e) {
      A.mountForm(e, { fields: [{ name: 'name', label: 'name', required: true }, { name: 'name_ne', label: 'name_ne' },
        { name: 'exam_type', label: 'exam_type', type: 'select', required: true, options: ['first_terminal', 'second_terminal', 'third_terminal', 'mid_term', 'final', 'practical', 'internal', 'custom'].map(function (k) { return { value: k, label: t('et_' + k) }; }) },
        { name: 'academic_year', label: 'academic_year', hint: 'year_hint' }, { name: 'start_date', label: 'start_date', type: 'date' }, { name: 'end_date', label: 'end_date', type: 'date' }],
        values: x || { exam_type: 'first_terminal' }, onSubmit: async function (v) {
          if (v.start_date && v.end_date && v.end_date < v.start_date) throw new Error(t('err_dates'));
          if (x) must(await db.from('exams').update(v).eq('id', x.id)); else must(await db.from('exams').insert(v));
          toast(t('saved')); A.pop(); after();
        } });
    } });
  }
  async function setup(el, exam) {
    var lk = await A.lookups(); A.skeleton(el);
    var classId = lk.classes.length ? lk.classes[0].id : null;
    if (!classId) { el.innerHTML = A.emptyMsg('no_classes_assigned'); return; }
    el.innerHTML = '<select id="sc" class="search">' + lk.classes.map(function (c) { return '<option value="' + c.id + '">' + esc(A.nm(c)) + '</option>'; }).join('') + '</select><div id="sb"></div>';
    async function draw() {
      classId = $('#sc', el).value;
      var rows = must(await db.from('exam_subjects').select('*').eq('exam_id', exam.id).eq('class_id', classId));
      var have = {}; rows.forEach(function (r) { have[r.subject_id] = 1; });
      var missing = lk.subjects.filter(function (s) { return !have[s.id]; });
      $('#sb', el).innerHTML = '<div class="row mb">' + (missing.length ? '<button class="btn small" id="sall">＋ ' + esc(t('add_all_subjects')) + ' (' + missing.length + ')</button>' : '') + '<button class="btn small ghost" id="scopy">⧉ ' + esc(t('copy_to_classes')) + '</button></div>' +
        (rows.length ? rows.map(function (r) {
          return '<div class="card tap" data-id="' + r.id + '"><div class="row between"><h4>' + esc(lk.sub[r.subject_id] ? A.nm(lk.sub[r.subject_id]) : '?') + '</h4><b>' + fmt(r.full_marks) + '</b></div><div class="muted xs">' +
            esc(t('theory')) + ' ' + fmt(r.theory_marks) + ' · ' + esc(t('practical')) + ' ' + fmt(r.practical_marks) + ' · ' + esc(t('internal')) + ' ' + fmt(r.internal_marks) + ' · ' + esc(t('credit_hours')) + ' ' + fmt(r.credit_hours) + (r.exam_date ? ' · ' + esc(r.exam_date) : '') + '</div></div>';
        }).join('') : A.emptyMsg());
      var sa = $('#sall', el); if (sa) sa.onclick = async function () {
        try { must(await db.from('exam_subjects').insert(missing.map(function (s) { return { exam_id: exam.id, class_id: classId, subject_id: s.id, theory_marks: 100, practical_marks: 0, internal_marks: 0, pass_marks: 35, credit_hours: 4 }; }))); draw(); } catch (e) { toast(A.errText(e), true); }
      };
      $('#scopy', el).onclick = async function () {
        if (!rows.length) return toast(t('nothing_to_save'), true);
        if (!confirm(t('confirm_action'))) return;
        try {
          var out = []; lk.classes.forEach(function (c) { if (c.id === classId) return; rows.forEach(function (r) { out.push({ exam_id: exam.id, class_id: c.id, subject_id: r.subject_id, theory_marks: r.theory_marks, practical_marks: r.practical_marks, internal_marks: r.internal_marks, pass_marks: r.pass_marks, credit_hours: r.credit_hours, exam_date: null }); }); });
          must(await db.from('exam_subjects').upsert(out, { onConflict: 'exam_id,class_id,subject_id', ignoreDuplicates: true })); toast(t('saved'));
        } catch (e) { toast(A.errText(e), true); }
      };
      el.querySelectorAll('#sb .card.tap').forEach(function (c) {
        c.onclick = function () {
          var r = rows.filter(function (x) { return x.id === c.getAttribute('data-id'); })[0];
          A.push({ title: function () { return t('exam_subjects'); }, render: function (e) {
            A.mountForm(e, { fields: [{ name: 'theory_marks', label: 'theory', type: 'number', required: true }, { name: 'practical_marks', label: 'practical', type: 'number' }, { name: 'internal_marks', label: 'internal', type: 'number' },
              { name: 'pass_marks', label: 'pass_marks', type: 'number', step: 'any' }, { name: 'credit_hours', label: 'credit_hours', type: 'number', step: 'any', required: true }, { name: 'exam_date', label: 'exam_date', type: 'date' }, { name: 'start_time', label: 'start_time', type: 'time' }],
              values: { theory_marks: r.theory_marks, practical_marks: r.practical_marks, internal_marks: r.internal_marks, pass_marks: r.pass_marks, credit_hours: r.credit_hours, exam_date: r.exam_date, start_time: (r.start_time || '').slice(0, 5) },
              onSubmit: async function (v) {
                var rec = { theory_marks: v.theory_marks || 0, practical_marks: v.practical_marks || 0, internal_marks: v.internal_marks || 0, pass_marks: v.pass_marks || 0, credit_hours: v.credit_hours, exam_date: v.exam_date, start_time: v.start_time };
                must(await db.from('exam_subjects').update(rec).eq('id', r.id)); toast(t('saved')); A.pop();
              } });
          } });
        };
      });
    }
    $('#sc', el).onchange = draw; await draw();
  }

  /* =========================================================  MARKS ENTRY */
  V.marksEntry = async function (el) {
    var role = state.profile.role, lk = await A.lookups(); A.skeleton(el);
    var exams = must(await db.from('exams').select('*').eq('status', 'draft').order('created_at', { ascending: false }));
    var choices = await A.classChoices();
    if (!exams.length) { el.innerHTML = A.emptyMsg('no_open_exams'); return; }
    if (!choices.length) { el.innerHTML = A.emptyMsg('no_classes_assigned'); return; }
    el.innerHTML = '<div class="filters"><select id="me" class="search">' + exams.map(function (x) { return '<option value="' + x.id + '">' + esc(A.nm(x)) + '</option>'; }).join('') + '</select>' +
      A.choiceSelect('mc', choices, A.ck(choices[0])) + '<select id="ms" class="search"></select></div><div id="mg"></div>';
    var subjRows = [];
    async function loadSubjects() {
      var ch = A.choiceOf(choices, $('#mc', el).value), ex = $('#me', el).value;
      subjRows = must(await db.from('exam_subjects').select('*').eq('exam_id', ex).eq('class_id', ch.class_id));
      var allowed = subjRows;
      if (role === 'teacher') { var mine = await A.teacherSubjectsFor(ch.class_id), ids = {}; mine.forEach(function (s) { ids[s.id] = 1; }); allowed = subjRows.filter(function (r) { return ids[r.subject_id]; }); }
      var ms = $('#ms', el);
      ms.innerHTML = allowed.map(function (r) { return '<option value="' + r.subject_id + '">' + esc(lk.sub[r.subject_id] ? A.nm(lk.sub[r.subject_id]) : '?') + '</option>'; }).join('');
      if (!allowed.length) { $('#mg', el).innerHTML = A.emptyMsg('no_subjects_setup'); return; }
      await loadGrid();
    }
    async function loadGrid() {
      var ch = A.choiceOf(choices, $('#mc', el).value), ex = exams.filter(function (x) { return x.id === $('#me', el).value; })[0], sid = $('#ms', el).value, box = $('#mg', el);
      if (!sid) return; A.skeleton(box);
      var es = subjRows.filter(function (r) { return r.subject_id === sid; })[0];
      var studs = await A.studentsOf(ch), rule = await ruleFor(lk.cls[ch.class_id].level, ex.academic_year);
      var ms = studs.length ? must(await db.from('marks').select('*').eq('exam_id', ex.id).eq('subject_id', sid).in('student_id', studs.map(function (s) { return s.id; }))) : [];
      var by = {}; ms.forEach(function (m) { by[m.student_id] = m; });
      var comps = ['theory', 'practical', 'internal'].filter(function (c) { return Number(es[c + '_marks']) > 0; });
      var locked = ex.is_locked;
      box.innerHTML = (locked ? '<div class="note">🔒 ' + esc(t('exam_locked_msg')) + '</div>' : '') + (rule.verified ? '' : '<div class="note">' + esc(t('rule_unverified')) + '</div>') +
        '<div class="muted sm mb">' + esc(t('full_marks')) + ': <b>' + fmt(es.full_marks) + '</b> · ' + comps.map(function (c) { return esc(t(c)) + ' ' + fmt(es[c + '_marks']); }).join(' · ') + '</div>' +
        studs.map(function (s) {
          var m = by[s.id] || {};
          return '<div class="mk" data-id="' + s.id + '"><div class="nm"><h4>' + (s.roll_no ? s.roll_no + '. ' : '') + esc(s.full_name) + '</h4><span class="gr muted xs"></span>' + (m.status ? ' <span class="chip ' + (m.status === 'approved' ? 'ok' : m.status === 'submitted' ? 'info' : '') + '">' + esc(t('mk_' + m.status)) + '</span>' : '') + '</div><div class="in">' +
            comps.map(function (c) { return '<input type="number" inputmode="decimal" step="any" min="0" max="' + es[c + '_marks'] + '" data-c="' + c + '" placeholder="' + esc(t(c)).slice(0, 3) + '" value="' + (m[c] === null || m[c] === undefined ? '' : m[c]) + '"' + (locked || m.status === 'approved' && role !== 'admin' ? ' disabled' : '') + '>'; }).join('') +
            '<label class="ab"><input type="checkbox" data-ab' + (m.is_absent ? ' checked' : '') + (locked ? ' disabled' : '') + '> ' + esc(t('absent_short')) + '</label></div></div>';
        }).join('') + (studs.length && !locked ? '<div class="row mt"><button class="btn" id="mdraft">💾 ' + esc(t('save_draft')) + '</button><button class="btn primary" id="msub">📤 ' + esc(t('submit_marks')) + '</button>' + (role === 'admin' ? '<button class="btn green" id="mapp">✓ ' + esc(t('approve_marks')) + '</button>' : '') + '</div>' : '') + (studs.length ? '' : A.emptyMsg('no_results'));
      function readRow(r) {
        var o = { is_absent: r.querySelector('[data-ab]').checked }, any = false;
        r.querySelectorAll('input[data-c]').forEach(function (i) { var v = i.value === '' ? null : Number(i.value); o[i.getAttribute('data-c')] = o.is_absent ? null : v; if (v !== null) any = true; });
        o.any = any || o.is_absent; return o;
      }
      function live(r) {
        var o = readRow(r), g = r.querySelector('.gr');
        if (!o.any) { g.textContent = ''; return; }
        var bad = false; comps.forEach(function (c) { if (o[c] !== null && (o[c] < 0 || o[c] > Number(es[c + '_marks']))) bad = true; });
        r.classList.toggle('bad', bad);
        if (bad) { g.textContent = t('err_marks_range'); return; }
        var res = G.subjectResult(rule, es, o);
        g.textContent = o.is_absent ? t('absent_short') : fmt(res.obtained) + '/' + fmt(res.full) + ' · ' + res.grade + (res.pass ? '' : ' ✕');
      }
      box.querySelectorAll('.mk').forEach(function (r) { live(r); r.querySelectorAll('input').forEach(function (i) { i.oninput = i.onchange = function () { live(r); }; }); });
      async function save(status) {
        var p = [], bad = 0;
        box.querySelectorAll('.mk').forEach(function (r) {
          var o = readRow(r); if (!o.any) return;
          comps.forEach(function (c) { if (o[c] !== null && (o[c] < 0 || o[c] > Number(es[c + '_marks']))) bad++; });
          var prev = by[r.getAttribute('data-id')];
          if (prev && prev.status === 'approved' && role !== 'admin') return;
          p.push({ exam_id: ex.id, student_id: r.getAttribute('data-id'), subject_id: sid, theory: o.theory === undefined ? null : o.theory, practical: o.practical === undefined ? null : o.practical, internal: o.internal === undefined ? null : o.internal, is_absent: o.is_absent, status: status });
        });
        if (bad) return toast(t('err_marks_range'), true);
        if (!p.length) return toast(t('nothing_to_save'), true);
        try { must(await db.from('marks').upsert(p, { onConflict: 'exam_id,student_id,subject_id' })); toast('✓ ' + t('saved') + ' (' + p.length + ')'); loadGrid(); } catch (e) { toast(A.errText(e), true); }
      }
      var b1 = $('#mdraft', box), b2 = $('#msub', box), b3 = $('#mapp', box);
      if (b1) b1.onclick = function () { save('draft'); }; if (b2) b2.onclick = function () { save('submitted'); };
      if (b3) b3.onclick = function () { if (confirm(t('confirm_action'))) save('approved'); };
    }
    $('#me', el).onchange = loadSubjects; $('#mc', el).onchange = loadSubjects; $('#ms', el).onchange = loadGrid;
    await loadSubjects();
  };

  /* =========================================================  GRADING RULES */
  V.gradingRules = async function (el) {
    A.skeleton(el);
    async function draw() {
      var rows = must(await db.from('grading_rules').select('*').order('created_at'));
      el.innerHTML = '<div class="note">' + esc(t('rule_note')) + '</div>' + rows.map(function (r) {
        return '<div class="card tap" data-id="' + r.id + '"><div class="row between"><h4>' + esc(r.name) + '</h4><span class="chip ' + (r.verified ? 'ok' : 'warn') + '">' + esc(r.verified ? t('verified') : t('unverified')) + '</span></div>' +
          '<div class="muted xs">' + esc(t('classes')) + ' ' + r.class_from + '–' + r.class_to + (r.academic_year ? ' · ' + esc(r.academic_year) : '') + ' · ' + esc(t('min_percent')) + ' ' + r.min_percent + '%</div>' +
          '<div class="sm" style="margin-top:6px">' + r.rules.map(function (b) { return '<span class="chip">' + esc(b.grade) + ' ≥' + b.min + ' (' + b.gp + ')</span>'; }).join('') + '</div></div>';
      }).join('');
      el.querySelectorAll('.card.tap').forEach(function (c) { c.onclick = function () { form(rows.filter(function (r) { return r.id === c.getAttribute('data-id'); })[0]); }; });
    }
    function form(r) {
      A.push({ title: function () { return t('grading_rules'); }, render: function (e) {
        var bands = r.rules.map(function (b) { return [b.grade, b.min, b.gp, b.desc || '', b.desc_ne || ''].join(','); }).join('\n');
        A.mountForm(e, { fields: [{ name: 'name', label: 'name', required: true }, { name: 'academic_year', label: 'academic_year' },
          { name: 'class_from', label: 'class_from', type: 'number', required: true }, { name: 'class_to', label: 'class_to', type: 'number', required: true },
          { name: 'bands', label: 'grade_bands', type: 'textarea', rows: 10, required: true, hint: 'bands_hint' },
          { name: 'min_percent', label: 'min_percent', type: 'number', step: 'any', required: true }, { name: 'min_component_percent', label: 'min_component_percent', type: 'number', step: 'any', required: true },
          { name: 'rounding', label: 'rounding', type: 'number', required: true },
          { name: 'verified', label: 'verified', type: 'select', options: [{ value: 'yes', label: t('yes') }, { value: 'no', label: t('no') }] }, { name: 'source_note', label: 'source_note', type: 'textarea' }],
          values: { name: r.name, academic_year: r.academic_year, class_from: r.class_from, class_to: r.class_to, bands: bands, min_percent: r.min_percent, min_component_percent: r.min_component_percent, rounding: r.rounding, verified: r.verified ? 'yes' : 'no', source_note: r.source_note },
          onSubmit: async function (v) {
            var list = String(v.bands).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
              var p = l.split(','); var min = Number(p[1]), gp = Number(p[2]);
              if (!p[0].trim() || isNaN(min) || isNaN(gp)) throw new Error(t('err_bands') + ': ' + l);
              return { grade: p[0].trim(), min: min, gp: gp, desc: (p[3] || '').trim(), desc_ne: (p[4] || '').trim() };
            });
            if (list.length < 2) throw new Error(t('err_bands'));
            if (!list.some(function (b) { return b.min === 0; })) throw new Error(t('err_bands_zero'));
            must(await db.from('grading_rules').update({ name: v.name, academic_year: v.academic_year || null, class_from: v.class_from, class_to: v.class_to, rules: list, min_percent: v.min_percent, min_component_percent: v.min_component_percent, rounding: v.rounding, verified: v.verified === 'yes', source_note: v.source_note }).eq('id', r.id));
            toast(t('saved')); A.pop(); draw();
          } });
      } });
    }
    await draw();
  };

  /* =========================================================  COMPUTE + REPORT CARD */
  async function compute(exam, ch) {
    var lk = await A.lookups(), studs = await A.studentsOf(ch), rule = await ruleFor(lk.cls[ch.class_id].level, exam.academic_year);
    var es = must(await db.from('exam_subjects').select('*').eq('exam_id', exam.id).eq('class_id', ch.class_id));
    var ms = studs.length ? await A.fetchAll(function (a, b) { return db.from('marks').select('*').eq('exam_id', exam.id).in('student_id', studs.map(function (s) { return s.id; })).range(a, b); }) : [];
    var by = {}; ms.forEach(function (m) { (by[m.student_id] = by[m.student_id] || {})[m.subject_id] = m; });
    var notApproved = ms.filter(function (m) { return m.status !== 'approved'; }).length;
    var items = studs.map(function (s) { return { student: s, student_id: s.id, res: G.studentResult(rule, es, by[s.id] || {}) }; });
    G.rankAll(items);
    return { items: items, rule: rule, es: es, notApproved: notApproved, lk: lk };
  }
  function bandDesc(rule, grade) { var b = rule.rules.filter(function (x) { return x.grade === grade; })[0]; return b ? (state.lang === 'ne' && b.desc_ne ? b.desc_ne : b.desc || '') : ''; }
  async function rcHtml(snap, remarks) {
    var sch = await A.school(), s = snap.student, r = snap.res;
    var rows = r.subjects.map(function (x) {
      return '<tr><td>' + esc(x.code || '') + '</td><td>' + esc(x.name) + '</td><td>' + fmt(x.credit) + '</td><td>' + (x.absent ? 'AB' : fmt(x.theory)) + '</td><td>' + (x.absent ? '' : fmt(x.practical)) + '</td><td>' + fmt(x.full) + '</td><td>' + (x.missing ? '–' : fmt(x.obtained)) + '</td><td>' + esc(x.grade || '–') + '</td><td>' + (x.missing ? '–' : fmt(x.gp)) + '</td></tr>';
    }).join('');
    return '<div class="rc"><div class="rc-h">' + A.logo(54) + '<div><h2>' + esc(A.SCHOOL) + '</h2><p>' + esc([sch.address, sch.phone].filter(Boolean).join(' · ')) + '</p><p><b>' + esc(snap.exam.name) + (snap.exam.year ? ' – ' + esc(snap.exam.year) : '') + '</b> · ' + esc(t('report_card')) + '</p></div></div>' +
      '<div class="rc-st"><div class="ph" data-photo="' + esc(s.photo || '') + '">' + (s.photo ? '' : '🎓') + '</div><div><div><b>' + esc(t('name')) + ':</b> ' + esc(s.name) + '</div><div><b>' + esc(t('student_id')) + ':</b> ' + esc(s.code) + '</div><div><b>' + esc(t('class')) + ':</b> ' + esc(s.class) + (s.section ? ' ' + esc(s.section) : '') + ' · <b>' + esc(t('roll_no')) + ':</b> ' + esc(s.roll || '–') + '</div>' + (s.dob ? '<div><b>' + esc(t('dob')) + ':</b> ' + esc(s.dob) + '</div>' : '') + '</div></div>' +
      '<table><tr><th>' + esc(t('code')) + '</th><th>' + esc(t('subject')) + '</th><th>' + esc(t('credit_hours')) + '</th><th>' + esc(t('theory')) + '</th><th>' + esc(t('practical')) + '</th><th>' + esc(t('full_marks')) + '</th><th>' + esc(t('obtained')) + '</th><th>' + esc(t('grade')) + '</th><th>GP</th></tr>' + rows + '</table>' +
      '<div class="rc-sum"><span>' + esc(t('total')) + ': ' + fmt(r.total_obtained) + '/' + fmt(r.total_full) + ' (' + fmt(r.percentage) + '%)</span><span>GPA: ' + (r.gpa_valid ? r.gpa.toFixed(snap.rule.rounding) : 'NG') + '</span><span>' + esc(t('grade')) + ': ' + esc(r.gpa_valid ? r.overall_grade : 'NG') + '</span></div>' +
      '<div class="rc-sum"><span>' + esc(t('result')) + ': ' + esc(r.result) + '</span><span>' + (snap.rank ? esc(t('rank')) + ': ' + snap.rank + '/' + snap.of : '') + '</span></div>' +
      (remarks ? '<p><b>' + esc(t('remarks')) + ':</b> ' + esc(remarks) + '</p>' : '') +
      (snap.rule.verified ? '' : '<p class="muted xs">' + esc(t('rule_unverified_print')) + '</p>') +
      '<div class="rc-sign"><div>' + esc(t('class_teacher')) + '</div><div>' + esc(t('parent_sign')) + '</div><div>' + esc(sch.principal_name || t('principal')) + '</div></div></div>';
  }
  function makeSnap(exam, item, rule, es, lk, ofN, sch) {
    var s = item.student, nameOf = {}, codeOf = {};
    es.forEach(function (e) { nameOf[e.subject_id] = lk.sub[e.subject_id] ? A.nm(lk.sub[e.subject_id]) : '?'; codeOf[e.subject_id] = lk.sub[e.subject_id] ? lk.sub[e.subject_id].code : ''; });
    var res = JSON.parse(JSON.stringify(item.res)); res.subjects.forEach(function (x) { x.name = nameOf[x.subject_id]; x.code = codeOf[x.subject_id] || ''; });
    return { student: { name: s.full_name, code: s.student_code, roll: s.roll_no, photo: s.photo_url, class: lk.cls[s.class_id] ? lk.cls[s.class_id].name : '', section: s.section_id && lk.sec[s.section_id] ? lk.sec[s.section_id].name : '', dob: s.dob || null },
      exam: { name: exam.name, year: exam.academic_year }, rule: { name: rule.name, verified: rule.verified, rounding: rule.rounding, rules: rule.rules }, res: res, rank: item.rank || null, of: ofN };
  }

  /* =========================================================  GRADE SHEETS (admin) */
  V.gradeSheets = async function (el) {
    A.skeleton(el);
    var exams = must(await db.from('exams').select('*').order('created_at', { ascending: false })), choices = await A.classChoices();
    if (!exams.length) { el.innerHTML = A.emptyMsg('no_exams'); return; } if (!choices.length) { el.innerHTML = A.emptyMsg('no_classes_assigned'); return; }
    el.innerHTML = '<div class="filters"><select id="ge" class="search">' + exams.map(function (x) { return '<option value="' + x.id + '">' + esc(A.nm(x)) + '</option>'; }).join('') + '</select>' + A.choiceSelect('gc', choices, A.ck(choices[0])) + '</div><div id="gb"></div>';
    async function run() {
      var exam = exams.filter(function (x) { return x.id === $('#ge', el).value; })[0], ch = A.choiceOf(choices, $('#gc', el).value), box = $('#gb', el); A.skeleton(box);
      var d = await compute(exam, ch), pass = d.items.filter(function (i) { return i.res.result === 'PASS'; }).length, ng = d.items.filter(function (i) { return i.res.result === 'NG'; }).length, inc = d.items.filter(function (i) { return i.res.result === 'INCOMPLETE'; }).length;
      var pub = d.items.length ? must(await db.from('report_cards').select('student_id, remarks').eq('exam_id', exam.id).in('student_id', d.items.map(function (i) { return i.student_id; }))) : [], published = {}; pub.forEach(function (p) { published[p.student_id] = p; });
      box.innerHTML = (d.rule.verified ? '' : '<div class="note">' + esc(t('rule_unverified')) + '</div>') +
        '<div class="stat3"><div class="sbox ok"><b>' + pass + '</b><span>PASS</span></div><div class="sbox bad"><b>' + ng + '</b><span>NG</span></div><div class="sbox warn"><b>' + inc + '</b><span>' + esc(t('incomplete')) + '</span></div></div>' +
        (d.notApproved ? '<div class="note">' + esc(t('marks_not_approved')) + ': ' + d.notApproved + '</div>' : '') +
        '<div class="scroll-x"><table class="tbl"><tr><th>#</th><th>' + esc(t('student')) + '</th><th>%</th><th>GPA</th><th>' + esc(t('grade')) + '</th><th>' + esc(t('result')) + '</th><th>' + esc(t('rank')) + '</th></tr>' +
        d.items.map(function (i) { var r = i.res; return '<tr data-id="' + i.student_id + '"><td>' + (i.student.roll_no || '') + '</td><td>' + esc(i.student.full_name) + (published[i.student_id] ? ' ✓' : '') + '</td><td>' + (r.complete ? fmt(r.percentage) : '–') + '</td><td>' + (r.gpa_valid ? r.gpa.toFixed(d.rule.rounding) : r.complete ? 'NG' : '–') + '</td><td>' + esc(r.complete ? (r.gpa_valid ? r.overall_grade : 'NG') : '–') + '</td><td>' + esc(r.result) + '</td><td>' + (i.rank || '') + '</td></tr>'; }).join('') + '</table></div>' +
        '<div class="row mt"><button class="btn primary" id="gpub">📣 ' + esc(t('publish_results')) + '</button><button class="btn" id="gprint">🖨 ' + esc(t('print_all')) + '</button><button class="btn ghost" id="gcsv">⬇ ' + esc(t('export_csv')) + '</button></div>';
      var ofN = d.items.length, sch = await A.school();
      box.querySelectorAll('tr[data-id]').forEach(function (tr) {
        tr.style.cursor = 'pointer';
        tr.onclick = function () {
          var it = d.items.filter(function (i) { return i.student_id === tr.getAttribute('data-id'); })[0];
          A.sheet(it.student.full_name, [
            { icon: '📄', label: t('report_card'), fn: async function () { A.printable(t('report_card'), await rcHtml(makeSnap(exam, it, d.rule, d.es, d.lk, ofN, sch), (published[it.student_id] || {}).remarks)); } },
            { icon: '💬', label: t('remarks'), fn: function () {
              var v = prompt(t('remarks'), (published[it.student_id] || {}).remarks || ''); if (v === null) return;
              (async function () { try {
                if (!published[it.student_id]) return toast(t('publish_first'), true);
                must(await db.from('report_cards').update({ remarks: v }).eq('exam_id', exam.id).eq('student_id', it.student_id)); toast(t('saved')); run();
              } catch (e) { toast(A.errText(e), true); } })(); } }]);
        };
      });
      $('#gcsv', box).onclick = function () {
        A.downloadCsv('grade-sheet.csv', [['Roll', 'Student ID', 'Name', 'Percentage', 'GPA', 'Grade', 'Result', 'Rank']].concat(d.items.map(function (i) { var r = i.res; return [i.student.roll_no || '', i.student.student_code, i.student.full_name, r.complete ? r.percentage : '', r.gpa_valid ? r.gpa : '', r.complete ? (r.gpa_valid ? r.overall_grade : 'NG') : '', r.result, i.rank || '']; })));
      };
      $('#gprint', box).onclick = async function () {
        var done = d.items.filter(function (i) { return i.res.complete; });
        if (!done.length) return toast(t('nothing_to_save'), true);
        var html = ''; for (var k = 0; k < done.length; k++) html += await rcHtml(makeSnap(exam, done[k], d.rule, d.es, d.lk, ofN, sch), (published[done[k].student_id] || {}).remarks);
        A.printable(t('report_card'), html);
      };
      $('#gpub', box).onclick = async function () {
        if (d.notApproved) return toast(t('marks_not_approved'), true);
        var ready = d.items.filter(function (i) { return i.res.complete; });
        if (!ready.length) return toast(t('nothing_to_save'), true);
        if (!confirm(t('confirm_publish') + ' (' + ready.length + ')')) return;
        try {
          must(await db.from('report_cards').upsert(ready.map(function (i) { return { exam_id: exam.id, student_id: i.student_id, class_id: ch.class_id, snapshot: makeSnap(exam, i, d.rule, d.es, d.lk, ofN, sch), published_by: state.profile.id, published_at: new Date().toISOString() }; }), { onConflict: 'exam_id,student_id' }));
          toast('✓ ' + t('published') + ' (' + ready.length + ')'); run();
        } catch (e) { toast(A.errText(e), true); }
      };
    }
    $('#ge', el).onchange = run; $('#gc', el).onchange = run; await run();
  };

  /* =========================================================  RESULTS (parent) + performance */
  async function resultsList(el, stu) {
    A.skeleton(el);
    var rows = must(await db.from('report_cards').select('id, remarks, snapshot, published_at, exams(name, name_ne, academic_year)').eq('student_id', stu.id).order('published_at', { ascending: false }));
    el.innerHTML = rows.length ? rows.map(function (r) {
      var s = r.snapshot.res;
      return '<div class="card tap" data-id="' + r.id + '"><div class="row between"><h4>' + esc(r.exams ? A.nm(r.exams) : r.snapshot.exam.name) + '</h4><span class="chip ' + (s.result === 'PASS' ? 'ok' : 'bad') + '">' + esc(s.result) + '</span></div><div class="muted sm">GPA ' + (s.gpa_valid ? s.gpa.toFixed(r.snapshot.rule.rounding) : 'NG') + ' · ' + fmt(s.percentage) + '% · ' + esc(s.gpa_valid ? s.overall_grade : 'NG') + (r.snapshot.rank ? ' · ' + esc(t('rank')) + ' ' + r.snapshot.rank : '') + '</div></div>';
    }).join('') : A.emptyMsg('no_results');
    el.querySelectorAll('.card.tap').forEach(function (c) {
      c.onclick = async function () { var r = rows.filter(function (x) { return x.id === c.getAttribute('data-id'); })[0]; A.printable(t('report_card'), await rcHtml(r.snapshot, r.remarks)); };
    });
  }
  V.results = async function (el) { var c = A.currentChild(); if (!c) { el.innerHTML = '<div class="note">' + esc(t('no_child')) + '</div>'; return; } await resultsList(el, c); };

  /* =========================================================  REPORTS HUB */
  V.reports = async function (el) {
    A.skeleton(el);
    var exams = must(await db.from('exams').select('id, name, name_ne').order('created_at', { ascending: false }));
    if (!exams.length) { el.innerHTML = A.emptyMsg('no_exams'); return; }
    el.innerHTML = '<select id="re" class="search">' + exams.map(function (x) { return '<option value="' + x.id + '">' + esc(A.nm(x)) + '</option>'; }).join('') + '</select><div id="rb"></div>';
    async function run() {
      var box = $('#rb', el); A.skeleton(box); var lk = await A.lookups();
      var rows = await A.fetchAll(function (a, b) { return db.from('report_cards').select('class_id, snapshot').eq('exam_id', $('#re', el).value).range(a, b); });
      if (!rows.length) { box.innerHTML = A.emptyMsg('no_published'); return; }
      var byC = {}, subj = {};
      rows.forEach(function (r) {
        var s = r.snapshot.res, c = byC[r.class_id] = byC[r.class_id] || { n: 0, pass: 0, gpa: 0, gn: 0 };
        c.n++; if (s.result === 'PASS') { c.pass++; c.gpa += s.gpa; c.gn++; }
        s.subjects.forEach(function (x) { if (x.missing) return; var k = x.name, z = subj[k] = subj[k] || { n: 0, sum: 0, fail: 0 }; z.n++; z.sum += x.pct || 0; if (!x.pass) z.fail++; });
      });
      var top = rows.filter(function (r) { return r.snapshot.res.result === 'PASS'; }).sort(function (a, b) { return b.snapshot.res.gpa - a.snapshot.res.gpa || b.snapshot.res.percentage - a.snapshot.res.percentage; }).slice(0, 10);
      box.innerHTML = '<h3 class="grp g-blue"><i></i>' + esc(t('result_summary')) + '</h3>' + lk.classes.filter(function (c) { return byC[c.id]; }).map(function (c) {
        var x = byC[c.id], p = Math.round(x.pass / x.n * 100);
        return '<div class="card"><div class="row between"><b>' + esc(A.nm(c)) + '</b><span>' + x.pass + '/' + x.n + ' (' + p + '%)</span></div><div class="bar-bg" style="margin:6px 0"><div class="bar-fg" style="width:' + p + '%"></div></div><div class="muted xs">' + esc(t('avg_gpa')) + ': ' + (x.gn ? (x.gpa / x.gn).toFixed(2) : '–') + '</div></div>';
      }).join('') + '<h3 class="grp g-purple"><i></i>' + esc(t('subject_analysis')) + '</h3><div class="scroll-x"><table class="tbl"><tr><th>' + esc(t('subject')) + '</th><th>' + esc(t('avg_pct')) + '</th><th>NG</th></tr>' +
        Object.keys(subj).sort().map(function (k) { return '<tr><td>' + esc(k) + '</td><td>' + (subj[k].sum / subj[k].n).toFixed(1) + '</td><td>' + subj[k].fail + '</td></tr>'; }).join('') + '</table></div>' +
        '<h3 class="grp g-green"><i></i>' + esc(t('top_students')) + '</h3>' + top.map(function (r, i) { return '<div class="card row between"><span>' + (i + 1) + '. ' + esc(r.snapshot.student.name) + ' <span class="muted xs">' + esc(r.snapshot.student.class) + '</span></span><b>' + r.snapshot.res.gpa.toFixed(2) + '</b></div>'; }).join('');
    }
    $('#re', el).onchange = run; await run();
  };

  /* =========================================================  Student action sheet entries */
  function idCard(r) {
    A.school().then(function (sch) {
      var html = '<div class="idc"><div class="top"><b>' + esc(A.SCHOOL) + '</b><span class="xs">' + esc(sch.address || '') + '</span></div><div class="ph" data-photo="' + esc(r.photo_url || '') + '">' + (r.photo_url ? '' : '🎓') + '</div><div class="body"><h3>' + esc(r.full_name) + '</h3>' +
        A.irow('student_id', r.student_code) + A.irow('class', (A.lookups_sync(r.class_id) || '')) + A.irow('roll_no', r.roll_no ? String(r.roll_no) : '') + A.irow('dob', r.dob) + A.irow('guardian', r.guardian_name) + A.irow('contact_no', r.guardian_phone) + A.irow('blood_group_s', r.blood_group) + '</div></div>';
      A.printable(t('id_card'), html);
    });
  }
  A.lookups_sync = function () { return ''; };
  A.saFns.push(function (r, ro) {
    var acts = [
      { icon: '🪪', label: t('id_card'), fn: async function () { var lk = await A.lookups(); A.lookups_sync = function (cid) { return lk.cls[cid] ? A.nm(lk.cls[cid]) + (r.section_id && lk.sec[r.section_id] ? ' ' + lk.sec[r.section_id].name : '') : ''; }; idCard(r); } },
      { icon: '✅', label: t('att_history'), fn: function () { A.push({ title: function () { return r.full_name; }, render: function (e) { return V.attendanceHistory(e, r); } }); } }];
    if (state.profile.role === 'admin') acts.push({ icon: '🏅', label: t('performance'), fn: function () { A.push({ title: function () { return r.full_name; }, render: function (e) { return resultsList(e, r); } }); } });
    return acts;
  });
})();
