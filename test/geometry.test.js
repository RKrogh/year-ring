'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../src/geometry.js');

const deg = (rad) => (rad * 180) / Math.PI;

test('parseDate accepts valid ISO dates and rejects invalid ones', () => {
  assert.deepEqual(g.parseDate('1987-05-16'), { year: 1987, month: 4, day: 16 });
  assert.equal(g.parseDate('2023-02-29'), null);
  assert.deepEqual(g.parseDate('2024-02-29'), { year: 2024, month: 1, day: 29 });
  assert.equal(g.parseDate('1987-13-01'), null);
  assert.equal(g.parseDate('nonsense'), null);
});

test('May 16 lands between 4 and 5 o\'clock', () => {
  const a = deg(g.dateAngle(g.parseDate('1987-05-16')));
  assert.ok(a > 120 && a < 150, `angle ${a}`);
});

test('every month owns exactly one 30 degree slice', () => {
  for (let m = 0; m < 12; m++) {
    const first = deg(g.dateAngle({ year: 2001, month: m, day: 1 }));
    const last = deg(g.dateAngle({ year: 2001, month: m, day: g.daysInMonth(2001, m) }));
    assert.ok(first > m * 30 && last < (m + 1) * 30, `month ${m}: ${first}..${last}`);
  }
});

test('ring index counts years back from the reference year', () => {
  const ref = 2026;
  const me = g.parseDate('1987-05-16');
  const son = g.parseDate('2021-05-09');
  assert.equal(g.ringIndex(me, ref), 39);
  assert.equal(Math.floor(g.dateDepth(me, ref)), 39);
  assert.equal(Math.floor(g.dateDepth(son, ref)), 5);
});

test('depth is continuous across new year', () => {
  const ref = 2026;
  const dec31 = g.dateDepth(g.parseDate('2020-12-31'), ref);
  const jan1 = g.dateDepth(g.parseDate('2021-01-01'), ref);
  assert.ok(dec31 > jan1);
  assert.ok(dec31 - jan1 < 2 / 365);
});

test('all scales are monotonic and span core..1', () => {
  for (const scale of ['linear', 'log', 'area']) {
    const opts = { maxRings: 100, scale, strength: 0.2, core: 0.05 };
    assert.equal(g.scaleDepth(0, opts), 0.05);
    assert.ok(Math.abs(g.scaleDepth(100, opts) - 1) < 1e-12);
    let prev = -1;
    for (let d = 0; d <= 100; d += 0.25) {
      const r = g.scaleDepth(d, opts);
      assert.ok(r > prev, `${scale} not monotonic at ${d}`);
      prev = r;
    }
  }
});

test('log scale gives recent rings more room than old ones', () => {
  const opts = { maxRings: 100, scale: 'log', strength: 0.2 };
  const ring5 = g.scaleDepth(6, opts) - g.scaleDepth(5, opts);
  const ring80 = g.scaleDepth(81, opts) - g.scaleDepth(80, opts);
  assert.ok(ring5 > ring80 * 3);
});

test('toXY puts 3 o\'clock to the right and 6 o\'clock down', () => {
  const p3 = g.toXY(Math.PI / 2, 10);
  assert.ok(Math.abs(p3.x - 10) < 1e-9 && Math.abs(p3.y) < 1e-9);
  const p6 = g.toXY(Math.PI, 10);
  assert.ok(Math.abs(p6.y - 10) < 1e-9);
});
