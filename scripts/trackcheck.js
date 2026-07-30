// Track validation + preview harness (dev-only, not shipped).
//   node .trackcheck.js
// Measures lap length, section proportions and self-clearance, then renders
// a labelled preview PNG so the layout can be inspected by eye.
//
// NOTE: this works on a control-point file whose points carry `n` (name)
// labels — scripts/madring-trace.js, the 64-point hand trace the MADRING was
// first built from. It is NOT the check for the shipped MADRING any more; that
// is scripts/madring-validate.js, which reads the control points out of
// game.js and compares them against the 3D model rather than against names.
const SRC = process.env.TRACK || require('path').join(__dirname, 'madring-trace.js');
const CP = require(SRC);
const WORLD = CP.WORLD || { W: 1024, H: 768 };
const { chromium } = require('playwright');

// Must match the samples-per-point the track under test uses in game.js. That
// is 20 for every track except MADRING, whose denser control points are paired
// with spp: 5 — pass SPP=5 when checking it.
const SPP = Number(process.env.SPP || 20);
const REAL_LAP_M = 5400;        // published circuit length
const RW = Number(process.argv[2] || 42);

function spline(pts, spp) {
    const out = [], n = pts.length;
    for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n], p1 = pts[i];
        const p2 = pts[(i + 1) % n],     p3 = pts[(i + 2) % n];
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

const wp = spline(CP, SPP);
const N = wp.length;
const seg = i => Math.hypot(wp[(i + 1) % N].x - wp[i].x, wp[(i + 1) % N].y - wp[i].y);
const cum = [0];
for (let i = 0; i < N; i++) cum.push(cum[i] + seg(i));
const LAP = cum[N];

const idxOf = name => {
    const i = CP.findIndex(p => p.n === name);
    if (i < 0) throw new Error('no control point named ' + name);
    return i * SPP;   // spline() emits cp[i] exactly at wp[i*SPP]
};
// arc length from control point a to control point b, forward around the lap
const arc = (a, b) => {
    const ia = idxOf(a), ib = idxOf(b);
    return ib >= ia ? cum[ib] - cum[ia] : LAP - cum[ia] + cum[ib];
};

const pxPerM = LAP / REAL_LAP_M;

console.log(`control points : ${CP.length}`);
console.log(`waypoints      : ${N}`);
console.log(`lap length     : ${LAP.toFixed(0)} px  (other tracks: 1915–2541 px)`);
console.log(`scale          : ${pxPerM.toFixed(4)} px/m  →  1 px = ${(1/pxPerM).toFixed(2)} m\n`);

const CHECKS = [
    ['Main straight (T22→T1)',      'T22',  'T1',   589],
    ['Ribera de Sena (T3→T5)',      'T3',   'T5',   837],
    ['La Monumental (T12→exit)',    'T12',  'T12x', 550],
    ['Start → T1',                  'START','T1',   202],
];
console.log('section                        target        got          Δ');
console.log('─'.repeat(66));
let worst = 0;
for (const [label, a, b, targetM] of CHECKS) {
    const gotPx = arc(a, b);
    const gotPct = gotPx / LAP * 100;
    const tgtPct = targetM / REAL_LAP_M * 100;
    const d = gotPct - tgtPct;
    worst = Math.max(worst, Math.abs(d));
    console.log(
        `${label.padEnd(30)} ${tgtPct.toFixed(1).padStart(5)}%  ` +
        `${gotPct.toFixed(1).padStart(5)}% (${gotPx.toFixed(0).padStart(4)} px)  ` +
        `${(d >= 0 ? '+' : '') + d.toFixed(1)} pt`
    );
}
console.log('─'.repeat(66));
console.log(`worst deviation: ${worst.toFixed(1)} points\n`);

// ── corner angles: compare against the published figures ──
// Measured as the heading change across the corner, sampled ±8 waypoints.
// Integrate the heading change across the corner's whole extent: half a
// control-point interval either side, which is where one corner's influence
// ends and its neighbour's begins.
const K = Number(process.env.K || 10);
const turnAt = name => {
    const i = idxOf(name);
    let total = 0;
    for (let k = -K; k < K; k++) {
        const a = wp[(i + k - 1 + 2 * N) % N], b = wp[(i + k + 2 * N) % N], c = wp[(i + k + 1 + 2 * N) % N];
        let d = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        total += d;
    }
    return { deg: Math.abs(total) * 180 / Math.PI, dir: total > 0 ? 'right' : 'left' };
};
const ANGLES = [['T13', 84], ['T17', 84], ['T20', 117], ['T21', 71], ['T22', 90]];
console.log('corner   published   measured   direction');
console.log('─'.repeat(45));
for (const [n, tgt] of ANGLES) {
    const t = turnAt(n);
    console.log(`${n.padEnd(8)} ${(tgt + '°').padStart(7)}   ${(t.deg.toFixed(0) + '°').padStart(8)}   ${t.dir}`);
}
// La Monumental is a semicircle: sum the heading change across the whole arc
{
    const ia = idxOf('T12'), ib = idxOf('T12x');
    let total = 0;
    for (let k = ia; k !== ib; k = (k + 1) % N) {
        const a = wp[k], b = wp[(k + 1) % N], c = wp[(k + 2) % N];
        let d = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        total += d;
    }
    console.log(`T12      ${'180°'.padStart(7)}   ${(Math.abs(total * 180 / Math.PI).toFixed(0) + '°').padStart(8)}   ` +
                `${total > 0 ? 'right' : 'left'}  (La Monumental, semicircle)`);
}
console.log('');

