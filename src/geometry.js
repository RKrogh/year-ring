// Pure geometry for the year-ring: maps calendar dates to polar coordinates.
//
// Model:
//   - Angle: the year is a clock face. Month m (0 = January) owns a 30° slice,
//     by default from m o'clock to m+1 o'clock, measured clockwise from 12. The
//     day picks a position inside that slice. A configurable year start (e.g. the
//     winter solstice) rotates the clock so that day sits at 12.
//   - Depth: the reference year is ring 0 at the centre; each older year pushes
//     one ring further out. Depth is continuous, so a date also has a radial
//     position inside its ring: later in the year means closer to the centre.
//     Time is therefore one continuous spiral, and the year start is the ring boundary.
//   - Radius: depth is mapped to a radius through a configurable scale
//     (linear, logarithmic or equal-area), so recent years can get more room.
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  }

  // Parses 'YYYY-MM-DD' without going through local time zones.
  function parseDate(text) {
    const match = /^(\d{1,4})-(\d{1,2})-(\d{1,2})$/.exec(String(text).trim());
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    if (month < 0 || month > 11 || day < 1 || day > daysInMonth(year, month)) return null;
    return { year, month, day };
  }

  // Fraction of the year elapsed at the middle of the given day, in [0, 1).
  // Every month is exactly 1/12, matching the clock-face slices.
  function yearFraction({ year, month, day }) {
    return (month + (day - 0.5) / daysInMonth(year, month)) / 12;
  }

  // Parses a year start given as 'MM-DD'. February 29 is rejected since most years lack it.
  function parseMonthDay(text) {
    const match = /^(\d{1,2})-(\d{1,2})$/.exec(String(text).trim());
    if (!match) return null;
    const month = Number(match[1]) - 1;
    const day = Number(match[2]);
    if (month < 0 || month > 11 || day < 1 || day > daysInMonth(2001, month)) return null;
    return { month, day };
  }

  // Where the year starts, as a fraction of the calendar year (0 = January 1).
  // The start is the beginning of that day, so a date on it sits just past 12 o'clock.
  function startFraction(yearStart) {
    const md = typeof yearStart === 'string' ? parseMonthDay(yearStart) : yearStart;
    if (!md) return 0;
    return (md.month + (md.day - 1) / daysInMonth(2001, md.month)) / 12;
  }

  const frac = (x) => x - Math.floor(x);

  // Continuous time in years, e.g. 1987.37 for mid-May 1987.
  function dateTime(date) {
    return date.year + yearFraction(date);
  }

  // Clock angle in radians, clockwise from 12 o'clock, which is the year start `s`.
  function timeAngle(t, s = 0) {
    return frac(t - s) * TAU;
  }

  function dateAngle(date, s = 0) {
    return timeAngle(dateTime(date), s);
  }

  // Time at which ring 0 begins. Each ring runs from one year start to the next,
  // and ring 0 is the one whose middle falls in the reference year, so a ring
  // is named after the calendar year holding most of it.
  function ringZeroStart(referenceYear, s = 0) {
    return referenceYear + s - (s >= 0.5 ? 1 : 0);
  }

  // Continuous depth in rings. Ring 0 spans depth [0, 1), the ring before
  // [1, 2), and so on; ring index = Math.floor(depth), ring k is named referenceYear - k.
  function dateDepth(date, referenceYear, s = 0) {
    return ringZeroStart(referenceYear, s) + 1 - dateTime(date);
  }

  // Inverse of dateDepth: the time at a given depth.
  function depthTime(depth, referenceYear, s = 0) {
    return ringZeroStart(referenceYear, s) + 1 - depth;
  }

  function ringIndex(date, referenceYear, s = 0) {
    return Math.floor(dateDepth(date, referenceYear, s));
  }

  // Normalised radius in [0, 1] for a depth in [0, maxRings].
  // `strength` only applies to the log scale: higher means more room for recent years.
  function scaleDepth(depth, { maxRings, scale = 'log', strength = 0.15, core = 0.04 }) {
    const t = Math.min(Math.max(depth / maxRings, 0), 1);
    let s;
    switch (scale) {
      case 'linear':
        s = t;
        break;
      case 'area':
        // Every ring has the same area, like evenly growing wood: outer rings are thinner.
        s = Math.sqrt(t);
        break;
      case 'log':
      default: {
        const k = Math.max(strength, 1e-6) * maxRings;
        s = Math.log1p(k * t) / Math.log1p(k);
        break;
      }
    }
    // A small core keeps ring 0 from collapsing into a dot.
    return core + (1 - core) * s;
  }

  // Polar to SVG cartesian (y grows downwards, angle clockwise from 12).
  function toXY(angle, radius, cx = 0, cy = 0) {
    return { x: cx + radius * Math.sin(angle), y: cy - radius * Math.cos(angle) };
  }

  const api = {
    TAU, daysInMonth, parseDate, parseMonthDay, yearFraction, startFraction, dateTime, timeAngle,
    dateAngle, ringZeroStart, dateDepth, depthTime, ringIndex, scaleDepth, toXY,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.YearRingGeometry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
