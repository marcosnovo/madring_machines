#!/usr/bin/env node
/**
 * madring-road-centre.js
 *
 * Writes scripts/madring-centreline.js — the line the game actually races,
 * measured off the middle of the 3D model's asphalt.
 *
 *   seed  : scripts/madring-geodata-centreline.js — the published polyline
 *           (bacinger/f1-circuits, MIT), which fixes the identity of the lap:
 *           where the start/finish line is, which way round it goes, and in
 *           what order the corners come.
 *   truth : madring-3d/assets/madring-sketchfab/scene.gltf, TarmacDark — the
 *           real driving surface of "Circuito de Madring 2026 layout" by Dave
 *           Love, CC-BY-4.0. See NOTICE.
 *   frame : scripts/madring-model-fit.js, which has already registered the two.
 *
 * Why this exists
 * ───────────────
 * The published polyline and the model agree over 88% of the lap and disagree
 * badly over one ~640 m stretch (37%-49%, the run into La Monumental), where
 * the geodata cuts diagonally across the infield and the model's tarmac
 * carries on up the left-hand straight and loops wider. Something had to give,
 * because images/madring-overhead.jpg is a render of the model: whatever the
 * road disagrees with, the player sees under the wheels. The model wins —
 * it is the thing on screen, its lap (5429 m) is closer to the published
 * 5474 m than the polyline's (5415 m), and madring-3d already races it, so
 * both games now drive the same circuit.
 *
 * How
 * ───
 * The model's tarmac is rasterised to a 1 m grid. Every sample of the seed
 * curve scans sideways across that grid, cuts the scan into runs of asphalt,
 * and moves to the middle of the nearest run that is road-shaped — no wider
 * than ROAD_MAX, so a run-off apron or the pit lane cannot swallow the line.
 * Four passes, starting wide enough to drag the samples across the infield
 * (34 m) and narrowing to settle them (20 m), smoothing and re-spacing in
 * between so a sample that found nothing is carried by its neighbours.
 * Finally the lap is re-spaced to 256 control points at even arc length.
 *
 * Index 0 is then rotated onto the model's own start/finish gantry, so the
 * game's timing line, its grid and its checkpoints sit on the painted line in
 * the baked image rather than near it.
 *
 * The method is the same one madring-3d/scripts/fit-circuit.mjs uses to build
 * its road.ts, which is why the two come out within a metre of each other on
 * lap length. This one works in world pixels and emits control points; that
 * one works in metres and emits a dense road with heights and banking.
 *
 *     node scripts/madring-road-centre.js          # rewrite the centreline
 *     node scripts/madring-road-centre.js --check  # measure, change nothing
 *
 * It also writes scripts/madring-road-centre.png, a plan view: the model's
 * asphalt in grey, the geodata seed in blue, the line the game drives in red.
 *
 * After running this, paste MADRING_CP into TRACKS[0].cp in game.js and re-run
 * scripts/madring-bake-overhead.js and scripts/trackcheck.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FIT = require('./madring-model-fit.js');
const SEED = require('./madring-geodata-centreline.js');

const OUT = path.join(__dirname, 'madring-centreline.js');
const PLAN = path.join(__dirname, 'madring-road-centre.png');
const CHECK_ONLY = process.argv.includes('--check');

const NCP = 256;          // control points emitted; game.js pairs this with spp 5
const SAMPLES = 1024;     // working resolution around the lap
const GAME_SPP = 5;

const R = FIT.surfaceRaster();
/** World pixels per model metre. The fit measured it; nothing here assumes it. */
const M = 1 / FIT.metresPerWorldPx;

// Everything below is in world pixels, converted to metres only for reporting.
const WINDOW = 60 * M;     // how far sideways a sample looks for asphalt
const STEP = 0.5 * M;      // scan resolution
const ROAD_MAX = 36 * M;   // widest run we will call "road" rather than "apron"
const EDGE_CAP = 20 * M;   // fallback half-width when no run is road-shaped

function paved(x, y) {
    const [mx, mz] = FIT.worldToModel(x, y);
    const ix = Math.floor((mx - R.ox) / R.res), iy = Math.floor((mz - R.oz) / R.res);
    if (ix < 0 || iy < 0 || ix >= R.W || iy >= R.H) return false;
    return R.mask[iy * R.W + ix] === 1;
}

