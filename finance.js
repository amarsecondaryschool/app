/* Fees, library, transport. */
(function () {
  'use strict';
  var A = window.AMAR, t = A.t, esc = A.esc, db = A.db, $ = A.$, must = A.must, toast = A.toast, state = A.state, V = A.views;
  var CATS = ['admission', 'tuition', 'exam', 'transport', 'other'];
  function catOpts() { return CATS.map(function (k) { return { value: k, label: t('cat_' + k) }; }); }

  /* ---------- ledger for one student ---------- */
  async function ledger(stu) {
    var items = must(await db.from('fee_items').select('*').eq('student_id', stu.id).order('due_date', { ascending: true, nullsFirst: false }));
    var pays = must(await db.from('payments').select('*').eq('student_id', stu.id).order('paid_on', { ascending: false }));
    var billed = items.reduce(function (s, x) { return s + Number(x.amount); }, 0), paid = pays.reduce(function (s, x) { return s + Number(x.amount); }, 0);
    return { items: items, pays: pays, billed: billed, paid: paid, due: billed - paid };
  }
  async function receipt(stu, p) {
    var sch = await A.school(), lk = await A.lookups();
    A.printable(t('receipt'), '<div class="receipt"><div class="rc-h">' + A.logo(48) + '<div><h2 style="margin:0">' + esc(A.SCHOOL) + '</h2><p class="xs">' + esc([sch.address, sch.phone].filter(Boolean).join(' · ')) + '</p></div></div>' +
      '<h3 style="text-align:center">' + esc(t('receipt')) + ' ' + esc(p.receipt_no) + '</h3>' +
      A.irow('name', stu.full_name) + A.irow('student_id', stu.student_code) + A.irow('class', stu.class_id && lk.cls[stu.class_id] ? A.nm(lk.cls[stu.class_id]) : '') +
      A.irow('date', A.fmtDate(p.paid_on)) + A.irow('amount', A.fmtMoney(p.amount)) + A.irow('method', p.method) + A.irow('note', p.note) +
      '<div class="rc-sign"><div>' + esc(t('parent_sign')) + '</div><div>' + esc(t('accountant')) + '</div></div></div>');
  }
  async function showLedger(el, stu, canEdit) {
    A.skeleton(el);
    var L = await ledger(stu);
    el.innerHTML = '<div class="stat3"><div class="sbox"><b>' + A.fmtMoney(L.billed) + '</b><span>' + esc(t('billed')) + '</span></div><div class="sbox ok"><b>' + A.fmtMoney(L.paid) + '</b><span>' + esc(t('paid')) + '</span></div><div class="sbox ' + (L.due > 0 ? 'bad' : 'ok') + '"><b>' + A.fmtMoney(L.due) + '</b><span>' + esc(t('balance')) + '</span></div></div>' +
      (canEdit ? '<div class="row mb"><button class="btn small" id="fadd">＋ ' + esc(t('add_fee')) + '</button><button class="btn small primary" id="fpay">💵 ' + esc(t('take_payment')) + '</button></div>' : '') +
      '<h3 class="grp g-orange"><i></i>' + esc(t('fee_items')) + '</h3>' + (L.items.length ? L.items.map(function (x) { return '<div class="card' + (canEdit ? ' tap' : '') + '" data-fi="' + x.id + '"><div class="row between"><b>' + esc(x.title) + '</b><b>' + A.fmtMoney(x.amount) + '</b></div><div class="muted xs">' + esc(t('cat_' + x.category)) + (x.due_date ? ' · ' + esc(t('due')) + ' ' + esc(A.fmtDate(x.due_date)) : '') + '</div></div>'; }).join('') : A.emptyMsg()) +
      '<h3 class="grp g-green"><i></i>' + esc(t('payments')) + '</h3>' + (L.pays.length ? L.pays.map(function (p) { return '<div class="card tap" data-p="' + p.id + '"><div class="row between"><b>' + A.fmtMoney(p.amount) + '</b><span class="chip ok">' + esc(p.receipt_no) + '</span></div><div class="muted xs">' + esc(A.fmtDate(p.paid_on)) + ' · ' + esc(p.method) + '</div></div>'; }).join('') : A.emptyMsg());
    el.querySelectorAll('[data-p]').forEach(function (c) { c.onclick = function () { receipt(stu, L.pays.filter(function (p) { return p.id === c.getAttribute('data-p'); })[0]); }; });
    if (!canEdit) return;
    $('#fadd', el).onclick = function () { feeForm(stu, function () { showLedger(el, stu, canEdit); }); };
    $('#fpay', el).onclick = function () { payForm(stu, L, function () { showLedger(el, stu, canEdit); }); };
    el.querySelectorAll('[data-fi]').forEach(function (c) {
      c.onclick = function () {
        A.sheet(t('fee_items'), [{ icon: '🗑️', label: t('delete'), fn: async function () { if (!confirm(t('confirm_delete'))) return; try { must(await db.from('fee_items').delete().eq('id', c.getAttribute('data-fi'))); showLedger(el, stu, canEdit); } catch (e) { toast(A.errText(e), true); } } }]);
      };
    });
  }
  function feeForm(stu, after) {
    A.push({ title: function () { return t('add_fee'); }, render: function (e) {
      A.mountForm(e, { fields: [{ name: 'title', label: 'title', required: true }, { name: 'category', label: 'category', type: 'select', required: true, options: catOpts() }, { name: 'amount', label: 'amount', type: 'number', step: 'any', required: true }, { name: 'due_date', label: 'due_date', type: 'date' }],
        values: { category: 'tuition' }, onSubmit: async function (v) { if (v.amount < 0) throw new Error(t('err_amount')); must(await db.from('fee_items').insert({ student_id: stu.id, title: v.title, category: v.category, amount: v.amount, due_date: v.due_date })); toast(t('saved')); A.pop(); after(); } });
    } });
  }
  function payForm(stu, L, after) {
    A.push({ title: function () { return t('take_payment'); }, render: function (e) {
      A.mountForm(e, { fields: [{ name: 'amount', label: 'amount', type: 'number', step: 'any', required: true }, { name: 'paid_on', label: 'date', type: 'date', required: true },
        { name: 'method', label: 'method', type: 'select', required: true, options: ['cash', 'bank', 'esewa', 'khalti', 'cheque'].map(function (k) { return { value: k, label: k }; }) }, { name: 'note', label: 'note' }],
        values: { amount: L.due > 0 ? L.due : null, paid_on: A.today(), method: 'cash' }, onSubmit: async function (v) {
          if (!(v.amount > 0)) throw new Error(t('err_amount'));
          var r = must(await db.from('payments').insert({ student_id: stu.id, amount: v.amount, paid_on: v.paid_on, method: v.method, note: v.note, received_by: state.profile.id }).select().single());
          toast('✓ ' + t('saved') + ' ' + r.receipt_no); A.pop(); after(); receipt(stu, r);
        } });
    } });
  }
  A.saFns.push(function (r, ro) { return state.profile.role === 'admin' ? [{ icon: '💰', label: t('fees'), fn: function () { A.push({ title: function () { return r.full_name; }, render: function (e) { return showLedger(e, r, true); } }); } }] : []; });

  V.fees = async function (el) {
    if (state.profile.role === 'parent') { var c = A.currentChild(); if (!c) { el.innerHTML = '<div class="note">' + esc(t('no_child')) + '</div>'; return; } return showLedger(el, c, false); }
    A.tabs(el, [{ label: 'fee_students', render: feeStudents }, { label: 'fee_outstanding', render: feeOutstanding }, { label: 'fee_structure', render: feeStructure }]);
  };
  async function feeStudents(box) {
    box.innerHTML = '<input id="fq" class="search" placeholder="' + esc(t('search')) + '"><div id="fl"></div>';
    var studs = await A.fetchAll(function (a, b) { return db.from('students').select('id, full_name, student_code, class_id, section_id, roll_no').eq('status', 'active').order('full_name').range(a, b); });
    function draw() {
      var q = $('#fq', box).value.toLowerCase(), list = studs.filter(function (s) { return !q || s.full_name.toLowerCase().indexOf(q) >= 0 || s.student_code.toLowerCase().indexOf(q) >= 0; }).slice(0, 60);
      $('#fl', box).innerHTML = list.length ? list.map(function (s) { return '<div class="card tap" data-id="' + s.id + '"><b>' + esc(s.full_name) + '</b><div class="muted xs">' + esc(s.student_code) + '</div></div>'; }).join('') : A.emptyMsg('no_results');
      box.querySelectorAll('#fl .tap').forEach(function (c) { c.onclick = function () { var s = studs.filter(function (x) { return x.id === c.getAttribute('data-id'); })[0]; A.push({ title: function () { return s.full_name; }, render: function (e) { return showLedger(e, s, true); } }); }; });
    }
    $('#fq', box).oninput = draw; draw();
  }
  async function feeOutstanding(box) {
    var lk = await A.lookups();
    var studs = await A.fetchAll(function (a, b) { return db.from('students').select('id, full_name, student_code, class_id').eq('status', 'active').range(a, b); });
    var items = await A.fetchAll(function (a, b) { return db.from('fee_items').select('student_id, amount').range(a, b); });
    var pays = await A.fetchAll(function (a, b) { return db.from('payments').select('student_id, amount').range(a, b); });
    var bal = {}; items.forEach(function (x) { bal[x.student_id] = (bal[x.student_id] || 0) + Number(x.amount); }); pays.forEach(function (x) { bal[x.student_id] = (bal[x.student_id] || 0) - Number(x.amount); });
    var due = studs.filter(function (s) { return bal[s.id] > 0; }).sort(function (a, b) { return bal[b.id] - bal[a.id]; });
    var tot = due.reduce(function (s, x) { return s + bal[x.id]; }, 0);
    box.innerHTML = '<div class="card"><div class="row between"><b>' + esc(t('total_outstanding')) + '</b><b>' + A.fmtMoney(tot) + '</b></div></div><button class="btn small mb" id="oexp">⬇ ' + esc(t('export_csv')) + '</button>' +
      (due.length ? '<div class="scroll-x"><table class="tbl"><tr><th>' + esc(t('student')) + '</th><th>' + esc(t('class')) + '</th><th>' + esc(t('balance')) + '</th></tr>' + due.map(function (s) { return '<tr><td>' + esc(s.full_name) + '</td><td>' + esc(lk.cls[s.class_id] ? A.nm(lk.cls[s.class_id]) : '') + '</td><td>' + A.fmtMoney(bal[s.id]) + '</td></tr>'; }).join('') + '</table></div>' : A.emptyMsg());
    $('#oexp', box).onclick = function () { A.downloadCsv('outstanding-fees.csv', [['Student ID', 'Name', 'Class', 'Balance']].concat(due.map(function (s) { return [s.student_code, s.full_name, lk.cls[s.class_id] ? lk.cls[s.class_id].name : '', bal[s.id]]; }))); };
  }
  async function feeStructure(box) {
    var lk = await A.lookups();
    async function draw() {
      var rows = must(await db.from('fee_templates').select('*').order('class_id'));
      box.innerHTML = '<button class="btn primary mb" id="tadd">＋ ' + esc(t('add_template')) + '</button><div class="note">' + esc(t('template_note')) + '</div>' + (rows.length ? rows.map(function (r) {
        return '<div class="card tap" data-id="' + r.id + '"><div class="row between"><b>' + esc(r.title) + '</b><b>' + A.fmtMoney(r.amount) + '</b></div><div class="muted xs">' + esc(lk.cls[r.class_id] ? A.nm(lk.cls[r.class_id]) : '') + ' · ' + esc(t('cat_' + r.category)) + '</div></div>';
      }).join('') : A.emptyMsg()) + '<h3 class="grp g-purple"><i></i>' + esc(t('apply_template')) + '</h3><select id="ac" class="search">' + lk.classes.map(function (c) { return '<option value="' + c.id + '">' + esc(A.nm(c)) + '</option>'; }).join('') + '</select><input type="date" id="ad" class="search" value="' + A.addDays(A.today(), 30) + '"><button class="btn" id="aapply">' + esc(t('apply_template')) + '</button>';
      $('#tadd', box).onclick = function () {
        A.push({ title: function () { return t('add_template'); }, render: function (e) {
          A.mountForm(e, { fields: [{ name: 'class_id', label: 'class', type: 'select', required: true, options: lk.classes.map(function (c) { return { value: c.id, label: A.nm(c) }; }) }, { name: 'title', label: 'title', required: true }, { name: 'category', label: 'category', type: 'select', required: true, options: catOpts() }, { name: 'amount', label: 'amount', type: 'number', step: 'any', required: true }],
            values: { category: 'tuition' }, onSubmit: async function (v) { must(await db.from('fee_templates').insert(v)); toast(t('saved')); A.pop(); draw(); } });
        } });
      };
      box.querySelectorAll('.card.tap').forEach(function (c) { c.onclick = function () { A.sheet(t('fee_structure'), [{ icon: '🗑️', label: t('delete'), fn: async function () { if (!confirm(t('confirm_delete'))) return; try { must(await db.from('fee_templates').delete().eq('id', c.getAttribute('data-id'))); draw(); } catch (e) { toast(A.errText(e), true); } } }]); }; });
      $('#aapply', box).onclick = async function () {
        if (!confirm(t('confirm_apply_template'))) return;
        try { var n = must(await db.rpc('admin_apply_fee_template', { p_class: $('#ac', box).value, p_due: $('#ad', box).value || null })); toast('✓ ' + t('added') + ': ' + n); } catch (e) { toast(A.errText(e), true); }
      };
    }
    await draw();
  }

  /* =========================================================  LIBRARY */
  V.library = async function (el) {
    var role = state.profile.role;
    if (role === 'parent') {
      var c = A.currentChild(); if (!c) { el.innerHTML = '<div class="note">' + esc(t('no_child')) + '</div>'; return; }
      A.skeleton(el);
      var tx = must(await db.from('book_transactions').select('*, library_books(title, author)').eq('student_id', c.id).order('issued_on', { ascending: false }));
      el.innerHTML = tx.length ? tx.map(function (x) { var od = !x.returned_on && x.due_on < A.today(); return '<div class="card"><div class="row between"><b>' + esc(x.library_books ? x.library_books.title : '') + '</b>' + (x.returned_on ? '<span class="chip ok">' + esc(t('returned')) + '</span>' : od ? '<span class="chip bad">' + esc(t('overdue')) + '</span>' : '<span class="chip warn">' + esc(t('issued')) + '</span>') + '</div><div class="muted xs">' + esc(A.fmtDate(x.issued_on)) + ' → ' + esc(A.fmtDate(x.due_on)) + '</div></div>'; }).join('') : A.emptyMsg();
      return;
    }
    A.tabs(el, [{ label: 'lib_books', render: libBooks }, { label: 'lib_issued', render: libIssued }]);
  };
  async function libBooks(box) {
    var canEdit = state.profile.role === 'admin';
    box.innerHTML = '<input id="bq" class="search" placeholder="' + esc(t('search')) + '"><div id="bl"></div>';
    var books = must(await db.from('library_books').select('*').order('title')), open = must(await db.from('book_transactions').select('book_id').is('returned_on', null)), out = {};
    open.forEach(function (o) { out[o.book_id] = (out[o.book_id] || 0) + 1; });
    function draw() {
      var q = $('#bq', box).value.toLowerCase(), list = books.filter(function (b) { return !q || (b.title + ' ' + (b.author || '') + ' ' + (b.isbn || '')).toLowerCase().indexOf(q) >= 0; });
      $('#bl', box).innerHTML = (canEdit ? '<button class="btn primary mb" id="badd">＋ ' + esc(t('add_book')) + '</button>' : '') + (list.length ? list.map(function (b) { var av = b.copies - (out[b.id] || 0); return '<div class="card tap" data-id="' + b.id + '"><div class="row between"><b>' + esc(b.title) + '</b><span class="chip ' + (av > 0 ? 'ok' : 'bad') + '">' + av + '/' + b.copies + '</span></div><div class="muted xs">' + esc(b.author || '') + (b.isbn ? ' · ' + esc(b.isbn) : '') + '</div></div>'; }).join('') : A.emptyMsg());
      var ba = $('#badd', box); if (ba) ba.onclick = function () { bookForm(null); };
      box.querySelectorAll('#bl .tap').forEach(function (c) {
        c.onclick = function () {
          var b = books.filter(function (x) { return x.id === c.getAttribute('data-id'); })[0];
          A.sheet(b.title, [{ icon: '📤', label: t('issue_book'), fn: function () { issueForm(b); } }].concat(canEdit ? [{ icon: '✏️', label: t('edit'), fn: function () { bookForm(b); } }, { icon: '🗑️', label: t('delete'), fn: async function () { if (!confirm(t('confirm_delete'))) return; try { must(await db.from('library_books').delete().eq('id', b.id)); V.library(box.parentNode.parentNode); } catch (e) { toast(A.errText(e), true); } } }] : []));
        };
      });
    }
    function bookForm(b) {
      A.push({ title: function () { return t(b ? 'edit' : 'add_book'); }, render: function (e) {
        A.mountForm(e, { fields: [{ name: 'title', label: 'title', required: true }, { name: 'author', label: 'author' }, { name: 'isbn', label: 'isbn' }, { name: 'copies', label: 'copies', type: 'number', required: true }], values: b || { copies: 1 }, onSubmit: async function (v) {
          v.copies = Math.round(v.copies); if (v.copies < 1) throw new Error(t('err_amount'));
          if (b) must(await db.from('library_books').update(v).eq('id', b.id)); else must(await db.from('library_books').insert(v)); toast(t('saved')); A.pop();
        } });
      } });
    }
    function issueForm(b) {
      A.push({ title: function () { return t('issue_book'); }, render: async function (e) {
        var studs = await A.fetchAll(function (x, y) { return db.from('students').select('id, full_name, student_code').eq('status', 'active').order('full_name').range(x, y); });
        A.mountForm(e, { fields: [{ name: 'student_id', label: 'student', type: 'select', required: true, options: studs.map(function (s) { return { value: s.id, label: s.full_name + ' (' + s.student_code + ')' }; }) }, { name: 'due_on', label: 'due_date', type: 'date', required: true }],
          values: { due_on: A.addDays(A.today(), 14) }, onSubmit: async function (v) { must(await db.from('book_transactions').insert({ book_id: b.id, student_id: v.student_id, due_on: v.due_on })); toast(t('saved')); A.pop(); } });
      } });
    }
    $('#bq', box).oninput = draw; draw();
  }
  async function libIssued(box) {
    async function draw() {
      var rows = must(await db.from('book_transactions').select('*, library_books(title), students(full_name, student_code)').is('returned_on', null).order('due_on'));
      box.innerHTML = rows.length ? rows.map(function (x) { var od = x.due_on < A.today(); return '<div class="card"><div class="row between"><b>' + esc(x.library_books ? x.library_books.title : '') + '</b>' + (od ? '<span class="chip bad">' + esc(t('overdue')) + '</span>' : '') + '</div><div class="muted xs">' + esc(x.students ? x.students.full_name : '') + ' · ' + esc(t('due')) + ' ' + esc(A.fmtDate(x.due_on)) + '</div><button class="btn small green mt" data-r="' + x.id + '">↩ ' + esc(t('return_book')) + '</button></div>'; }).join('') : A.emptyMsg();
      box.querySelectorAll('[data-r]').forEach(function (b) { b.onclick = async function () { try { must(await db.from('book_transactions').update({ returned_on: A.today() }).eq('id', b.getAttribute('data-r'))); toast(t('saved')); draw(); } catch (e) { toast(A.errText(e), true); } }; });
    }
    await draw();
  }

  /* =========================================================  TRANSPORT */
  V.transport = async function (el) {
    var role = state.profile.role; A.skeleton(el);
    if (role === 'parent') {
      var c = A.currentChild(); if (!c) { el.innerHTML = '<div class="note">' + esc(t('no_child')) + '</div>'; return; }
      var ts = must(await db.from('transport_students').select('transport(*)').eq('student_id', c.id).maybeSingle());
      el.innerHTML = ts && ts.transport ? '<div class="card"><h4>🚌 ' + esc(ts.transport.bus_no) + '</h4>' + A.irow('route', ts.transport.route) + A.irow('driver', ts.transport.driver_name) + A.irow('contact_no', ts.transport.driver_phone) + A.irow('notes', ts.transport.notes) + '</div>' : A.emptyMsg('no_transport');
      return;
    }
    async function draw() {
      var rows = must(await db.from('transport').select('*').order('bus_no')), asg = await A.fetchAll(function (a, b) { return db.from('transport_students').select('transport_id').range(a, b); }), cnt = {};
      asg.forEach(function (x) { cnt[x.transport_id] = (cnt[x.transport_id] || 0) + 1; });
      el.innerHTML = (role === 'admin' ? '<button class="btn primary mb" id="trad">＋ ' + esc(t('add_bus')) + '</button>' : '') + (rows.length ? rows.map(function (r) { return '<div class="card tap" data-id="' + r.id + '"><div class="row between"><h4>🚌 ' + esc(r.bus_no) + '</h4><span class="chip info">' + (cnt[r.id] || 0) + ' ' + esc(t('students')) + '</span></div><div class="muted xs">' + esc(r.route || '') + (r.driver_name ? ' · ' + esc(r.driver_name) : '') + (r.driver_phone ? ' · ' + esc(r.driver_phone) : '') + '</div></div>'; }).join('') : A.emptyMsg());
      if (role !== 'admin') return;
      $('#trad', el).onclick = function () { busForm(null); };
      el.querySelectorAll('.card.tap').forEach(function (c) {
        c.onclick = function () {
          var r = rows.filter(function (x) { return x.id === c.getAttribute('data-id'); })[0];
          A.sheet(r.bus_no, [{ icon: '👥', label: t('bus_students'), fn: function () { A.push({ title: function () { return r.bus_no; }, render: function (e) { return busStudents(e, r); } }); } }, { icon: '✏️', label: t('edit'), fn: function () { busForm(r); } },
            { icon: '🗑️', label: t('delete'), fn: async function () { if (!confirm(t('confirm_delete'))) return; try { must(await db.from('transport').delete().eq('id', r.id)); draw(); } catch (e) { toast(A.errText(e), true); } } }]);
        };
      });
    }
    function busForm(r) {
      A.push({ title: function () { return t(r ? 'edit' : 'add_bus'); }, render: function (e) {
        A.mountForm(e, { fields: [{ name: 'bus_no', label: 'bus_no', required: true }, { name: 'route', label: 'route' }, { name: 'driver_name', label: 'driver' }, { name: 'driver_phone', label: 'contact_no' }, { name: 'notes', label: 'notes', type: 'textarea' }], values: r || {}, onSubmit: async function (v) {
          if (r) must(await db.from('transport').update(v).eq('id', r.id)); else must(await db.from('transport').insert(v)); toast(t('saved')); A.pop(); draw();
        } });
      } });
    }
    await draw();
  };
  async function busStudents(el, bus) {
    A.skeleton(el);
    async function draw() {
      var rows = must(await db.from('transport_students').select('student_id, students(full_name, student_code)').eq('transport_id', bus.id));
      el.innerHTML = '<button class="btn primary mb" id="sadd">＋ ' + esc(t('add_student')) + '</button>' + (rows.length ? rows.map(function (r) { return '<div class="card row between"><span>' + esc(r.students ? r.students.full_name : '') + ' <span class="muted xs">' + esc(r.students ? r.students.student_code : '') + '</span></span><button class="btn small danger" data-r="' + r.student_id + '">✕</button></div>'; }).join('') : A.emptyMsg());
      el.querySelectorAll('[data-r]').forEach(function (b) { b.onclick = async function () { try { must(await db.from('transport_students').delete().eq('student_id', b.getAttribute('data-r'))); draw(); } catch (e) { toast(A.errText(e), true); } }; });
      $('#sadd', el).onclick = function () {
        A.push({ title: function () { return t('add_student'); }, render: async function (e) {
          var studs = await A.fetchAll(function (x, y) { return db.from('students').select('id, full_name, student_code').eq('status', 'active').order('full_name').range(x, y); });
          A.mountForm(e, { fields: [{ name: 'student_id', label: 'student', type: 'select', required: true, options: studs.map(function (s) { return { value: s.id, label: s.full_name + ' (' + s.student_code + ')' }; }) }], onSubmit: async function (v) {
            must(await db.from('transport_students').upsert({ student_id: v.student_id, transport_id: bus.id }, { onConflict: 'student_id' })); toast(t('saved')); A.pop(); draw();
          } });
        } });
      };
    }
    await draw();
  }
})();
