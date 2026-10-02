'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { render, placedPeople } = require('../src/render.js');

const base = {
  referenceYear: 2026, maxRings: 100, scale: 'log', strength: 0.15, theme: 'wood', seed: 3,
  people: [
    { id: 'a', name: 'Me', date: '1987-05-16', color: '#c0392b' },
    { id: 'b', name: 'Son <3', date: '2021-05-09', color: '#1f6fb2' },
    { id: 'c', name: 'Too old', date: '1900-01-01', color: '#000000' },
    { id: 'd', name: 'Hidden', date: '2000-01-01', color: '#000000', visible: false },
  ],
};

test('only visible people inside the ring range are placed', () => {
  const names = placedPeople(base).map((p) => p.person.name);
  assert.deepEqual(names, ['Me', 'Son <3']);
});

test('render produces a well-formed svg with escaped labels', () => {
  const svg = render(base, { today: { year: 2026, month: 9, day: 2 } });
  assert.match(svg, /^<svg [^>]*viewBox="[-\d. ]+"/);
  assert.ok(svg.trim().endsWith('</svg>'));
  assert.ok(svg.includes('Son &lt;3'));
  assert.ok(!svg.includes('Son <3'));
  assert.ok(svg.includes('16 May 1987 · ring 39'));
  assert.ok(!svg.includes('NaN'));
});

test('render is deterministic for the same state', () => {
  assert.equal(render(base), render(base));
});

test('a selected person gets a life spiral', () => {
  const plain = render(base, { today: { year: 2026, month: 9, day: 2 } });
  const selected = render({ ...base, selectedId: 'b' }, { today: { year: 2026, month: 9, day: 2 } });
  assert.ok(selected.length > plain.length);
});

test('season lines appear only when toggled', () => {
  assert.ok(!render(base).includes('Winter solstice'));
  const svg = render({ ...base, showSolstices: true, showEquinoxes: true });
  for (const name of ['Summer solstice', 'Winter solstice', 'Spring equinox', 'Autumn equinox']) {
    assert.ok(svg.includes(name), name);
  }
});

test('year start changes placement but not ring numbers for mid-year dates', () => {
  const solstice = render({ ...base, yearStart: '12-21' });
  assert.notEqual(solstice, render(base));
  assert.ok(solstice.includes('16 May 1987 · ring 39'));
  assert.ok(!solstice.includes('NaN'));
});
