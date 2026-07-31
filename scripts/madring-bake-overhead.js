#!/usr/bin/env node
/**
 * madring-bake-overhead.js
 *
 * Bakes the MADRING's track art from a real 3D model of the circuit instead of
 * drawing it by hand.
 *
 *   in  : madring-3d/assets/madring-sketchfab/scene.gltf
 *         "Circuito de Madring 2026 layout" by Dave Love, CC-BY-4.0 — the real
 *         grandstands, pit complex, start gantry, buildings, trees and fences.
 *   out : images/madring-overhead.jpg, exactly TRACKS[0].W x TRACKS[0].H,
 *         one image pixel per world pixel.
 *
 *     node scripts/madring-bake-overhead.js             # 3x supersampled
 *     SS=1 node scripts/madring-bake-overhead.js        # quick, for iterating
 *     FORMAT=png node scripts/madring-bake-overhead.js  # lossless copy
 *
 * How it works
 * ────────────
 * An orthographic camera looks straight down at the model. Its frustum is the
 * game world: scripts/madring-model-fit.js has already found the rotation,
 * scale and offset that put our centreline down the middle of the model's
 * tarmac, so the camera is positioned and rolled by that transform and its
 * width and height are the world's, converted to metres. What lands in pixel
 * (x, y) of the render is therefore what stands at world (x, y) in the game.
 * There is no eyeballing anywhere in the chain.
 *
 * Two passes are rendered. The first is the whole circuit. The second is the
 * road surface alone — tarmac, kerbs, painted lines, pit apron — on a
 * transparent background. Between them we stroke the game's own road: the
 * spline through TRACKS[0].cp, at TRACKS[0].rw. That band has to be there
 * because the game's cars are enormous next to a real circuit (a 26 px car on
 * a road that is 15 m wide in life would be undrivable), so the drivable
 * surface is ~45 m across where the real one is ~15. Laying the surface pass
 * back on top means the real kerbs and markings survive on our wider asphalt
 * rather than being buried under it.
 *
 * The road band is read straight out of game.js — control points, road width
 * and samples-per-point — so the baked image cannot drift from the road the
 * car actually drives. If that parse fails the script stops rather than bake
 * a misaligned image.
 *
 * What this does NOT do: collision. The colour-mask collision map is still
 * generated from the spline in game.js and owes nothing to this picture.
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
// The image is a photographic aerial, which PNG cannot compress: lossless it
// runs to ~6.5 MB, and every player pays that on the boot loading screen
// whether or not they ever pick this track. JPEG at 0.92 is a tenth of that
// with nothing visible to lose — there is no alpha and no flat colour to band.
// FORMAT=png if you want the lossless copy for inspection.
const FORMAT = (process.env.FORMAT || 'jpg').toLowerCase() === 'png' ? 'png' : 'jpg';
const OUT = path.join(ROOT, 'images', 'madring-overhead.' + FORMAT);
const QUALITY = Number(process.env.QUALITY || 0.92);
const SS = Number(process.env.SS || 3);           // supersample factor
const FIT = require('./madring-model-fit.js');

// ── read the track's real numbers out of game.js ────────────────────────────
// Anything hard-coded here would be a second source of truth waiting to rot.
function readTrackFromGame() {
    const src = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
    const at = src.indexOf("name: 'MADRING'");
    if (at < 0) throw new Error('MADRING track not found in game.js');
    const body = src.slice(at, at + 20000);
    const num = (key) => {
        const m = body.match(new RegExp('\\b' + key + ':\\s*(\\d+)'));
        if (!m) throw new Error(`MADRING: could not read ${key} from game.js`);
        return Number(m[1]);
    };
    const cpAt = body.indexOf('cp: [');
    const cpEnd = body.indexOf(']', cpAt);
    if (cpAt < 0 || cpEnd < 0) throw new Error('MADRING: could not read cp from game.js');
    const cp = [...body.slice(cpAt, cpEnd).matchAll(/\{x:\s*(-?\d+),\s*y:\s*(-?\d+)\}/g)]
        .map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
    if (cp.length < 16) throw new Error(`MADRING: only parsed ${cp.length} control points from game.js`);
    return { W: num('W'), H: num('H'), rw: num('rw'), spp: num('spp'), cp };
}
const T = readTrackFromGame();

// Same Catmull-Rom the game uses. Duplicated deliberately: this script must
// walk the exact curve game.js walks, so it takes the same points, the same
// samples-per-point and the same formula.
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
const WP = spline(T.cp, T.spp);

// ── camera placement, straight from the fit ─────────────────────────────────
// world px → model metres. Screen right must be world +x and screen down world
// +y, so the camera's up vector is the model-space direction of world -y.
const th = FIT.rotationDeg * Math.PI / 180;
const worldToModel = (x, y) => {
    const ux = (x - FIT.centroidWorld.x) * FIT.metresPerWorldPx * FIT.mirror;
    const uy = (y - FIT.centroidWorld.y) * FIT.metresPerWorldPx;
    return [Math.cos(th) * ux - Math.sin(th) * uy + FIT.tx,
            Math.sin(th) * ux + Math.cos(th) * uy + FIT.tz];
};
const [camX, camZ] = worldToModel(T.W / 2, T.H / 2);
const CAM = {
    x: camX, z: camZ,
    up: [Math.sin(th), 0, -Math.cos(th)],       // model direction of world -y
    halfW: T.W * FIT.metresPerWorldPx / 2,
    halfH: T.H * FIT.metresPerWorldPx / 2,
    mirror: FIT.mirror,
};

// Materials that make up the road surface. Rendered a second time, on top of
// our asphalt band, so the circuit's real markings are not painted over.
const SURFACE = ['TarmacDark', 'main_kerbs', 'Line_White', 'Line_Red', 'Line_Yellow',
                 'Pit01c2', 'tyre_skids1', 'kuwait_bridge_road_3_lane'];

// ── static server, so the browser can fetch the model and three.js ──────────
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.gltf': 'model/gltf+json',
               '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg',
               '.html': 'text/html' };
function serve(pageHtml) {
    return new Promise(resolve => {
        const srv = http.createServer((req, res) => {
            const rel = decodeURIComponent(req.url.split('?')[0]);
            if (rel === '/') {                       // the render harness itself
                res.writeHead(200, { 'Content-Type': 'text/html' }).end(pageHtml);
                return;
            }
            if (rel === '/favicon.ico') { res.writeHead(204).end(); return; }
            const file = path.join(ROOT, rel);
            if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
                res.writeHead(404).end('no');
                return;
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
            fs.createReadStream(file).pipe(res);
        });
        srv.listen(0, '127.0.0.1', () => resolve(srv));
    });
}

const PAGE = `<!doctype html><meta charset=utf8><style>html,body{margin:0;background:#000}</style>
<script type="importmap">{"imports":{"three":"/madring-3d/node_modules/three/build/three.module.js"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from '/madring-3d/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
window.THREE = THREE;
window.__ready = new Promise((resolve, reject) => {
    new GLTFLoader().load('/madring-3d/assets/madring-sketchfab/scene.gltf',
        g => { window.__gltf = g; resolve(true); },
        p => { window.__progress = p.loaded; },
        e => reject(String(e)));
});
</script>`;

(async () => {
    const srv = await serve(PAGE);
    const port = srv.address().port;
    const W = T.W * SS, H = T.H * SS;

    console.log(`world      : ${T.W} x ${T.H} px, road ${T.rw} px, ${T.cp.length} cp x ${T.spp} = ${WP.length} waypoints`);
    console.log(`camera     : ortho ${(CAM.halfW * 2).toFixed(0)} x ${(CAM.halfH * 2).toFixed(0)} m` +
        ` at (${CAM.x.toFixed(1)}, ${CAM.z.toFixed(1)}), roll ${FIT.rotationDeg.toFixed(3)} deg`);
    console.log(`render     : ${W} x ${H} (SS=${SS}) → ${T.W} x ${T.H}`);

    const browser = await chromium.launch({
        headless: true, executablePath: '/opt/pw-browsers/chromium',
        args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    page.on('console', m => { if (m.type() === 'error') console.log('  [page]', m.text()); });
    page.on('pageerror', e => console.log('  [page error]', e.message));

    await page.goto(`http://127.0.0.1:${port}/`);

    process.stdout.write('loading model… ');
    await page.waitForFunction('window.__ready !== undefined', null, { timeout: 60000 });
    await page.evaluate('window.__ready', { timeout: 600000 });
    console.log('ok');

    process.stdout.write('rendering… ');
    const dataUrl = await page.evaluate(async ({ W, H, CAM, WP, RW, SS, SURFACE, OUTW, OUTH, FORMAT, QUALITY, SUN }) => {
        const THREE = window.THREE;
        const scene = new THREE.Scene();
        scene.add(window.__gltf.scene);

        // Exposure budget, not decoration. The model's ground is a real aerial
        // photograph, so a flat up-facing surface wants to come back at roughly
        // its own texture colour: ambient alone would do that at intensity 1.
        // The rest is spent on the sun, which now sits LOW — a straight-down
        // orthographic render flattens every roof into a shape, and the only
        // way to give buildings volume without tilting the camera (which would
        // displace rooftops from their footprints and break the road/collision
        // alignment this bake promises) is to let them cast long shadows onto
        // the ground. Elevation ~30°: a 20 m hall throws a ~35 m shadow.
        // Azimuth is from the image's top-left, the direction human vision
        // expects light from. Total on a lit horizontal face ≈ 1.1
        // (0.42 ambient + 0.10 hemi + 1.15·sin 30° sun); in shadow ≈ 0.52 —
        // shadowed ground renders at about half brightness, which is what it
        // takes for the shadows to read on top of a photographic texture that
        // already carries its own baked-in sun.
        scene.add(new THREE.AmbientLight(0xffffff, 0.42));
        scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x6b5f4a, 0.10));
        const SUN_ELEV = 30 * Math.PI / 180;
        // screen direction the light comes FROM: top-left = world (-1, -1).
        // Convert that world direction to model space with the same rotation
        // the camera transform uses. The camera's mirror (cam.scale.x = -1)
        // flips screen x, so the world-x component is negated once more to
        // land on screen (-1, -1) — verified on the bake itself: the trees
        // along the park rows throw their shadows to the lower-right.
        const sth = SUN.th, sm = SUN.mirror;
        const ux = (1 / Math.SQRT2) * sm, uy = (-1 / Math.SQRT2);
        const mx = Math.cos(sth) * ux - Math.sin(sth) * uy;
        const mz = Math.sin(sth) * ux + Math.cos(sth) * uy;
        const D = 2500;
        const key = new THREE.DirectionalLight(0xfff4e0, 1.15);
        key.position.set(CAM.x + mx * Math.cos(SUN_ELEV) * D,
                         Math.sin(SUN_ELEV) * D,
                         CAM.z + mz * Math.cos(SUN_ELEV) * D);
        key.target.position.set(CAM.x, 0, CAM.z);
        scene.add(key.target);
        key.castShadow = true;
        // The shadow camera has to hold the whole circuit: half-diagonal of
        // the world is ~1220 m, plus slack for the light's slant. 8192 px
        // over ~2700 m is 0.33 m per shadow texel — three times finer than
        // the 1 px ≈ 1 m output, so edges stay crisp at this scale.
        const SR = 1350;
        key.shadow.camera.left = -SR; key.shadow.camera.right = SR;
        key.shadow.camera.top = SR;   key.shadow.camera.bottom = -SR;
        key.shadow.camera.near = 500; key.shadow.camera.far = 4500;
        key.shadow.mapSize.set(8192, 8192);
        key.shadow.bias = -0.0004;
        key.shadow.normalBias = 0.8;
        scene.add(key);

        // Half this model's materials are authored fully metallic — the hall
        // roofs, the glass, the fences. A metal has no diffuse response, so
        // without something to reflect it renders pure black no matter how many
        // lights you point at it, which is exactly what the first bake showed.
        // Two fixes, both needed: give the scene a sky to reflect, and treat a
        // metallic material that carries a colour map as the dielectric its
        // author's texture implies.
        scene.traverse(o => {
            if (!o.isMesh) return;
            // Everything casts and receives: the buildings, grandstands and
            // the gantry throw the long shadows this bake is about, and the
            // ground plane and the tarmac have to catch them.
            o.castShadow = true;
            o.receiveShadow = true;
            for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
                if (!m || m.metalness === undefined) continue;
                if (m.map && m.metalness > 0.5) { m.metalness = 0.2; m.roughness = Math.max(m.roughness, 0.5); }
                else if (m.metalness > 0.9) m.metalness = 0.75;
                m.envMapIntensity = 0.3;
                m.needsUpdate = true;
                // Cutout foliage/fence textures: without an alpha-tested depth
                // material a transparent card shadows as its full rectangle.
                if (m.transparent && m.map) {
                    o.customDepthMaterial = new THREE.MeshDepthMaterial({
                        depthPacking: THREE.RGBADepthPacking, map: m.map, alphaTest: 0.5,
                    });
                }
            }
        });

        const cam = new THREE.OrthographicCamera(-CAM.halfW, CAM.halfW, CAM.halfH, -CAM.halfH, 1, 6000);
        cam.position.set(CAM.x, 2500, CAM.z);
        cam.up.set(CAM.up[0], CAM.up[1], CAM.up[2]);
        cam.lookAt(CAM.x, 0, CAM.z);
        if (CAM.mirror === -1) cam.scale.x *= -1;      // fit says the model is flipped
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld(true);

        const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(1);
        renderer.setSize(W, H, false);
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // a sky for the remaining metals to reflect
        const sky = document.createElement('canvas');
        sky.width = 64; sky.height = 64;
        const sg = sky.getContext('2d').createLinearGradient(0, 0, 0, 64);
        sg.addColorStop(0.00, '#8fb6e8'); sg.addColorStop(0.48, '#dfeaf6');
        sg.addColorStop(0.52, '#9d9382'); sg.addColorStop(1.00, '#6b6152');
        sky.getContext('2d').fillStyle = sg;
        sky.getContext('2d').fillRect(0, 0, 64, 64);
        const skyTex = new THREE.CanvasTexture(sky);
        skyTex.mapping = THREE.EquirectangularReflectionMapping;
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromEquirectangular(skyTex).texture;

        const grab = () => {
            const c = document.createElement('canvas');
            c.width = W; c.height = H;
            c.getContext('2d').drawImage(renderer.domElement, 0, 0);
            return c;
        };

        // pass A — the whole circuit
        renderer.setClearColor(0x6f7a58, 1);
        renderer.render(scene, cam);
        const passA = grab();

        // pass B — road surface only, transparent elsewhere. The non-surface
        // meshes are not hidden but muted (no colour, no depth): an invisible
        // mesh casts no shadow, and this pass is drawn back ON TOP of the
        // composite, so hiding the buildings here would wipe their shadows
        // off every stretch of real tarmac they fall across.
        const muted = new Map();          // material → saved writes
        scene.traverse(o => {
            if (!o.isMesh) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            const isSurface = mats.some(m => m && SURFACE.some(s => (m.name || '').startsWith(s)));
            if (isSurface) return;
            for (const m of mats) {
                if (!m || muted.has(m)) continue;
                muted.set(m, { colorWrite: m.colorWrite, depthWrite: m.depthWrite });
                m.colorWrite = false; m.depthWrite = false;
            }
        });
        renderer.setClearColor(0x000000, 0);
        renderer.render(scene, cam);
        const passB = grab();
        muted.forEach((saved, m) => { m.colorWrite = saved.colorWrite; m.depthWrite = saved.depthWrite; });

        // composite: circuit → our road band → real markings back on top
        const out = document.createElement('canvas');
        out.width = W; out.height = H;
        const x = out.getContext('2d');
        x.drawImage(passA, 0, 0);

        x.save();
        x.scale(SS, SS);
        x.lineCap = 'round'; x.lineJoin = 'round';
        const path = () => {
            x.beginPath();
            x.moveTo(WP[0].x, WP[0].y);
            for (let i = 1; i < WP.length; i++) x.lineTo(WP[i].x, WP[i].y);
            x.closePath();
        };
        // soft shadow so the band sits into the scenery instead of on it
        x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = RW + 20; path(); x.stroke();
        // kerb: red/white dashes laid wider than the asphalt
        x.strokeStyle = '#cc2222'; x.lineWidth = RW + 12;
        x.setLineDash([16, 16]); path(); x.stroke();
        x.strokeStyle = '#f0f0f0'; x.lineDashOffset = 16; path(); x.stroke();
        x.setLineDash([]); x.lineDashOffset = 0;
        // asphalt, keyed to the model's own tarmac tone
        x.strokeStyle = '#3c3c42'; x.lineWidth = RW; path(); x.stroke();
        x.strokeStyle = '#45454c'; x.lineWidth = RW - 14; path(); x.stroke();
        x.restore();

        x.drawImage(passB, 0, 0);

        // downscale to one image pixel per world pixel
        const fin = document.createElement('canvas');
        fin.width = OUTW; fin.height = OUTH;
        const fx = fin.getContext('2d');
        fx.imageSmoothingEnabled = true; fx.imageSmoothingQuality = 'high';
        fx.drawImage(out, 0, 0, OUTW, OUTH);
        return fin.toDataURL(FORMAT === 'png' ? 'image/png' : 'image/jpeg', QUALITY);
    }, { W, H, CAM, WP, RW: T.rw, SS, SURFACE, OUTW: T.W, OUTH: T.H, FORMAT, QUALITY,
         SUN: { th, mirror: FIT.mirror } });
    console.log('ok');

    fs.writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
    await browser.close();
    srv.close();
    console.log(`wrote ${path.relative(ROOT, OUT)} — ${(fs.statSync(OUT).size / 1048576).toFixed(2)} MB`);
})().catch(e => { console.error(e); process.exit(1); });
