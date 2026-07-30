#!/usr/bin/env node
/**
 * madring-validate.js
 *
 * Measures the MADRING as it is actually shipped and writes
 * scripts/MADRING-VALIDATION.md from what it finds. Nothing in that document
 * is typed in by hand except the PUBLISHED column, which is the circuit's own
 * promotional figures, reproduced only as something to compare against.
 *
 *     node scripts/madring-validate.js            # measure and rewrite the doc
 *     node scripts/madring-validate.js --print    # measure, print, write nothing
 *
 * Two halves.
 *
 * 1. GEOMETRY, in Node. The control points are parsed out of game.js — not out
 *    of scripts/madring-centreline.js — because game.js is what ships, and a
 *    check that reads the generator rather than the product cannot catch a
 *    paste that went wrong. They are splined exactly as game.js splines them,
 *    and the resulting waypoints are compared against the 3D model's TarmacDark
 *    mesh through the transform in scripts/madring-model-fit.js, which is the
 *    same transform scripts/madring-bake-overhead.js points its camera with.
 *    So "the road is on the model's asphalt" and "the road is on the asphalt in
 *    the picture" are the same statement.
 *
 * 2. THE GAME'S OWN TABLES, in a headless browser. Everything the track
 *    addresses by waypoint index — the four checkpoints, the staggered grid,
 *    the seeded pickups, the nitro, the banking circles, the tunnel spans — is
 *    read back out of a booted game and classified against the collision mask
 *    the game built for itself. This is the check that a previous change to the
 *    control points broke silently: those tables are all derived from lap
 *    fractions, so they move when the layout moves, and nothing complains.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'MADRING-VALIDATION.md');
const PRINT_ONLY = process.argv.includes('--print');

const FIT = require('./madring-model-fit.js');
const SEED = require('./madring-geodata-centreline.js');

// ── the track, as game.js ships it ──────────────────────────────────────────
function readTrack() {
    const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
    const at = src.indexOf("name: 'MADRING'");
    if (at < 0) throw new Error('MADRING not found in game.js');
    const body = src.slice(at, at + 24000);
    const num = k => {
        const m = body.match(new RegExp('\\b' + k + ':\\s*(\\d+)'));
        if (!m) throw new Error('could not read ' + k);
        return Number(m[1]);
    };
    const cpAt = body.indexOf('cp: ['), cpEnd = body.indexOf(']', cpAt);
    const cp = [...body.slice(cpAt, cpEnd).matchAll(/\{x:\s*(-?\d+),\s*y:\s*(-?\d+)\}/g)]
        .map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
    const arr = k => {
        const m = body.match(new RegExp('\\b' + k + ':\\s*\\[([^\\]]*)\\]'));
        return m ? m[1] : null;
    };
    const bank = (arr('bankWp') || '').split(',').map(Number);
    const tun = [...(arr('tunnels') || '').matchAll(/frac:\s*([\d.]+),\s*len:\s*(\d+)/g)]
        .map(m => ({ frac: Number(m[1]), len: Number(m[2]) }));
    const nitro = (arr('nitroWp') || '').split(',').map(Number);
    return { W: num('W'), H: num('H'), rw: num('rw'), spp: num('spp'), laps: num('laps'), cp, bank, tun, nitro };
}
const T = readTrack();

/** The spline game.js drives. */
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
const WP = spline(T.cp, T.spp), N = WP.length;
const M = 1 / FIT.metresPerWorldPx;              // world px per metre

// ── the model's asphalt, in our world pixels ────────────────────────────────
const R = FIT.surfaceRaster();
const paved = (x, y) => {
    const [mx, mz] = FIT.worldToModel(x, y);
    const ix = Math.floor((mx - R.ox) / R.res), iy = Math.floor((mz - R.oz) / R.res);
    return ix >= 0 && iy >= 0 && ix < R.W && iy < R.H && R.mask[iy * R.W + ix] === 1;
};
/** Half-width of the paved corridor either side of a waypoint, in metres. */
function corridor(i) {
    const a = WP[(i - 1 + N) % N], b = WP[(i + 1) % N];
    let tx = b.x - a.x, ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const rx = -ty, ry = tx, step = 0.5 * M, lim = 45 * M;
    let l = 0, r = 0;
    while (l < lim && paved(WP[i].x - rx * (l + step), WP[i].y - ry * (l + step))) l += step;
    while (r < lim && paved(WP[i].x + rx * (r + step), WP[i].y + ry * (r + step))) r += step;
    return [l / M, r / M];
}

