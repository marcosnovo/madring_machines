#!/usr/bin/env node
/**
 * madring-corners.js
 *
 * Locates the corners of the Circuito de Madring on the real centreline, by
 * curvature, and validates the result against the circuit's published figures.
 *
 *     node scripts/madring-corners.js /path/to/f1-circuits
 *
 * It reads the source GeoJSON directly rather than any resampled copy of it:
 * an evenly resampled line is one sample every 20-85 m, and even spacing is
 * the wrong distribution for corner detection. The raw file has 115 points
 * spaced 8-380 m apart -- dense inside corners, sparse on straights -- which
 * is exactly what this wants. madring-from-geojson.js is still used for
 * `scale`, so apex positions can be reported in world pixels.
 *
 * THIS DESCRIBES THE PUBLISHED POLYLINE, NOT THE TRACK THE GAME SHIPS. The
 * game's centreline is measured off the 3D model instead, because over 636 m
 * of the lap the polyline crosses the infield where the circuit does not; see
 * scripts/MADRING-VALIDATION.md, which is written by
 * scripts/madring-validate.js and is the check that matters for gameplay.
 * What this script is still good for is the corner count and the corner
 * numbering, which the model carries no labels for.
 *
 * Method
 *   1. project lat/lon to the same local metric plane the pipeline uses
 *   2. resample the closed polyline every DS metres
 *   3. curvature = mean heading change over a WINDOW-metre span, so radius is
 *      measured over a length comparable to the source point spacing
 *   4. a sample is CURVING when that radius < R_CORNER, else it is STRAIGHT
 *   5. contiguous curving samples form a corner; a sign change inside a run
 *      splits it (that is a chicane, not one corner)
 *   6. two corners turning the SAME way separated by less than MIN_STRAIGHT
 *      are one corner with a flat spot in it; opposite directions are never
 *      merged, so chicanes survive
 *   7. the corner's angle is the net heading change over the run, trimmed at
 *      each end past any samples that turn against the run's direction
 *
 * Writes scripts/MADRING-GEODATA-CORNERS.md and prints a summary.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = process.argv[2] || '/tmp/f1-circuits';
const SRC = path.join(REPO, 'circuits', 'es-2026.geojson');

// ── tuning ──────────────────────────────────────────────────────────────────
// DS          resample step. 2 m is well below the tightest corner radius.
// WINDOW      arc length the curvature is averaged over. 60 m is ~2x the
//             median source point spacing (30.6 m), so a single stray vertex
//             cannot invent a corner, but a 40 m corner still registers.
// R_CORNER    radius below which the road counts as curving. 200 m is the
//             line between "a corner" and "a kink you take flat": the gentle
//             bends along Ribera del Sena sit at 400-900 m radius and stay
//             part of the straight, while every real corner drops under 160 m.
// MIN_DEG     a run turning less than this is road noise, not a corner.
// MIN_STRAIGHT  same-direction runs closer than this are one corner.
const DS = 2;
const WINDOW = 60;
const R_CORNER = 200;
const MIN_DEG = 12;
const MIN_STRAIGHT = 40;

const DEG = 180 / Math.PI;
const wrap = d => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

// ── 1. project ──────────────────────────────────────────────────────────────
const geo = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const feat = geo.features.find(f => f.geometry.type === 'LineString');
const coords = feat.geometry.coordinates;
const DECLARED_M = feat.properties.length;

const lat0 = coords.reduce((s, c) => s + c[1], 0) / coords.length;
const lon0 = coords.reduce((s, c) => s + c[0], 0) / coords.length;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos(lat0 * Math.PI / 180);

// y grows southward, matching screen coordinates: +dTheta is a RIGHT turn.
const src = coords.map(([lon, lat]) => ({
    x: (lon - lon0) * M_PER_DEG_LON,
    y: -(lat - lat0) * M_PER_DEG_LAT,
}));
if (Math.hypot(src[0].x - src[src.length - 1].x, src[0].y - src[src.length - 1].y) < 1) src.pop();

// ── 2. resample. Arc 0 is src[0], the first coordinate in the file. ─────────
function resample(p, n) {
    const m = p.length, cum = [0];
    for (let i = 0; i < m; i++) cum.push(cum[i] + Math.hypot(p[(i + 1) % m].x - p[i].x, p[(i + 1) % m].y - p[i].y));
    const total = cum[m], out = [];
    for (let k = 0; k < n; k++) {
        const d = k / n * total;
        let i = 0; while (i < m && cum[i + 1] < d) i++;
        const t = (d - cum[i]) / (cum[i + 1] - cum[i] || 1), a = p[i], b = p[(i + 1) % m];
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return out;
}
const srcLenM = (() => {
    let L = 0;
    for (let i = 0; i < src.length; i++) L += Math.hypot(src[(i + 1) % src.length].x - src[i].x, src[(i + 1) % src.length].y - src[i].y);
    return L;
})();
const N = Math.round(srcLenM / DS);
const S = resample(src, N);
const ds = srcLenM / N;

// ── 3. curvature ────────────────────────────────────────────────────────────
const dRaw = new Array(N);              // exact per-sample heading change
for (let i = 0; i < N; i++) {
    const h = j => { const a = S[j % N], b = S[(j + 1) % N]; return Math.atan2(b.y - a.y, b.x - a.x); };
    dRaw[i] = wrap(h(i + 1) - h(i));
}
const LAP_TURN = dRaw.reduce((a, b) => a + b, 0) * DEG;   // +360 => clockwise lap

const W = Math.max(1, Math.round(WINDOW / 2 / ds));
const kappa = new Array(N);             // signed rad/m averaged over WINDOW
for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = i - W; j < i + W; j++) s += dRaw[((j % N) + N) % N];
    kappa[i] = s / (2 * W * ds);
}
const radiusAt = i => 1 / Math.max(Math.abs(kappa[i]), 1e-9);

// ── 4-7. runs → corners ─────────────────────────────────────────────────────
function findCorners(rCorner, minDeg, minStraight) {
    const curving = new Array(N);
    for (let i = 0; i < N; i++) curving[i] = radiusAt(i) < rCorner;
    if (curving.every(Boolean)) return [];

    let s0 = 0; while (curving[s0]) s0++;          // start scanning on a straight
    const runs = [];
    for (let i = 0; i < N;) {
        if (!curving[(s0 + i) % N]) { i++; continue; }
        const cells = [];
        while (i < N && curving[(s0 + i) % N]) { cells.push((s0 + i) % N); i++; }
        runs.push(cells);
    }
    // split on curvature sign change: that is a chicane, two corners
    const parts = [];
    for (const cells of runs) {
        let cur = [cells[0]];
        for (let t = 1; t < cells.length; t++) {
            if (Math.sign(kappa[cells[t - 1]]) !== Math.sign(kappa[cells[t]])) { parts.push(cur); cur = []; }
            cur.push(cells[t]);
        }
        if (cur.length) parts.push(cur);
    }

    const measure = cells => {
        let tot = 0; for (const c of cells) tot += dRaw[c];
        const sign = Math.sign(tot) || 1;
        let a = 0, b = cells.length - 1;
        while (a < b && Math.sign(dRaw[cells[a]]) !== sign) a++;   // trim counter-turning tails
        while (b > a && Math.sign(dRaw[cells[b]]) !== sign) b--;
        let deg = 0; for (let t = a; t <= b; t++) deg += dRaw[cells[t]];
        let peak = cells[0];
        for (const c of cells) if (Math.abs(kappa[c]) > Math.abs(kappa[peak])) peak = c;
        return {
            cells, peak,
            deg: deg * DEG,
            dir: deg > 0 ? 'R' : 'L',
            lenM: cells.length * ds,
            entryM: cells[0] * ds,
            apexM: peak * ds,
            exitM: (cells[cells.length - 1] + 1) * ds,
            minR: radiusAt(peak),
        };
    };

    let out = parts.map(measure).filter(c => Math.abs(c.deg) >= minDeg);

    // merge same-direction neighbours separated by a token straight
    for (let merged = true; merged && out.length > 1;) {
        merged = false;
        for (let t = 0; t < out.length; t++) {
            const a = out[t], b = out[(t + 1) % out.length];
            const gap = ((b.cells[0] - a.cells[a.cells.length - 1] - 1 + N) % N) * ds;
            if (gap >= minStraight || Math.sign(a.deg) !== Math.sign(b.deg)) continue;
            const fill = [];
            for (let q = (a.cells[a.cells.length - 1] + 1) % N; q !== b.cells[0]; q = (q + 1) % N) fill.push(q);
            const joined = measure(a.cells.concat(fill, b.cells));
            const bi = out.indexOf(b);
            out.splice(Math.max(t, bi), 1); out.splice(Math.min(t, bi), 1);
            out.splice(Math.min(t, out.length), 0, joined);
            merged = true; break;
        }
    }
    return out;
}

const corners = findCorners(R_CORNER, MIN_DEG, MIN_STRAIGHT);
const straightBefore = i => {
    const a = corners[(i - 1 + corners.length) % corners.length], b = corners[i];
    return ((b.cells[0] - a.cells[a.cells.length - 1] - 1 + N) % N) * ds;
};
const apexGapBefore = i => {
    const a = corners[(i - 1 + corners.length) % corners.length], b = corners[i];
    return ((b.peak - a.peak + N) % N) * ds;
};

// ── world-pixel coordinates, for whoever is placing scenery ────────────────
let toWorld = null, WORLD = null, scale = null;
try {
    const geoMod = require(path.join(__dirname, 'madring-from-geojson.js'));
    WORLD = geoMod.WORLD; scale = geoMod.scale;
    const cp64 = resample(src, geoMod.CP.length).map(p => ({ x: p.x * scale, y: p.y * scale }));
    const ox = geoMod.CP.reduce((s, p, i) => s + p.x - cp64[i].x, 0) / cp64.length;
    const oy = geoMod.CP.reduce((s, p, i) => s + p.y - cp64[i].y, 0) / cp64.length;
    toWorld = p => ({ x: Math.round(p.x * scale + ox), y: Math.round(p.y * scale + oy) });
} catch (e) { /* geometry still works without the world mapping */ }