/** The same closed Catmull-Rom game.js drives. */
function spline(pts, spp) {
    const out = [], n = pts.length;
    for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
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

function resample(pts, n) {
    const m = pts.length, seg = [];
    let total = 0;
    for (let i = 0; i < m; i++) {
        const d = Math.hypot(pts[(i + 1) % m].x - pts[i].x, pts[(i + 1) % m].y - pts[i].y);
        seg.push(d); total += d;
    }
    const out = [];
    let i = 0, acc = 0;
    for (let k = 0; k < n; k++) {
        const target = total * k / n;
        while (acc + seg[i] < target) { acc += seg[i]; i = (i + 1) % m; }
        const t = seg[i] > 1e-9 ? (target - acc) / seg[i] : 0;
        const a = pts[i], b = pts[(i + 1) % m];
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return { points: out, length: total };
}

const smoothClosed = (v, half) => {
    const n = v.length;
    return v.map((_, i) => {
        let s = 0;
        for (let j = -half; j <= half; j++) s += v[(i + j + 2 * n) % n];
        return s / (2 * half + 1);
    });
};

/**
 * One pass: move every sample sideways onto the middle of the asphalt.
 *
 * `reach` caps both how far sideways a sample may look and how far it may
 * end up from where it started — wide enough on the first pass to cross the
 * infield, narrow later so a sample already on the track cannot hop onto the
 * pit lane. A run that touches the end of the scan window is `clipped`: we
 * cannot tell how wide it really is, so it is not eligible for the
 * road-shaped test.
 */
function snap(points, reach) {
    const n = points.length, out = [];
    let missed = 0;
    for (let i = 0; i < n; i++) {
        const p = points[i], a = points[(i - 1 + n) % n], b = points[(i + 1) % n];
        let tx = b.x - a.x, ty = b.y - a.y;
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const rx = -ty, ry = tx;

        const runs = [];
        let runStart = null;
        for (let d = -WINDOW; d <= WINDOW + STEP * 1.5; d += STEP) {
            const on = d <= WINDOW + STEP / 2 && paved(p.x + rx * d, p.y + ry * d);
            if (on && runStart === null) runStart = d;
            else if (!on && runStart !== null) {
                const to = d - STEP;
                runs.push({ from: runStart, to, clipped: runStart <= -WINDOW || to >= WINDOW - STEP / 2 });
                runStart = null;
            }
        }
        const cand = runs.filter(r => !(r.from > reach || r.to < -reach));
        if (!cand.length) { missed++; out.push({ x: p.x, y: p.y, half: NaN }); continue; }

        const distTo = r => (r.from > 0 ? r.from : r.to < 0 ? -r.to : 0);
        const shaped = cand.filter(r => !r.clipped && r.to - r.from + STEP <= ROAD_MAX);
        let mid, half;
        if (shaped.length) {
            const run = shaped.reduce((best, r) => (distTo(r) < distTo(best) ? r : best));
            mid = (run.from + run.to) / 2;
            half = (run.to - run.from + STEP) / 2;
        } else {
            // One slab: track and pit lane, or a corner buried in run-off. Stay
            // where we are and cap the half-width so the midpoint does not walk
            // off into the paddock.
            const run = cand.reduce((best, r) => (distTo(r) < distTo(best) ? r : best));
            const anchor = Math.max(run.from, Math.min(run.to, 0));
            const dr = Math.min(EDGE_CAP, run.to - anchor), dl = Math.min(EDGE_CAP, anchor - run.from);
            mid = anchor + (dr - dl) / 2;
            half = (dr + dl) / 2;
        }
        out.push({ x: p.x + rx * Math.max(-reach, Math.min(reach, mid)), y: p.y + ry * Math.max(-reach, Math.min(reach, mid)), half });
    }
    return { out, missed };
}

/** Carry samples that found no asphalt between the nearest ones that did. */
function bridge(s) {
    const n = s.length, ok = i => !Number.isNaN(s[(i + n) % n].half);
    if (!s.some((_, i) => ok(i))) throw new Error('no asphalt under the seed anywhere — is the fit broken?');
    for (let i = 0; i < n; i++) {
        if (ok(i)) continue;
        let before = i, after = i;
        while (!ok(before)) before--;
        while (!ok(after)) after++;
        const a = s[(before + 2 * n) % n], b = s[after % n], t = (i - before) / (after - before);
        s[i] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, half: NaN };
    }
}

// ── how badly does the seed disagree with the model? ────────────────────────
// Measured, not asserted, because the number goes into the header of the file
// this script writes and into the comment in game.js that explains why the
// model wins.
const seedWp = spline(SEED.MADRING_CP, GAME_SPP);
const seedOn = seedWp.filter(p => paved(p.x, p.y)).length;
const seedOff = (() => {
    const out = [];
    let cur = null;
    for (let i = 0; i < seedWp.length; i++) {
        if (!paved(seedWp[i].x, seedWp[i].y)) { if (!cur) cur = { a: i, b: i }; cur.b = i; }
        else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out.filter(r => r.b - r.a > 4);
})();
let seedOffPx = 0;
for (const r of seedOff)
    for (let i = r.a; i <= r.b; i++)
        seedOffPx += Math.hypot(seedWp[(i + 1) % seedWp.length].x - seedWp[i].x, seedWp[(i + 1) % seedWp.length].y - seedWp[i].y);
const seedOffM = seedOffPx / M;

// ── derive ──────────────────────────────────────────────────────────────────
let road = resample(seedWp, SAMPLES).points;
console.log(`seed       : ${SEED.MADRING_CP.length} geodata control points, ` +
    `${(100 * seedOn / seedWp.length).toFixed(1)}% of it on the model's asphalt`);
seedOff.forEach(r => console.log(`  off tarmac : waypoints ${r.a}-${r.b}, ` +
    `${(100 * r.a / seedWp.length).toFixed(1)}%-${(100 * r.b / seedWp.length).toFixed(1)}% of the lap`));
for (const [reachM, smoothing] of [[34, 8], [24, 3], [20, 2], [20, 2]]) {
    const { out, missed } = snap(road, reachM * M);
    bridge(out);
    console.log(`  pass ${String(reachM).padStart(2)} m : ${missed} of ${SAMPLES} samples found no asphalt`);
    const xs = smoothClosed(out.map(s => s.x), smoothing);
    const ys = smoothClosed(out.map(s => s.y), smoothing);
    road = resample(xs.map((x, i) => ({ x, y: ys[i] })), SAMPLES).points;
}

// ── put index 0 on the model's own start/finish gantry ──────────────────────
const gantry = FIT.materialCentroid('startgantry');
let startShift = 0;
if (gantry) {
    const [gx, gy] = FIT.modelToWorld(gantry[0], gantry[1]);
    let best = Infinity;
    road.forEach((p, i) => {
        const d = (p.x - gx) ** 2 + (p.y - gy) ** 2;
        if (d < best) { best = d; startShift = i; }
    });
    const seedOff = startShift > SAMPLES / 2 ? startShift - SAMPLES : startShift;
    console.log(`gantry     : world (${gx.toFixed(0)}, ${gy.toFixed(0)}), ` +
        `${Math.sqrt(best).toFixed(1)} px from the line, ` +
        `${(seedOff / SAMPLES * 100).toFixed(2)}% of a lap from the geodata's own start`);
    road = road.slice(startShift).concat(road.slice(0, startShift));
}

const CP = resample(road, NCP).points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));