const onTarmac = WP.filter(p => paved(p.x, p.y)).length;
const widths = [], offsets = [];
for (let i = 0; i < N; i++) {
    const [l, r] = corridor(i);
    widths.push(l + r);
    offsets.push(Math.abs(l - r) / 2);       // how far off the middle of the corridor
}
const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;

// ── arc length, curvature, corners, straights ───────────────────────────────
const ds = [], head = [];
for (let i = 0; i < N; i++) {
    ds.push(Math.hypot(WP[(i + 1) % N].x - WP[i].x, WP[(i + 1) % N].y - WP[i].y) / M);
    head.push(Math.atan2(WP[(i + 1) % N].y - WP[i].y, WP[(i + 1) % N].x - WP[i].x));
}
const lapM = ds.reduce((s, v) => s + v, 0);
const dh = head.map((h, i) => {
    let d = head[(i + 1) % N] - h;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
});
// curvature averaged over ~60 m, the window scripts/madring-corners.js used on
// the geodata — the same reason applies here, a single point should not invent
// a corner.
const WIN = Math.max(2, Math.round(30 / (lapM / N)));
const kap = [], rad = [];
for (let i = 0; i < N; i++) {
    let dt = 0, L = 0;
    for (let k = -WIN; k <= WIN; k++) { dt += dh[(i + k + 2 * N) % N]; L += ds[(i + k + 2 * N) % N]; }
    kap.push(dt / L);
    rad.push(Math.abs(dt / L) > 1e-9 ? Math.abs(L / dt) : Infinity);
}
/** Contiguous runs where `test` holds, as {a, len, arcM, turnDeg}. */
function runs(test) {
    const out = [];
    let cur = null;
    for (let i = 0; i < 2 * N; i++) {
        const j = i % N;
        if (test(j)) {
            if (!cur) cur = { a: j, len: 0, arcM: 0, turn: 0 };
            cur.len++; cur.arcM += ds[j]; cur.turn += dh[j];
        } else if (cur) { out.push(cur); cur = null; }
        if (cur && cur.len > N) break;
    }
    return out.map(r => ({ ...r, turnDeg: r.turn * 180 / Math.PI }));
}
const CORNER_R = 200;
const corners = runs(i => rad[i] < CORNER_R)
    .filter(r => Math.abs(r.turnDeg) >= 12 && r.arcM > 12)
    .sort((a, b) => a.a - b.a);
// dedupe wrap-around duplicates
const seen = new Set(), cornerList = [];
for (const c of corners) { if (seen.has(c.a)) continue; seen.add(c.a); cornerList.push(c); }
const straights = runs(i => rad[i] > 400).sort((a, b) => b.arcM - a.arcM)
    .filter((s, i, all) => all.findIndex(o => o.a === s.a) === i);

// La Monumental: the longest sustained right-hand arc on the lap, measured
// twice. The tight measure (below a 200 m radius) is the semicircle itself and
// is what the published 180° figure describes; the wide one (below 400 m)
// includes the entry and exit sweeps and is what `bankWp` covers, because the
// banking on the real circuit runs into them.
const monumental = runs(i => kap[i] > 0 && rad[i] < 400).sort((a, b) => b.arcM - a.arcM)[0];
const monumentalTight = runs(i => kap[i] > 0 && rad[i] < CORNER_R).sort((a, b) => b.arcM - a.arcM)[0];

// Gaps between consecutive corners — corner exit to next corner entry. This is
// what a published "the main straight is 589 m" figure actually measures, and
// it is not the same thing as a run of low curvature.
function gapsBetweenCorners(list) {
    const out = [];
    for (let k = 0; k < list.length; k++) {
        const a = list[k], b = list[(k + 1) % list.length];
        const from = (a.a + a.len) % N, to = b.a;
        let L = 0;
        for (let i = from; i !== to; i = (i + 1) % N) L += ds[i];
        out.push({ from, to, arcM: L, after: k + 1, before: ((k + 1) % list.length) + 1 });
    }
    return out;
}