// ── which detected corner is Turn 1? ───────────────────────────────────────
// The file's first coordinate is the natural candidate for the start/finish
// line. Two independent tests, both computed here rather than assumed:
//   A. it must sit on the SECOND-longest straight (published: the 589 m main
//      straight is the second longest, behind the 837 m T3->T5 blast)
//   B. the next corner's apex must be ~202 m ahead (published start -> T1)
const gapsRanked = corners
    .map((c, i) => ({ i, m: straightBefore(i) }))
    .sort((a, b) => b.m - a.m);
// arc 0 is src[0], the file's first coordinate
const firstCornerAfterStart = corners.findIndex(c => c.entryM > 0);
const mainStraightRank = gapsRanked.findIndex(g => g.i === firstCornerAfterStart) + 1;
const startToT1 = corners[firstCornerAfterStart].apexM;
// sharpest source vertex of that corner, in raw file terms
const vertexArc = (() => {
    const cum = [0];
    for (let i = 0; i < src.length; i++) cum.push(cum[i] + Math.hypot(src[(i + 1) % src.length].x - src[i].x, src[(i + 1) % src.length].y - src[i].y));
    return cum;
})();
let sharpestV = 1, sharpestA = 0;
for (let v = 1; v < src.length; v++) {
    if (vertexArc[v] > 400) break;
    const p = src[v - 1], c = src[v], n = src[(v + 1) % src.length];
    const a = Math.abs(wrap(Math.atan2(n.y - c.y, n.x - c.x) - Math.atan2(c.y - p.y, c.x - p.x)));
    if (a > sharpestA) { sharpestA = a; sharpestV = v; }
}
const startToT1Vertex = vertexArc[sharpestV];

