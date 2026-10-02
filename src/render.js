// Renders the year-ring as a standalone SVG string from a plain state object.
// No DOM access here, so the same output is used on screen and for export.
(function (root) {
  'use strict';

  const G = typeof module !== 'undefined' && module.exports ? require('./geometry.js') : root.YearRingGeometry;
  const { TAU } = G;

  const C = 600;              // centre of the ring in SVG units
  const R = 400;              // radius of the oldest ring boundary
  const BARK = 26;            // bark thickness outside the oldest ring
  const LABEL_R = R + BARK + 40;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const THEMES = {
    wood: {
      background: '#f3ece0', early: [233, 200, 148], late: [176, 122, 70], boundary: '#6e4524',
      bark: '#4a3021', barkEdge: '#2e1d13', barkText: '#e9d3b0', season: '#8a3b00', spoke: 'rgba(60,35,15,0.28)', text: '#3b2a1c',
      muted: '#7b6450', halo: '#f3ece0', core: '#c99a62', fill: true,
    },
    night: {
      background: '#101318', early: [38, 46, 60], late: [24, 30, 41], boundary: '#5d6b82',
      bark: '#0a0c10', barkEdge: '#3a4456', barkText: '#9fb0c8', season: '#f2c14e', spoke: 'rgba(170,190,220,0.22)', text: '#dde4ef',
      muted: '#8d99ad', halo: '#101318', core: '#4a5870', fill: true,
    },
    paper: {
      background: '#ffffff', early: [255, 255, 255], late: [244, 244, 242], boundary: '#9a9a96',
      bark: '#3d3d3a', barkEdge: '#1f1f1d', barkText: '#f2f2ee', season: '#b8860b', spoke: 'rgba(0,0,0,0.12)', text: '#1f1f1d',
      muted: '#6f6f6a', halo: '#ffffff', core: '#d6d6d2', fill: true,
    },
  };

  // Deterministic PRNG so the wood grain stays stable between renders.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const f1 = (n) => Math.round(n * 10) / 10;
  const rgb = ([r, g, b]) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  // Builds the polar mapping for a given state: depth + angle -> pixel position.
  function makeShape(state) {
    const rand = mulberry32(state.seed || 1);
    const harmonics = [2, 3, 4, 5, 7].map((k, i) => ({ k, amp: rand() / (i + 1.5), phase: rand() * TAU }));
    const total = harmonics.reduce((s, h) => s + h.amp, 0) || 1;
    const wobble = (state.wobble ?? 0.05);
    const scaleOpts = { maxRings: state.maxRings, scale: state.scale, strength: state.strength };

    function radius(depth, angle) {
      let w = 0;
      for (const h of harmonics) w += h.amp * Math.sin(h.k * angle + h.phase + depth * 0.004 * h.k);
      return R * G.scaleDepth(depth, scaleOpts) * (1 + (wobble * w) / total);
    }
    function point(depth, angle) {
      return G.toXY(angle, radius(depth, angle), C, C);
    }
    function closedPath(depth) {
      const steps = Math.round(Math.min(240, Math.max(48, radius(depth, 0) * 0.6)));
      let d = '';
      for (let i = 0; i < steps; i++) {
        const p = point(depth, (i / steps) * TAU);
        d += (i ? 'L' : 'M') + f1(p.x) + ' ' + f1(p.y);
      }
      return d + 'Z';
    }
    // Radial pixel width of ring i, measured at 12 o'clock.
    function ringWidth(i) {
      return radius(i + 1, 0) - radius(i, 0);
    }
    return { radius, point, closedPath, ringWidth };
  }

  function renderWood(state, theme, shape) {
    const out = [];
    const rand = mulberry32((state.seed || 1) * 7919);
    const n = state.maxRings;

    // Bark and the outermost boundary.
    out.push(`<path d="${shape.closedPath(n)}" fill="${theme.bark}" stroke="${theme.bark}" stroke-width="${BARK * 2}" stroke-linejoin="round"/>`);
    out.push(`<path d="${shape.closedPath(n)}" fill="none" stroke="${theme.barkEdge}" stroke-width="${BARK * 2 + 4}" stroke-opacity="0.35" stroke-linejoin="round"/>`);

    // Paint from the oldest ring inwards. Each year starts (Jan) at its outer
    // boundary with light earlywood and ends (Dec) on its inner side with a band
    // of darker latewood, like a real growth ring.
    for (let i = n - 1; i >= 0; i--) {
      const jitter = rand();
      const early = mix(theme.early, theme.late, 0.08 + 0.18 * jitter);
      const late = mix(theme.early, theme.late, 0.75 + 0.25 * rand());
      const latewood = 0.18 + 0.2 * rand();
      out.push(`<path d="${shape.closedPath(i + 1)}" fill="${rgb(early)}" stroke="${theme.boundary}" stroke-width="${shape.ringWidth(i) > 3 ? 0.9 : 0.5}" stroke-opacity="0.85"/>`);
      if (theme.fill && shape.ringWidth(i) > 1.5) {
        out.push(`<path d="${shape.closedPath(i + latewood)}" fill="${rgb(late)}" fill-opacity="0.55"/>`);
      }
    }
    out.push(`<path d="${shape.closedPath(0)}" fill="${theme.core}" stroke="${theme.boundary}" stroke-width="0.9"/>`);
    out.push(`<path d="${shape.closedPath(n)}" fill="url(#shade)"/>`);

    // Faint medullary rays for texture.
    const rays = [];
    for (let k = 0; k < 70; k++) {
      const a = rand() * TAU;
      const d0 = rand() * n * 0.6;
      const d1 = Math.min(n, d0 + n * (0.1 + rand() * 0.4));
      const p0 = shape.point(d0, a);
      const p1 = shape.point(d1, a);
      rays.push(`M${f1(p0.x)} ${f1(p0.y)}L${f1(p1.x)} ${f1(p1.y)}`);
    }
    out.push(`<path d="${rays.join('')}" stroke="${theme.boundary}" stroke-opacity="0.12" stroke-width="0.8" fill="none"/>`);
    return out.join('\n');
  }

  const startOf = (state) => G.startFraction(state.yearStart || '01-01');

  // Fixed approximations; the real dates drift by a day or so between years.
  const SOLSTICES = [
    { name: 'Summer solstice', month: 5, day: 21 },
    { name: 'Winter solstice', month: 11, day: 21 },
  ];
  const EQUINOXES = [
    { name: 'Spring equinox', month: 2, day: 20 },
    { name: 'Autumn equinox', month: 8, day: 22 },
  ];

  // Lines from the centre to the rim on the solstices and/or equinoxes,
  // labelled just inside the bark and running along the line.
  function renderSeasons(state, theme, shape) {
    const marks = [
      ...(state.showSolstices ? SOLSTICES.map((m) => ({ ...m, strong: true })) : []),
      ...(state.showEquinoxes ? EQUINOXES.map((m) => ({ ...m, strong: false })) : []),
    ];
    if (!marks.length) return '';
    const start = startOf(state);
    const out = [];
    for (const mark of marks) {
      const a = G.timeAngle(G.yearFraction({ year: 2001, month: mark.month, day: mark.day }), start);
      const end = shape.point(state.maxRings, a);
      const dash = mark.strong ? '' : ' stroke-dasharray="7 5"';
      out.push(`<line x1="${C}" y1="${C}" x2="${f1(end.x)}" y2="${f1(end.y)}" stroke="${theme.halo}" stroke-width="4" stroke-opacity="0.3"/>`);
      out.push(`<line x1="${C}" y1="${C}" x2="${f1(end.x)}" y2="${f1(end.y)}" stroke="${theme.season}" stroke-width="${mark.strong ? 1.8 : 1.3}"${dash}/>`);
      // Text runs outward along the line; on the left half it is flipped to stay upright.
      const p = G.toXY(a, shape.radius(state.maxRings, a) - 10, C, C);
      const deg = (a * 180) / Math.PI;
      const left = deg > 180;
      const rot = left ? deg + 90 : deg - 90;
      out.push(`<text x="${f1(p.x)}" y="${f1(p.y)}" transform="rotate(${f1(rot)} ${f1(p.x)} ${f1(p.y)})" text-anchor="${left ? 'start' : 'end'}" dy="-5" class="season" fill="${theme.season}" stroke="${theme.halo}"><title>${mark.name}: ${mark.day} ${MONTHS[mark.month]}</title>${mark.name}</text>`);
    }
    return `<g class="seasons">${out.join('')}</g>`;
  }

  function renderMonths(state, theme, shape) {
    const out = [];
    const spokes = [];
    const start = startOf(state);
    for (let m = 0; m < 12; m++) {
      const a = G.timeAngle(m / 12, start);
      const end = shape.point(state.maxRings, a);
      spokes.push(`M${C} ${C}L${f1(end.x)} ${f1(end.y)}`);
      const mid = G.timeAngle((m + 0.5) / 12, start);
      const p = G.toXY(mid, shape.radius(state.maxRings, mid) + BARK / 2, C, C);
      // Rotate along the rim, flipping the lower half so it stays readable.
      let rot = (mid * 180) / Math.PI;
      if (rot > 90 && rot < 270) rot -= 180;
      out.push(`<text x="${f1(p.x)}" y="${f1(p.y)}" transform="rotate(${f1(rot)} ${f1(p.x)} ${f1(p.y)})" class="month" fill="${theme.barkText}" text-anchor="middle" dominant-baseline="central">${MONTHS[m]}</text>`);
    }
    out.unshift(`<path d="${spokes.join('')}" stroke="${theme.spoke}" stroke-width="1" stroke-dasharray="3 5" fill="none"/>`);
    return out.join('\n');
  }

  // Labels every ring that is wide enough, otherwise every 5th or 10th year.
  function renderYearLabels(state, theme, shape) {
    const out = [];
    const angle = TAU * 0.003;
    for (let i = 0; i < state.maxRings; i++) {
      const w = shape.ringWidth(i);
      const step = w >= 13 ? 1 : w >= 5 ? 5 : 10;
      if (i % step !== 0 && i !== state.maxRings - 1) continue;
      if (w < 3.2 && i % 10 !== 0) continue;
      const p = shape.point(i + 0.5, angle);
      const size = Math.max(8, Math.min(13, w * 0.8));
      out.push(`<text x="${f1(p.x + 4)}" y="${f1(p.y)}" class="year" font-size="${f1(size)}" fill="${theme.text}" stroke="${theme.halo}" dominant-baseline="central">${state.referenceYear - i}</text>`);
    }
    return out.join('\n');
  }

  // Spreads label angles apart so nearby people do not overlap at the rim.
  function spreadAngles(items, minSep) {
    const sorted = [...items].sort((a, b) => a.angle - b.angle);
    sorted.forEach((it) => (it.labelAngle = it.angle));
    for (let iter = 0; iter < 200; iter++) {
      let moved = false;
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i];
        const b = sorted[(i + 1) % sorted.length];
        if (a === b) break;
        let gap = b.labelAngle - a.labelAngle;
        if (i === sorted.length - 1) gap += TAU;
        if (gap < minSep) {
          const push = (minSep - gap) / 2 + 1e-4;
          a.labelAngle -= push;
          b.labelAngle += push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return sorted;
  }

  function formatDate({ year, month, day }) {
    return `${day} ${MONTHS[month]} ${year}`;
  }

  // The life spiral is drawn one year at a time so its stroke can follow the
  // ring width; otherwise decades of turns in thin outer rings become a solid disc.
  function lifeSpiral(shape, fromDepth, toDepth, referenceYear, start, color) {
    const out = [];
    for (let ring = Math.floor(fromDepth); ring >= Math.floor(toDepth) && ring >= 0; ring--) {
      const start = Math.min(fromDepth, ring + 1);
      const end = Math.max(toDepth, ring);
      if (start <= end) continue;
      const steps = Math.max(8, Math.ceil((start - end) * 120));
      let d = '';
      for (let i = 0; i <= steps; i++) {
        const depth = start + (end - start) * (i / steps);
        const p = shape.point(depth, G.timeAngle(G.depthTime(depth, referenceYear, start), start));
        d += (i ? 'L' : 'M') + f1(p.x) + ' ' + f1(p.y);
      }
      const width = Math.min(2.4, Math.max(0.4, shape.ringWidth(ring) * 0.22));
      out.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${f1(width)}" stroke-opacity="0.9" stroke-linecap="round"/>`);
    }
    return out.join('');
  }

  function placedPeople(state) {
    const start = startOf(state);
    const result = [];
    for (const person of state.people || []) {
      if (person.visible === false) continue;
      const date = G.parseDate(person.date);
      if (!date) continue;
      const depth = G.dateDepth(date, state.referenceYear, start);
      if (depth < 0 || depth > state.maxRings) continue;
      result.push({ person, date, depth, angle: G.dateAngle(date, start), ring: Math.floor(depth) });
    }
    return result;
  }

  // Rough text width for layout; exact metrics are not available outside a browser.
  const textWidth = (text, size, bold) => String(text).length * size * (bold ? 0.6 : 0.52);

  function grow(bounds, x0, y0, x1, y1) {
    bounds.minX = Math.min(bounds.minX, x0);
    bounds.minY = Math.min(bounds.minY, y0);
    bounds.maxX = Math.max(bounds.maxX, x1);
    bounds.maxY = Math.max(bounds.maxY, y1);
  }

  function renderPeople(state, theme, shape, today, bounds) {
    const items = placedPeople(state);
    if (!items.length) return '';
    const back = [];
    const front = [];
    const labels = [];

    for (const it of items) {
      const color = it.person.color || '#d33';
      const p = shape.point(it.depth, it.angle);
      const selected = state.selectedId && state.selectedId === it.person.id;
      const dim = state.selectedId && !selected;
      const group = `data-id="${esc(it.person.id)}" class="person${selected ? ' selected' : ''}" opacity="${dim ? 0.55 : 1}"`;

      if (state.showBirthRing !== false) {
        back.push(`<g ${group}><path d="${shape.closedPath(it.ring + 1)}" fill="none" stroke="${color}" stroke-width="1.6" stroke-opacity="0.75" stroke-dasharray="6 4"/></g>`);
      }
      if (selected && today) {
        const toDepth = Math.max(0, G.dateDepth(today, state.referenceYear, startOf(state)));
        if (toDepth < it.depth) {
          back.push(lifeSpiral(shape, it.depth, toDepth, state.referenceYear, startOf(state), color));
        }
      }
      const tip = `${it.person.name}: ${formatDate(it.date)}, ring ${it.ring}`;
      front.push(
        `<g ${group}><title>${esc(tip)}</title>` +
          `<line x1="${C}" y1="${C}" x2="${f1(p.x)}" y2="${f1(p.y)}" stroke="${theme.halo}" stroke-width="6" stroke-linecap="round" stroke-opacity="0.8"/>` +
          `<line x1="${C}" y1="${C}" x2="${f1(p.x)}" y2="${f1(p.y)}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>` +
          `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="7" fill="${color}" stroke="${theme.halo}" stroke-width="2.5"/>` +
          `</g>`,
      );
    }

    // Labels sit outside the bark; a leader runs from the dot to the label.
    for (const it of spreadAngles(items, 0.13)) {
      const color = it.person.color || '#d33';
      const p = shape.point(it.depth, it.angle);
      const rim = G.toXY(it.angle, R + BARK + 8, C, C);
      const elbow = G.toXY(it.labelAngle, LABEL_R - 16, C, C);
      const anchorPt = G.toXY(it.labelAngle, LABEL_R, C, C);
      const sx = Math.sin(it.labelAngle);
      const anchor = Math.abs(sx) < 0.25 ? 'middle' : sx > 0 ? 'start' : 'end';
      const cy = -Math.cos(it.labelAngle);
      const dy = Math.abs(sx) < 0.25 ? (cy < 0 ? -12 : 12) : 0;
      const dim = state.selectedId && state.selectedId !== it.person.id;
      const name = it.person.name || '?';
      const sub = `${formatDate(it.date)} · ring ${it.ring}`;
      const w = Math.max(textWidth(name, 17, true), textWidth(sub, 13));
      const x0 = anchor === 'start' ? anchorPt.x : anchor === 'end' ? anchorPt.x - w : anchorPt.x - w / 2;
      grow(bounds, x0, anchorPt.y + dy - 16, x0 + w, anchorPt.y + dy + 22);
      labels.push(
        `<g data-id="${esc(it.person.id)}" class="person" opacity="${dim ? 0.55 : 1}">` +
          `<path d="M${f1(p.x)} ${f1(p.y)}L${f1(rim.x)} ${f1(rim.y)}L${f1(elbow.x)} ${f1(elbow.y)}" fill="none" stroke="${color}" stroke-width="1.2" stroke-dasharray="2 3"/>` +
          `<text x="${f1(anchorPt.x)}" y="${f1(anchorPt.y + dy)}" text-anchor="${anchor}" class="name" fill="${color}" stroke="${theme.halo}">${esc(name)}</text>` +
          `<text x="${f1(anchorPt.x)}" y="${f1(anchorPt.y + dy + 17)}" text-anchor="${anchor}" class="date" fill="${theme.muted}" stroke="${theme.halo}">${esc(sub)}</text>` +
          `</g>`,
      );
    }
    return [back.join('\n'), front.join('\n'), labels.join('\n')].join('\n');
  }

  function renderToday(state, theme, shape, today) {
    if (!today) return '';
    const start = startOf(state);
    const depth = G.dateDepth(today, state.referenceYear, start);
    if (depth < 0 || depth > state.maxRings) return '';
    const p = shape.point(depth, G.dateAngle(today, start));
    return `<g class="today"><title>Today: ${esc(formatDate(today))}</title>` +
      `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="5" fill="${theme.halo}" stroke="${theme.text}" stroke-width="2"/>` +
      `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="1.8" fill="${theme.text}"/></g>`;
  }

  function render(state, options = {}) {
    const theme = THEMES[state.theme] || THEMES.wood;
    const shape = makeShape(state);
    const today = options.today || null;
    const font = "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif";

    // The canvas is fitted to what is drawn: bark first, then labels and title grow it.
    const bounds = { minX: C, minY: C, maxX: C, maxY: C };
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * TAU;
      const p = G.toXY(a, shape.radius(state.maxRings, a) + BARK + 2, C, C);
      grow(bounds, p.x, p.y, p.x, p.y);
    }

    const body = [renderWood(state, theme, shape)];
    if (state.showMonths !== false) body.push(renderMonths(state, theme, shape));
    if (state.showYears !== false) body.push(renderYearLabels(state, theme, shape));
    body.push(renderSeasons(state, theme, shape));
    body.push(renderPeople(state, theme, shape, today, bounds));
    if (state.showToday !== false) body.push(renderToday(state, theme, shape, today));

    if (state.title) {
      const titleY = bounds.minY - 36;
      const w = textWidth(state.title, 30);
      body.push(`<text x="${C}" y="${f1(titleY)}" text-anchor="middle" class="title" fill="${theme.text}">${esc(state.title)}</text>`);
      grow(bounds, C - w / 2, titleY - 30, C + w / 2, titleY);
    }

    // Keep the ring centred horizontally and pad evenly.
    const pad = 36;
    const half = Math.max(C - bounds.minX, bounds.maxX - C) + pad;
    const x = f1(C - half);
    const y = f1(bounds.minY - pad);
    const width = f1(half * 2);
    const height = f1(bounds.maxY - bounds.minY + pad * 2);

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}" font-family="${font}">`,
      `<style>
        .month{font-size:13px;letter-spacing:.18em;text-transform:uppercase}
        .year{paint-order:stroke;stroke-width:3px;stroke-opacity:.75;font-variant-numeric:tabular-nums}
        .name{font-size:17px;font-weight:bold;paint-order:stroke;stroke-width:4px}
        .date{font-size:13px;paint-order:stroke;stroke-width:4px}
        .season{font-size:11px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;paint-order:stroke;stroke-width:3px;stroke-opacity:.45}
        .title{font-size:30px;letter-spacing:.04em}
        .person{cursor:pointer}
      </style>`,
      `<defs><radialGradient id="shade" cx="${C}" cy="${C}" r="${R}" gradientUnits="userSpaceOnUse">` +
        `<stop offset="0" stop-color="#fff" stop-opacity="0.10"/><stop offset="0.7" stop-color="#000" stop-opacity="0"/>` +
        `<stop offset="1" stop-color="#000" stop-opacity="0.16"/></radialGradient></defs>`,
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${theme.background}"/>`,
      ...body,
      '</svg>',
    ].join('\n');
  }

  const api = { render, THEMES, placedPeople };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.YearRingRender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
