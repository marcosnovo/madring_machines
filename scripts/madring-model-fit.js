#!/usr/bin/env node
/**
 * madring-model-fit.js
 *
 * Works out how the Sketchfab 3D model of the circuit sits on top of our
 * centreline — the transform scripts/madring-bake-overhead.js needs before it
 * can point a camera at the model and get a picture our road lines up with.
 *
 *   model : madring-3d/assets/madring-sketchfab/scene.gltf
 *           "Circuito de Madring 2026 layout" by Dave Love, CC-BY-4.0.
 *           Real metric scale, 1 unit = 1 m, Y up, ground in the XZ plane.
 *   ours  : scripts/madring-geodata-centreline.js, world pixels, ~1.0244 px/m.
 *           The published survey, deliberately — not the line the game races,
 *           which is derived from this fit and would make the fit circular.
 *
 * Nothing here is guessed. The model's TarmacDark mesh — the driving surface
 * and only that — is rasterised to a 1 m grid and turned into a distance
 * transform: every square metre of tarmac is labelled with how far it is from
 * the nearest edge. A four-parameter similarity transform (rotation, uniform
 * scale, translation; mirror tried both ways) then maps our centreline into
 * model space, and we search for the transform that maximises the average
 * distance-to-edge under the line, capped at half a road width so that a wide
 * paddock cannot outbid the racing surface. The maximum is where our line runs
 * down the middle of their tarmac, which is exactly the alignment we want.
 *
 * Search is a 48-seed multistart Nelder–Mead over the full circle, so the
 * result does not depend on a starting guess. Reported as CLI output:
 *
 *     node scripts/madring-model-fit.js
 *
 * and exported for the bake script as the FIT object.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const MODEL_DIR = path.join(__dirname, '..', 'madring-3d', 'assets', 'madring-sketchfab');
const SURFACE_MATERIAL = 'TarmacDark';     // the driving surface, nothing else
const RES = 1;                             // metres per raster cell
const PAD = 80;                            // raster margin, metres
const CAP = 11;                            // half a road width: the objective's ceiling

// ── minimal glTF reader ─────────────────────────────────────────────────────
// three.js is a browser library; this runs in Node, and all we need is
// positions and indices with node transforms applied.
const gltf = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'scene.gltf'), 'utf8'));
const bin = fs.readFileSync(path.join(MODEL_DIR, gltf.buffers[0].uri));
const COMP = { 5120: ['Int8', 1], 5121: ['Uint8', 1], 5122: ['Int16', 2], 5123: ['Uint16', 2], 5125: ['Uint32', 4], 5126: ['Float32', 4] };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(i) {
    const a = gltf.accessors[i], bv = gltf.bufferViews[a.bufferView];
    const [kind, size] = COMP[a.componentType], n = NCOMP[a.type];
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const stride = bv.byteStride || size * n;
    const out = new global[kind + 'Array'](a.count * n);
    const read = { Float32: 'readFloatLE', Uint16: 'readUInt16LE', Uint32: 'readUInt32LE', Uint8: 'readUInt8', Int16: 'readInt16LE', Int8: 'readInt8' }[kind];
    for (let k = 0; k < a.count; k++)
        for (let c = 0; c < n; c++) out[k * n + c] = bin[read](base + k * stride + c * size);
    return { data: out, count: a.count };
}
function matMul(a, b) {                    // column-major 4x4
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
    }
    return o;
}
function nodeMatrix(n) {
    if (n.matrix) return n.matrix.slice();
    const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
    const t = n.translation || [0, 0, 0], s = n.scale || [1, 1, 1];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    return [
        (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
        (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
        (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
        t[0], t[1], t[2], 1,
    ];
}

/** Every triangle of the named material, flattened to model XZ. */
function surfaceTriangles(material = SURFACE_MATERIAL) {
    const tris = [];
    const visit = (ni, parent) => {
        const node = gltf.nodes[ni];
        const m = matMul(parent, nodeMatrix(node));
        if (node.mesh !== undefined) {
            for (const prim of gltf.meshes[node.mesh].primitives) {
                const mat = gltf.materials[prim.material];
                if (!mat || !mat.name.startsWith(material)) continue;
                const P = readAccessor(prim.attributes.POSITION), I = readAccessor(prim.indices);
                const X = new Float64Array(P.count), Z = new Float64Array(P.count);
                for (let i = 0; i < P.count; i++) {
                    const x = P.data[i * 3], y = P.data[i * 3 + 1], z = P.data[i * 3 + 2];
                    X[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
                    Z[i] = m[2] * x + m[6] * y + m[10] * z + m[14];
                }
                for (let k = 0; k < I.count; k += 3) {
                    const a = I.data[k], b = I.data[k + 1], c = I.data[k + 2];
                    tris.push([X[a], Z[a], X[b], Z[b], X[c], Z[c]]);
                }
            }
        }
        (node.children || []).forEach(c => visit(c, m));
    };
    gltf.scenes[gltf.scene || 0].nodes.forEach(ni => visit(ni, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    return tris;
}

// ── raster + distance transform ─────────────────────────────────────────────
function rasterise(tris) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const t of tris) for (let i = 0; i < 6; i += 2) {
        if (t[i] < x0) x0 = t[i]; if (t[i] > x1) x1 = t[i];
        if (t[i + 1] < z0) z0 = t[i + 1]; if (t[i + 1] > z1) z1 = t[i + 1];
    }
    const bounds = { x0, x1, z0, z1 };
    x0 -= PAD; z0 -= PAD; x1 += PAD; z1 += PAD;
    const W = Math.ceil((x1 - x0) / RES), H = Math.ceil((z1 - z0) / RES);
    const mask = new Uint8Array(W * H);
    for (const t of tris) {
        const ax = (t[0] - x0) / RES, ay = (t[1] - z0) / RES;
        const bx = (t[2] - x0) / RES, by = (t[3] - z0) / RES;
        const cx = (t[4] - x0) / RES, cy = (t[5] - z0) / RES;
        const det = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
        if (Math.abs(det) < 1e-9) continue;
        const lo = (v, n) => Math.max(0, Math.floor(v)), hi = (v, n) => Math.min(n - 1, Math.ceil(v));
        for (let y = lo(Math.min(ay, by, cy)); y <= hi(Math.max(ay, by, cy), H); y++)
            for (let x = lo(Math.min(ax, bx, cx)); x <= hi(Math.max(ax, bx, cx), W); x++) {
                const px = x + 0.5, py = y + 0.5;
                const w0 = ((bx - ax) * (py - ay) - (px - ax) * (by - ay)) / det;
                const w1 = ((px - ax) * (cy - ay) - (cx - ax) * (py - ay)) / det;
                if (w0 >= -0.05 && w1 >= -0.05 && w0 + w1 <= 1.05) mask[y * W + x] = 1;
            }
    }
    return { mask, W, H, ox: x0, oz: z0, bounds };
}

// Felzenszwalb & Huttenlocher — exact Euclidean distance transform, O(n).
function edt1d(f, n) {
    const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
        let s;
        for (;;) {
            s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
            if (s <= z[k]) k--; else break;
        }
        k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
    return d;
}
function distanceToEdge(mask, W, H) {
    const f = new Float64Array(W * H);
    for (let i = 0; i < W * H; i++) f[i] = mask[i] ? 1e12 : 0;
    const col = new Float64Array(H), row = new Float64Array(W);
    for (let x = 0; x < W; x++) {
        for (let y = 0; y < H; y++) col[y] = f[y * W + x];
        const d = edt1d(col, H);
        for (let y = 0; y < H; y++) f[y * W + x] = d[y];
    }
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) row[x] = f[y * W + x];
        const d = edt1d(row, W);
        for (let x = 0; x < W; x++) f[y * W + x] = Math.sqrt(d[x]);
    }
    return f;
}