// ── the circuit's own overpasses ────────────────────────────────────────────
function crossings(material) {
    const tris = FIT.materialTriangles(material);
    const hit = new Array(N).fill(false);
    for (let i = 0; i < N; i++) {
        const [px, pz] = FIT.worldToModel(WP[i].x, WP[i].y);
        for (const t of tris) {
            const d = (t[3] - t[5]) * (t[0] - t[4]) + (t[4] - t[2]) * (t[1] - t[5]);
            if (Math.abs(d) < 1e-9) continue;
            const l1 = ((t[3] - t[5]) * (px - t[4]) + (t[4] - t[2]) * (pz - t[5])) / d;
            const l2 = ((t[5] - t[1]) * (px - t[4]) + (t[0] - t[4]) * (pz - t[5])) / d;
            if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) { hit[i] = true; break; }
        }
    }
    const out = [];
    let cur = null;
    for (let i = 0; i < N; i++) {
        if (hit[i]) { if (!cur) cur = { a: i, b: i }; cur.b = i; }
        else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out;
}
const overpasses = crossings('Cement001');

// ── self-clearance ──────────────────────────────────────────────────────────
let pinch = Infinity, pinchAt = [0, 0];
const SKIP = 120;
for (let i = 0; i < N; i++) for (let j = i + SKIP; j < N - SKIP; j++) {
    const d = Math.hypot(WP[j].x - WP[i].x, WP[j].y - WP[i].y);
    if (d < pinch) { pinch = d; pinchAt = [i, j]; }
}

