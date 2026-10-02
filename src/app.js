// UI wiring: state, persistence, the people editor and exports.
(function () {
  'use strict';

  const G = window.YearRingGeometry;
  const { render, THEMES } = window.YearRingRender;
  const STORAGE_KEY = 'year-ring:v1';
  const PALETTE = ['#c0392b', '#1f6fb2', '#2e8b57', '#8e44ad', '#d4880f', '#16a0a0', '#c2185b', '#5d6d7e'];

  const now = new Date();
  const today = { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };

  function defaults() {
    return {
      version: 1,
      title: '',
      referenceYear: today.year,
      yearStart: '01-01',
      maxRings: 100,
      scale: 'log',
      strength: 0.15,
      theme: 'wood',
      wobble: 0.05,
      seed: 3,
      showMonths: true,
      showYears: true,
      showToday: true,
      showBirthRing: true,
      showSolstices: false,
      showEquinoxes: false,
      showNewYear: false,
      people: [],
      selectedId: null,
    };
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  // Merges loaded data over defaults so older or partial files still work.
  function normalise(raw) {
    const base = defaults();
    if (!raw || typeof raw !== 'object') return base;
    const state = { ...base, ...raw };
    state.people = Array.isArray(raw.people)
      ? raw.people.map((p, i) => ({
          id: String(p.id || uid()),
          name: String(p.name ?? ''),
          date: String(p.date ?? ''),
          color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : PALETTE[i % PALETTE.length],
          visible: p.visible !== false,
        }))
      : base.people;
    state.maxRings = clamp(Math.round(Number(state.maxRings)) || 100, 1, 300);
    state.referenceYear = Math.round(Number(state.referenceYear)) || today.year;
    state.strength = clamp(Number(state.strength) || 0.15, 0.001, 10);
    state.wobble = clamp(Number(state.wobble) || 0, 0, 0.2);
    state.yearStart = G.parseMonthDay(state.yearStart) ? state.yearStart : '01-01';
    state.selectedId = null;
    return state;
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function loadInitial() {
    const fromHash = readHash();
    if (fromHash) return normalise(fromHash);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return normalise(JSON.parse(saved));
    } catch { /* storage unavailable or corrupt: fall back to defaults */ }
    return defaults();
  }

  function save() {
    try {
      const { selectedId, ...persisted } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch { /* private mode or blocked storage: the page still works */ }
  }

  // Share links carry the whole state in the URL fragment, which never reaches a server.
  function encodeShare() {
    const { selectedId, ...persisted } = state;
    const bytes = new TextEncoder().encode(JSON.stringify(persisted));
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function readHash() {
    const match = /^#s=([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (!match) return null;
    try {
      const bin = atob(match[1].replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  }

  let state = loadInitial();
  const $ = (id) => document.getElementById(id);
  const ringEl = $('ring');
  const peopleEl = $('people');
  const stageEl = document.querySelector('.stage');

  // ---- Diagram -------------------------------------------------------------

  let frame = 0;
  function scheduleDraw() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      ringEl.innerHTML = render(state, { today });
      // The stage takes the diagram's background so the image bleeds to the edges.
      const theme = THEMES[state.theme] || THEMES.wood;
      stageEl.style.background = theme.background;
      stageEl.style.color = theme.muted;
    });
  }

  // The empty-state prompt and the diagram hint depend on whether anyone is listed.
  function updateHints() {
    const empty = state.people.length === 0;
    $('empty').hidden = !empty;
    $('hint').textContent = empty
      ? 'Add a person to mark their birthday on the rings.'
      : "Click a person's line to trace their life spiral.";
  }

  function changed() {
    updateHints();
    save();
    scheduleDraw();
  }

  ringEl.addEventListener('click', (e) => {
    const hit = e.target.closest('[data-id]');
    select(hit ? hit.getAttribute('data-id') : null);
  });

  function select(id) {
    state.selectedId = state.selectedId === id ? null : id;
    peopleEl.querySelectorAll('.person-row').forEach((row) => {
      row.classList.toggle('selected', row.dataset.id === state.selectedId);
    });
    scheduleDraw();
  }

  // ---- People editor -------------------------------------------------------

  // Inserts the dashes while typing digits: 19870516 -> 1987-05-16.
  function autoDash(text) {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    if (digits.length > 6) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
    if (digits.length > 4) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return digits;
  }

  function describe(person) {
    const date = G.parseDate(person.date);
    if (!date) return { text: person.date ? 'Use YYYY-MM-DD' : 'Enter a date (YYYY-MM-DD)', warn: true };
    const start = G.startFraction(state.yearStart);
    const depth = G.dateDepth(date, state.referenceYear, start);
    if (depth < 0) return { text: `After ${state.referenceYear}, not drawn`, warn: true };
    if (depth > state.maxRings) return { text: `Beyond ${state.maxRings} rings, not drawn`, warn: true };
    const ring = Math.floor(depth);
    let age = today.year - date.year;
    if (today.month < date.month || (today.month === date.month && today.day < date.day)) age--;
    const ageText = age >= 0 ? ` · ${age} ${age === 1 ? 'year' : 'years'} old` : '';
    return { text: `Ring ${ring}${ageText}`, warn: false };
  }

  function renderPeopleList() {
    peopleEl.innerHTML = '';
    for (const person of state.people) peopleEl.appendChild(personRow(person));
  }

  function personRow(person) {
    const li = document.createElement('li');
    li.className = 'person-row';
    li.dataset.id = person.id;
    li.style.setProperty('--person', person.color);
    li.classList.toggle('hidden', !person.visible);
    li.classList.toggle('selected', state.selectedId === person.id);
    li.innerHTML = `
      <input class="color" type="color" aria-label="Colour">
      <input class="name" type="text" placeholder="Name" aria-label="Name">
      <div class="date">
        <input class="date-text" type="text" inputmode="numeric" maxlength="10" placeholder="YYYY-MM-DD" aria-label="Birth date (YYYY-MM-DD)" autocomplete="off">
        <button class="pick" type="button" aria-label="Pick a date" title="Pick a date"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5 1.5v3M11 1.5v3"/></svg></button>
        <input class="date-picker" type="date" tabindex="-1" aria-hidden="true">
      </div>
      <button class="remove" type="button" aria-label="Remove" title="Remove">✕</button>
      <div class="info"><span class="text"></span><label><input class="visible" type="checkbox"> show</label></div>`;

    const q = (sel) => li.querySelector(sel);
    q('.color').value = person.color;
    q('.name').value = person.name;
    q('.date-text').value = person.date;
    q('.visible').checked = person.visible;

    const refreshInfo = () => {
      const info = describe(person);
      q('.info .text').textContent = info.text;
      q('.info').classList.toggle('warn', info.warn);
    };
    refreshInfo();
    li.refreshInfo = refreshInfo;

    q('.color').addEventListener('input', (e) => {
      person.color = e.target.value;
      li.style.setProperty('--person', person.color);
      changed();
    });
    q('.name').addEventListener('input', (e) => { person.name = e.target.value; changed(); });
    // The visible field is plain text so the format is always ISO; the native
    // picker (whose display follows the browser locale) is only used as a popup.
    const dateText = q('.date-text');
    const picker = q('.date-picker');
    const setDate = (value) => { person.date = value; refreshInfo(); changed(); };
    dateText.addEventListener('input', (e) => {
      if (e.inputType && e.inputType.startsWith('insert')) dateText.value = autoDash(dateText.value);
      setDate(dateText.value.trim());
    });
    q('.pick').addEventListener('click', () => {
      picker.value = G.parseDate(dateText.value) ? dateText.value : '';
      try {
        picker.showPicker();
      } catch {
        picker.focus();
        picker.click();
      }
    });
    picker.addEventListener('change', () => {
      if (!picker.value) return;
      dateText.value = picker.value;
      setDate(picker.value);
    });
    q('.visible').addEventListener('change', (e) => {
      person.visible = e.target.checked;
      li.classList.toggle('hidden', !person.visible);
      changed();
    });
    q('.remove').addEventListener('click', (e) => {
      e.stopPropagation();
      state.people = state.people.filter((p) => p !== person);
      if (state.selectedId === person.id) state.selectedId = null;
      li.remove();
      changed();
    });
    li.addEventListener('click', (e) => {
      if (e.target.closest('input, button, label')) return;
      select(person.id);
    });
    return li;
  }

  function refreshAllInfo() {
    peopleEl.querySelectorAll('.person-row').forEach((row) => row.refreshInfo && row.refreshInfo());
  }

  $('add-person').addEventListener('click', () => {
    const used = new Set(state.people.map((p) => p.color));
    const color = PALETTE.find((c) => !used.has(c)) || PALETTE[state.people.length % PALETTE.length];
    const person = { id: uid(), name: '', date: '', color, visible: true };
    state.people.push(person);
    const row = personRow(person);
    peopleEl.appendChild(row);
    row.querySelector('.name').focus();
    changed();
  });

  // ---- Settings ------------------------------------------------------------

  const fmt = {
    maxRings: (v) => String(v),
    strength: (v) => Number(v).toFixed(2),
    wobble: (v) => `${Math.round(v * 1000) / 10}%`,
  };

  function bindRange(id, parse = Number) {
    const input = $(id);
    const out = $(`${id}-out`);
    input.value = state[id];
    if (out) out.textContent = fmt[id](state[id]);
    input.addEventListener('input', () => {
      state[id] = parse(input.value);
      if (out) out.textContent = fmt[id](state[id]);
      if (id === 'maxRings') refreshAllInfo();
      changed();
    });
  }

  function bindValue(id, parse = (v) => v) {
    const input = $(id);
    input.value = state[id];
    input.addEventListener('input', () => {
      const v = parse(input.value);
      if (v === null) return;
      state[id] = v;
      if (id === 'scale') updateStrengthVisibility();
      if (id === 'referenceYear') refreshAllInfo();
      changed();
    });
  }

  const TOGGLES = ['showMonths', 'showYears', 'showToday', 'showBirthRing', 'showSolstices', 'showEquinoxes', 'showNewYear'];

  function bindToggle(id) {
    const input = $(id);
    input.checked = !!state[id];
    input.addEventListener('change', () => { state[id] = input.checked; changed(); });
  }

  // Year start: a preset list plus a custom MM-DD field shown only when needed.
  function syncYearStart() {
    const preset = $('yearStartPreset');
    const known = [...preset.options].some((o) => o.value === state.yearStart);
    preset.value = known ? state.yearStart : 'custom';
    $('yearStart-custom-row').hidden = known;
    $('yearStartCustom').value = state.yearStart;
    $('yearStartCustom').classList.remove('invalid');
  }

  function setYearStart(value) {
    state.yearStart = value;
    refreshAllInfo();
    changed();
  }

  function bindYearStart() {
    syncYearStart();
    $('yearStartPreset').addEventListener('change', (e) => {
      const custom = e.target.value === 'custom';
      $('yearStart-custom-row').hidden = !custom;
      if (custom) $('yearStartCustom').focus();
      else setYearStart(e.target.value);
    });
    $('yearStartCustom').addEventListener('input', (e) => {
      const field = e.target;
      if (e.inputType && e.inputType.startsWith('insert')) {
        const digits = field.value.replace(/\D/g, '').slice(0, 4);
        field.value = digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
      }
      const md = G.parseMonthDay(field.value);
      field.classList.toggle('invalid', !md && field.value.length > 0);
      if (md) setYearStart(`${String(md.month + 1).padStart(2, '0')}-${String(md.day).padStart(2, '0')}`);
    });
  }

  function updateStrengthVisibility() {
    $('strength-row').hidden = state.scale !== 'log';
  }

  function bindAll() {
    bindRange('maxRings', (v) => parseInt(v, 10));
    bindRange('strength');
    bindRange('wobble');
    bindValue('scale');
    bindValue('theme');
    bindValue('title');
    bindValue('referenceYear', (v) => {
      const n = parseInt(v, 10);
      return n >= 1 && n <= 9999 ? n : null;
    });
    TOGGLES.forEach(bindToggle);
    bindYearStart();
    updateStrengthVisibility();
  }

  // Re-syncs every control after the whole state is replaced (load, reset).
  function syncControls() {
    ['maxRings', 'strength', 'wobble', 'scale', 'theme', 'title', 'referenceYear'].forEach((id) => {
      $(id).value = state[id];
      const out = $(`${id}-out`);
      if (out) out.textContent = fmt[id](state[id]);
    });
    TOGGLES.forEach((id) => ($(id).checked = !!state[id]));
    syncYearStart();
    updateStrengthVisibility();
    renderPeopleList();
  }

  $('reseed').addEventListener('click', () => {
    state.seed = Math.floor(Math.random() * 1e6) + 1;
    changed();
  });

  // ---- Export / import -----------------------------------------------------

  function status(text) {
    $('status').textContent = text;
    clearTimeout(status.timer);
    status.timer = setTimeout(() => ($('status').textContent = ''), 4000);
  }

  function fileBase() {
    const slug = (state.title || 'year-ring').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return slug || 'year-ring';
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Exports never include the selection highlight.
  const exportSvg = () => render({ ...state, selectedId: null }, { today });

  $('export-svg').addEventListener('click', () => {
    download(new Blob([exportSvg()], { type: 'image/svg+xml' }), `${fileBase()}.svg`);
  });

  $('export-png').addEventListener('click', () => {
    const svg = exportSvg();
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      // Rendered at 2x the SVG's own size for a print-friendly image.
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob) download(blob, `${fileBase()}.png`);
        else status('PNG export failed in this browser; try SVG.');
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      status('PNG export failed in this browser; try SVG.');
    };
    img.src = url;
  });

  $('export-json').addEventListener('click', () => {
    const { selectedId, ...persisted } = state;
    download(new Blob([JSON.stringify(persisted, null, 2)], { type: 'application/json' }), `${fileBase()}.json`);
  });

  $('import-json').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      state = normalise(JSON.parse(await file.text()));
      syncControls();
      changed();
      status(`Loaded ${file.name}`);
    } catch {
      status('That file is not valid year-ring JSON.');
    }
  });

  $('share').addEventListener('click', async () => {
    const url = `${location.href.split('#')[0]}#s=${encodeShare()}`;
    try {
      await navigator.clipboard.writeText(url);
      status('Link copied. It contains the dates, so share it with care.');
    } catch {
      history.replaceState(null, '', url);
      status('Clipboard blocked; the link is now in the address bar.');
    }
  });

  $('reset').addEventListener('click', () => {
    if (!confirm('Clear all people and settings?')) return;
    state = defaults();
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    syncControls();
    changed();
  });

  // ---- Boot ----------------------------------------------------------------

  bindAll();
  renderPeopleList();
  updateHints();
  scheduleDraw();
})();
