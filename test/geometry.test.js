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

test('year start defaults to January 1 and parses MM-DD', () => {
  assert.equal(g.startFraction('01-01'), 0);
  assert.equal(g.startFraction('bogus'), 0);
  assert.equal(g.parseMonthDay('02-29'), null);
  assert.deepEqual(g.parseMonthDay('12-21'), { month: 11, day: 21 });
  assert.ok(Math.abs(g.startFraction('07-01') - 0.5) < 1e-12);
});

test('winter solstice start puts December 21 at 12 o\'clock', () => {
  const s = g.startFraction('12-21');
  const a = deg(g.dateAngle(g.parseDate('2020-12-21'), s));
  assert.ok(a > 0 && a < 1.5, `angle ${a}`);
  // January 1 is now about 11 days past 12 o'clock.
  const jan = deg(g.dateAngle(g.parseDate('2021-01-01'), s));
  assert.ok(jan > 10 && jan < 13, `jan angle ${jan}`);
});

test('a solstice-to-solstice ring is named after the year holding most of it', () => {
  const s = g.startFraction('12-21');
  const ref = 2026;
  // 25 Dec 2025 already belongs to the 2026 ring (ring 0).
  assert.equal(g.ringIndex(g.parseDate('2025-12-25'), ref, s), 0);
  assert.equal(g.ringIndex(g.parseDate('2025-12-20'), ref, s), 1);
  assert.equal(g.ringIndex(g.parseDate('1987-05-16'), ref, s), 39);
  // The ring boundary sits exactly on the start.
  const before = g.dateDepth(g.parseDate('2025-12-20'), ref, s);
  const after = g.dateDepth(g.parseDate('2025-12-21'), ref, s);
  assert.ok(before > 1 && after < 1);
});

test('depthTime inverts dateDepth for any start', () => {
  for (const start of ['01-01', '03-20', '06-21', '12-21']) {
    const s = g.startFraction(start);
    const d = g.parseDate('1987-05-16');
    const depth = g.dateDepth(d, 2026, s);
    assert.ok(Math.abs(g.depthTime(depth, 2026, s) - g.dateTime(d)) < 1e-9);
  }
});