// ── the search ──────────────────────────────────────────────────────────────
function nelderMead(f, x0, step, iters) {
    const n = x0.length;
    let simplex = [x0.slice()];
    for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += step[i]; simplex.push(p); }
    let val = simplex.map(f);
    for (let it = 0; it < iters; it++) {
        const order = val.map((v, i) => i).sort((a, b) => val[b] - val[a]);   // maximise
        simplex = order.map(i => simplex[i]); val = order.map(i => val[i]);
        const worst = n, cen = new Array(n).fill(0);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cen[j] += simplex[i][j] / n;
        const refl = cen.map((c, j) => 2 * c - simplex[worst][j]);
        const fr = f(refl);
        if (fr > val[0]) {
            const exp = cen.map((c, j) => 3 * c - 2 * simplex[worst][j]), fe = f(exp);
            if (fe > fr) { simplex[worst] = exp; val[worst] = fe; } else { simplex[worst] = refl; val[worst] = fr; }
        } else if (fr > val[n - 1]) { simplex[worst] = refl; val[worst] = fr; }
        else {
            const con = cen.map((c, j) => c + 0.5 * (simplex[worst][j] - c)), fc = f(con);
            if (fc > val[worst]) { simplex[worst] = con; val[worst] = fc; }
            else for (let i = 1; i <= n; i++) {
                simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
                val[i] = f(simplex[i]);
            }
        }
    }
    const bi = val.indexOf(Math.max(...val));
    return { par: simplex[bi], val: val[bi] };
}

