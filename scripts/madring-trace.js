// Traced off the circuit map supplied by the user (north up, 300 m scale bar).
// Coordinates are read off that image; transform() maps them into world space.
//
// Reading the map: the loop is portrait, roughly 408 × 690 in image pixels.
// Travel is CLOCKWISE (north up), which keeps the real circuit's mostly
// right-handed character. Start/finish sits on the southern edge alongside the
// IFEMA halls, running west.
const IMG = [
    // ── IFEMA south edge — main straight, heading WEST ──
    [636, 826, 'START'],
    [560, 842, '·'],
    [486, 856, 'T1'],
    [432, 861, '·'],
    [404, 880, 'T2'],
    [352, 884, '·'],
    [300, 866, '·'],
    [266, 848, 'T3'],       // Hortaleza — right onto the long west straight
    // ── west side — the long straight, heading NORTH ──
    [252, 800, '·'],
    [245, 726, '·'],
    [241, 652, 'T4'],
    [238, 578, '·'],
    [235, 504, '·'],
    [233, 462, 'T5'],       // top of the straight
    // ── the neck: outbound and return legs run parallel and very close ──
    [238, 418, 'T6'],
    [246, 372, '·'],
    [251, 318, 'T7'],
    [259, 264, 'T8'],
    // ── La Monumental — the teardrop loop at the north end ──
    [274, 222, 'T12'],      // entry
    [306, 199, '·'],        // apex
    [341, 216, '·'],
    [356, 258, '·'],
    [352, 302, '·'],
    [337, 344, 'T12x'],     // exit
    // ── return leg back down through the neck ──
    [318, 382, 'T13'],
    [302, 420, '·'],
    [292, 458, '·'],
    [290, 500, 'T14'],
    // ── stepping east toward the M-11 ──
    [296, 536, 'T15'],
    [330, 545, '·'],
    [386, 543, 'T16'],
    [444, 546, '·'],
    [487, 553, 'T17'],
    [514, 582, '·'],
    [556, 598, 'T18'],
    [604, 599, '·'],
    [622, 628, 'T19'],
    [630, 668, '·'],
    // ── the angular notch around the exhibition halls ──
    [637, 702, 'T20'],
    [600, 714, '·'],
    [578, 720, '·'],
    [575, 748, 'T21'],
    [600, 760, '·'],
    [638, 764, '·'],
    [641, 796, 'T22'],      // El Parque, onto the main straight
];

// ── image → world ──
const K = 1.9;                       // world px per image px
const MARGIN = 84;                   // room for kerbs, run-off and scenery
const xs = IMG.map(p => p[0]), ys = IMG.map(p => p[1]);
const x0 = Math.min(...xs), y0 = Math.min(...ys);
const W = Math.round((Math.max(...xs) - x0) * K + MARGIN * 2);
const H = Math.round((Math.max(...ys) - y0) * K + MARGIN * 2);

const CP = IMG.map(([ix, iy, n]) => ({
    x: Math.round((ix - x0) * K + MARGIN),
    y: Math.round((iy - y0) * K + MARGIN),
    n,
}));

module.exports = CP;
module.exports.WORLD = { W, H };