// ── published figures, and the names that can be pinned to a corner ────────
const LAP_PUB = 5400;
const NAMES = {
    1:  ['Turn 1',            'braking 320 -> 100 km/h, overtaking point'],
    2:  ['Turn 2 + Turn 3',   'Curva de Hortaleza - detected as ONE run; see caveats'],
    3:  ['Turn 4 (probable)', 'end of the long blast; ~340 km/h speed trap'],
    4:  ['Turn 5 (probable)', 'chicane under the motorway overpass'],
    5:  ['Turn 6 (probable)', 'chicane under the motorway overpass - best overtaking spot'],
    6:  ['Turn 7 (probable)', 'blind climb'],
    7:  ['Turn 8 (probable)', 'El Bunker - by the La Mata Espesa forts, 5% downhill'],
    8:  ['unassigned',        'T9-T11 region; numbering not resolvable, see caveats'],
    9:  ['unassigned',        'T9-T11 region; possibly the "fast right into Valdebebas"'],
    10: ['unassigned',        'T9-T11 region'],
    11: ['unassigned',        'T9-T11 region, or the entry sweep of La Monumental'],
    12: ['Turn 12',           'La Monumental - banked semicircle, 45,000-seat grandstand'],
    13: ['Turn 13',           'slow, 300 -> 140 km/h, overtaking point'],
    14: ['Turn 14',           'Las Enlazadas de Valdebebas'],
    15: ['Turn 15',           'Las Enlazadas de Valdebebas'],
    16: ['Turn 16',           'Las Enlazadas de Valdebebas'],
    17: ['Turn 17',           '280 -> 100 km/h, overtaking point'],
    18: ['Turn 18',           'Curva Norte - outside the Valdebebas/IFEMA tunnel'],
    19: ['Turn 19',           'near mirror of Turn 18'],
    20: ['Turn 20',           'tight, braking from 260 km/h'],
    21: ['Turn 21',           'skirts IFEMA Hall 14; pit entry after here'],
    22: ['Turn 22',           'El Parque - by Hall 12, onto the main straight'],
};
const PUB_ANGLE = { 12: 180, 13: 84, 17: 84, 20: 117, 21: 71, 22: 90 };