function fitModel() {
    // The GEODATA line, not the one the game drives. Fitting against the raced
    // line would be circular — that line is itself derived from this fit — and
    // the geodata is the independent survey the model should be registered to.
    const { MADRING_CP, MADRING_WORLD } = require('./madring-geodata-centreline.js');
    const tris = surfaceTriangles();
    const R = rasterise(tris);
    const DT = distanceToEdge(R.mask, R.W, R.H);

    // Dense, arc-length-fair sampling of our centreline.
    const line = [];
    for (let i = 0; i < MADRING_CP.length; i++) {
        const a = MADRING_CP[i], b = MADRING_CP[(i + 1) % MADRING_CP.length];
        for (let s = 0; s < 4; s++) line.push({ x: a.x + (b.x - a.x) * s / 4, y: a.y + (b.y - a.y) * s / 4 });
    }
    const cx = line.reduce((s, p) => s + p.x, 0) / line.length;
    const cy = line.reduce((s, p) => s + p.y, 0) / line.length;

    const sample = (x, z) => {
        const fx = (x - R.ox) / RES, fy = (z - R.oz) / RES;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        if (ix < 0 || iy < 0 || ix >= R.W - 1 || iy >= R.H - 1) return 0;
        const tx = fx - ix, ty = fy - iy;
        const a = DT[iy * R.W + ix], b = DT[iy * R.W + ix + 1];
        const c = DT[(iy + 1) * R.W + ix], d = DT[(iy + 1) * R.W + ix + 1];
        return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
    const mapper = (th, s, tx, tz, mir) => {
        const co = Math.cos(th), si = Math.sin(th);
        return p => {
            const ux = (p.x - cx) * s * mir, uy = (p.y - cy) * s;
            return [co * ux - si * uy + tx, si * ux + co * uy + tz];
        };
    };
    const score = (par, mir) => {
        const f = mapper(par[0], par[1], par[2], par[3], mir);
        let sum = 0;
        for (const p of line) { const q = f(p); sum += Math.min(sample(q[0], q[1]), CAP); }
        return sum / line.length;
    };

    // translation prior: centroid of the tarmac; scale prior: the track's own px/m
    let mx = 0, mz = 0, n = 0;
    for (let y = 0; y < R.H; y++) for (let x = 0; x < R.W; x++)
        if (R.mask[y * R.W + x]) { mx += R.ox + (x + 0.5) * RES; mz += R.oz + (y + 0.5) * RES; n++; }
    mx /= n; mz /= n;
    const s0 = 1 / MADRING_WORLD.scale;

    let best = null;
    for (const mir of [1, -1]) for (let deg = 0; deg < 360; deg += 15) {
        const r = nelderMead(p => score(p, mir), [deg * Math.PI / 180, s0, mx, mz], [0.08, 0.01, 30, 30], 1200);
        if (!best || r.val > best.val) best = { ...r, mir };
    }

    let deg = ((best.par[0] * 180 / Math.PI) % 360 + 360) % 360;
    if (deg > 180) deg -= 360;
    const f = mapper(...best.par, best.mir);
    let onTarmac = 0; const edge = [];
    for (const p of line) { const q = f(p); const d = sample(q[0], q[1]); if (d > 0.5) onTarmac++; edge.push(d); }
    edge.sort((a, b) => a - b);

    return {
        // world pixel (x, y) → model metres (x, z):
        //   u = (p - centroidWorld) * metresPerWorldPx * [mirror, 1]
        //   model = rotate(rotationDeg) * u + (tx, tz)
        rotationDeg: deg,
        mirror: best.mir,
        metresPerWorldPx: best.par[1],
        tx: best.par[2], tz: best.par[3],
        centroidWorld: { x: cx, y: cy },
        tarmacBounds: R.bounds,
        tarmacAreaM2: n,
        quality: {
            meanEdgeDistance: best.val,
            onTarmacPct: 100 * onTarmac / line.length,
            edgeP05: edge[Math.floor(edge.length * 0.05)],
            edgeMedian: edge[edge.length >> 1],
        },
    };
}

const FIT = fitModel();

if (require.main === module) {
    console.log('model      :', path.relative(process.cwd(), path.join(MODEL_DIR, 'scene.gltf')));
    console.log('surface    :', SURFACE_MATERIAL, `— ${FIT.tarmacAreaM2} m2 of tarmac`);
    console.log('bounds     :', `x ${FIT.tarmacBounds.x0.toFixed(0)}…${FIT.tarmacBounds.x1.toFixed(0)}  ` +
        `z ${FIT.tarmacBounds.z0.toFixed(0)}…${FIT.tarmacBounds.z1.toFixed(0)} m`);
    console.log('');
    console.log('rotation   :', FIT.rotationDeg.toFixed(3), 'deg');
    console.log('mirror     :', FIT.mirror === 1 ? 'none' : 'x flipped');
    console.log('scale      :', FIT.metresPerWorldPx.toFixed(6), 'm per world px');
    console.log('translate  :', FIT.tx.toFixed(2), FIT.tz.toFixed(2));
    console.log('');
    console.log('centreline on their tarmac :', FIT.quality.onTarmacPct.toFixed(1) + '%');
    console.log('mean distance-to-edge      :', FIT.quality.meanEdgeDistance.toFixed(2), `m (capped at ${CAP})`);
    console.log('median distance-to-edge    :', FIT.quality.edgeMedian.toFixed(1), 'm');
}

module.exports = FIT;
module.exports.CAP = CAP;

// The tarmac raster itself, for scripts that need to ask "is this square metre
// of the real circuit paved?" — scripts/madring-road-centre.js walks it to find
// the middle of the road, and scripts/trackcheck.js uses it to score coverage.
// Computed on demand and memoised; it costs ~2 s and most callers never want it.
let _raster = null;
module.exports.surfaceRaster = () => {
    if (!_raster) {
        const R = rasterise(surfaceTriangles());
        _raster = { mask: R.mask, W: R.W, H: R.H, ox: R.ox, oz: R.oz, res: RES, bounds: R.bounds };
    }
    return _raster;
};

// Every triangle of a named material, flattened to model XZ as
// [ax, az, bx, bz, cx, cz]. scripts/madring-validate.js uses it to ask where
// the circuit's real overpasses cross the racing line.
module.exports.materialTriangles = (material) => surfaceTriangles(material);

// Centroid of a named material in model metres — used to find the model's own
// start/finish gantry, so the game's timing line can be put under the painted
// one instead of near it.
module.exports.materialCentroid = (material) => {
    const tris = surfaceTriangles(material);
    if (!tris.length) return null;
    let x = 0, z = 0;
    for (const t of tris) for (let i = 0; i < 6; i += 2) { x += t[i]; z += t[i + 1]; }
    return [x / (tris.length * 3), z / (tris.length * 3)];
};

// world pixel (x, y) → model metres (x, z), and back. The bake's camera uses
// exactly this mapping, so anything expressed in one frame can be checked in
// the other without a second, drifting copy of the arithmetic.
const _th = FIT.rotationDeg * Math.PI / 180, _co = Math.cos(_th), _si = Math.sin(_th);
module.exports.worldToModel = (x, y) => {
    const ux = (x - FIT.centroidWorld.x) * FIT.metresPerWorldPx * FIT.mirror;
    const uy = (y - FIT.centroidWorld.y) * FIT.metresPerWorldPx;
    return [_co * ux - _si * uy + FIT.tx, _si * ux + _co * uy + FIT.tz];
};
module.exports.modelToWorld = (mx, mz) => {
    const dx = mx - FIT.tx, dz = mz - FIT.tz;
    const ux = _co * dx + _si * dz, uy = -_si * dx + _co * dz;
    return [ux / FIT.metresPerWorldPx / FIT.mirror + FIT.centroidWorld.x,
            uy / FIT.metresPerWorldPx + FIT.centroidWorld.y];
};
