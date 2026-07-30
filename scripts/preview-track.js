#!/usr/bin/env node
// Renders a labelled preview PNG of a control-point file. Dev tool.
//   node scripts/preview-track.js <cp-file> <roadWidth> <out.png>
const { chromium } = require('playwright');
const CP = require(process.argv[2]);
const RW = Number(process.argv[3] || 46);
const OUT = process.argv[4];
const WORLD = CP.WORLD || { W: 1024, H: 768 };
function spline(pts, spp) {
    const out = [], n = pts.length;
    for (let i = 0; i < n; i++) {
        const p0 = pts[(i-1+n)%n], p1 = pts[i], p2 = pts[(i+1)%n], p3 = pts[(i+2)%n];
        for (let s = 0; s < spp; s++) {
            const t = s/spp, tt = t*t, ttt = tt*t;
            out.push({
                x: 0.5*(2*p1.x + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*tt + (-p0.x+3*p1.x-3*p2.x+p3.x)*ttt),
                y: 0.5*(2*p1.y + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*tt + (-p0.y+3*p1.y-3*p2.y+p3.y)*ttt),
            });
        }
    }
    return out;
}
const wp = spline(CP, 20);
let L = 0;
for (let i = 0; i < wp.length; i++) L += Math.hypot(wp[(i+1)%wp.length].x-wp[i].x, wp[(i+1)%wp.length].y-wp[i].y);
console.log(`world ${WORLD.W}×${WORLD.H}  lap ${L.toFixed(0)} px  cp ${CP.length}`);
(async () => {
    const b = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });
    const p = await b.newPage();
    await p.setViewportSize({ width: WORLD.W, height: WORLD.H });
    await p.setContent(`<canvas id=c width=${WORLD.W} height=${WORLD.H}></canvas><style>body{margin:0}</style>`);
    await p.evaluate(([wp, CP, RW, WORLD]) => {
        const x = document.getElementById('c').getContext('2d');
        x.fillStyle = '#20301c'; x.fillRect(0,0,WORLD.W,WORLD.H);
        const path = () => { x.beginPath(); x.moveTo(wp[0].x,wp[0].y);
            for (let i=1;i<wp.length;i++) x.lineTo(wp[i].x,wp[i].y); x.closePath(); };
        x.lineCap='round'; x.lineJoin='round';
        x.strokeStyle='#8d8d8d'; x.lineWidth=RW+10; path(); x.stroke();
        x.strokeStyle='#565656'; x.lineWidth=RW; path(); x.stroke();
        x.strokeStyle='#7a7a7a'; x.lineWidth=1; x.setLineDash([9,15]); path(); x.stroke(); x.setLineDash([]);
        CP.forEach(cp => {
            const big = cp.n && cp.n !== '·';
            x.fillStyle = big ? '#ffcc22' : '#ffffff88';
            x.beginPath(); x.arc(cp.x, cp.y, big?5:2.5, 0, Math.PI*2); x.fill();
            if (big) { x.font='bold 15px monospace'; x.textAlign='center'; x.textBaseline='middle';
                x.strokeStyle='#000'; x.lineWidth=4; x.strokeText(cp.n, cp.x, cp.y-18);
                x.fillStyle='#fff'; x.fillText(cp.n, cp.x, cp.y-18); }
        });
        x.strokeStyle='#fff'; x.lineWidth=5;
        x.beginPath(); x.arc(CP[0].x, CP[0].y, 16, 0, Math.PI*2); x.stroke();
    }, [wp, CP, RW, WORLD]);
    await p.screenshot({ path: OUT });
    await b.close();
})();
