// Chance scores for the Stats screens. chance(p, t) is the share of all colors farther from pick p than
// target t is (ties half): uniform on 0..1 when t is random, whatever p is, so chance averages 50%.
// Shares are counted on evenly spaced grids of cell centers rather than all 16.7M colors.

function grid(steps) {
  const size = 256 / steps, out = [];
  for (let r = 0; r < steps; r++) for (let g = 0; g < steps; g++) for (let b = 0; b < steps; b++) {
    out.push([size / 2 + r * size, size / 2 + g * size, size / 2 + b * size]);
  }
  return out;
}
const GRID16 = grid(16); // 4096 points, for scoring
const GRID8 = grid(8);   // 512 points, for the chance band

function dist2(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function chance(p, t) {
  const d = dist2(p, t);
  let score = 0;
  for (const s of GRID16) {
    const x = dist2(p, s);
    if (x > d) score += 1; else if (x === d) score += 0.5;
  }
  return score / GRID16.length;
}

// Variance of the round's mean chance score when the target is random (each GRID8 point in turn).
// Picks share one target, so their scores move together; this keeps that correlation in the band.
function nullVar(picks) {
  if (!picks.length) return 0;
  const K = GRID8.length, mean = new Float64Array(K);
  for (const p of picks) {
    const d = GRID8.map(s => dist2(p, s));
    const order = d.map((_, i) => i).sort((a, b) => d[a] - d[b]);
    for (let a = 0; a < K;) {
      let b = a;
      while (b < K && d[order[b]] === d[order[a]]) b++;
      const u = (K - b + (b - a) / 2) / K; // farther ones, plus half the ties
      for (let i = a; i < b; i++) mean[order[i]] += u / picks.length;
      a = b;
    }
  }
  let sum = 0, sq = 0;
  for (const m of mean) { sum += m; sq += m * m; }
  return sq / K - (sum / K) * (sum / K);
}

function avg(xs) { return xs.reduce((s, x) => s + x, 0) / xs.length; }

function roundStats(picks, quantum, prng) {
  const q = picks.map(p => chance(p, quantum));
  const p = prng ? picks.map(x => chance(x, prng)) : null;
  return {
    n: picks.length,
    qMean: picks.length ? avg(q) : null,
    pMean: p && picks.length ? avg(p) : null,
    nullVar: nullVar(picks),
    q, p,
  };
}

const pct = x => Math.round(x * 1000) / 10;

function bandFor(n, variance) {
  if (!n) return null;
  const half = 1.96 * Math.sqrt(variance);
  return [pct(0.5 - half), pct(0.5 + half)];
}

const MAX_POINTS = 40;

// rows: { roundId, n, qMean, pMean, nullVar }, oldest first. Rounds are independent, so their
// variances add, weighted by pick count.
function summary(rows) {
  rows = rows.filter(r => r.n > 0);
  if (!rows.length) {
    return { rounds: 0, picks: 0, quantum: null, algorithm: null, algorithmRounds: 0, algorithmSince: null, band: null, series: [] };
  }
  let n = 0, q = 0, v = 0, an = 0, a = 0, algorithmRounds = 0, algorithmSince = null;
  const running = rows.map(r => {
    n += r.n; q += r.n * r.qMean; v += r.n * r.n * r.nullVar;
    if (r.pMean != null) {
      an += r.n; a += r.n * r.pMean; algorithmRounds++;
      if (algorithmSince == null) algorithmSince = r.roundId;
    }
    const half = 1.96 * Math.sqrt(v) / n;
    return { t: r.roundId, q: pct(q / n), a: an ? pct(a / an) : null, lo: pct(0.5 - half), hi: pct(0.5 + half) };
  });
  const last = running[running.length - 1];
  const L = running.length;
  const series = L <= MAX_POINTS ? running : Array.from({ length: MAX_POINTS }, (_, i) => running[Math.round(i * (L - 1) / (MAX_POINTS - 1))]);
  return {
    rounds: rows.length, picks: n, quantum: last.q, algorithm: last.a, algorithmRounds, algorithmSince,
    band: [last.lo, last.hi], series,
  };
}

module.exports = { chance, nullVar, roundStats, summary, bandFor };
