#!/usr/bin/env node
/**
 * madring-accuracy.js
 *
 * How faithful is the curve the game actually drives?
 *
 * game.js does not store the circuit — it stores N control points and splines
 * them with Catmull-Rom at 20 samples per point. That spline is what the road,
 * the collision mask and the AI waypoints are built from, so the question that
 * matters is not "how good are the control points" but "how far does the
 * splined curve wander from the published centreline".
 *
 * This measures exactly that: for a range of control-point counts it resamples
 * the source polyline, splines it the way game.js does, and reports the lap
 * length plus the mean / p95 / max distance from the splined curve back to the
 * source polyline — in metres, using the same px/m scale the track ships with.
 *
 * The second column of the answer is samples-per-point. Spline error is set by
 * how far apart the control points are, not by how finely the curve is walked,
 * so 256 points at 5 samples each is exactly as accurate as 256 at 20 — and it
 * lands on the same 1280 waypoints the 64-point version produced, which is what
 * keeps the index-addressed machinery (AI look-ahead, tunnel spans measured in
 * waypoints, start-line stagger) behaving as before. Hence SPP=5 on MADRING.
 *
 *     node scripts/madring-accuracy.js [/path/to/f1-circuits] [counts…]
 *     node scripts/madring-accuracy.js /tmp/f1-circuits 64 128 256 384
 *     SPP=5 node scripts/madring-accuracy.js /tmp/f1-circuits 256
 */
'use strict';

const path = require('path');

const REPO = process.argv[2] && !/^\d+$/.test(process.argv[2]) ? process.argv[2] : '/tmp/f1-circuits';
const COUNTS = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const NS = COUNTS.length ? COUNTS : [64, 128, 256, 384];

// Same spline game.js uses. Kept byte-identical in behaviour on purpose — a
// measurement against a different curve would tell us nothing.
function spline(pts, spp) {
    spp = spp || 20;
    const out = [], n = pts.length;
    for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n], p1 = pts[i];
        const p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
        for (let s = 0; s < spp; s++) {
            const t = s / spp, tt = t * t, ttt = tt * t;
            out.push({
                x: 0.5 * (2*p1.x + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*tt + (-p0.x+3*p1.x-3*p2.x+p3.x)*ttt),
                y: 0.5 * (2*p1.y + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*tt + (-p0.y+3*p1.y-3*p2.y+p3.y)*ttt),
            });
        }
    }
    return out;
}

// distance from a point to a segment
function segDist(p, a, b) {
    const vx = b.x - a.x, vy = b.y - a.y;
    const l2 = vx * vx + vy * vy;
    let t = l2 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}
function polyDist(p, poly) {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
        const d = segDist(p, poly[i], poly[(i + 1) % poly.length]);
        if (d < best) best = d;
    }
    return best;
}
function lapLen(p) {
    let L = 0;
    for (let i = 0; i < p.length; i++) L += Math.hypot(p[(i + 1) % p.length].x - p[i].x, p[(i + 1) % p.length].y - p[i].y);
    return L;
}

const GEN = path.join(__dirname, 'madring-from-geojson.js');
function build(n) {
    process.env.NCP = String(n);
    delete require.cache[require.resolve(GEN)];
    process.argv[2] = REPO;
    return require(GEN);
}

const ref = build(NS[0]);
const SRC = ref.SRC;                       // published centreline, world px
const SCALE = ref.scale;                   // px per metre
const srcLenM = lapLen(SRC) / SCALE;

const SPP = Number(process.env.SPP || 20);

console.log(`source polyline : ${SRC.length} points, ${srcLenM.toFixed(0)} m`);
console.log(`scale           : ${SCALE.toFixed(6)} px/m`);
console.log(`samples / point : ${SPP}\n`);
console.log('  cp    world       wp    lap        Δlap      mean     p95      max');
console.log('  ──────────────────────────────────────────────────────────────────────');

const rows = [];
for (const n of NS) {
    const { CP, WORLD } = build(n);
    const wp = spline(CP, SPP);
    const lap = lapLen(wp) / SCALE;
    // Errors are measured on the splined curve — that is the road the car sees.
    const errs = wp.map(p => polyDist(p, SRC) / SCALE).sort((a, b) => a - b);
    const mean = errs.reduce((s, e) => s + e, 0) / errs.length;
    const p95 = errs[Math.floor(errs.length * 0.95)];
    const max = errs[errs.length - 1];
    rows.push({ n, spp: SPP, wp: wp.length, W: WORLD.W, H: WORLD.H, lap, mean, p95, max });
    console.log(
        `  ${String(n).padStart(3)}   ${String(WORLD.W + 'x' + WORLD.H).padStart(9)}` +
        ` ${String(wp.length).padStart(5)}` +
        `  ${lap.toFixed(0).padStart(6)} m  ${(lap - srcLenM >= 0 ? '+' : '') + (lap - srcLenM).toFixed(0)} m`.padEnd(20) +
        `${mean.toFixed(2).padStart(6)} m ${p95.toFixed(2).padStart(6)} m ${max.toFixed(2).padStart(6)} m`);
}

module.exports = rows;
