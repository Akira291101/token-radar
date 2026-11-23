(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var dialog = document.getElementById('detail');
  var model = DATA.model;
  var state = { q: '', category: 'all', signal: 'all', tab: 'board', sort: 'rank', dir: 1, selected: null };
  var sortDefaults = { rank: 1, name: 1, implied: -1, tvl: -1, growth: -1, age: 1, signal: -1 };
  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var sign = n < 0 ? '-' : '';
    var v = Math.abs(n);
    if (v >= 1e9) return sign + '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return sign + '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return sign + '$' + Math.round(v / 1e3) + 'K';
    return sign + usd.format(v);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtSignal(row) {
    return Math.round(row.confidence * 100) + '/100 ' + row.signal;
  }
  function impliedOf(row) {
    var raw = row.tvl_usd * model.base_multiple * row.growth_multiplier * row.age_multiplier * row.category_multiplier * row.chain_multiplier;
    return Math.max(1, Math.round(raw) - (row.tie_break || 0));
  }
  function catOf(row) { return row.category || 'Other'; }
  function pad3(n) { return String(n).padStart(3, '0'); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string' || typeof child === 'number') node.appendChild(document.createTextNode(String(child)));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('signal')) state.signal = params.get('signal');
    if (params.get('tab')) state.tab = params.get('tab') === 'live' ? 'live' : 'board';
    if (params.get('sort') && sortDefaults[params.get('sort')] !== undefined) state.sort = params.get('sort');
    if (params.get('dir')) state.dir = Number(params.get('dir')) < 0 ? -1 : 1;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.signal !== 'all') params.set('signal', state.signal);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.sort !== 'rank' || state.dir !== sortDefaults.rank) {
      params.set('sort', state.sort);
      params.set('dir', String(state.dir));
    }
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && catOf(r) !== state.category) return false;
      if (state.signal === 'high' && r.signal !== 'high') return false;
      if (!q) return true;
      var hay = [r.name, r.slug, catOf(r), r.category_key, (r.chains || []).join(' '), r.signal, r.listed_at || ''].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d; bv = b.change_7d; }
      else if (key === 'age') { av = a.age_days; bv = b.age_days; }
      else if (key === 'signal') { av = a.confidence; bv = b.confidence; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if ((key === 'growth' || key === 'age') && (av === null || bv === null)) {
        if (av === null && bv === null) return a.rank - b.rank;
        return av === null ? 1 : -1;
      }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.rank - b.rank;
    });
  }
  function sortBy(key) {
    if (state.sort === key) state.dir = -state.dir;
    else {
      state.sort = key;
      state.dir = sortDefaults[key] === undefined ? -1 : sortDefaults[key];
    }
    writeHash();
    render();
  }
  function clearFilters() {
    state.q = '';
    state.category = 'all';
    state.signal = 'all';
    writeHash();
    render();
  }

  function meta(label, value) {
    return el('div', { class: 'meta' }, el('span', { text: label }), el('b', { text: value }));
  }
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('div', null, el('div', { class: 'wordmark', text: 'TOKEN RADAR' }), el('div', { class: 'brand-sub', text: 'PRE-TOKEN SIGNAL BOARD' }))
      ),
      el('div', { class: 'top-meta' },
        meta('Snapshot', DATA.as_of),
        meta('Coverage', DATA.watchlist_size + '/' + DATA.watchlist_size + ' watchlist'),
        meta('Model', DATA.model_version)
      )
    );
  }
  function metric(label, value, lead) {
    return el('div', { class: 'metric' + (lead ? ' lead' : '') }, el('span', { text: label }), el('b', { text: value }));
  }
  function lede() {
    var top = DATA.rows[0];
    return el('section', { class: 'hero' },
      el('div', null,
        el('div', { class: 'eyebrow', text: '01 / THE UNIVERSE' }),
        el('h1', null, el('span', { text: 'Capital before' }), el('span', { class: 'accent-word', text: 'consensus.' })),
        el('p', { text: DATA.board_size + ' protocols with no token on record, scored from one snapshot and ranked by modeled implied value. The leader reads ' + fmtUsd(top.implied_value_usd) + '. Search, filter, then open any row for the arithmetic and the farm plan. Implied value is a model, not a price.' })
      ),
      el('div', { class: 'metrics' },
        metric('Top implied', fmtUsd(top.implied_value_usd), true),
        metric('Rows ranked', String(DATA.board_size)),
        metric('Watchlist', DATA.watchlist_size + ' / ' + DATA.watchlist_size),
        metric('Live set aside', String(DATA.live_size))
      )
    );
  }

  function categoryCounts() {
    var counts = {};
    DATA.rows.forEach(function (r) { var c = catOf(r); counts[c] = (counts[c] || 0) + 1; });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); }).map(function (c) {
      return { name: c, count: counts[c] };
    });
  }
  function categoryChip(value, label, count) {
    return el('button', {
      type: 'button', class: 'chip', 'aria-pressed': state.category === value ? 'true' : 'false',
      onclick: function () { state.category = value; writeHash(); render(); }
    }, label, el('small', { text: String(count) }));
  }
  function segmentedButton(value, label) {
    return el('button', {
      type: 'button', 'aria-pressed': state.signal === value ? 'true' : 'false',
      onclick: function () { state.signal = value; writeHash(); render(); }
    }, label);
  }
  function tabButton(value, label) {
    return el('button', {
      type: 'button', 'aria-pressed': state.tab === value ? 'true' : 'false',
      onclick: function () { state.tab = value; writeHash(); render(); }
    }, label);
  }
  function filterNote() {
    var q = state.q.trim();
    if (!q && state.category === 'all' && state.signal === 'all') return null;
    var bits = [];
    if (state.category !== 'all') bits.push(state.category);
    if (state.signal === 'high') bits.push('high signal');
    if (q) bits.push('“' + q + '”');
    return el('div', { class: 'filter-note' },
      el('span', { class: 'tag', text: 'FILTERED VIEW' }),
      el('span', { text: rows().length + ' of ' + DATA.board_size + ' rows · ' + bits.join(' · ') }),
      el('button', { class: 'link', type: 'button', text: 'Clear all', onclick: clearFilters })
    );
  }
  function controls() {
    var search = el('input', {
      type: 'search', id: 'q', placeholder: 'Search name, chain, category or signal', value: state.q,
      'aria-label': 'Search the board'
    });
    search.addEventListener('input', function () {
      state.q = search.value;
      writeHash();
      render(true);
    });
    var chips = el('div', { class: 'chips', 'aria-label': 'Category filters' }, categoryChip('all', 'All categories', DATA.board_size));
    categoryCounts().forEach(function (c) { chips.appendChild(categoryChip(c.name, c.name, c.count)); });
    var note = filterNote();
    var boardFilters = el('div', { class: 'filters' },
      el('div', { class: 'filter-row' },
        el('div', { class: 'search' }, search),
        el('div', { class: 'segmented', role: 'group', 'aria-label': 'Signal filter' }, segmentedButton('all', 'All rows'), segmentedButton('high', 'High signal'))
      ),
      chips,
      note
    );
    var liveFilters = el('div', { class: 'filters' },
      el('p', { class: 'live-intro', text: 'These ' + DATA.live_size + ' protocols already trade. Their market caps are observations, not estimates, so they are set aside from the ranked pre-token board.' })
    );
    return el('section', null,
      el('div', { class: 'section-head' },
        el('div', null, el('div', { class: 'eyebrow', text: '02 / THE BOARD' }), el('h2', { text: state.tab === 'board' ? 'Ranked pre-token protocols' : 'Live-token reference' })),
        el('p', { class: 'sub', text: 'Sort any column. Open a row for the model inputs, growth response and derived farm plan.' })
      ),
      el('div', { class: 'tabs', role: 'group', 'aria-label': 'View' }, tabButton('board', '01 Ranked board'), tabButton('live', '02 Live reference')),
      state.tab === 'board' ? boardFilters : liveFilters
    );
  }

  function sortHeader(key, label) {
    var active = state.sort === key;
    var arrow = active ? (state.dir < 0 ? ' ↓' : ' ↑') : '';
    return el('th', {
      scope: 'col',
      'aria-sort': active ? (state.dir < 0 ? 'descending' : 'ascending') : 'none'
    }, el('button', { type: 'button', text: label + arrow, onclick: function () { sortBy(key); } }));
  }
  function initialsOf(name) {
    var parts = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
    return parts.length ? (parts[0][0] + (parts.length > 1 ? parts[1][0] : '')).toUpperCase() : '?';
  }
  function growthCell(row) {
    var v = row.change_7d;
    var cls = v === null ? 'flat' : v >= 0 ? 'up' : 'down';
    return el('td', { class: 'num growth ' + cls },
      el('span', { 'aria-hidden': 'true', text: v === null ? '–' : v >= 0 ? '▲' : '▼' }),
      el('b', { text: fmtPct(v) })
    );
  }
  function signalPill(row) {
    return el('span', { class: 'pill ' + row.signal, text: row.signal.toUpperCase() + ' · ' + Math.round(row.confidence * 100) });
  }
  function emptyState() {
    return el('div', { class: 'board' }, el('div', { class: 'empty' },
      el('h2', { text: 'No protocol matches that filter' }),
      el('p', { text: 'Try another category, a shorter search, or return to the full board.' }),
      el('button', { type: 'button', text: 'Clear filters', onclick: clearFilters })
    ));
  }
  function boardTable() {
    var list = sortedRows(rows());
    if (!list.length) return emptyState();
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr', {
        tabindex: '0',
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'rank' + (r.rank <= 10 ? ' rank-top' : ''), text: pad3(r.rank) }),
        el('td', null, el('div', { class: 'protocol' },
          el('span', { class: 'avatar', 'aria-hidden': 'true', text: initialsOf(r.name) }),
          el('div', null,
            el('b', { text: r.name }),
            el('small', { text: catOf(r) + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(' / ') : 'chain unknown') })
          )
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        growthCell(r),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('b', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round(r.implied_value_usd / max * 100)) + '%' }))
        )),
        el('td', null, signalPill(r)),
        el('td', { class: 'chev', 'aria-hidden': 'true', text: '›' })
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'board' }, el('div', { class: 'table-wrap' },
      el('table', null,
        el('caption', { class: 'sr-only', text: 'Pre-token protocols ranked by implied value. Select a column to sort; select a row for details.' }),
        el('thead', null, el('tr', null,
          sortHeader('rank', '#'),
          sortHeader('name', 'Protocol'),
          sortHeader('tvl', 'TVL'),
          sortHeader('growth', '7d change'),
          sortHeader('age', 'Age'),
          sortHeader('implied', 'Implied value'),
          sortHeader('signal', 'Signal'),
          el('th', { 'aria-label': 'Open details' })
        )),
        tbody
      )
    ));
  }
  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'pill', text: 'LIVE' })),
        el('td', null, el('div', { class: 'protocol' },
          el('span', { class: 'avatar', 'aria-hidden': 'true', text: initialsOf(r.name) }),
          el('div', null, el('b', { text: r.name }), el('small', { text: (r.chains || []).slice(0, 2).join(' / ') || 'chain unknown' }))
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        growthCell(r),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'tag-chip', text: catOf(r) }))
      ));
    });
    return el('div', { class: 'board' }, el('div', { class: 'table-wrap' },
      el('table', { class: 'live-table' },
        el('caption', { class: 'sr-only', text: 'Live-token protocols set aside from the pre-token ranking.' }),
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }),
          el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d change' }),
          el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Category' })
        )),
        tbody
      )
    ));
  }

  function modelPanel() {
    var m = DATA.model;
    var constants = [
      ['Base multiple', String(m.base_multiple)],
      ['Growth weight', String(m.growth_weight)],
      ['Growth scale', m.growth_scale_pct + '%'],
      ['Growth clamp', m.growth_floor + '% / ' + m.growth_cap + '%'],
      ['Age peak', m.age_peak_days + 'd'],
      ['Age stale', m.age_stale_days + 'd'],
      ['Age decay', m.age_decay_days + 'd'],
      ['Age floor / gain', m.age_floor + ' / ' + m.age_gain],
      ['Unknown age', m.unknown_age_days + 'd / ' + m.unknown_age_multiplier],
      ['Chain weight', String(m.chain_weight)],
      ['Category keys', String(Object.keys(m.category_weights).length)],
      ['High signal', 'confidence 0.85+']
    ];
    var lines = [
      ['BASE', 'tvl_usd × ' + m.base_multiple],
      ['MOMENTUM', '1 + ' + m.growth_weight + ' × tanh(clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / ' + m.growth_scale_pct + ')'],
      ['MATURITY', m.age_floor + ' + ' + m.age_gain + ' × min(1, age / ' + m.age_peak_days + ') × exp(−max(0, age − ' + m.age_stale_days + ') / ' + m.age_decay_days + ')'],
      ['CATEGORY', Object.keys(m.category_weights).filter(function (k) { return k !== 'default'; }).map(function (k) { return k + ' ' + m.category_weights[k]; }).join(' · ')],
      ['CHAINS', '1 + ' + m.chain_weight + ' × log2(1 + chain count)'],
      ['RESULT', 'round(base × momentum × maturity × category × chains)']
    ];
    return el('section', { class: 'method' },
      el('div', null,
        el('div', { class: 'eyebrow', text: '03 / METHOD' }),
        el('h2', { text: 'One function. Every row.' }),
        el('p', { class: 'sub', text: 'The board recomputes each value from the snapshot fields and the constants below. No protocol name is special-cased, no row is hand-picked, and live-token protocols are never mixed into the ranking.' }),
        el('div', { class: 'formula', text: DATA.model_formula }),
        el('p', { class: 'sub', text: DATA.model_notes })
      ),
      el('div', null,
        el('div', { class: 'constants' }, constants.map(function (c) {
          return el('div', { class: 'constant' }, el('span', { text: c[0] }), el('b', { text: c[1] }));
        })),
        el('div', { class: 'lines' }, lines.map(function (l) {
          return el('div', { class: 'line' }, el('span', { text: l[0] }), el('code', { text: l[1] }));
        }))
      )
    );
  }
  function footer() {
    return el('footer', { class: 'foot' },
      el('span', { text: 'TOKEN RADAR / OFFLINE SNAPSHOT' }),
      el('span', { text: 'AS OF ' + DATA.as_of }),
      el('span', { text: DATA.model_version + ' · ' + DATA.board_size + ' ROWS' })
    );
  }

  function breakRow(label, detail, value, result) {
    return el('div', { class: 'break-row' + (result ? ' result' : '') },
      el('span', { text: label }), el('span', { text: detail }), el('b', { text: value })
    );
  }
  function growthTrace(row) {
    var count = 29;
    var min = model.growth_floor;
    var max = model.growth_cap;
    var span = (max - min) / (count - 1);
    var known = row.change_7d !== null && row.change_7d !== undefined;
    var target = known ? Math.min(max, Math.max(min, row.change_7d)) : 0;
    var bars = [];
    for (var i = 0; i < count; i++) {
      var pct = min + span * i;
      var t = known ? Math.tanh(pct / model.growth_scale_pct) : 0;
      var height = Math.max(2, Math.round(Math.abs(t) * 26));
      var hit = known && Math.abs(pct - target) <= span / 2;
      bars.push(el('i', {
        class: (t < 0 ? 'down' : 'up') + (hit ? ' hit' : ''),
        style: '--h:' + height + 'px'
      }));
    }
    return el('div', { class: 'trace', 'aria-hidden': 'true' }, bars);
  }
  function closeDetail() {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else {
      dialog.removeAttribute('open');
      state.selected = null;
      writeHash();
    }
  }
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var chains = row.chains || [];
    var steps = row.farm_steps || [];
    var inner = el('div', { class: 'detail-inner' });

    inner.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('div', { class: 'eyebrow', text: 'RANK ' + pad3(row.rank) + ' / ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('div', { class: 'tags' }, [catOf(row)].concat(chains.slice(0, 4)).map(function (t) {
          return el('span', { class: 'tag-chip', text: t });
        })),
        el('p', { class: 'detail-meta', text: row.slug + ' · listed ' + (row.listed_at || 'not recorded') + ' · age ' + fmtAge(row.age_days) })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: '✕', onclick: closeDetail })
    ));

    inner.appendChild(el('div', { class: 'value-hero' },
      el('div', null, el('span', { class: 'label', text: 'IMPLIED VALUE' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
      el('div', { class: 'hero-side' }, el('span', { text: 'MODEL ' + DATA.model_version }), el('b', { text: fmtSignal(row) }))
    ));

    inner.appendChild(el('section', { class: 'detail-section' },
      el('div', { class: 'section-kicker', text: '01 / BREAKDOWN' }),
      el('h3', { text: 'Anatomy of the number' }),
      el('div', { class: 'breakdown' },
        breakRow('BASE', 'TVL ' + fmtUsd(row.tvl_usd) + ' × ' + model.base_multiple, fmtUsd(row.tvl_usd * model.base_multiple)),
        breakRow('MOMENTUM', '7d ' + fmtPct(row.change_7d) + ' → tanh response', Number(row.growth_multiplier).toFixed(4) + '×'),
        breakRow('MATURITY', 'age ' + fmtAge(row.age_days) + ' → age response', Number(row.age_multiplier).toFixed(4) + '×'),
        breakRow('CATEGORY', row.category_key + ' keyword weight', Number(row.category_multiplier).toFixed(2) + '×'),
        breakRow('CHAINS', chains.length + ' chain' + (chains.length === 1 ? '' : 's') + ' → breadth weight', Number(row.chain_multiplier).toFixed(4) + '×'),
        breakRow('SIGNAL', row.signal + ' evidence confidence', Math.round(row.confidence * 100) + '/100'),
        breakRow('RESULT', 'model ' + DATA.model_version + ' · recomputed ' + fmtUsd(impliedOf(row)), fmtUsd(row.implied_value_usd), true)
      ),
      el('p', { class: 'detail-note', text: 'Maturity uses the model’s maturity_multiplier (carried here as age_multiplier). The result is an estimate of pre-token value, not a price target.' })
    ));

    inner.appendChild(el('section', { class: 'detail-section' },
      el('div', { class: 'section-kicker', text: '02 / GROWTH RESPONSE' }),
      el('h3', { text: 'Seven-day signal' }),
      growthTrace(row),
      el('div', { class: 'trace-legend' }, el('span', { text: model.growth_floor + '%' }), el('span', { text: 'MODEL CURVE · MARKER = THIS PROTOCOL' }), el('span', { text: '+' + model.growth_cap + '%' })),
      el('p', { class: 'detail-note', text: row.change_7d === null
        ? 'No 7d change in this snapshot; momentum is neutral at 1.0000×.'
        : 'Observed ' + fmtPct(row.change_7d) + ' → ' + Number(row.growth_multiplier).toFixed(4) + '× momentum. The curve is the model’s tanh response across its clamp range, not a price history.' })
    ));

    inner.appendChild(el('section', { class: 'detail-section' },
      el('div', { class: 'section-kicker', text: '03 / FARM PLAN' }),
      el('h3', { text: steps.length + ' derived steps' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        var tm = tail.indexOf(' Time: ');
        var cost = tm >= 0 ? tail.slice(0, tm) : tail;
        var time = tm >= 0 ? tail.slice(tm + 1) : '';
        return el('li', null, el('p', { text: action }), el('small', { text: cost + (time ? ' · ' + time : '') }));
      }))
    ));

    inner.appendChild(el('section', { class: 'detail-section' },
      el('div', { class: 'section-kicker', text: '04 / SNAPSHOT FIELDS' }),
      el('h3', { text: 'What the data carries' }),
      el('p', { class: 'detail-note', text: 'Category key ' + row.category_key + ' · listed ' + (row.listed_at || 'unknown') + ' · age ' + fmtAge(row.age_days) + ' · chains ' + (chains.join(', ') || 'unnamed') + '. TVL ' + fmtUsd(row.tvl_usd) + ', 7d ' + fmtPct(row.change_7d) + ', confidence ' + fmtSignal(row) + '.' })
    ));

    dialog.textContent = '';
    dialog.appendChild(inner);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else dialog.setAttribute('open', '');
  }

  function render(focusSearch) {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'board' ? boardTable() : liveTable());
    shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (state.selected) openDetail(state.selected);
    if (focusSearch) {
      var input = document.getElementById('q');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  }

  dialog.addEventListener('close', function () {
    state.selected = null;
    writeHash();
  });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDetail(); });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open && typeof dialog.close === 'function') dialog.close();
  });
  readHash();
  render();
})();