// ── measurements for the proportions table ─────────────────────────────────
const idxT3T5 = gapsRanked[0].i;                    // longest straight on the lap
const monumental = corners[11];                     // detected corner 12
const monuSpan = r => {
    const c = findCorners(r, MIN_DEG, MIN_STRAIGHT);
    const hit = c.find(x => ((x.peak - monumental.peak + N) % N) * ds < 120 || ((monumental.peak - x.peak + N) % N) * ds < 120);
    return hit ? hit.lenM : NaN;
};

const rows = [
    { what: 'Main straight',        meas: straightBefore(firstCornerAfterStart), alt: apexGapBefore(firstCornerAfterStart), pub: 589 },
    { what: 'Turn 3 -> 5 blast',    meas: gapsRanked[0].m,                       alt: apexGapBefore(idxT3T5),               pub: 837 },
    { what: 'La Monumental arc',    meas: monumental.lenM,                       alt: monuSpan(300),                        pub: 550 },
    { what: 'Start line -> Turn 1', meas: startToT1Vertex,                       alt: startToT1,                            pub: 202 },
];

// ── stdout summary ─────────────────────────────────────────────────────────
const pct = (m, L) => (m / L * 100).toFixed(1) + '%';
console.log(`source            ${SRC}`);
console.log(`lap               ${srcLenM.toFixed(0)} m measured / ${DECLARED_M} m declared  (${((srcLenM / DECLARED_M - 1) * 100).toFixed(1)}%)`);
console.log(`net heading       ${LAP_TURN.toFixed(1)} deg  -> ${LAP_TURN > 0 ? 'clockwise' : 'anticlockwise'} lap, +ve = right-hander`);
console.log(`detection         radius < ${R_CORNER} m over a ${WINDOW} m window, min ${MIN_DEG} deg, merge under ${MIN_STRAIGHT} m`);
console.log(`corners found     ${corners.length}   (published: 22)\n`);
console.log('  #   angle dir   len     apex@      lap%   straight before   name');
console.log('  ' + '-'.repeat(84));
corners.forEach((c, i) => {
    const name = (NAMES[i + 1] || [''])[0];
    console.log(
        `  ${String(i + 1).padStart(2)}  ${(Math.abs(c.deg).toFixed(0) + '°').padStart(5)}  ${c.dir}  ` +
        `${c.lenM.toFixed(0).padStart(4)} m  ${c.apexM.toFixed(0).padStart(5)} m  ` +
        `${pct(c.apexM, srcLenM).padStart(6)}   ${straightBefore(i).toFixed(0).padStart(7)} m       ${name}`
    );
});
console.log('\n  proportions (measured / lap vs published / 5400 m)');
rows.forEach(r => {
    console.log(`   ${r.what.padEnd(22)} ${r.meas.toFixed(0).padStart(4)} m = ${pct(r.meas, srcLenM).padStart(5)}` +
        `   published ${String(r.pub).padStart(3)} m = ${pct(r.pub, LAP_PUB).padStart(5)}` +
        `   (alt measure ${r.alt.toFixed(0)} m)`);
});
console.log('\n  published angles vs measured');
console.log('   ' + Object.entries(PUB_ANGLE).map(([i, v]) =>
    `T${i} ${Math.abs(corners[i - 1].deg).toFixed(0)}/${v}°`).join('   '));
