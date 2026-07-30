#!/usr/bin/env node
/**
 * madring-emit-centreline.js
 *
 * Writes scripts/madring-geodata-centreline.js — the circuit as the published
 * geodata draws it. This is NOT the line the game drives. It is step one of
 * two:
 *
 *   1. this script          published polyline → world pixels
 *   2. madring-road-centre  that line snapped onto the 3D model's asphalt,
 *                           written to scripts/madring-centreline.js
 *
 * The geodata is what fixes the circuit's identity — where the start/finish
 * line is, which way round the lap goes, and the order of the corners — and
 * scripts/madring-model-fit.js aligns the model to it. But over 636 m of the
 * lap the published polyline cuts across the infield while the real circuit
 * does not, so the model's tarmac is what the game finally races on. See
 * scripts/MADRING-VALIDATION.md.
 *
 *     node scripts/madring-emit-centreline.js [/path/to/f1-circuits] [count]
 *
 * All it does is run scripts/madring-from-geojson.js at the chosen control
 * point count and format the result. The header it stamps into the file is
 * true because this script is the only thing that writes it; do not hand-edit
 * the output. After regenerating, re-run scripts/madring-road-centre.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = process.argv[2] && !/^\d+$/.test(process.argv[2]) ? process.argv[2] : '/tmp/f1-circuits';
const N = Number(process.argv.find(a => /^\d+$/.test(a)) || 256);
const OUT = path.join(__dirname, 'madring-geodata-centreline.js');

process.env.NCP = String(N);
process.argv[2] = REPO;
const { CP, WORLD, scale, lenM } = require('./madring-from-geojson.js');

// lap length of the Catmull-Rom curve the game actually drives, not of the
// control polygon — the control polygon is always shorter than the curve.
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
const wp = spline(CP, 5);
let lapPx = 0;
for (let i = 0; i < wp.length; i++) lapPx += Math.hypot(wp[(i + 1) % wp.length].x - wp[i].x, wp[(i + 1) % wp.length].y - wp[i].y);
const lapM = lapPx / scale;

const rows = [];
for (let i = 0; i < CP.length; i += 4)
    rows.push('    ' + CP.slice(i, i + 4).map(p => `{x:${p.x},y:${p.y}},`.padEnd(15)).join('').trimEnd());

fs.writeFileSync(OUT, `// GENERATED — do not edit by hand.
// Regenerate: node scripts/madring-emit-centreline.js <path-to-f1-circuits> ${N}
//
// The MADRING as the PUBLISHED GEODATA draws it — derived from
// bacinger/f1-circuits (MIT), circuits/es-2026.geojson, the real Circuito de
// Madring, 5474 m declared, ${lenM.toFixed(0)} m as measured off the polyline. Projected to a
// local metric plane, confirmed clockwise and resampled at even arc length to
// ${N} points.
//
// THIS IS NOT THE LINE THE GAME DRIVES. It is the seed that
// scripts/madring-model-fit.js aligns the 3D model to, and that
// scripts/madring-road-centre.js then snaps onto the model's asphalt to
// produce scripts/madring-centreline.js. Over 636 m of the lap the two
// disagree and the model wins; see scripts/MADRING-VALIDATION.md.
//
// Why ${N} and not 64: the game drives the Catmull-Rom spline through these
// points, not the points themselves, and at 64 control points that spline cut
// every corner — a ${(5284).toFixed(0)} m lap and up to 17.8 m of deviation, wider than the
// road. See scripts/madring-accuracy.js for the measurement.
//
//   world      : ${WORLD.W} x ${WORLD.H} px
//   scale      : ${scale.toFixed(6)} px/m
//   lap        : ${lapPx.toFixed(0)} px = ${lapM.toFixed(0)} m as splined at 5 samples/point

const MADRING_WORLD = { W: ${WORLD.W}, H: ${WORLD.H}, scale: ${scale.toFixed(6)}, lapM: ${lapM.toFixed(1)} };
const MADRING_CP = [
${rows.join('\n')}
];

if (typeof module !== "undefined") module.exports = { MADRING_CP, MADRING_WORLD };
`);

console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
console.log(`  control points : ${CP.length}`);
console.log(`  world          : ${WORLD.W} x ${WORLD.H}`);
console.log(`  splined lap    : ${lapM.toFixed(0)} m  (source polyline ${lenM.toFixed(0)} m)`);
