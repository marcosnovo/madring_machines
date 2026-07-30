#!/usr/bin/env node
/**
 * madring-corners.js
 *
 * Finds the 22 corners on the real centreline instead of guessing where they
 * are. Reads the projected geometry from madring-from-geojson.js, walks the
 * lap accumulating heading change, and reports each corner's arc position,
 * total turn angle and direction.
 *
 *     node scripts/madring-corners.js /path/to/f1-circuits
 */
'use strict';

const path = require('path');
process.argv[2] = process.argv[2] || '/tmp/f1-circuits';
const { CP, WORLD, scale, lenM } = require(path.join(__dirname, 'madring-from-geojson.js'));

// Dense resample of the control polygon for stable curvature.
function densify(pts, per) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        for (let k = 0; k < per; k++) {
            const t = k / per;
            out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
    }
    return out;
}
const P = densify(CP, 8);
const N = P.length;

// arc length (world px) at each sample, and total
const segLen = i => Math.hypot(P[(i + 1) % N].x - P[i].x, P[(i + 1) % N].y - P[i].y);
const cum = [0];
for (let i = 0; i < N; i++) cum.push(cum[i] + segLen(i));
const LAP_PX = cum[N];
const pxPerM = LAP_PX / lenM;

// Heading change per sample, smoothed over a window so noise in the source
// polyline does not register as corners.
const SMOOTH = 6;
const heading = i => {
    const a = P[(i - SMOOTH + 2 * N) % N], b = P[(i + SMOOTH) % N];
    return Math.atan2(b.y - a.y, b.x - a.x);
};
const dTheta = new Array(N);
for (let i = 0; i < N; i++) {
    let d = heading((i + 1) % N) - heading(i);
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    dTheta[i] = d;
}

// A corner is a run of samples all turning the same way, whose total heading
// change exceeds THRESH. Straights are the gaps between them.
const THRESH = 16 * Math.PI / 180;   // ignore anything gentler than 16°
const runs = [];
let i = 0;
while (i < N) {
    const sign = Math.sign(dTheta[i]);
    if (sign === 0) { i++; continue; }
    let j = i, total = 0;
    while (j < N && (Math.sign(dTheta[j]) === sign || Math.abs(dTheta[j]) < 0.004)) {
        total += dTheta[j];
        j++;
    }
    if (Math.abs(total) >= THRESH) {
        let peak = i;
        for (let k = i; k < j; k++) if (Math.abs(dTheta[k]) > Math.abs(dTheta[peak])) peak = k;
        runs.push({ start: i, end: j, peak, deg: Math.abs(total) * 180 / Math.PI, dir: total > 0 ? 'R' : 'L' });
    }
    i = j;
}

console.log(`lap ${LAP_PX.toFixed(0)} px = ${lenM.toFixed(0)} m   world ${WORLD.W}×${WORLD.H}   scale ${scale.toFixed(3)} px/m`);
console.log(`corners found (>${(THRESH * 180 / Math.PI).toFixed(0)}°): ${runs.length}\n`);
console.log(' #   turn  dir   apex(x,y)      lap%    arc(m)   preceding straight');
console.log('─'.repeat(74));
runs.forEach((r, k) => {
    const prev = runs[(k - 1 + runs.length) % runs.length];
    const gapPx = k === 0
        ? LAP_PX - cum[prev.end] + cum[r.start]
        : cum[r.start] - cum[prev.end];
    const p = P[r.peak];
    console.log(
        `${String(k + 1).padStart(2)}  ${(r.deg.toFixed(0) + '°').padStart(5)}   ${r.dir}   ` +
        `(${String(Math.round(p.x)).padStart(4)},${String(Math.round(p.y)).padStart(4)})  ` +
        `${(cum[r.peak] / LAP_PX * 100).toFixed(1).padStart(5)}%  ` +
        `${(cum[r.peak] / pxPerM).toFixed(0).padStart(6)}   ` +
        `${(gapPx / pxPerM).toFixed(0).padStart(5)} m`
    );
});

// The longest straights, which is where nitro pickups belong.
console.log('\nlongest straights:');
const gaps = runs.map((r, k) => {
    const prev = runs[(k - 1 + runs.length) % runs.length];
    const gapPx = k === 0 ? LAP_PX - cum[prev.end] + cum[r.start] : cum[r.start] - cum[prev.end];
    return { intoCorner: k + 1, m: gapPx / pxPerM, midIdx: Math.round((prev.end + r.start) / 2) % N };
}).sort((a, b) => b.m - a.m).slice(0, 5);
gaps.forEach(g => {
    const p = P[g.midIdx];
    console.log(`  ${g.m.toFixed(0).padStart(4)} m into corner ${g.intoCorner}  · midpoint (${Math.round(p.x)},${Math.round(p.y)})`);
});
