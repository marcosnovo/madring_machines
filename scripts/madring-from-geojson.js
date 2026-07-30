#!/usr/bin/env node
/**
 * madring-from-geojson.js
 *
 * Turns the real circuit centreline into the control points game.js needs.
 *
 * Source: bacinger/f1-circuits (MIT), circuits/es-2026.geojson — 116 lat/lon
 * points of the Circuito de Madring, declared length 5474 m. Run with the
 * repo checked out somewhere and pass its path:
 *
 *     node scripts/madring-from-geojson.js /path/to/f1-circuits
 *
 * Steps: project lat/lon onto a local metric plane, rotate so the layout sits
 * upright, scale metres → world pixels, resample the centreline at even arc
 * length, and print the cp array.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = process.argv[2] || '/tmp/f1-circuits';
const SRC = path.join(REPO, 'circuits', 'es-2026.geojson');

const geo = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const feat = geo.features.find(f => f.geometry.type === 'LineString');
const coords = feat.geometry.coordinates;
const DECLARED_M = feat.properties.length;

// ── 1. project lat/lon → local metres (equirectangular about the centroid) ──
const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
const lon0 = coords.reduce((s, c) => s + c[0], 0) / coords.length;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos(lat0 * Math.PI / 180);

// y grows southward so the plane matches screen coordinates
let pts = coords.map(([lon, lat]) => ({
    x: (lon - lon0) * M_PER_DEG_LON,
    y: -(lat - lat0) * M_PER_DEG_LAT,
}));

// drop the duplicated closing point — the game's spline closes the loop itself
if (Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1) pts.pop();

const polyLen = p => {
    let L = 0;
    for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        L += Math.hypot(a.x - b.x, a.y - b.y);
    }
    return L;
};
const lenM = polyLen(pts);

// ── 2. direction: the real circuit runs clockwise (mostly right-handers) ──
// Shoelace on screen coords (y down): positive area ⇒ clockwise on screen.
let area2 = 0;
for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    area2 += a.x * b.y - b.x * a.y;
}
const clockwise = area2 > 0;
if (!clockwise) pts.reverse();

// ── 3. resample at even arc length ──
function resample(p, n) {
    const cum = [0];
    for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        cum.push(cum[i] + Math.hypot(a.x - b.x, a.y - b.y));
    }
    const total = cum[p.length];
    const out = [];
    for (let k = 0; k < n; k++) {
        const d = (k / n) * total;
        let i = 0;
        while (i < p.length && cum[i + 1] < d) i++;
        const t = (d - cum[i]) / (cum[i + 1] - cum[i] || 1);
        const a = p[i], b = p[(i + 1) % p.length];
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return out;
}

// ── 4. scale metres → world pixels ──
// Pick the scale from the tightest pinch on the circuit: where the outbound
// and return legs run side by side, the two stretches must stay at least
// ROAD_W + 14 px apart or the colour-mask collision map fuses them.
const ROAD_W = Number(process.env.RW || 46);
const dense = resample(pts, 900);
let pinchM = Infinity;
for (let i = 0; i < dense.length; i++) {
    for (let j = i + 1; j < dense.length; j++) {
        const along = Math.min(j - i, dense.length - (j - i));
        if (along < 40) continue;
        const d = Math.hypot(dense[i].x - dense[j].x, dense[i].y - dense[j].y);
        if (d < pinchM) pinchM = d;
    }
}
const scale = (ROAD_W + 14) / pinchM;      // px per metre

const N_CP = Number(process.env.NCP || 64);
const cps = resample(pts, N_CP).map(p => ({ x: p.x * scale, y: p.y * scale }));

const xs = cps.map(p => p.x), ys = cps.map(p => p.y);
const MARGIN = 90;
const minX = Math.min(...xs), minY = Math.min(...ys);
const W = Math.ceil(Math.max(...xs) - minX + MARGIN * 2);
const H = Math.ceil(Math.max(...ys) - minY + MARGIN * 2);
const CP = cps.map(p => ({
    x: Math.round(p.x - minX + MARGIN),
    y: Math.round(p.y - minY + MARGIN),
}));

// The untouched source polyline, placed in the same world frame as CP. Nothing
// in the game reads this; it is the reference scripts/madring-accuracy.js
// measures the splined lap against.
const SRC_LINE = pts.map(p => ({
    x: p.x * scale - minX + MARGIN,
    y: p.y * scale - minY + MARGIN,
}));

if (require.main === module) {
    console.error(`source          : ${SRC}`);
    console.error(`declared length : ${DECLARED_M} m`);
    console.error(`measured length : ${lenM.toFixed(0)} m  (${(lenM - DECLARED_M).toFixed(0)} m off)`);
    console.error(`direction       : ${clockwise ? 'clockwise' : 'anticlockwise (reversed to clockwise)'}`);
    console.error(`tightest pinch  : ${pinchM.toFixed(1)} m between separate stretches`);
    console.error(`scale           : ${scale.toFixed(4)} px/m  →  road ${ROAD_W}px = ${(ROAD_W / scale).toFixed(1)} m wide`);
    console.error(`lap in world px : ${(lenM * scale).toFixed(0)}`);
    console.error(`world size      : ${W} × ${H}`);
    console.error(`control points  : ${CP.length}\n`);
    console.log('module.exports = [');
    CP.forEach((p, i) => console.log(`    { x: ${p.x}, y: ${p.y}, n: 'i${i}' },`));
    console.log('];');
    console.log(`module.exports.WORLD = { W: ${W}, H: ${H} };`);
}

module.exports = { CP, SRC: SRC_LINE, WORLD: { W, H }, scale, lenM, DECLARED_M };