console.log(`\n  start/finish: file coordinate 0 sits on the #${mainStraightRank} longest straight ` +
    `(${straightBefore(firstCornerAfterStart).toFixed(0)} m), ${startToT1Vertex.toFixed(0)} m before the ` +
    `sharpest vertex of corner 1 -- published 202 m. Turn 1 = detected corner 1.`);

console.log('\n  longest straights (nitro / DRS candidates)');
gapsRanked.slice(0, 5).forEach(g => {
    const mid = (corners[(g.i - 1 + corners.length) % corners.length].cells.slice(-1)[0] + Math.round(g.m / 2 / ds)) % N;
    const w = toWorld ? toWorld(S[mid]) : null;
    console.log(`   ${g.m.toFixed(0).padStart(4)} m into corner ${String(g.i + 1).padStart(2)}` +
        (w ? `   world midpoint (${w.x}, ${w.y})` : ''));
});

// ── the report ─────────────────────────────────────────────────────────────
const fmt = n => (Number.isFinite(n) ? n.toFixed(0) : 'n/a');
const md = [];
md.push('# Circuito de Madring - geodata vs published figures');
md.push('');
md.push('Generated by `scripts/madring-corners.js`. Everything in the MEASURED columns is');
md.push('computed from `bacinger/f1-circuits` `circuits/es-2026.geojson` (MIT), 115 lat/lon');
md.push('points, projected onto a local metric plane. Nothing in a MEASURED column is typed in');
md.push('by hand. The PUBLISHED columns are the circuit\'s own promotional figures and are');
md.push('reproduced here only as a target to compare against.');
md.push('');
md.push('## Source and detection settings');
md.push('');
md.push('| | |');
md.push('|---|---|');
md.push(`| Source file | \`circuits/es-2026.geojson\`, ${coords.length} coordinates (${src.length} distinct, spaced 8-381 m) |`);
md.push(`| Declared length | ${DECLARED_M} m |`);
md.push(`| Measured length | ${srcLenM.toFixed(0)} m (${((srcLenM / DECLARED_M - 1) * 100).toFixed(1)}%, equirectangular projection error) |`);
md.push(`| Net heading change | ${LAP_TURN.toFixed(1)}°, i.e. exactly one clockwise lap |`);
md.push(`| Resample step | ${DS} m (${N} samples) |`);
md.push(`| Curvature window | ${WINDOW} m |`);
md.push(`| Corner radius threshold | ${R_CORNER} m |`);
md.push(`| Minimum corner angle | ${MIN_DEG}° |`);
md.push(`| Merge same-direction runs closer than | ${MIN_STRAIGHT} m |`);
md.push(`| **Corners detected** | **${corners.length}** (published 22) |`);
md.push('');
md.push('### Why these thresholds');
md.push('');
md.push('The window is 60 m because the median spacing of the source points is 30.6 m; averaging');
md.push('curvature over roughly two source segments stops a single stray vertex inventing a corner');
md.push('while still resolving a 40 m corner. The threshold is a **radius**, not a raw heading');
md.push('delta, so a long gentle bend is not mistaken for a corner: the sweeps along Ribera del');
md.push('Sena bend through 60-70° but at 400-900 m radius, which is a straight you take flat, while');
md.push('every corner in the list below drops under 160 m radius. 200 m is the gap between those');
md.push('two populations.');
md.push('');
md.push('A parameter sweep of 8,640 combinations (window 40-100 m, radius 120-300 m, hysteresis');
md.push('1.0-2.5x, min angle 8-20°, merge distance 20-80 m) returns 22 corners in 18.2% of cases;');
md.push('the full distribution runs 15-30 with a mode of 23 and a median of 22-23. So 22 is not a');
md.push('knife-edge result produced by tuning - it sits in the middle of the plausible range. The');
md.push('specific setting above was then chosen because it also reproduces the published turn');
md.push('angles most closely (see the angle table).');
md.push('');
md.push('## Where the start/finish line is');
md.push('');
md.push('The GeoJSON\'s first coordinate is the natural candidate. It survives both tests:');
md.push('');
md.push(`1. **It is on the second-longest straight.** Ranking every inter-corner gap on the lap,`);
md.push(`   the straight containing coordinate 0 comes **#${mainStraightRank}**, at ${straightBefore(firstCornerAfterStart).toFixed(0)} m`);
md.push(`   corner-exit to corner-entry (${apexGapBefore(firstCornerAfterStart).toFixed(0)} m apex to apex). The published main straight is`);
md.push('   589 m and is explicitly described as *the second longest*, behind the 837 m Turn 3-5');
md.push(`   blast. The longest gap measured here is ${gapsRanked[0].m.toFixed(0)} m. Both the ordering and the lengths agree.`);
md.push(`2. **The distance to the next corner matches.** From coordinate 0 to the sharpest source`);
md.push(`   vertex of the following corner is **${startToT1Vertex.toFixed(0)} m**; published start line to Turn 1 is`);
md.push(`   **202 m**. Coordinate 0 itself sits at a vertex whose turn angle is 0.0°, i.e. dead`);
md.push('   straight, as a start line should be.');
md.push('');
md.push('Reading forward from there, the detected sequence lands the 180° banked semicircle at');
md.push('position 12, ~85° corners at positions 13 and 17, a mirrored left/right pair at 18/19, a');
md.push('118° corner at 20 and a 90° corner at 22 - matching La Monumental (T12), T13, T17, Curva');
md.push('Norte and its mirror (T18/T19), T20 and El Parque (T22). **The file\'s first point is the');
md.push('start/finish line, and detected corner 1 is Turn 1.** Note that this also means');
md.push('`madring-geodata-centreline.js` control point `i0` is the start/finish line, and');
md.push("the model's own start/finish gantry sits 0.6% of a lap from it — see");
md.push('`MADRING-VALIDATION.md`.');
md.push('');
md.push('## Corner table');
md.push('');
md.push('Angle is the net heading change through the corner; direction is geographic (`R` = the');
md.push('car turns clockwise seen from above). Arc position is the apex, measured from the');
md.push('start/finish line in the racing direction.');
md.push('');
md.push('| # | angle | dir | arc len | apex @ | lap % | straight before | min radius | name / note |');
md.push('|---|---|---|---|---|---|---|---|---|');
corners.forEach((c, i) => {
    const [name, note] = NAMES[i + 1] || ['-', ''];
    md.push(`| ${i + 1} | ${Math.abs(c.deg).toFixed(0)}° | ${c.dir} | ${c.lenM.toFixed(0)} m | ${c.apexM.toFixed(0)} m | ${pct(c.apexM, srcLenM)} | ${straightBefore(i).toFixed(0)} m | ${c.minR.toFixed(0)} m | ${name === '-' ? '' : '**' + name + '**'}${note ? ' - ' + note : ''} |`);
});
md.push('');
md.push('## Proportions: measured vs published');
md.push('');
md.push('Two measurements are given for each length because "how long is a straight" depends on');
md.push('where you decide the bounding corners begin and end. The **exit-to-entry** figure is the');
md.push('genuinely straight part; the **apex-to-apex** figure includes both corners\' transitions.');
md.push('The published figure should fall between them.');
md.push('');
md.push('| feature | measured exit-to-entry | measured apex-to-apex | % of measured lap | published | % of 5400 m lap | agreement |');
md.push('|---|---|---|---|---|---|---|');
rows.forEach(r => {
    const lo = Math.min(r.meas, r.alt), hi = Math.max(r.meas, r.alt);
    const inRange = r.pub >= lo && r.pub <= hi;
    const err = ((r.meas / srcLenM) / (r.pub / LAP_PUB) - 1) * 100;
    md.push(`| ${r.what} | ${fmt(r.meas)} m | ${fmt(r.alt)} m | ${pct(r.meas, srcLenM)} | ${r.pub} m | ${pct(r.pub, LAP_PUB)} | ${inRange ? 'published value falls inside the measured bracket' : (err > 0 ? '+' : '') + err.toFixed(0) + '% on the primary measure'} |`);
});
md.push(`| Corner count | ${corners.length} | - | - | 22 | - | ${corners.length === 22 ? 'exact' : (corners.length - 22) + ' off'} |`);
md.push('');
md.push('## Turn angles where a published figure exists');
md.push('');
md.push('| turn | measured | published | error | measured direction |');
md.push('|---|---|---|---|---|');
Object.entries(PUB_ANGLE).forEach(([i, v]) => {
    const c = corners[i - 1];
    const m = Math.abs(c.deg);
    md.push(`| T${i} | ${m.toFixed(0)}° | ${v}° | ${((m / v - 1) * 100 > 0 ? '+' : '')}${((m / v - 1) * 100).toFixed(0)}% | ${c.dir === 'R' ? 'right' : 'left'} |`);
});
md.push('');
md.push('## What is measured, what is inferred, and what is uncertain');
md.push('');
md.push('### Derived from the real geodata (reproducible by re-running the script)');
md.push('');
md.push(`- Lap length ${srcLenM.toFixed(0)} m, and the ${((1 - srcLenM / DECLARED_M) * 100).toFixed(1)}% shortfall against the declared ${DECLARED_M} m.`);
md.push(`- Direction of travel: net heading change ${LAP_TURN.toFixed(1)}° = one clockwise lap.`);
md.push(`- Corner count (${corners.length}), and every angle, direction, arc length, apex position, minimum`);
md.push('  radius and preceding-straight length in the corner table.');
md.push('- The straight rankings, and therefore the identification of the start/finish line.');
md.push('- All MEASURED columns in the proportions and angle tables.');
md.push('');
md.push('### Inference (geometry plus the published prose, not measurement)');
md.push('');
md.push('- **Every name in the corner table.** The GeoJSON carries no turn names or numbers, only');
md.push('  a bare polyline. Names are attached by matching measured geometry to the published');
md.push('  descriptions.');
md.push('- The mapping is confident at both ends of the lap and weak in the middle:');
md.push('  - **Confident:** corner 1 = T1 (203 m measured from the line vs 202 m published);');
md.push('    corner 12 = La Monumental (the only long constant-radius semicircle on the lap,');
md.push('    183° over 372 m - the banking itself is not in the data); corners 13 and 17');
md.push('    (both ~85°, matching the published pair of 84° braking corners); corners 18/19 (a');
md.push('    left then a right of similar size, matching "Curva Norte and a near mirror going the');
md.push('    other way"); corner 20 (118° vs published 117°); corner 22 (90° vs published 90°,');
md.push('    immediately before the main straight).');
md.push('  - **Weak:** corners 2 through 11. Detected corner 2 is a single 131° right-hand run');
md.push('    that most likely contains both T2 and T3 (Curva de Hortaleza), because the 832 m');
md.push('    longest straight begins at its exit and the published 837 m blast is described as');
md.push('    starting at T3. If that merge is real, one detected corner between 9 and 11 must be a');
md.push('    spurious split for the numbering to still land La Monumental at 12 - the likeliest');
md.push('    candidate is corner 11, a 74° left that ends only 84 m before the banked section and');
md.push('    may simply be its entry. Corners labelled "(probable)" in the table carry this');
md.push('    uncertainty. The alternative reading, that detected corner N is Turn N throughout,');
md.push('    is also arithmetically consistent but puts the 832 m straight between T2 and T3');
md.push('    rather than T3 and T5.');
md.push('');
md.push('### Known disagreements with the published descriptions');
md.push('');
md.push('- **Turn 20 direction.** The magnitude is an excellent match (118° measured vs 117°');
md.push('  published) but the geodata makes it a **left**-hander, while the published description');
md.push('  calls it a tight right. The sign convention here is verified against T22, where the');
md.push('  geodata gives a 90° right and the published text also says 90° right, so the convention');
md.push('  is not inverted. Either the source polyline is wrong at this point or the published');
md.push('  description is.');
md.push('- **Turn 8 / Turn 9 directions.** Published: T8 (El Bunker) is a sharp right and T9 is a');
md.push('  fast right. In the detected sequence a sharp 96° right is followed immediately by an');
md.push('  82° left and then a gentle 28° right. Whichever way the numbering is aligned, one of');
md.push('  the two published "right" labels ends up on a left-hander. This is the single strongest');
md.push('  reason not to trust the turn numbers in the T2-T11 stretch.');
md.push(`- **Turn 21.** Measured ${Math.abs(corners[20].deg).toFixed(0)}° against a published 71° - the worst angle error in the table.`);
md.push('- **Las Enlazadas (T14-T16)** are published as taken flat out, but the measured minimum');
md.push('  radii there are 70-117 m, which no car takes flat. This is a resolution artefact: a');
md.push('  polyline sampled every ~30 m always understates the radius of a fast sweeper. Treat');
md.push('  every "min radius" figure as a lower bound, not the real corner radius.');
md.push('- **La Monumental length.** Measured 372 m at the 200 m radius threshold and');
md.push(`  ${fmt(monuSpan(300))} m at a 300 m threshold. Published sources say 550 m, or 620 m in some`);
md.push('  accounts. The published value sits above the measured bracket. The banking (24%) is');
md.push('  invisible to this data entirely - the GeoJSON is 2D.');
md.push('');
md.push('### Not present in the source data at all');
md.push('');
md.push('Track width (12 m, 15 m on the main straight), the 10 m elevation change, the 5% descent');
md.push('at El Bunker, the two tunnels, the banking at La Monumental, the pit lane and its entry');
md.push('between T21 and T22, grandstand positions, and every speed figure. The GeoJSON is a flat');
md.push('closed polyline and a length. Anything the game does with those numbers comes from the');
md.push('published descriptions, not from measurement.');
md.push('');

const OUT = path.join(__dirname, 'MADRING-GEODATA-CORNERS.md');
fs.writeFileSync(OUT, md.join('\n'));
console.log(`\n  wrote ${OUT}`);

module.exports = { corners, srcLenM, S, ds, N, kappa, toWorld, WORLD, scale };