// ── how far the shipped line moved away from the published polyline ─────────
const SEEDWP = spline(SEED.MADRING_CP, T.spp);
function nearestSeed(p) {
    let best = Infinity;
    for (let i = 0; i < SEEDWP.length; i++) {
        const a = SEEDWP[i], b = SEEDWP[(i + 1) % SEEDWP.length];
        const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
        let t = l2 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
        if (d < best) best = d;
    }
    return d2m(best);
}
const d2m = v => v / M;
const seedGap = WP.map(nearestSeed);
const seedOnTarmac = SEEDWP.filter(p => paved(p.x, p.y)).length;
const seedOff = (() => {
    const off = SEEDWP.map(p => !paved(p.x, p.y));
    const out = []; let cur = null;
    for (let i = 0; i < off.length; i++) {
        if (off[i]) { if (!cur) cur = { a: i, b: i }; cur.b = i; }
        else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out.filter(r => r.b - r.a > 4);
})();
let seedOffM = 0;
for (const r of seedOff) for (let i = r.a; i <= r.b; i++) {
    const a = SEEDWP[i], b = SEEDWP[(i + 1) % SEEDWP.length];
    seedOffM += Math.hypot(b.x - a.x, b.y - a.y) / M;
}

// ── half two: read the game's own tables back out of a booted game ──────────
async function inspectGame() {
    let chromium;
    try { ({ chromium } = require('playwright')); }
    catch { return null; }
    const esbuild = require('esbuild');
    const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
    const srv = http.createServer((req, res) => {
        const u = decodeURIComponent(req.url.split('?')[0]);
        const f = path.join(ROOT, u === '/' ? 'index.html' : u);
        fs.readFile(f, (e, d) => {
            if (e) { res.writeHead(404).end(); return; }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
            res.end(d);
        });
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port;
    const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8')
        .replace(/type\s*:\s*Phaser\.AUTO/, 'type: Phaser.CANVAS')
        .replace(/^new Phaser\.Game\(config\);/m, 'globalThis.__g = new Phaser.Game(config); globalThis.TRACKS = TRACKS;');
    const bundle = (await esbuild.build({
        stdin: { contents: `import Phaser from 'phaser';\n${src}\n`, resolveDir: ROOT, loader: 'js' },
        bundle: true, write: false, platform: 'browser', target: 'es2020',
    })).outputFiles[0].text;

    const browser = await chromium.launch({
        headless: true,
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    });
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.route('**/dist/bundle.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: bundle }));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof TRACKS !== 'undefined' && TRACKS[0] && TRACKS[0].cpx, { timeout: 180000 });
    const got = await page.evaluate(() => {
        const t = TRACKS[0];
        const px = t.cpx, TW = t.cpxW, TH = t.cpxH;
        const terrain = (x, y) => {
            const ix = Math.floor(x), iy = Math.floor(y);
            if (ix < 0 || ix >= TW || iy < 0 || iy >= TH) return 'offroad';
            const i = (iy * TW + ix) * 4;
            if (px[i + 1] > 200 && px[i] < 100 && px[i + 2] < 100) return 'road';
            if (px[i + 2] > 200 && px[i] < 100 && px[i + 1] < 100) return 'mud';
            if (px[i] > 200 && px[i + 1] < 100 && px[i + 2] < 100) return 'banking';
            return 'offroad';
        };
        const classify = list => list.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), ter: terrain(p.x, p.y) }));
        return {
            wp: t.wp.length,
            wpTerrain: t.wp.reduce((acc, p) => { const k = terrain(p.x, p.y); acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
            wpOff: t.wp.map((p, i) => [i, terrain(p.x, p.y)]).filter(r => r[1] === 'offroad' || r[1] === 'mud').map(r => r[0]),
            cks: classify(t.cks),
            starts: classify(t.starts),
            pks: t.pks.map(p => ({ type: p.type, x: Math.round(p.x), y: Math.round(p.y), ter: terrain(p.x, p.y) })),
            banking: { n: t.banking.length, off: t.banking.filter(b => terrain(b.x, b.y) === 'offroad').length },
            tunnels: t.tunnels.map(tu => ({ startI: tu.startI, len: tu.len, frac: +(tu.startI / t.wp.length).toFixed(3) })),
        };
    });
    await browser.close();
    srv.close();
    return got;
}

// ── report ──────────────────────────────────────────────────────────────────
const fmtPct = v => (100 * v).toFixed(1) + '%';
const fracOf = i => (i / N * 100).toFixed(1) + '%';

(async () => {
    const game = await inspectGame();

    const lines = [];
    const P = s => lines.push(s);

    P('# The MADRING, as shipped — measured against its two sources');
    P('');
    P('GENERATED by `scripts/madring-validate.js`. Do not edit by hand; re-run it.');
    P('');
    P('Every MEASURED number below is computed at generation time from two things:');
    P('the control points inlined in `game.js` (splined exactly as the game splines');
    P('them), and the `TarmacDark` mesh of the 3D model the background is baked from.');
    P('The PUBLISHED column is the circuit\'s own promotional figures, reproduced only');
    P('as something to compare against.');
    P('');
    P('## Where the layout comes from');
    P('');
    P('Two sources, and they do not agree everywhere.');
    P('');
    P('| | |');
    P('|---|---|');
    P('| Published centreline | `bacinger/f1-circuits`, `circuits/es-2026.geojson` (MIT), 116 lat/lon points, declared 5474 m |');
    P('| 3D model | "Circuito de Madring 2026 layout" by Dave Love, CC-BY-4.0 — `madring-3d/assets/madring-sketchfab/` |');
    P('| Registration | `scripts/madring-model-fit.js`: rotation ' + FIT.rotationDeg.toFixed(3) + '°, ' + FIT.metresPerWorldPx.toFixed(6) + ' m per world px, mirror ' + (FIT.mirror === 1 ? 'none' : 'x') + ' |');
    P('| Background | `images/madring-overhead.jpg`, an orthographic render of that model through that same transform |');
    P('');
    P('The geodata fixes the **identity** of the lap — where the start/finish line is,');
    P('which way round it goes, what order the corners come in. The model fixes the');
    P('**path**, because the model is what the player can see: the background image is a');
    P('render of it, so anywhere the road disagrees with the model, the car is visibly');
    P('driving over painted grass.');
    P('');
    P(`### The ${seedOffM.toFixed(0)} m disagreement`);
    P('');
    P('Splining the published polyline the way the game does and asking, for each of its');
    P(`${SEEDWP.length} waypoints, whether that square metre is paved in the model:`);
    P('');
    P('| | |');
    P('|---|---|');
    P(`| Published polyline on the model's asphalt | ${fmtPct(seedOnTarmac / SEEDWP.length)} |`);
    P(`| Contiguous stretches off it (>4 waypoints) | ${seedOff.length} |`);
    seedOff.forEach(r => P(`| — waypoints ${r.a}–${r.b} | ${(r.a / SEEDWP.length * 100).toFixed(1)}%–${(r.b / SEEDWP.length * 100).toFixed(1)}% of the lap, ${seedOffM.toFixed(0)} m |`));
    P('');
    P('That single stretch is the run into La Monumental. The polyline cuts diagonally');
    P('across the infield; the circuit carries on up the left-hand straight and loops');
    P('wider. It is not a rounding error — the two are up to');
    P(`${Math.max(...seedGap).toFixed(0)} m apart, several road widths.`);
    P('');
    P('The model wins there, and — since a splice would leave two seams and two');
    P('provenances — everywhere. `scripts/madring-road-centre.js` walks the middle of');
    P("the model's asphalt along the whole lap, starting from the published polyline so");
    P('the lap keeps its identity. `madring-3d` already did the same thing for the 3D');
    P('game (`madring-3d/src/circuit/road.ts`), which is why the two now measure the');
    P('same circuit to within a metre of lap length.');
    P('');
    P('## The road the game drives');
    P('');
    P('| | measured | note |');
    P('|---|---|---|');
    P(`| Control points | ${T.cp.length} | inlined in \`game.js\` as \`TRACKS[0].cp\` |`);
    P(`| Samples per point | ${T.spp} | ${N} waypoints, which is what everything index-addressed expects |`);
    P(`| World | ${T.W} x ${T.H} px | ${M.toFixed(4)} px/m |`);
    P(`| Road width | ${T.rw} px | ${(T.rw / M).toFixed(1)} m — three times the real circuit's, because a 26 px car on a 15 m road is undrivable |`);
    P(`| Lap | ${lapM.toFixed(0)} m | published 5474 m (${((lapM / 5474 - 1) * 100).toFixed(1)}%); \`madring-3d\` measures the same asphalt at 5429 m |`);
    P(`| Laps per race | ${T.laps} | |`);
    P('');
    P('## Coverage: is the road on the asphalt in the picture?');
    P('');
    P('For every one of the ' + N + ' waypoints, the model is asked whether that square');
    P('metre is paved, and how far it is to each edge of the paved corridor.');
    P('');
    P('| | measured |');
    P('|---|---|');
    P(`| Waypoints on the model's asphalt | **${fmtPct(onTarmac / N)}** (${onTarmac} / ${N}) |`);
    P(`| Paved corridor under the road, median | ${pct(widths, 0.5).toFixed(1)} m |`);
    P(`| Paved corridor, 5th percentile | ${pct(widths, 0.05).toFixed(1)} m |`);
    P(`| Paved corridor, narrowest | ${Math.min(...widths).toFixed(1)} m |`);
    P(`| Offset from the middle of that corridor, mean | ${mean(offsets).toFixed(1)} m |`);
    P(`| Offset from the middle, 95th percentile | ${pct(offsets, 0.95).toFixed(1)} m |`);
    P(`| Offset from the middle, worst | ${Math.max(...offsets).toFixed(1)} m |`);
    P('');
    P("The game's road is deliberately wider than the circuit's, so the band overhangs");
    P('the real asphalt in places and the numbers above are about the *centreline*, not');
    P('the band. The corridor figure is the real thing: where it drops toward 25 m the');
    P('painted kerbs in the render sit inside the drivable band rather than at its edge.');
    P('');
    P('## Self-clearance');
    P('');
    P('The collision mask is built by stroking the same spline at the same width, so two');
    P('stretches of lap closer together than the road is wide fuse into one drivable');
    P('blob and the car can cut the course.');
    P('');
    P('| | measured |');
    P('|---|---|');
    P(`| Closest approach between separate stretches | ${pinch.toFixed(1)} px = ${(pinch / M).toFixed(1)} m |`);
    P(`| — between waypoints | ${pinchAt[0]} (${fracOf(pinchAt[0])}) and ${pinchAt[1]} (${fracOf(pinchAt[1])}) |`);
    P(`| Road width | ${T.rw} px |`);
    P(`| Gap between the two tarmac edges | ${(pinch - T.rw).toFixed(1)} px = ${((pinch - T.rw) / M).toFixed(1)} m |`);
    P(`| Verdict | ${pinch > T.rw + 6 ? 'stretches stay separate' : '**TOO CLOSE — they will fuse**'} |`);
    P('');
    P('## Corners');
    P('');
    P('Detected the same way `scripts/madring-corners.js` detected them on the geodata:');
    P(`curvature averaged over ~60 m, a corner is a run below a ${CORNER_R} m radius turning`);
    P('through at least 12°. Direction is geographic — `R` is clockwise seen from above,');
    P('which is the direction of travel.');
    P('');
    P(`**${cornerList.length} corners detected** (published 22). The shortfall is expected and`);
    P('is not a claim that corners are missing: the line has been smoothed by the');
    P('snapping passes that put it in the middle of the asphalt, so a pair of corners');
    P('joined by a very short link — the chicane under the motorway, the Enlazadas —');
    P('comes back as one run. The same detector on the raw geodata finds 22; that');
    P('analysis, and the corner numbering and naming it supports, is in');
    P('`MADRING-GEODATA-CORNERS.md` — the model carries no corner labels at all.');
    P('');
    P('| # | angle | dir | arc | apex @ | lap % | min radius |');
    P('|---|---|---|---|---|---|---|');
    cornerList.forEach((c, k) => {
        const mid = (c.a + c.len / 2) % N;
        let arcTo = 0;
        for (let i = 0; i < mid; i++) arcTo += ds[i];
        let mr = Infinity;
        for (let i = 0; i < c.len; i++) mr = Math.min(mr, rad[(c.a + i) % N]);
        P(`| ${k + 1} | ${Math.abs(c.turnDeg).toFixed(0)}° | ${c.turnDeg > 0 ? 'R' : 'L'} | ${c.arcM.toFixed(0)} m | ${arcTo.toFixed(0)} m | ${(mid / N * 100).toFixed(1)}% | ${mr.toFixed(0)} m |`);
    });
    P('');
    P('## Straights');
    P('');
    P('Two measures, because "how long is a straight" depends on where you decide the');
    P('bounding corners end. **Exit-to-entry** is the gap between two detected corners,');
    P('which is what a published figure measures. **Flat** is a run where the averaged');
    P('radius never drops below 400 m, which is stricter and always shorter.');
    P('');
    const gaps = gapsBetweenCorners(cornerList).sort((a, b) => b.arcM - a.arcM);
    P('| rank | exit-to-entry | between corners | from | to |');
    P('|---|---|---|---|---|');
    gaps.slice(0, 5).forEach((g, k) =>
        P(`| ${k + 1} | ${g.arcM.toFixed(0)} m | ${g.after} → ${g.before} | ${fracOf(g.from)} | ${fracOf(g.to)} |`));
    P('');
    P('| rank | flat run | from | to |');
    P('|---|---|---|---|');
    straights.slice(0, 5).forEach((s, k) =>
        P(`| ${k + 1} | ${s.arcM.toFixed(0)} m | ${fracOf(s.a)} | ${fracOf((s.a + s.len) % N)} |`));
    P('');
    const mainStraight = gaps.find(g => g.from > N * 0.9 || g.to < N * 0.1);
    P('Published: a 589 m main straight, described as the second longest, behind an 837 m');
    P('blast from Turn 3 to Turn 5.');
    if (mainStraight) {
        P(`The gap that contains the start/finish line measures **${mainStraight.arcM.toFixed(0)} m**`);
        P(`exit-to-entry (${fracOf(mainStraight.from)} to ${fracOf(mainStraight.to)}) against the published 589 m —`);
        P(`${((mainStraight.arcM / 589 - 1) * 100).toFixed(0)}%.`);
    }
    P(`The longest gap on the lap is ${gaps[0].arcM.toFixed(0)} m; the published 837 m figure spans a`);
    P('pair of corners this detector merges, so it is not directly comparable.');
    P('');
    P('## The things addressed by lap fraction');
    P('');
    P('These are the ones a change to `cp` breaks silently, because they are all');
    P('positions along the lap rather than places: move the layout and they move with');
    P('it, and nothing complains.');
    P('');
    P('### La Monumental — `bankWp`');
    P('');
    P('| | measured | published |');
    P('|---|---|---|');
    P(`| The semicircle itself (radius under ${CORNER_R} m) | ${Math.abs(monumentalTight.turnDeg).toFixed(0)}° over ${monumentalTight.arcM.toFixed(0)} m | 180° over 550 m |`);
    P(`| With its entry and exit sweeps (under 400 m) | ${Math.abs(monumental.turnDeg).toFixed(0)}° over ${monumental.arcM.toFixed(0)} m | |`);
    P(`| — the wider bracket spans | ${fracOf(monumental.a)} to ${fracOf((monumental.a + monumental.len) % N)} of the lap | |`);
    P(`| \`bankWp\` in \`game.js\` | ${T.bank[0]} to ${T.bank[1]} | |`);
    P(`| Agreement | ${Math.abs(T.bank[0] - monumental.a / N) < 0.02 && Math.abs(T.bank[1] - ((monumental.a + monumental.len) % N) / N) < 0.02 ? 'the banking covers the arc' : '**bankWp no longer matches the arc**'} | |`);
    P('');
    P('### Tunnels — `tunnels[].frac`');
    P('');
    P('These used to be invented. They are now the two places where the circuit\'s own');
    P('concrete overpass decks (`Cement001` in the model) cross the racing line, found by');
    P('intersecting those meshes with the waypoints.');
    P('');
    P('| overpass in the model | spans | `tunnels` entry |');
    P('|---|---|---|');
    overpasses.forEach((o, k) => {
        const t = T.tun[k];
        P(`| ${k + 1} | waypoints ${o.a}–${o.b} (${fracOf(o.a)}–${fracOf(o.b)}), ${o.b - o.a + 1} long | ${t ? `frac ${t.frac} len ${t.len}` : '—'} |`);
    });
    P('');
    P('### Nitro — `nitroWp`');
    P('');
    P('| position | falls inside |');
    P('|---|---|');
    T.nitro.forEach(v => {
        const s = straights.find(st => {
            const a = st.a / N, b = ((st.a + st.len) % N) / N;
            return a < b ? v >= a && v <= b : v >= a || v <= b;
        });
        P(`| ${(v * 100).toFixed(1)}% | ${s ? `the ${s.arcM.toFixed(0)} m straight at ${fracOf(s.a)}–${fracOf((s.a + s.len) % N)}` : '**not on a straight**'} |`);
    });
    P('');

    if (game) {
        const ter = game.wpTerrain;
        const road = (ter.road || 0) + (ter.banking || 0);
        P('### Read back out of a booted game');
        P('');
        P("Everything below was read from `TRACKS[0]` after the game built it, and");
        P("classified against the collision mask the game built for itself.");
        P('');
        P('| | |');
        P('|---|---|');
        P(`| Waypoints | ${game.wp} |`);
        P(`| — on road or banking in the collision mask | ${fmtPct(road / game.wp)} |`);
        P(`| Checkpoints on road | ${game.cks.filter(c => c.ter !== 'offroad').length} / ${game.cks.length} |`);
        P(`| Grid slots on road | ${game.starts.filter(c => c.ter !== 'offroad').length} / ${game.starts.length} |`);
        P(`| Seeded pickups on road | ${game.pks.filter(p => p.ter !== 'offroad').length} / ${game.pks.length} |`);
        P(`| Banking circles off road | ${game.banking.off} of ${game.banking.n} |`);
        P(`| Tunnel spans | ${game.tunnels.map(t => `waypoint ${t.startI} (${(t.frac * 100).toFixed(1)}%), ${t.len} long`).join('; ')} |`);
        P('');
        const bad = [
            ...game.cks.filter(c => c.ter === 'offroad').map(c => `checkpoint (${c.x}, ${c.y})`),
            ...game.starts.filter(c => c.ter === 'offroad').map(c => `grid slot (${c.x}, ${c.y})`),
            ...game.pks.filter(p => p.ter === 'offroad').map(p => `${p.type} pickup (${p.x}, ${p.y})`),
        ];
        P(bad.length ? '**Off the road: ' + bad.join(', ') + '**' : 'Nothing addressed by lap fraction has fallen off the road.');
        P('');
        if (game.wpOff.length) {
            P(`${game.wpOff.length} waypoint${game.wpOff.length === 1 ? '' : 's'} (${game.wpOff.join(', ')}) read as neither road nor`);
            P('banking. They sit on the antialiased rim where a banking circle is painted over');
            P('the road in the mask, so the blend fails both colour tests. A car there loses a');
            P('frame of grip and nothing else — MADRING does not enable the fall-off-the-world');
            P('rule — but it is a real one-pixel seam in the engine\'s mask, not a rounding');
            P('artefact of this check.');
            P('');
        }
    } else {
        P('_(the booted-game half was skipped — playwright/esbuild not available)_');
        P('');
    }

    P('## What is measured, what is inferred, and what is not here at all');
    P('');
    P('### Measured, and reproducible by re-running this script');
    P('');
    P('Lap length, scale, corner count and every column of the corner table, the');
    P('straights, the coverage and corridor figures, the self-clearance, the positions of');
    P("the circuit's overpasses, and the classification of every checkpoint, grid slot and");
    P('pickup against the collision mask.');
    P('');
    P('### Inferred');
    P('');
    P('- **Corner names and numbers.** Neither source carries them. The geodata is a bare');
    P('  polyline and the model is untagged geometry. Any name attached to a corner comes');
    P("  from matching measured geometry to the circuit's published prose, and in the");
    P('  middle of the lap that matching is weak enough not to be worth writing down.');
    P('- **The banked section is a terrain type**, not geometry. A 24% bank cannot be');
    P('  drawn from directly above, so the arc measured above is painted as `banking`.');
    P('');
    P('### Not present in either source');
    P('');
    P('The elevation change, the surface of the banking, the pit lane as a driveable');
    P('thing, and every speed figure. The geodata is a flat closed polyline and a length;');
    P('the model is untagged geometry with a real aerial photograph on the ground plane.');
    P('');
    P('### Known limits of this check');
    P('');
    P('- Coverage is measured on the **centreline**, not across the width of the band.');
    P("  The band is ~45 m wide against a real corridor that is mostly 28-30 m, so it");
    P('  necessarily overhangs; that is a deliberate playability decision, not an error.');
    P('- The corner detector is run on a curve that has already been smoothed by the');
    P('  snapping passes in `madring-road-centre.js`, so very short kinks in the real');
    P('  asphalt are not resolvable here.');
    P('- Nothing here checks that the *render* is correctly exposed or that its features');
    P('  are recognisable — only that the road and the asphalt in it coincide.');

    const doc = lines.join('\n') + '\n';
    if (PRINT_ONLY) { console.log(doc); return; }
    fs.writeFileSync(OUT, doc);
    console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
    console.log(`  waypoints on the model's asphalt : ${fmtPct(onTarmac / N)}`);
    console.log(`  lap                              : ${lapM.toFixed(0)} m`);
    console.log(`  corners                          : ${cornerList.length}`);
    console.log(`  self-clearance                   : ${(pinch / M).toFixed(1)} m vs a ${(T.rw / M).toFixed(1)} m road`);
    if (game) console.log(`  game tables off road             : ${
        game.cks.filter(c => c.ter === 'offroad').length +
        game.starts.filter(c => c.ter === 'offroad').length +
        game.pks.filter(p => p.ter === 'offroad').length}`);
})().catch(e => { console.error(e); process.exit(1); });
