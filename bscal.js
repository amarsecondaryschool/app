/* Nepali (BS) calendar with national holidays (like Hamro Patro) shown at the top of the Calendar section */
(function () {
  'use strict';
  var A = window.AMAR, db = A.db, $ = A.$, esc = A.esc, V = A.views;
  var NE = ['बैशाख', 'जेठ', 'असार', 'श्रावण', 'भदौ', 'असोज', 'कार्तिक', 'मंसिर', 'पौष', 'माघ', 'फागुन', 'चैत'], DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var AM = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* [BS month, BS day, name, 1 = public holiday / 0 = festival or observance]  (2083 BS list, from Hamro Patro / Govt. of Nepal) */
  var H2083 = [
    [1, 1, 'Nepali New Year', 1], [1, 18, 'Buddha Jayanti / Labour Day', 1], [2, 14, 'Bakar Eid', 1], [2, 15, 'Republic Day', 1], [3, 6, 'Bhoto Jatra', 0],
    [5, 10, 'Prophet Muhammad Jayanti (Muslims)', 0], [5, 12, 'Janai Purnima / Raksha Bandhan', 1], [5, 13, 'Gai Jatra', 1], [5, 19, 'Krishna Janmashtami', 1], [5, 23, 'Gen-Z Sahid Diwas', 1], [5, 29, 'Haritalika Teej', 1],
    [6, 3, 'Sambidhan Diwas', 1], [6, 9, 'Indra Jatra', 0], [6, 18, 'Jitiya Parva', 0], [6, 25, 'Ghatasthapana', 1], [6, 31, 'Fulpati', 1],
    [7, 1, 'Maha Ashtami', 1], [7, 2, 'Dashain holiday', 1], [7, 3, 'Maha Nawami', 1], [7, 4, 'Bijaya Dashami', 1], [7, 5, 'Dashain holiday', 1], [7, 6, 'Dashain holiday', 1],
    [7, 22, 'Laxmi Puja / Kukur Tihar', 1], [7, 23, 'Tihar – Gai Puja', 1], [7, 24, 'Gobardhan Puja / Nepal Sambat 1147', 1], [7, 25, 'Bhai Tika', 1], [7, 26, 'Tihar holiday', 1], [7, 29, 'Chhath Parva', 0],
    [8, 8, 'Guru Nanak Jayanti', 0], [9, 9, 'Udhauli Parva', 0], [9, 10, 'Christmas Day', 1], [9, 15, 'Tamu Lhosar', 1], [9, 27, 'Prithivi Jayanti', 1],
    [10, 1, 'Maghe Sankranti', 1], [10, 16, 'Sahid Diwas', 1], [10, 24, 'Sonam Lhosar', 1], [10, 28, 'Basanta Panchami / Saraswati Puja', 1],
    [11, 7, 'Prajatantra Diwas', 1], [11, 22, 'Maha Shivaratri', 1], [11, 24, "International Women's Day (women)", 0], [11, 25, 'Gyalpo Lhosar', 1],
    [12, 7, 'Holi (Fagu Purnima)', 1], [12, 8, 'Fagu Purnima (Terai)', 1], [12, 23, 'Ghode Jatra', 0]
  ];
  /* holidays that fall on the same BS date every year (used for other years) */
  var FIXED = [[1, 1, 'Nepali New Year', 1], [2, 15, 'Republic Day', 1], [6, 3, 'Sambidhan Diwas', 1], [9, 27, 'Prithivi Jayanti', 1], [10, 1, 'Maghe Sankranti', 1], [10, 16, 'Sahid Diwas', 1], [11, 7, 'Prajatantra Diwas', 1]];
  function holidays(y, m, d, ad) {
    var out = [], src = y === 2083 ? H2083 : FIXED;
    src.forEach(function (h) { if (h[0] === m && h[1] === d) out.push({ n: h[2], h: !!h[3] }); });
    if (y !== 2083) { if (ad.slice(5) === '05-01') out.push({ n: 'Labour Day', h: true }); if (ad.slice(5) === '12-25') out.push({ n: 'Christmas Day', h: true }); }
    return out;
  }
  A.holidaysOn = function (ad) { var p = A.bsParts(ad); return p ? holidays(p.y, p.m, p.d, ad) : []; };

  var cur = null, pick = null;
  async function draw(box) {
    var tp = A.bsParts(A.today()); if (!cur) cur = { y: tp.y, m: tp.m };
    var info = A.bsMonthInfo(cur.y, cur.m), ev = []; try { ev = (await db.from('calendar_events').select('*')).data || []; } catch (e) {}
    var cells = '', hol = [], i;
    for (i = 0; i < info.wd; i++) cells += '<div class="bc-e"></div>';
    for (var d = 1; d <= info.len; d++) {
      var ad = A.addDays(info.from, d - 1), wd = (info.wd + d - 1) % 7, isT = cur.y === tp.y && cur.m === tp.m && d === tp.d, h = holidays(cur.y, cur.m, d, ad),
        has = ev.filter(function (e) { return e.event_date <= ad && ad <= (e.end_date || e.event_date); }), pub = h.some(function (x) { return x.h; });
      h.forEach(function (x) { hol.push({ d: d, ad: ad, n: x.n, h: x.h }); });
      cells += '<button type="button" class="bc-d' + (isT ? ' today' : '') + (wd === 6 || wd === 0 ? ' sat' : '') + (pub ? ' hol' : '') + (h.length && !pub ? ' fes' : '') + (has.length ? ' ev' : '') + (pick === ad ? ' pick' : '') + '" data-ad="' + ad + '"><b>' + d + '</b><small>' + (+ad.slice(8)) + '</small>' + (has.length || h.length ? '<i></i>' : '') + '</button>';
    }
    var list = ev.filter(function (e) { return e.event_date <= A.addDays(info.from, info.len - 1) && (e.end_date || e.event_date) >= info.from; });
    var a1 = info.from.split('-'), a2 = A.addDays(info.from, info.len - 1).split('-');
    box.innerHTML = '<div class="bc"><div class="bc-h"><button class="bc-n" id="bp">‹</button><div><h3>' + esc(A.BSM[cur.m - 1]) + ' ' + cur.y + '</h3><span>' + NE[cur.m - 1] + ' · ' + AM[+a1[1] - 1] + ' ' + (+a1[2]) + ' – ' + AM[+a2[1] - 1] + ' ' + (+a2[2]) + ', ' + a2[0] + '</span></div><button class="bc-n" id="bn">›</button></div>' +
      '<div class="bc-w">' + DAYS.map(function (x, k) { return '<div' + (k === 6 || k === 0 ? ' class="sat"' : '') + '>' + x + '</div>'; }).join('') + '</div><div class="bc-g">' + cells + '</div>' +
      '<div class="bc-key"><span><i class="k1"></i>Holiday</span><span><i class="k2"></i>Festival</span><span><i class="k3"></i>School event</span><span><i class="k4"></i>Sat &amp; Sun</span></div>' +
      '<div id="bsel"></div>' +
      '<button class="btn small" id="bt" style="margin-top:10px">Today</button>' +
      (hol.length ? '<div class="bc-hl"><h4>Holidays &amp; festivals</h4>' + hol.map(function (x) { return '<div class="' + (x.h ? 'h' : 'f') + '"><b>' + x.d + '</b><span>' + esc(x.n) + '</span><em>' + new Date(x.ad + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }) + '</em></div>'; }).join('') + '</div>' : '') +
      (list.length ? '<div class="bc-l">' + list.map(function (e) { return '<div><b>' + esc(A.fmtDate(e.event_date)) + '</b> ' + esc(e.title) + '</div>'; }).join('') + '</div>' : '') + '</div>';
    function show(ad) {
      var p = A.bsParts(ad), h = A.holidaysOn(ad), wd = new Date(ad + 'T00:00:00Z').getUTCDay(), evs = ev.filter(function (e) { return e.event_date <= ad && ad <= (e.end_date || e.event_date); });
      var lines = h.map(function (x) { return '<div class="' + (x.h ? 'h' : 'f') + '">' + (x.h ? '🔴 ' : '🟠 ') + esc(x.n) + '</div>'; }).concat(evs.map(function (e) { return '<div class="e">📌 ' + esc(e.title) + '</div>'; }));
      if (wd === 6 || wd === 0) lines.unshift('<div class="h">🔴 ' + (wd === 6 ? 'Saturday' : 'Sunday') + ' – weekly holiday</div>');
      $('#bsel', box).innerHTML = '<div class="bc-sel"><b>' + p.d + ' ' + esc(A.BSM[p.m - 1]) + ' ' + p.y + ' · ' + esc(A.bsLongNe(ad)) + '</b><small>' + new Date(ad + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) + '</small>' + (lines.join('') || '<div class="muted sm">Normal school day</div>') + '</div>';
    }
    box.querySelectorAll('.bc-d').forEach(function (b) { b.onclick = function () { pick = b.getAttribute('data-ad'); box.querySelectorAll('.bc-d.pick').forEach(function (x) { x.classList.remove('pick'); }); b.classList.add('pick'); show(pick); }; });
    if (pick) show(pick); else show(A.today());
    $('#bp', box).onclick = function () { cur.m--; if (cur.m < 1) { cur.m = 12; cur.y--; } pick = null; draw(box); };
    $('#bn', box).onclick = function () { cur.m++; if (cur.m > 12) { cur.m = 1; cur.y++; } pick = null; draw(box); };
    $('#bt', box).onclick = function () { cur = null; pick = null; draw(box); };
  }
  var oc = V.calendar;
  V.calendar = async function (el) {
    el.innerHTML = ''; var box = document.createElement('div'), rest = document.createElement('div'); el.appendChild(box); el.appendChild(rest);
    cur = null; pick = null; draw(box).catch(function () {}); return oc ? oc(rest) : null;
  };
})();