// ── self-clearance: closest approach between non-adjacent parts of the loop ──
// The collision map strokes the spline with lineWidth = rw, so two stretches
// closer than rw fuse into one drivable blob and the car can cut the course.
let minD = Infinity, minAt = null;
const SKIP = 34;   // ignore neighbours within this many waypoints along the loop
for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
        const along = Math.min(j - i, N - (j - i));   // circular distance along the path
        if (along < SKIP) continue;
        const d = Math.hypot(wp[i].x - wp[j].x, wp[i].y - wp[j].y);
        if (d < minD) { minD = d; minAt = [i, j]; }
    }
}
const nameAt = k => {
    let best = null, bd = 1e9;
    CP.forEach((p, ci) => { const d = Math.abs(ci * SPP - k); if (d < bd) { bd = d; best = `${p.n}[cp${ci}]`; } });
    return best;
};
console.log(`closest approach between separate stretches: ${minD.toFixed(0)} px ` +
            `(near ${nameAt(minAt[0])} ↔ ${nameAt(minAt[1])})`);
console.log(`road width in use: ${RW} px → gap between tarmac edges: ${(minD - RW).toFixed(0)} px`);
console.log(minD > RW + 12 ? '✓ stretches stay separate\n' : '✗ TOO CLOSE — stretches will fuse in the collision map\n');

const xs = wp.map(p => p.x), ys = wp.map(p => p.y);
console.log(`bounds: x ${Math.min(...xs).toFixed(0)}–${Math.max(...xs).toFixed(0)}, ` +
            `y ${Math.min(...ys).toFixed(0)}–${Math.max(...ys).toFixed(0)} (world ${WORLD.W}×${WORLD.H}, need ${RW/2+6}px margin)`);

// ── preview render ──
(async () => {
    const b = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });
    const p = await b.newPage();
    await p.setViewportSize({ width: WORLD.W, height: WORLD.H });
    await p.setContent(`<canvas id="c" width="${WORLD.W}" height="${WORLD.H}"></canvas><style>body{margin:0}</style>`);
    await p.evaluate(([wp, CP, RW, WORLD]) => {
        const x = document.getElementById('c').getContext('2d');
        x.fillStyle = '#20301c'; x.fillRect(0, 0, WORLD.W, WORLD.H);
        const path = () => {
            x.beginPath(); x.moveTo(wp[0].x, wp[0].y);
            for (let i = 1; i < wp.length; i++) x.lineTo(wp[i].x, wp[i].y);
            x.closePath();
        };
        x.lineCap = 'round'; x.lineJoin = 'round';
        x.strokeStyle = '#8d8d8d'; x.lineWidth = RW + 10; path(); x.stroke();
        x.strokeStyle = '#565656'; x.lineWidth = RW;      path(); x.stroke();
        x.strokeStyle = '#7a7a7a'; x.lineWidth = 1; x.setLineDash([8, 14]); path(); x.stroke();
        x.setLineDash([]);
        CP.forEach(cp => {
            x.fillStyle = '#ffcc22';
            x.beginPath(); x.arc(cp.x, cp.y, 4, 0, Math.PI * 2); x.fill();
            x.fillStyle = '#fff'; x.font = 'bold 12px monospace';
            x.textAlign = 'center'; x.textBaseline = 'middle';
            x.strokeStyle = '#000'; x.lineWidth = 3;
            x.strokeText(cp.n, cp.x, cp.y - 15); x.fillText(cp.n, cp.x, cp.y - 15);
        });
        // start/finish marker
        x.strokeStyle = '#fff'; x.lineWidth = 4;
        x.beginPath(); x.arc(CP[0].x, CP[0].y, 12, 0, Math.PI * 2); x.stroke();
    }, [wp, CP, RW, WORLD]);
    await p.screenshot({ path: '/tmp/claude-0/-home-user-madring-machines/d0ff4269-0e54-552a-bf93-4c0327fa1427/scratchpad/track-preview.png' });
    await b.close();
})();