// ── measure what we produced ────────────────────────────────────────────────
const WP = spline(CP, GAME_SPP);
let lapPx = 0;
for (let i = 0; i < WP.length; i++) lapPx += Math.hypot(WP[(i + 1) % WP.length].x - WP[i].x, WP[(i + 1) % WP.length].y - WP[i].y);
const lapM = lapPx / M;

let onTarmac = 0;
for (const p of WP) if (paved(p.x, p.y)) onTarmac++;

let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
for (const p of WP) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }

// Closest approach between two parts of the lap that are not neighbours. The
// road is 46 px wide, so this has to stay well above that or the collision mask
// welds the two legs together and the car can cut across.
let pinch = Infinity, pinchAt = [0, 0];
const N = WP.length, GAP = 120;
for (let i = 0; i < N; i += 2) for (let j = i + GAP; j < N - GAP; j += 2) {
    const d = Math.hypot(WP[j].x - WP[i].x, WP[j].y - WP[i].y);
    if (d < pinch) { pinch = d; pinchAt = [i, j]; }
}

console.log('');
console.log(`control pts: ${CP.length} x ${GAME_SPP} = ${WP.length} waypoints`);
console.log(`lap        : ${lapPx.toFixed(0)} px = ${lapM.toFixed(1)} m   (published 5474 m, ${((lapM / 5474 - 1) * 100).toFixed(1)}%)`);
console.log(`on tarmac  : ${(100 * onTarmac / WP.length).toFixed(2)}% of waypoints land on the model's asphalt`);
console.log(`bbox       : x ${x0.toFixed(0)}…${x1.toFixed(0)}  y ${y0.toFixed(0)}…${y1.toFixed(0)} px`);
console.log(`pinch      : ${pinch.toFixed(1)} px = ${(pinch / M).toFixed(1)} m between wp ${pinchAt[0]} and ${pinchAt[1]}`);

