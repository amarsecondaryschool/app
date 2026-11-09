/* Nepal letter-grading engine. Pure functions: no database, no screen.
   The grade table itself comes from the `grading_rules` table (admin-editable),
   never from this file. Used by the app and by the unit tests. */
(function (root) {
  'use strict';

  function round(x, d) { var m = Math.pow(10, d); return Math.round((x + Number.EPSILON) * m) / m; }
  function num(x) { return (x === null || x === undefined || x === '') ? null : Number(x); }

  /* rule = { rules:[{grade,min,gp,desc,desc_ne}], min_percent, min_component_percent, rounding } */
  function gradeFor(rule, pct) {
    var list = rule.rules.slice().sort(function (a, b) { return b.min - a.min; });
    for (var i = 0; i < list.length; i++) if (pct >= list[i].min) return list[i];
    return list[list.length - 1];
  }
  function ngGrade(rule) {
    var list = rule.rules.slice().sort(function (a, b) { return a.min - b.min; });
    return list[0];                       // lowest band = NG
  }

  /* es = exam_subjects row, m = marks row (or undefined) */
  function subjectResult(rule, es, m) {
    var full = Number(es.theory_marks) + Number(es.practical_marks) + Number(es.internal_marks);
    var out = { subject_id: es.subject_id, full: full, credit: Number(es.credit_hours) || 0,
                theory: null, practical: null, internal: null, obtained: null, pct: null,
                grade: null, gp: null, pass: null, absent: false, missing: false, reason: '' };
    if (!m) { out.missing = true; return out; }
    if (m.is_absent) {
      var ng0 = ngGrade(rule);
      out.absent = true; out.obtained = 0; out.pct = 0; out.grade = ng0.grade; out.gp = 0; out.pass = false; out.reason = 'absent';
      return out;
    }
    var th = num(m.theory), pr = num(m.practical), inn = num(m.internal);
    if (th === null && pr === null && inn === null) { out.missing = true; return out; }
    out.theory = th; out.practical = pr; out.internal = inn;
    out.obtained = (th || 0) + (pr || 0) + (inn || 0);
    out.pct = full > 0 ? round(out.obtained / full * 100, 2) : 0;
    var minc = Number(rule.min_component_percent);
    var threshold = Number(es.pass_marks) > 0 ? Number(es.pass_marks) : full * Number(rule.min_percent) / 100;
    var ok = out.obtained >= threshold;
    if (ok && Number(es.theory_marks) > 0 && (th || 0) < Number(es.theory_marks) * minc / 100) { ok = false; out.reason = 'theory'; }
    if (ok && Number(es.practical_marks) > 0 && (pr || 0) < Number(es.practical_marks) * minc / 100) { ok = false; out.reason = 'practical'; }
    if (!ok && !out.reason) out.reason = 'total';
    out.pass = ok;
    if (ok) { var g = gradeFor(rule, out.pct); out.grade = g.grade; out.gp = Number(g.gp); }
    else { var ng = ngGrade(rule); out.grade = ng.grade; out.gp = 0; }
    return out;
  }

  /* examSubjects: exam_subjects rows of the student's class; marksBySubject: {subject_id: marks row} */
  function studentResult(rule, examSubjects, marksBySubject) {
    var dec = Number(rule.rounding);
    var subs = examSubjects.map(function (es) { return subjectResult(rule, es, marksBySubject[es.subject_id]); });
    var full = 0, obt = 0, credits = 0, gpSum = 0, ng = 0, missing = 0;
    subs.forEach(function (s) {
      if (s.missing) { missing++; return; }
      full += s.full; obt += s.obtained; credits += s.credit; gpSum += s.gp * s.credit;
      if (!s.pass) ng++;
    });
    var pct = full > 0 ? round(obt / full * 100, 2) : 0;
    var gpa = credits > 0 ? round(gpSum / credits, dec) : 0;
    var complete = missing === 0 && subs.length > 0;
    var overall = complete ? gradeFor(rule, pct) : null;
    return {
      subjects: subs, total_full: full, total_obtained: obt, percentage: pct,
      gpa: gpa, gpa_valid: complete && ng === 0, ng_count: ng, missing_count: missing, complete: complete,
      overall_grade: overall ? overall.grade : null,
      result: !complete ? 'INCOMPLETE' : (ng === 0 ? 'PASS' : 'NG')
    };
  }

  /* results = [{student_id, res}] -> adds rank (ties share a rank). Only complete results are ranked. */
  function rankAll(items) {
    var ranked = items.filter(function (i) { return i.res.complete && i.res.result === 'PASS'; })
      .sort(function (a, b) { return b.res.gpa - a.res.gpa || b.res.percentage - a.res.percentage; });
    var rank = 0, prev = null;
    ranked.forEach(function (i, idx) {
      var key = i.res.gpa + '|' + i.res.percentage;
      if (key !== prev) { rank = idx + 1; prev = key; }
      i.rank = rank;
    });
    return items;
  }

  /* Choose the best active rule: right class level, right year, verified first. */
  function pickRule(rules, classLevel, year) {
    var c = rules.filter(function (r) {
      return r.is_active && classLevel >= r.class_from && classLevel <= r.class_to &&
             (!r.academic_year || String(r.academic_year) === String(year || ''));
    });
    c.sort(function (a, b) {
      return (b.academic_year ? 1 : 0) - (a.academic_year ? 1 : 0) || (b.verified ? 1 : 0) - (a.verified ? 1 : 0) ||
             (a.class_to - a.class_from) - (b.class_to - b.class_from);
    });
    return c[0] || null;
  }

  var api = { round: round, gradeFor: gradeFor, subjectResult: subjectResult, studentResult: studentResult, rankAll: rankAll, pickRule: pickRule };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AmarGrading = api;
})(typeof window !== 'undefined' ? window : this);