// ── plan view ───────────────────────────────────────────────────────────────
function writePlan(file, W, H) {
    const rgb = Buffer.alloc(W * H * 3, 20);
    const put = (x, y, r, g, b) => {
        const i = Math.round(x), j = Math.round(y);
        if (i < 0 || i >= W || j < 0 || j >= H) return;
        const o = (j * W + i) * 3;
        rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (paved(x, y)) put(x, y, 110, 110, 116);
    for (const p of spline(SEED.MADRING_CP, GAME_SPP)) put(p.x, p.y, 80, 150, 255);
    for (const p of WP) { put(p.x, p.y, 255, 60, 60); put(p.x + 1, p.y, 255, 60, 60); }
    for (const p of CP) for (let d = -2; d <= 2; d++) { put(p.x + d, p.y, 255, 220, 60); put(p.x, p.y + d, 255, 220, 60); }

    const raw = Buffer.alloc(H * (W * 3 + 1));
    for (let j = 0; j < H; j++) rgb.copy(raw, j * (W * 3 + 1) + 1, j * W * 3, (j + 1) * W * 3);
    const table = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
    const crc32 = buf => { let c = -1; for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
        return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
    fs.writeFileSync(file, Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]));
}

// ── write ───────────────────────────────────────────────────────────────────
const WORLD = { W: SEED.MADRING_WORLD.W, H: SEED.MADRING_WORLD.H };
if (CHECK_ONLY) { console.log('\n--check: nothing written'); process.exit(0); }

writePlan(PLAN, WORLD.W, WORLD.H);
console.log(`wrote ${path.relative(process.cwd(), PLAN)}`);

const rows = [];
for (let i = 0; i < CP.length; i += 4)
    rows.push('    ' + CP.slice(i, i + 4).map(p => `{x:${p.x},y:${p.y}},`.padEnd(15)).join('').trimEnd());

fs.writeFileSync(OUT, `// GENERATED — do not edit by hand.
// Regenerate: node scripts/madring-road-centre.js
//
// The MADRING centreline the game races: the middle of the real circuit's
// asphalt, measured off "Circuito de Madring 2026 layout" by Dave Love
// (CC-BY-4.0 — see NOTICE, attribution is a condition of the licence), with
// the lap's identity — start/finish line, direction, corner order — taken from
// the published geodata in scripts/madring-geodata-centreline.js
// (bacinger/f1-circuits, MIT).
//
// The two sources agree over most of the lap — ${(100 * seedOn / seedWp.length).toFixed(1)}% of the published
// polyline lands on the model's asphalt — and disagree over ${seedOffM.toFixed(0)} m of it, where
// the polyline cuts across the infield and the circuit does not. The model
// wins there, because images/madring-overhead.jpg is a render of the model and
// the player would otherwise watch the car drive over painted grass.
// Index 0 sits on the model's own start/finish gantry.
//
// Why ${NCP} points and not 64: game.js drives the Catmull-Rom spline through
// these points, not the points themselves, and at 64 control points that
// spline cut every corner — up to 17.8 m of deviation, wider than the road.
// game.js pairs this with spp: 5 so the finer curve still lands on 1280
// waypoints, which is what everything addressed by waypoint index expects.
//
//   world      : ${WORLD.W} x ${WORLD.H} px
//   scale      : ${M.toFixed(6)} px/m, measured by scripts/madring-model-fit.js
//   lap        : ${lapPx.toFixed(0)} px = ${lapM.toFixed(0)} m as splined at 5 samples/point
//                (published 5474 m; madring-3d measures the same asphalt at 5429 m)
//   on tarmac  : ${(100 * onTarmac / WP.length).toFixed(1)}% of the ${WP.length} waypoints

const MADRING_WORLD = { W: ${WORLD.W}, H: ${WORLD.H}, scale: ${M.toFixed(6)}, lapM: ${lapM.toFixed(1)} };
const MADRING_CP = [
${rows.join('\n')}
];

if (typeof module !== "undefined") module.exports = { MADRING_CP, MADRING_WORLD };
`);
console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
