// ============================================================
// MICRO MACHINES — Web Recreation
// Built with Phaser 3 · Procedural tracks + Kenney vehicle sprites
// ============================================================

// ── CONSTANTS ───────────────────────────────────────────────
const GW = 1024;
const GH = 768;
const TOTAL_LAPS = 1; // TODO: restore to 4
const TS = 12;                       // truck half-size
const ROT_FRAMES = 24;              // rotation angles per truck
const ROAD_W = 50;                  // default road width
const CP_DIST = 40;                 // checkpoint trigger distance
const WP_DIST = 25;                 // AI waypoint advance distance
const PICKUP_R = 15;                // pickup collection radius
const TRUCK_W = 26;
const TRUCK_H = 38;

const C = {
    player: 0x7b5ea7, ai1: 0xf0c020, ai2: 0xe08a1e, ai3: 0xe88acc,
    road: 0x606060, roadEdge: 0x888888, dirt: 0x8B7355, grass: 0x4a8a3a,
    mud: 0x5a4830, hud: 0x111111, money: 0xFFD700, nitro: 0xff4400,
};

const NAMES = ['COPILOT', 'FRANK', 'HUBOT', 'MONA'];
const CHAR_COLORS = [0x7b5ea7, 0xf0c020, 0xe08a1e, 0xe88acc];
const TCOLORS = [C.player, C.ai1, C.ai2, C.ai3];
const PLAYER_IMGS = ['avatar_copilot', 'avatar_frank', 'avatar_hubot', 'avatar_mona'];
const CAR_SPRITES = ['car_copilot', 'car_frank', 'car_hubot', 'car_mona'];
const TKEYS = ['player', 'ai1', 'ai2', 'ai3'];
const PRIZES = [100000, 90000, 80000, 70000];

const TRACK_MUSIC = [
    'music/mfcc-racing-speed-action-music-115041.mp3',                                           // 0  SIDEWINDER
    'music/mfcc-speed-speed-racing-cycling-music-257904.mp3',                                    // 1  FANDANGO
    'music/mfcc-asian-background-music-1-min-25-sec-371823.mp3',                                 // 2  WIPEOUT
    'music/mfcc-speed-action-racing-music-120442.mp3',                                           // 3  BLASTER
    'music/mfcc-african-background-music-372732.mp3',                                            // 4  HUEVOS GRANDE
    'music/mfcc-sports-football-soccer-music-414731.mp3',                                        // 5  CLIFFHANGER
    'music/mfcc-speed-racing-action-music-115039.mp3',                                           // 6  BIG DUKES
    'music/mfcc-halloween-background-music-428574.mp3',                                          // 7  HURRICANE GULCH
    'music/mfcc-african-background-music-372732 (1).mp3',                                        // 8  SAFARI RUSH
    'music/mfcc-arabic-islamic-middle-east-music-372733.mp3',                                    // 9  DESERT MIRAGE
    'music/mfcc-brazil-music-festival-football-rio-brazilian-background-274292.mp3',             // 10 COPACABANA CRUNCH
    'music/mfcc-country-country-texas-cowboy-music-322875.mp3',                                  // 11 LONE STAR RALLY
    'music/mfcc-happy-christmas-music-winter-holidays-celebration-background-theme-269352.mp3',  // 12 JINGLE RALLY
    'music/mfcc-indian-bollywood-diwali-music-306679.mp3',                                       // 13 CURRY CORNER
    'music/mfcc-italian-italy-tarantella-music-321645.mp3',                                      // 14 BELLA STRADA
    'music/mfcc-jazz-music-casino-poker-roulette-las-vegas-background-intro-theme-287498.mp3',   // 15 LOOSE SLOPS
    'music/mfcc-medieval-irish-celtic-ireland-music-318197.mp3',                                 // 16 SHAMROCK SPRINT
    'music/mfcc-mexican-mexican-mexico-mariachi-music-290633.mp3',                               // 17 EL GRANDE LOOP
    'music/mfcc-reggae-reggaeton-jamaican-music-326054.mp3',                                     // 18 IRIE CIRCUIT
    'music/mfcc-spanish-spanish-spain-music-373166.mp3',                                         // 19 OLÉ DASH
    'music/mfcc-wildlife-jungle-forest-background-music-263783.mp3',                             // 20 JUNGLE JAMBOREE
    'music/mfcc-speed-action-racing-music-120442.mp3',                                           // 21 NEON DRIVE (synthwave reuse)
];

// Synthwave track is larger than screen — world dimensions
const SW_W = 2048;
const SW_H = 1536;

// Desk track — massive procedural map (~10× the area of synthwave)
// Internal canvas rendered at half resolution (cpxScale=2) to stay
// well within WebGL texture limits; world coords are still full size.
const TEN_W = SW_W * 3;  // 6144
const TEN_H = SW_H * 3;  // 4608
const TEN_SCALE = 2;

const TRUCK_SPRITES = {
    player: 'car_copilot',
    ai1: 'car_frank',
    ai2: 'car_hubot',
    ai3: 'car_mona',
};

const UPGRADES = [
    { key: 'tires',        name: 'TIRES',         cost: 40000,  max: 10 },
    { key: 'shocks',       name: 'SHOCKS',        cost: 60000,  max: 10 },
    { key: 'acceleration', name: 'ACCELERATION',   cost: 80000,  max: 10 },
    { key: 'topSpeed',     name: 'TOP SPEED',      cost: 100000, max: 10 },
    { key: 'nitros',       name: 'NITRO (×1)',     cost: 1000,   max: 99 },
];

// ── TRACK DATA ──────────────────────────────────────────────
const TRACKS = [
    {
        name: 'SIDEWINDER',
        cp: [
            {x:512,y:690},{x:740,y:700},{x:900,y:620},{x:930,y:460},
            {x:880,y:310},{x:730,y:220},{x:560,y:270},{x:420,y:210},
            {x:260,y:155},{x:130,y:255},{x:100,y:420},{x:140,y:570},
            {x:300,y:660},
        ],
        rw: ROAD_W,
        mud: [{x:800,y:460,r:30},{x:200,y:400,r:25}],
    },
    {
        name: 'FANDANGO',
        cp: [
            {x:350,y:700},{x:620,y:710},{x:850,y:640},{x:920,y:480},
            {x:860,y:320},{x:680,y:240},{x:500,y:320},{x:380,y:240},
            {x:200,y:175},{x:100,y:320},{x:110,y:500},{x:180,y:630},
        ],
        rw: ROAD_W,
        mud: [{x:500,y:320,r:28}],
    },
    {
        name: 'WIPEOUT',
        cp: [
            {x:512,y:700},{x:780,y:680},{x:920,y:540},{x:880,y:360},
            {x:760,y:250},{x:900,y:150},{x:650,y:110},{x:400,y:155},
            {x:200,y:245},{x:100,y:420},{x:150,y:580},{x:300,y:680},
        ],
        rw: ROAD_W - 4,
        mud: [{x:880,y:360,r:25},{x:300,y:680,r:25}],
    },
    {
        name: 'BLASTER',
        cp: [
            {x:512,y:700},{x:780,y:690},{x:920,y:580},{x:860,y:420},
            {x:720,y:340},{x:580,y:400},{x:500,y:320},{x:380,y:220},
            {x:200,y:175},{x:100,y:310},{x:120,y:480},{x:250,y:600},
            {x:370,y:650},
        ],
        rw: ROAD_W - 2,
        mud: [{x:580,y:400,r:20},{x:120,y:480,r:22}],
    },
    {
        name: 'HUEVOS GRANDE',
        cp: [
            {x:512,y:710},{x:750,y:680},{x:920,y:560},{x:920,y:380},
            {x:840,y:230},{x:660,y:155},{x:480,y:200},{x:350,y:150},
            {x:180,y:200},{x:100,y:350},{x:100,y:520},{x:200,y:650},
            {x:370,y:700},
        ],
        rw: ROAD_W,
        mud: [{x:480,y:200,r:30}],
    },
    {
        name: 'CLIFFHANGER',
        cp: [
            {x:400,y:700},{x:650,y:710},{x:870,y:650},{x:940,y:500},
            {x:900,y:350},{x:760,y:255},{x:600,y:310},{x:500,y:220},
            {x:340,y:155},{x:180,y:235},{x:100,y:400},{x:80,y:560},
            {x:200,y:670},
        ],
        rw: ROAD_W - 4,
        mud: [{x:600,y:310,r:25},{x:200,y:670,r:20}],
    },
    {
        name: 'BIG DUKES',
        cp: [
            {x:512,y:700},{x:720,y:710},{x:900,y:640},{x:940,y:460},
            {x:880,y:300},{x:720,y:200},{x:550,y:155},{x:380,y:200},
            {x:250,y:300},{x:120,y:200},{x:80,y:380},{x:100,y:540},
            {x:250,y:650},{x:380,y:690},
        ],
        rw: ROAD_W,
        mud: [{x:380,y:200,r:25},{x:880,y:300,r:22}],
    },
    {
        name: 'HURRICANE GULCH',
        cp: [
            {x:450,y:700},{x:700,y:700},{x:880,y:620},{x:930,y:460},
            {x:860,y:310},{x:700,y:240},{x:550,y:300},{x:440,y:240},
            {x:300,y:155},{x:160,y:245},{x:120,y:400},{x:160,y:540},
            {x:300,y:640},
        ],
        rw: ROAD_W - 2,
        mud: [{x:550,y:300,r:28},{x:160,y:540,r:24}],
    },
    {   // 8 ── SAFARI RUSH — Monaco-inspired: tight hairpins, narrow, many direction changes
        name: 'SAFARI RUSH', theme: 'african',
        cp: [
            {x:512,y:678},{x:748,y:660},{x:888,y:540},{x:908,y:375},{x:835,y:242},
            {x:665,y:172},{x:512,y:252},{x:368,y:172},{x:215,y:218},{x:135,y:358},
            {x:172,y:518},{x:318,y:605},{x:322,y:498},{x:435,y:618},
        ],
        rw: ROAD_W - 6,
        mud: [{x:875,y:378,r:22},{x:155,y:435,r:18}],
    },
    {   // 9 ── DESERT MIRAGE — Bahrain/Abu Dhabi inspired: long straights, sharp hairpins
        name: 'DESERT MIRAGE', theme: 'arabic',
        cp: [
            {x:512,y:685},{x:740,y:678},{x:890,y:598},{x:925,y:445},{x:875,y:295},
            {x:700,y:212},{x:512,y:190},{x:325,y:212},{x:168,y:298},{x:125,y:452},
            {x:188,y:578},{x:342,y:660},
        ],
        rw: ROAD_W,
        mud: [{x:878,y:380,r:25},{x:145,y:455,r:22}],
    },
    {   // 10 ── COPACABANA CRUNCH — Interlagos inspired: counter-clockwise with S-curves
        name: 'COPACABANA CRUNCH', theme: 'brazil',
        cp: [
            {x:512,y:692},{x:295,y:672},{x:162,y:552},{x:148,y:398},{x:238,y:265},
            {x:408,y:198},{x:578,y:235},{x:698,y:172},{x:875,y:248},{x:918,y:405},
            {x:838,y:548},{x:668,y:658},
        ],
        rw: ROAD_W,
        mud: [{x:185,y:455,r:22},{x:892,y:420,r:18}],
    },
    {   // 11 ── LONE STAR RALLY — COTA inspired: big sweeping T1, tight S-curves
        name: 'LONE STAR RALLY', theme: 'country',
        cp: [
            {x:512,y:678},{x:758,y:655},{x:905,y:518},{x:882,y:358},{x:762,y:238},
            {x:592,y:188},{x:448,y:232},{x:342,y:172},{x:228,y:232},{x:155,y:372},
            {x:198,y:505},{x:345,y:582},{x:438,y:502},{x:352,y:645},
        ],
        rw: ROAD_W,
        mud: [{x:462,y:232,r:18},{x:215,y:455,r:22}],
    },
    {   // 12 ── JINGLE RALLY — Nürburgring inspired: very winding, many direction changes
        name: 'JINGLE RALLY', theme: 'christmas',
        cp: [
            {x:512,y:675},{x:718,y:645},{x:860,y:502},{x:798,y:348},{x:882,y:228},
            {x:762,y:148},{x:608,y:172},{x:478,y:252},{x:348,y:165},{x:205,y:188},
            {x:138,y:328},{x:222,y:458},{x:142,y:572},{x:275,y:648},{x:415,y:668},
        ],
        rw: ROAD_W,
        mud: [{x:492,y:252,r:18},{x:212,y:458,r:20}],
    },
    {   // 13 ── CURRY CORNER — Indian city circuit with tunnel through building
        name: 'CURRY CORNER', theme: 'indian',
        cp: [
            {x:512,y:680},{x:738,y:658},{x:878,y:528},{x:848,y:368},{x:722,y:258},
            {x:598,y:205},{x:448,y:195},{x:302,y:232},{x:195,y:348},{x:175,y:498},
            {x:275,y:612},{x:428,y:658},
        ],
        tunnels: [{frac: 0.40, len: 22}],
        rw: ROAD_W,
        mud: [{x:598,y:358,r:22},{x:218,y:475,r:18}],
    },
    {   // 14 ── BELLA STRADA — Monza inspired: fast main straight + tight Ascari chicane
        name: 'BELLA STRADA', theme: 'italian',
        cp: [
            {x:512,y:678},{x:775,y:665},{x:912,y:548},{x:882,y:385},{x:735,y:258},
            {x:512,y:228},{x:298,y:258},{x:192,y:348},{x:268,y:442},{x:182,y:542},
            {x:272,y:642},{x:412,y:678},
        ],
        rw: ROAD_W,
        mud: [{x:885,y:428,r:22},{x:212,y:448,r:18}],
    },
    {   // 15 ── LOOSE SLOPS — Las Vegas inspired: blocky 90° street corners, inner chicane
        name: 'LOOSE SLOPS', theme: 'casino',
        cp: [
            {x:512,y:678},{x:765,y:678},{x:918,y:562},{x:918,y:375},{x:808,y:248},
            {x:625,y:232},{x:512,y:328},{x:408,y:232},{x:238,y:248},{x:128,y:375},
            {x:128,y:565},{x:262,y:678},
        ],
        rw: ROAD_W,
        mud: [{x:700,y:388,r:28},{x:198,y:418,r:22}],
        casinoDice: [],
    },
    {   // 16 ── SHAMROCK SPRINT — Irish rolling hills with tunnel through hilltop
        name: 'SHAMROCK SPRINT', theme: 'irish',
        cp: [
            {x:512,y:680},{x:732,y:652},{x:872,y:518},{x:898,y:358},{x:802,y:228},
            {x:642,y:158},{x:492,y:148},{x:345,y:188},{x:208,y:298},{x:152,y:448},
            {x:208,y:578},{x:358,y:655},
        ],
        tunnels: [{frac: 0.38, len: 22}],
        rw: ROAD_W,
        mud: [{x:542,y:388,r:25},{x:192,y:508,r:22}],
    },
    {   // 17 ── EL GRANDE LOOP — Mexico City inspired: outer loop + inner stadium section with tunnel
        name: 'EL GRANDE LOOP', theme: 'mexican',
        cp: [
            {x:512,y:690},{x:748,y:668},{x:892,y:538},{x:898,y:372},{x:758,y:252},
            {x:518,y:215},{x:295,y:255},{x:178,y:378},{x:205,y:535},{x:378,y:625},
            {x:518,y:565},{x:658,y:625},{x:755,y:545},
        ],
        tunnels: [{frac: 0.69, len: 18}],
        rw: ROAD_W,
        mud: [{x:752,y:455,r:28},{x:250,y:455,r:24}],
    },
    {   // 18 ── IRIE CIRCUIT — Reggae / Jamaica: winding circuit with two water-jump ramps
        name: 'IRIE CIRCUIT', theme: 'reggae',
        cp: [
            {x:512,y:685},{x:735,y:655},{x:882,y:518},{x:858,y:345},{x:718,y:222},
            {x:512,y:185},{x:308,y:238},{x:182,y:365},{x:162,y:532},{x:295,y:648},
            {x:458,y:648},
        ],
        ramps: [
            {x:618, y:202, a: Math.PI, cd: 0},  // ramp 1: top section, car heading left
            {x:318, y:648, a: 0,        cd: 0},  // ramp 2: bottom, car heading right
        ],
        water: [
            {x:512, y:188, rw:130, rh:30},  // water channel 1 (horizontal bridge at top)
            {x:408, y:648, rw:110, rh:28},  // water channel 2 (horizontal bridge at bottom)
        ],
        rw: ROAD_W,
        mud: [{x:718,y:348,r:22},{x:182,y:455,r:18}],
    },
    {   // 19 ── OLÉ DASH — Spain: arena-edge circuit with two water-jump ramps
        name: 'OL\u00c9 DASH', theme: 'spanish',
        cp: [
            {x:512,y:682},{x:762,y:658},{x:898,y:528},{x:908,y:365},{x:832,y:248},
            {x:658,y:188},{x:512,y:185},{x:368,y:192},{x:215,y:298},{x:158,y:448},
            {x:218,y:582},{x:382,y:662},{x:452,y:575},
        ],
        ramps: [
            {x:602, y:186, a: Math.PI, cd: 0},  // ramp 1: top straight, car heading left
            {x:398, y:646, a: -0.9,     cd: 0},  // ramp 2: bottom-left hairpin, car heading up-right
        ],
        water: [
            {x:490, y:185, rw:120, rh:28},   // water 1 (top straight bridge)
            {x:438, y:608, rw:110, rh:28},   // water 2 (after bottom-left ramp)
        ],
        rw: ROAD_W,
        mud: [{x:418,y:368,r:22},{x:168,y:515,r:18}],
    },
    {   // 20 ── JUNGLE JAMBOREE — Sepang/Singapore inspired: very winding + jungle tunnel
        name: 'JUNGLE JAMBOREE', theme: 'jungle',
        cp: [
            {x:512,y:680},{x:718,y:655},{x:862,y:512},{x:848,y:342},{x:728,y:218},
            {x:562,y:182},{x:412,y:218},{x:292,y:178},{x:175,y:285},{x:215,y:432},
            {x:162,y:558},{x:262,y:655},{x:415,y:652},{x:508,y:548},{x:418,y:658},
        ],
        tunnels: [{frac: 0.35, len: 24}],
        rw: ROAD_W,
        mud: [{x:448,y:355,r:28},{x:698,y:548,r:25}],
    },
    {
        // ── SYNTHWAVE — giant multi-screen track ──
        name: 'NEON DRIVE',
        synth: true,
        W: SW_W, H: SW_H,
        rw: ROAD_W + 4,
        cp: [
            {x:1024,y:1420}, {x:1350,y:1440}, {x:1700,y:1380}, {x:1920,y:1220},
            {x:1960,y:1000}, {x:1820,y:820},  {x:1560,y:780},  {x:1320,y:900},
            {x:1080,y:820},  {x:900,y:620},   {x:1100,y:460},  {x:1380,y:380},
            {x:1680,y:300},  {x:1900,y:180},  {x:1700,y:90},   {x:1350,y:120},
            {x:1020,y:200},  {x:720,y:160},   {x:420,y:110},   {x:180,y:230},
            {x:100,y:440},   {x:220,y:640},   {x:440,y:720},   {x:620,y:900},
            {x:480,y:1080},  {x:260,y:1180},  {x:130,y:1340},  {x:300,y:1460},
            {x:560,y:1480},  {x:780,y:1440},
        ],
        mud: [{x:1500,y:900,r:30},{x:400,y:500,r:28},{x:1700,y:1100,r:26}],
    },
    {
        // ── DESK CHAOS — procedurally generated, three laps, ~10× NEON DRIVE ──
        name: 'DESK CHAOS',
        desk: true,
        procedural: true,
        laps: 3,
        W: TEN_W, H: TEN_H,
        rw: ROAD_W + 4,
        cpxScale: TEN_SCALE,
        cp: [],      // filled in at genTracks() time, per-session
        mud: [],
        boosts: [], ramps: [], tunnels: [], decor: null,
    },
];

// ── GAME STATE ──────────────────────────────────────────────
let gs = resetGameState();
// Game options — persist across races (not reset with gs)
let opts = { drift: false, guardrails: false, gravity: false, laps: 1 };

function resetGameState() {
    return {
        money: 200000, tires: 0, shocks: 0, acceleration: 0,
        topSpeed: 0, nitros: 3, raceNum: 0, playerIdx: 0,
        highestUnlocked: 0,
    };
}

// Returns character indices reordered so gs.playerIdx is first
function getCharOrder() {
    const order = [gs.playerIdx];
    for (let i = 0; i < 4; i++) if (i !== gs.playerIdx) order.push(i);
    return order;
}

// ── UTILITY: Catmull-Rom closed-loop spline ─────────────────
function spline(pts, spp) {
    spp = spp || 20;
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

function drawPath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
}

function hexCSS(c) { return '#' + c.toString(16).padStart(6, '0'); }

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// ── DESK TRACK (procedural, per-session) ────────────────────
// Generates a huge closed-loop road winding across a virtual computer desk.
// Called once per page load from PreloadScene.genTracks().
function generateDeskCp(t) {
    const pseed0 = ((Date.now() & 0x7fffffff) ^ (Math.random() * 1e9 | 0)) | 1;
    let s = pseed0;
    const prand = () => { s = (s * 48271) % 0x7fffffff; return s / 0x7fffffff; };
    t._prand = prand;

    const W = t.W, H = t.H, cx = W / 2, cy = H / 2;
    // Perlin-lite: lay down N sample points around an ellipse, each with
    // independent radial jitter to give the loop twisty character.
    const N = 46;
    const cp = [];
    // radius envelope: stay clear of edges so decor has room
    const baseRx = W * 0.38, baseRy = H * 0.38;
    // two low-freq harmonics sampled per generation for flavour
    const h1 = 0.14 + prand() * 0.12, h2 = 0.22 + prand() * 0.12;
    const ph1 = prand() * Math.PI * 2, ph2 = prand() * Math.PI * 2;
    for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const wobble = 1
            + h1 * Math.sin(a * 3 + ph1)
            + h2 * Math.sin(a * 5 + ph2)
            + (prand() - 0.5) * 0.18;
        const rx = baseRx * Math.max(0.55, Math.min(1.2, wobble));
        const ry = baseRy * Math.max(0.55, Math.min(1.2, wobble * (0.9 + prand() * 0.2)));
        cp.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
    t.cp = cp;

    // Coffee-spill mud pools sprinkled along the loop
    t.mud = [];
    for (let i = 0; i < 6; i++) {
        const base = cp[(prand() * N) | 0];
        t.mud.push({
            x: base.x + (prand() - 0.5) * 300,
            y: base.y + (prand() - 0.5) * 300,
            r: 60 + prand() * 80,
        });
    }
}

function generateDeskExtras(t, wp) {
    const prand = t._prand || Math.random;
    const N = wp.length;
    // Boost chevrons every ~14 spline points (skip the very start so players
    // don't get launched at GO)
    t.boosts = [];
    for (let i = 20; i < N - 6; i += 14) {
        const p = wp[i], q = wp[(i + 2) % N];
        t.boosts.push({
            x: p.x, y: p.y,
            a: Math.atan2(q.y - p.y, q.x - p.x),
            cd: 0,
        });
    }
    // Ramps — sparser, also aligned to track direction
    t.ramps = [];
    for (let r = 0; r < 7; r++) {
        const wi = 40 + ((prand() * (N - 60)) | 0);
        const p = wp[wi], q = wp[(wi + 2) % N];
        t.ramps.push({
            x: p.x, y: p.y,
            a: Math.atan2(q.y - p.y, q.x - p.x),
            cd: 0,
        });
    }
    // Tunnels — a few contiguous spans
    t.tunnels = [];
    const tunCount = 3;
    for (let k = 0; k < tunCount; k++) {
        const startI = 60 + ((k * N / tunCount) | 0) + ((prand() * 40) | 0);
        const len = 18 + ((prand() * 14) | 0);
        t.tunnels.push({ startI: startI % N, len });
    }
    // Decor placements (world coords). These are cosmetic; the procedural
    // loop already wanders around the desk so overlap with props just makes
    // the road "drive over" them.
    const W = t.W, H = t.H;
    t.decor = {
        laptop:   { x: W * 0.28, y: H * 0.25, w: 1700, h: 1100 },
        coffee:   { x: W * 0.78, y: H * 0.22, r: 220 },
        mouse:    { x: W * 0.82, y: H * 0.62, w: 260, h: 420 },
        keyboard: { x: W * 0.52, y: H * 0.72, w: 2000, h: 680 },
        pencil:   { x: W * 0.18, y: H * 0.78, len: 1600, ang: -0.35 },
        phone:    { x: W * 0.65, y: H * 0.42, w: 320, h: 680 },
    };
}

// Draws the desk theme into the (already-scaled) canvas context. World coords.
function drawDeskTrack(vx, t, wp, srand) {
    const W = t.W, H = t.H;
    // ── wood desk surface ──
    // base wood colour gradient
    const bg = vx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#7a4a24');
    bg.addColorStop(0.5, '#8a5a30');
    bg.addColorStop(1, '#6a3e1e');
    vx.fillStyle = bg; vx.fillRect(0, 0, W, H);
    // wood grain streaks
    vx.strokeStyle = 'rgba(40,20,10,0.25)';
    for (let i = 0; i < 260; i++) {
        const gy = srand() * H;
        const gx0 = srand() * W * 0.2;
        const gx1 = gx0 + W * (0.5 + srand() * 0.6);
        vx.lineWidth = 0.6 + srand() * 1.4;
        vx.beginPath();
        vx.moveTo(gx0, gy);
        vx.bezierCurveTo(gx0 + 200, gy + (srand() - 0.5) * 40, gx1 - 200, gy + (srand() - 0.5) * 40, gx1, gy);
        vx.stroke();
    }
    // occasional knots
    for (let i = 0; i < 22; i++) {
        const kx = srand() * W, ky = srand() * H, kr = 8 + srand() * 22;
        const kg = vx.createRadialGradient(kx, ky, 1, kx, ky, kr);
        kg.addColorStop(0, 'rgba(30,14,6,0.85)');
        kg.addColorStop(1, 'rgba(30,14,6,0)');
        vx.fillStyle = kg; vx.beginPath(); vx.arc(kx, ky, kr, 0, Math.PI * 2); vx.fill();
    }

    const d = t.decor;

    // ── LAPTOP ──
    // outer shadow
    vx.fillStyle = 'rgba(0,0,0,0.35)';
    vx.fillRect(d.laptop.x - d.laptop.w / 2 + 18, d.laptop.y - d.laptop.h / 2 + 22, d.laptop.w, d.laptop.h);
    // silver body
    vx.fillStyle = '#d0d0d5';
    vx.fillRect(d.laptop.x - d.laptop.w / 2, d.laptop.y - d.laptop.h / 2, d.laptop.w, d.laptop.h);
    // darker inner screen area (closed lid look)
    vx.fillStyle = '#2a2a30';
    vx.fillRect(d.laptop.x - d.laptop.w / 2 + 40, d.laptop.y - d.laptop.h / 2 + 40, d.laptop.w - 80, d.laptop.h - 80);
    // subtle silver bezel highlight
    vx.strokeStyle = 'rgba(255,255,255,0.25)'; vx.lineWidth = 4;
    vx.strokeRect(d.laptop.x - d.laptop.w / 2 + 4, d.laptop.y - d.laptop.h / 2 + 4, d.laptop.w - 8, d.laptop.h - 8);
    // hinge strip on far edge
    vx.fillStyle = '#8a8a90';
    vx.fillRect(d.laptop.x - d.laptop.w / 2, d.laptop.y + d.laptop.h / 2 - 24, d.laptop.w, 8);

    // GitHub Octocat sticker on laptop lid
    (function drawOctocat() {
        const ox = d.laptop.x + d.laptop.w * 0.22, oy = d.laptop.y - d.laptop.h * 0.15;
        const R = 180;
        // sticker backing (round white)
        vx.fillStyle = '#fff';
        vx.beginPath(); vx.arc(ox, oy, R + 14, 0, Math.PI * 2); vx.fill();
        vx.strokeStyle = 'rgba(0,0,0,0.2)'; vx.lineWidth = 3;
        vx.beginPath(); vx.arc(ox, oy, R + 14, 0, Math.PI * 2); vx.stroke();
        // octocat silhouette
        vx.fillStyle = '#24292e';
        // head
        vx.beginPath(); vx.arc(ox, oy - 10, R * 0.65, 0, Math.PI * 2); vx.fill();
        // ears
        vx.beginPath();
        vx.moveTo(ox - R * 0.55, oy - R * 0.45);
        vx.lineTo(ox - R * 0.25, oy - R * 0.85);
        vx.lineTo(ox - R * 0.15, oy - R * 0.5);
        vx.closePath(); vx.fill();
        vx.beginPath();
        vx.moveTo(ox + R * 0.55, oy - R * 0.45);
        vx.lineTo(ox + R * 0.25, oy - R * 0.85);
        vx.lineTo(ox + R * 0.15, oy - R * 0.5);
        vx.closePath(); vx.fill();
        // tentacles (three drooping below)
        for (let i = -1; i <= 1; i++) {
            vx.beginPath();
            vx.moveTo(ox + i * R * 0.3, oy + R * 0.2);
            vx.quadraticCurveTo(ox + i * R * 0.5, oy + R * 0.9, ox + i * R * 0.2, oy + R * 1.1);
            vx.quadraticCurveTo(ox + i * R * 0.4, oy + R * 0.9, ox + i * R * 0.5, oy + R * 0.3);
            vx.closePath(); vx.fill();
        }
        // eyes
        vx.fillStyle = '#fff';
        vx.beginPath(); vx.arc(ox - R * 0.22, oy - 20, 16, 0, Math.PI * 2); vx.fill();
        vx.beginPath(); vx.arc(ox + R * 0.22, oy - 20, 16, 0, Math.PI * 2); vx.fill();
        vx.fillStyle = '#24292e';
        vx.beginPath(); vx.arc(ox - R * 0.22 + 4, oy - 18, 6, 0, Math.PI * 2); vx.fill();
        vx.beginPath(); vx.arc(ox + R * 0.22 + 4, oy - 18, 6, 0, Math.PI * 2); vx.fill();
        // sticker caption
        vx.fillStyle = '#24292e';
        vx.font = 'bold 30px monospace'; vx.textAlign = 'center'; vx.textBaseline = 'middle';
        vx.fillText('GitHub', ox, oy + R + 40);
    })();

    // ── KEYBOARD ──
    const kb = d.keyboard;
    vx.fillStyle = 'rgba(0,0,0,0.35)';
    vx.fillRect(kb.x - kb.w / 2 + 14, kb.y - kb.h / 2 + 14, kb.w, kb.h);
    vx.fillStyle = '#e8e8ec';
    vx.fillRect(kb.x - kb.w / 2, kb.y - kb.h / 2, kb.w, kb.h);
    vx.strokeStyle = 'rgba(0,0,0,0.2)'; vx.lineWidth = 3;
    vx.strokeRect(kb.x - kb.w / 2, kb.y - kb.h / 2, kb.w, kb.h);
    // keys grid
    const cols = 16, rows = 5;
    const kp = 8;
    const keyW = (kb.w - kp * (cols + 1)) / cols;
    const keyH = (kb.h - kp * (rows + 1)) / rows;
    vx.fillStyle = '#f8f8fb';
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const kx = kb.x - kb.w / 2 + kp + c * (keyW + kp);
            const ky = kb.y - kb.h / 2 + kp + r * (keyH + kp);
            vx.fillRect(kx, ky, keyW, keyH);
        }
    }
    // spacebar (last row middle)
    vx.fillStyle = '#f8f8fb';
    vx.fillRect(kb.x - kb.w * 0.25, kb.y + kb.h / 2 - kp - keyH, kb.w * 0.5, keyH);

    // ── COFFEE MUG (top-down) ──
    const cf = d.coffee;
    // saucer shadow
    vx.fillStyle = 'rgba(0,0,0,0.35)';
    vx.beginPath(); vx.arc(cf.x + 14, cf.y + 14, cf.r * 1.15, 0, Math.PI * 2); vx.fill();
    // mug outer (white ceramic)
    vx.fillStyle = '#f4f4f4';
    vx.beginPath(); vx.arc(cf.x, cf.y, cf.r, 0, Math.PI * 2); vx.fill();
    vx.strokeStyle = '#888'; vx.lineWidth = 4;
    vx.beginPath(); vx.arc(cf.x, cf.y, cf.r, 0, Math.PI * 2); vx.stroke();
    // handle
    vx.strokeStyle = '#f4f4f4'; vx.lineWidth = 36;
    vx.beginPath(); vx.arc(cf.x + cf.r, cf.y, cf.r * 0.55, -Math.PI * 0.4, Math.PI * 0.4); vx.stroke();
    vx.strokeStyle = '#888'; vx.lineWidth = 3;
    vx.beginPath(); vx.arc(cf.x + cf.r, cf.y, cf.r * 0.55 + 18, -Math.PI * 0.4, Math.PI * 0.4); vx.stroke();
    vx.beginPath(); vx.arc(cf.x + cf.r, cf.y, cf.r * 0.55 - 18, -Math.PI * 0.4, Math.PI * 0.4); vx.stroke();
    // coffee surface (inner)
    const cg = vx.createRadialGradient(cf.x, cf.y, 0, cf.x, cf.y, cf.r * 0.78);
    cg.addColorStop(0, '#6b3e1c'); cg.addColorStop(1, '#3a1e0c');
    vx.fillStyle = cg;
    vx.beginPath(); vx.arc(cf.x, cf.y, cf.r * 0.78, 0, Math.PI * 2); vx.fill();
    // foam / crema dots
    vx.fillStyle = 'rgba(210,170,120,0.6)';
    for (let i = 0; i < 18; i++) {
        const ra = srand() * Math.PI * 2, rd = srand() * cf.r * 0.7;
        vx.beginPath(); vx.arc(cf.x + Math.cos(ra) * rd, cf.y + Math.sin(ra) * rd, 2 + srand() * 4, 0, Math.PI * 2); vx.fill();
    }
    // label (a tiny "☕")
    vx.fillStyle = '#fff'; vx.font = 'bold 90px monospace'; vx.textAlign = 'center'; vx.textBaseline = 'middle';
    vx.fillText('☕', cf.x, cf.y + 6);

    // ── MOUSE ──
    const m = d.mouse;
    vx.fillStyle = 'rgba(0,0,0,0.3)';
    vx.beginPath(); vx.ellipse(m.x + 10, m.y + 14, m.w / 2, m.h / 2, 0, 0, Math.PI * 2); vx.fill();
    vx.fillStyle = '#e0e0e4';
    vx.beginPath(); vx.ellipse(m.x, m.y, m.w / 2, m.h / 2, 0, 0, Math.PI * 2); vx.fill();
    vx.strokeStyle = '#999'; vx.lineWidth = 3;
    vx.beginPath(); vx.ellipse(m.x, m.y, m.w / 2, m.h / 2, 0, 0, Math.PI * 2); vx.stroke();
    // split line
    vx.strokeStyle = '#aaa'; vx.lineWidth = 2;
    vx.beginPath(); vx.moveTo(m.x, m.y - m.h / 2 + 20); vx.lineTo(m.x, m.y); vx.stroke();
    // scroll wheel
    vx.fillStyle = '#666';
    vx.fillRect(m.x - 8, m.y - 40, 16, 28);
    // mouse cable
    vx.strokeStyle = '#ddd'; vx.lineWidth = 10;
    vx.beginPath();
    vx.moveTo(m.x, m.y - m.h / 2);
    vx.bezierCurveTo(m.x + 140, m.y - m.h / 2 - 180, m.x + 260, m.y - m.h / 2 - 260, m.x + 380, m.y - m.h / 2 - 200);
    vx.stroke();

    // ── PENCIL ──
    const pc = d.pencil;
    vx.save();
    vx.translate(pc.x, pc.y);
    vx.rotate(pc.ang);
    // shadow
    vx.fillStyle = 'rgba(0,0,0,0.3)';
    vx.fillRect(14, -50 + 18, pc.len, 100);
    // yellow body
    vx.fillStyle = '#f6c21a';
    vx.fillRect(0, -50, pc.len * 0.78, 100);
    // paint stripe
    vx.fillStyle = '#d79a08';
    vx.fillRect(0, -50, pc.len * 0.78, 18);
    vx.fillRect(0, 32, pc.len * 0.78, 18);
    // ferrule (metal band)
    vx.fillStyle = '#c0c0c8';
    vx.fillRect(pc.len * 0.78, -50, pc.len * 0.06, 100);
    // grooves on ferrule
    vx.strokeStyle = '#8a8a92'; vx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
        vx.beginPath();
        vx.moveTo(pc.len * 0.78 + i * (pc.len * 0.06 / 5), -50);
        vx.lineTo(pc.len * 0.78 + i * (pc.len * 0.06 / 5), 50);
        vx.stroke();
    }
    // eraser
    vx.fillStyle = '#ea6ba0';
    vx.fillRect(pc.len * 0.84, -50, pc.len * 0.16, 100);
    // sharpened tip (cone)
    vx.fillStyle = '#e8c28a';
    vx.beginPath();
    vx.moveTo(0, -50); vx.lineTo(-pc.len * 0.06, 0); vx.lineTo(0, 50); vx.closePath(); vx.fill();
    // graphite core
    vx.fillStyle = '#2a2a2a';
    vx.beginPath();
    vx.moveTo(0, -14); vx.lineTo(-pc.len * 0.055, 0); vx.lineTo(0, 14); vx.closePath(); vx.fill();
    vx.restore();

    // ── IPHONE ──
    const ph = d.phone;
    vx.fillStyle = 'rgba(0,0,0,0.35)';
    vx.fillRect(ph.x - ph.w / 2 + 12, ph.y - ph.h / 2 + 14, ph.w, ph.h);
    // body
    vx.fillStyle = '#1a1a1e';
    const rr = 42;
    roundRect(vx, ph.x - ph.w / 2, ph.y - ph.h / 2, ph.w, ph.h, rr); vx.fill();
    // screen
    vx.fillStyle = '#0a1230';
    roundRect(vx, ph.x - ph.w / 2 + 14, ph.y - ph.h / 2 + 60, ph.w - 28, ph.h - 120, rr - 14); vx.fill();
    // notch
    vx.fillStyle = '#000';
    vx.fillRect(ph.x - 60, ph.y - ph.h / 2 + 28, 120, 26);
    // home indicator
    vx.fillStyle = '#fff';
    vx.fillRect(ph.x - 50, ph.y + ph.h / 2 - 18, 100, 5);
    // app icons grid (tiny)
    vx.fillStyle = '#3a8ef6';
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 4; c++) {
            const ax = ph.x - ph.w / 2 + 34 + c * 66;
            const ay = ph.y - ph.h / 2 + 110 + r * 100;
            vx.fillStyle = `hsl(${(r * 4 + c) * 25}, 70%, 55%)`;
            roundRect(vx, ax, ay, 48, 48, 12); vx.fill();
        }
    }

    // ── ROAD: cable-trace style ──
    // outer shadow
    vx.strokeStyle = 'rgba(0,0,0,0.45)'; vx.lineWidth = t.rw + 18;
    vx.lineCap = 'round'; vx.lineJoin = 'round';
    vx.save(); vx.translate(10, 12); drawPath(vx, wp); vx.stroke(); vx.restore();
    // grey shoulder
    vx.strokeStyle = '#3a3a40'; vx.lineWidth = t.rw + 10;
    drawPath(vx, wp); vx.stroke();
    // road surface
    vx.strokeStyle = '#5a5a60'; vx.lineWidth = t.rw;
    drawPath(vx, wp); vx.stroke();
    // inner slightly lighter
    vx.strokeStyle = '#6a6a72'; vx.lineWidth = t.rw - 14;
    drawPath(vx, wp); vx.stroke();
    // yellow centre dashes
    vx.strokeStyle = '#ffcc33'; vx.lineWidth = 3; vx.setLineDash([18, 26]);
    drawPath(vx, wp); vx.stroke(); vx.setLineDash([]);

    // Coffee-spill mud
    t.mud.forEach(mu => {
        const g = vx.createRadialGradient(mu.x, mu.y, 0, mu.x, mu.y, mu.r);
        g.addColorStop(0, 'rgba(58,26,10,0.95)');
        g.addColorStop(0.7, 'rgba(80,40,18,0.6)');
        g.addColorStop(1, 'rgba(80,40,18,0)');
        vx.fillStyle = g; vx.beginPath(); vx.arc(mu.x, mu.y, mu.r, 0, Math.PI * 2); vx.fill();
        // drips
        vx.fillStyle = 'rgba(40,18,8,0.7)';
        for (let i = 0; i < 6; i++) {
            const a2 = srand() * Math.PI * 2;
            vx.beginPath();
            vx.arc(mu.x + Math.cos(a2) * mu.r * 1.1, mu.y + Math.sin(a2) * mu.r * 1.1, 4 + srand() * 10, 0, Math.PI * 2);
            vx.fill();
        }
    });

    // Boost chevrons (">>") painted on the road
    t.boosts.forEach(b => {
        vx.save();
        vx.translate(b.x, b.y); vx.rotate(b.a);
        vx.fillStyle = '#ffee33';
        for (let k = 0; k < 3; k++) {
            const off = (k - 1) * 24;
            vx.beginPath();
            vx.moveTo(off - 16, -18);
            vx.lineTo(off + 10, 0);
            vx.lineTo(off - 16, 18);
            vx.lineTo(off - 8, 0);
            vx.closePath(); vx.fill();
        }
        // glow outline
        vx.strokeStyle = 'rgba(255,180,0,0.6)'; vx.lineWidth = 3;
        for (let k = 0; k < 3; k++) {
            const off = (k - 1) * 24;
            vx.beginPath();
            vx.moveTo(off - 16, -18);
            vx.lineTo(off + 10, 0);
            vx.lineTo(off - 16, 18);
            vx.lineTo(off - 8, 0);
            vx.closePath(); vx.stroke();
        }
        vx.restore();
    });

    // Ramps — yellow/black warning stripes across the road
    t.ramps.forEach(r => {
        vx.save();
        vx.translate(r.x, r.y); vx.rotate(r.a);
        for (let k = -3; k <= 3; k++) {
            vx.fillStyle = k % 2 === 0 ? '#222' : '#ffdd22';
            vx.fillRect(k * 9 - 4, -t.rw / 2 + 4, 9, t.rw - 8);
        }
        // front edge highlight (suggests a raised lip)
        vx.fillStyle = 'rgba(255,255,255,0.45)';
        vx.fillRect(25, -t.rw / 2 + 4, 4, t.rw - 8);
        vx.fillStyle = 'rgba(0,0,0,0.6)';
        vx.fillRect(-30, -t.rw / 2 + 4, 4, t.rw - 8);
        vx.restore();
    });

    // Tunnels — shaded overlay suggesting the road dips beneath something
    t.tunnels.forEach(tu => {
        const p0 = wp[tu.startI], p1 = wp[(tu.startI + tu.len) % wp.length];
        const a = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        const halfW = t.rw / 2 + 6;
        // darkened section along the road
        vx.save();
        vx.strokeStyle = 'rgba(10,10,14,0.75)'; vx.lineWidth = t.rw + 4;
        vx.lineCap = 'butt';
        vx.beginPath();
        for (let i = 0; i <= tu.len; i++) {
            const pp = wp[(tu.startI + i) % wp.length];
            if (i === 0) vx.moveTo(pp.x, pp.y); else vx.lineTo(pp.x, pp.y);
        }
        vx.stroke();
        vx.restore();
        // entrance & exit arches
        [p0, p1].forEach((pt, ei) => {
            const ang = ei === 0 ? a : a + Math.PI;
            vx.save();
            vx.translate(pt.x, pt.y); vx.rotate(ang);
            // arch frame
            vx.fillStyle = '#b0b0b6';
            vx.fillRect(-10, -halfW - 18, 20, halfW * 2 + 36);
            vx.fillStyle = '#555';
            vx.fillRect(-6, -halfW, 12, halfW * 2);
            // top lamp
            vx.fillStyle = '#ffee88';
            vx.beginPath(); vx.arc(0, -halfW - 6, 5, 0, Math.PI * 2); vx.fill();
            vx.restore();
        });
    });
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ── PROCEDURAL SFX (Web Audio API) ─────────────────────────
const SFX = (() => {
    let ctx = null;
    const ac = () => { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); return ctx; };

    // play a simple tone burst
    function tone(freq, type, vol, attack, sustain, release, delay = 0) {
        const c = ac();
        const g = c.createGain();
        g.connect(c.destination);
        const o = c.createOscillator();
        o.type = type; o.frequency.value = freq;
        o.connect(g);
        const t0 = c.currentTime + delay;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(vol, t0 + attack);
        g.gain.setValueAtTime(vol, t0 + attack + sustain);
        g.gain.linearRampToValueAtTime(0, t0 + attack + sustain + release);
        o.start(t0);
        o.stop(t0 + attack + sustain + release + 0.01);
    }

    // countdown beep (low for 3/2/1, high+chord for GO)
    function countdownBeep(isGo) {
        if (isGo) {
            // major chord fanfare
            [[523, 0], [659, 0.04], [784, 0.08]].forEach(([f, d]) =>
                tone(f, 'square', 0.18, 0.01, 0.18, 0.15, d)
            );
        } else {
            tone(330, 'square', 0.22, 0.005, 0.08, 0.06);
        }
    }

    // short nitro burst: noise-ish sweep up
    function nitro() {
        const c = ac();
        const g = c.createGain();
        g.connect(c.destination);
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(80, c.currentTime);
        o.frequency.exponentialRampToValueAtTime(400, c.currentTime + 0.25);
        o.connect(g);
        g.gain.setValueAtTime(0.3, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
        o.start(); o.stop(c.currentTime + 0.36);
        // layered hiss
        const buf = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const src = c.createBufferSource();
        src.buffer = buf;
        const hg = c.createGain(); hg.gain.setValueAtTime(0.12, c.currentTime);
        hg.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.3);
        src.connect(hg); hg.connect(c.destination);
        src.start();
    }

    // pickup jingles
    function pickupMoney() {
        // ascending coin chime: C5 → E5 → G5
        [[523, 0], [659, 0.07], [784, 0.14]].forEach(([f, d]) =>
            tone(f, 'sine', 0.22, 0.005, 0.06, 0.08, d)
        );
    }
    function pickupNitro() {
        // power-up rising blip: A4 → A5
        tone(440, 'square', 0.15, 0.005, 0.04, 0.05, 0);
        tone(880, 'square', 0.18, 0.005, 0.08, 0.10, 0.08);
    }

    // engine: continuous oscillator managed externally
    let engineOsc = null, engineGain = null;
    function engineStart() {
        if (engineOsc) return;
        const c = ac();
        engineGain = c.createGain(); engineGain.gain.value = 0.06;
        engineGain.connect(c.destination);
        engineOsc = c.createOscillator();
        engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 38;
        engineOsc.connect(engineGain);
        engineOsc.start();
    }
    function engineUpdate(speed, maxSpeed, accelerating) {
        if (!engineOsc) return;
        const c = ac();
        const ratio = Math.min(1, speed / (maxSpeed * 0.9 + 0.01));
        const targetFreq = 38 + ratio * 95 + (accelerating ? 18 : 0);
        const targetVol  = 0.08 + ratio * 0.09 + (accelerating ? 0.04 : 0);
        engineOsc.frequency.setTargetAtTime(targetFreq, c.currentTime, 0.08);
        engineGain.gain.setTargetAtTime(targetVol,  c.currentTime, 0.08);
    }
    function engineStop() {
        if (!engineOsc) return;
        engineGain.gain.setTargetAtTime(0, ac().currentTime, 0.1);
        setTimeout(() => { try { engineOsc.stop(); } catch(e){} engineOsc = null; engineGain = null; }, 300);
    }

    // ramp launch sound: quick rising whoosh + thud on landing
    function rampJump() {
        const c = ac();
        // whoosh sweep up
        const o = c.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(120, c.currentTime);
        o.frequency.exponentialRampToValueAtTime(600, c.currentTime + 0.18);
        const g = c.createGain();
        g.gain.setValueAtTime(0.25, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
        o.connect(g); g.connect(c.destination);
        o.start(); o.stop(c.currentTime + 0.26);
        // noise burst for texture
        const buf = c.createBuffer(1, c.sampleRate * 0.15, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
        const src = c.createBufferSource(); src.buffer = buf;
        const ng = c.createGain(); ng.gain.setValueAtTime(0.1, c.currentTime);
        ng.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
        src.connect(ng); ng.connect(c.destination); src.start();
    }

    // ball kick: short punchy thud
    function ballKick() {
        const c = ac();
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(220, c.currentTime);
        o.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.12);
        const g = c.createGain();
        g.gain.setValueAtTime(0.3, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
        o.connect(g); g.connect(c.destination);
        o.start(); o.stop(c.currentTime + 0.16);
        // short noise pop
        const buf = c.createBuffer(1, c.sampleRate * 0.06, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
        const src = c.createBufferSource(); src.buffer = buf;
        const hg = c.createGain(); hg.gain.setValueAtTime(0.15, c.currentTime);
        hg.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06);
        src.connect(hg); hg.connect(c.destination); src.start();
    }

    // subbuteo wobble: hollow plastic clack
    function subbuteoHit() {
        const c = ac();
        // hollow plastic knock
        const o = c.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(800, c.currentTime);
        o.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.08);
        const g = c.createGain();
        g.gain.setValueAtTime(0.2, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
        o.connect(g); g.connect(c.destination);
        o.start(); o.stop(c.currentTime + 0.13);
        // secondary resonance
        const o2 = c.createOscillator();
        o2.type = 'triangle';
        o2.frequency.value = 350;
        const g2 = c.createGain();
        g2.gain.setValueAtTime(0.1, c.currentTime + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18);
        o2.connect(g2); g2.connect(c.destination);
        o2.start(c.currentTime + 0.02); o2.stop(c.currentTime + 0.19);
    }

    // ghost freeze: eerie descending wail
    function ghostFreeze() {
        const c = ac();
        // descending wail
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(900, c.currentTime);
        o.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.5);
        const g = c.createGain();
        g.gain.setValueAtTime(0.25, c.currentTime);
        g.gain.linearRampToValueAtTime(0.15, c.currentTime + 0.3);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6);
        o.connect(g); g.connect(c.destination);
        o.start(); o.stop(c.currentTime + 0.65);
        // breathy overlay
        const o2 = c.createOscillator();
        o2.type = 'triangle';
        o2.frequency.setValueAtTime(450, c.currentTime);
        o2.frequency.exponentialRampToValueAtTime(120, c.currentTime + 0.4);
        const g2 = c.createGain();
        g2.gain.setValueAtTime(0.12, c.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
        o2.connect(g2); g2.connect(c.destination);
        o2.start(); o2.stop(c.currentTime + 0.55);
    }

    // guardrail scrape: metallic scratch
    function guardrailBounce() {
        const c = ac();
        const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.1), c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
        const src = c.createBufferSource(); src.buffer = buf;
        const bq = c.createBiquadFilter(); bq.type = 'bandpass'; bq.frequency.value = 3400; bq.Q.value = 2;
        const hg = c.createGain();
        hg.gain.setValueAtTime(0.28, c.currentTime);
        hg.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
        src.connect(bq); bq.connect(hg); hg.connect(c.destination); src.start();
    }

    // falling whoosh: descending sweep (plays when car goes off-track)
    function fallWhoosh() {
        const c = ac();
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(380, c.currentTime);
        o.frequency.exponentialRampToValueAtTime(55, c.currentTime + 0.75);
        const g = c.createGain();
        g.gain.setValueAtTime(0.2, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.8);
        o.connect(g); g.connect(c.destination);
        o.start(); o.stop(c.currentTime + 0.82);
        // harmonic
        const o2 = c.createOscillator(); o2.type = 'triangle';
        o2.frequency.setValueAtTime(220, c.currentTime);
        o2.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.6);
        const g2 = c.createGain();
        g2.gain.setValueAtTime(0.1, c.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.7);
        o2.connect(g2); g2.connect(c.destination); o2.start(); o2.stop(c.currentTime + 0.75);
    }

    // landing thud: deep boom + noise for crash landing
    function landThud() {
        const c = ac();
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(130, c.currentTime);
        o.frequency.exponentialRampToValueAtTime(38, c.currentTime + 0.28);
        const g = c.createGain();
        g.gain.setValueAtTime(0.5, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.32);
        o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.35);
        // percussive noise burst
        const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.18), c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.7;
        const src = c.createBufferSource(); src.buffer = buf;
        const ng = c.createGain();
        ng.gain.setValueAtTime(0.35, c.currentTime);
        ng.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
        src.connect(ng); ng.connect(c.destination); src.start();
    }

    return { countdownBeep, nitro, pickupMoney, pickupNitro, engineStart, engineUpdate, engineStop, rampJump, ballKick, subbuteoHit, ghostFreeze, guardrailBounce, fallWhoosh, landThud };
})();

// ── BOOT SCENE ──────────────────────────────────────────────
class BootScene extends Phaser.Scene {
    constructor() { super('BootScene'); }

    preload() {
        this._createLoadingUI();

        this.load.on('progress', (value) => this._updateBar(value * 0.4));
        this.load.on('fileprogress', (file) => this._setStatus(`Loading ${file.key}…`));
        this.load.on('loaderror', (file) => {
            console.warn('Asset load failed:', file.key, file.src || 'unknown source');
        });

        this.load.image(TRUCK_SPRITES.player, 'players/car_copilot.png');
        this.load.image(TRUCK_SPRITES.ai1, 'players/car_frank.png');
        this.load.image(TRUCK_SPRITES.ai2, 'players/car_hubot.png');
        this.load.image(TRUCK_SPRITES.ai3, 'players/car_mona.png');

        this.load.image('avatar_copilot', 'players/copilot.png');
        this.load.image('avatar_frank', 'players/frank.png');
        this.load.image('avatar_hubot', 'players/hubot.png');
        this.load.image('avatar_mona', 'players/mona.png');
    }

    create() {
        this.genTrucks();
        this.genPickups();
        this._updateBar(0.4);
        this._setStatus('Building tracks…');
        this._genTracksAsync(() => {
            this._updateBar(1.0);
            this._setStatus('Ready!');
            // Warm browser cache for first 2 race tracks' music in background (non-blocking).
            // fetch() shares the HTTP cache with Phaser's XHR audio loader so the
            // downloads start now rather than blocking the first race transition.
            TRACK_MUSIC.slice(0, 2).forEach(url => fetch(url).catch(() => {}));
            this.time.delayedCall(300, () => this.scene.start('MainMenuScene'));
        });
    }

    genTrucks() {
        // If sprite loading fails for any reason, keep the procedural truck fallback.
        if (Object.values(TRUCK_SPRITES).every(k => this.textures.exists(k))) return;

        const sz = TS * 2;
        TCOLORS.forEach((col, idx) => {
            const cv = document.createElement('canvas');
            cv.width = sz * ROT_FRAMES; cv.height = sz;
            const ctx = cv.getContext('2d');
            const r = (col >> 16) & 0xff, g = (col >> 8) & 0xff, b = col & 0xff;
            for (let f = 0; f < ROT_FRAMES; f++) {
                const cx = f * sz + sz / 2, cy = sz / 2;
                const a = (f / ROT_FRAMES) * Math.PI * 2;
                ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
                // body
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(-TS * 0.7, -TS * 0.5, TS * 1.4, TS);
                // front (darker)
                ctx.fillStyle = `rgb(${r * 0.6 | 0},${g * 0.6 | 0},${b * 0.6 | 0})`;
                ctx.fillRect(TS * 0.2, -TS * 0.5, TS * 0.5, TS);
                // wheels
                ctx.fillStyle = '#222';
                [[-0.6, -0.6], [-0.6, 0.4], [0.3, -0.6], [0.3, 0.4]].forEach(([wx, wy]) => {
                    ctx.fillRect(TS * wx, TS * wy, TS * 0.3, TS * 0.2);
                });
                // cage
                ctx.strokeStyle = `rgb(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)})`;
                ctx.lineWidth = 1;
                ctx.strokeRect(-TS * 0.25, -TS * 0.3, TS * 0.5, TS * 0.6);
                ctx.restore();
            }
            this.textures.addSpriteSheet(`truck_${TKEYS[idx]}`, cv, { frameWidth: sz, frameHeight: sz });
        });
    }

    genPickups() {
        // money bag
        let cv = document.createElement('canvas'); cv.width = cv.height = 20;
        let ctx = cv.getContext('2d');
        ctx.fillStyle = '#FFD700'; ctx.beginPath(); ctx.arc(10, 12, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#8B6914'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('$', 10, 12);
        this.textures.addCanvas('pk_money', cv);

        // nitro
        cv = document.createElement('canvas'); cv.width = cv.height = 20;
        ctx = cv.getContext('2d');
        ctx.fillStyle = '#ff4400'; ctx.beginPath(); ctx.arc(10, 10, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff9944'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('N', 10, 11);
        this.textures.addCanvas('pk_nitro', cv);
    }

    // ── Shared track rendering helpers (visual canvas) ────────────────────
    // Draws dark tunnel bodies + concrete portal arches for any track that
    // has a t.tunnels array (already converted from frac → startI).
    drawTrackTunnels(vx, t, wp) {
        if (!t.tunnels || !t.tunnels.length) return;
        const halfW = t.rw / 2 + 6;
        t.tunnels.forEach(tu => {
            // dark outer shell
            vx.save();
            vx.strokeStyle = 'rgba(8,8,14,0.90)';
            vx.lineWidth = t.rw + 14;
            vx.lineCap = 'butt'; vx.lineJoin = 'round';
            vx.beginPath();
            for (let i = 0; i <= tu.len; i++) {
                const pp = wp[(tu.startI + i) % wp.length];
                if (i === 0) vx.moveTo(pp.x, pp.y); else vx.lineTo(pp.x, pp.y);
            }
            vx.stroke();
            // dark road surface inside tunnel
            vx.strokeStyle = 'rgba(28,28,38,0.96)';
            vx.lineWidth = t.rw - 4;
            vx.beginPath();
            for (let i = 0; i <= tu.len; i++) {
                const pp = wp[(tu.startI + i) % wp.length];
                if (i === 0) vx.moveTo(pp.x, pp.y); else vx.lineTo(pp.x, pp.y);
            }
            vx.stroke();
            vx.restore();
            // portal arches at entry and exit
            const p0  = wp[tu.startI % wp.length];
            const p1  = wp[(tu.startI + 1) % wp.length];
            const pE  = wp[(tu.startI + tu.len) % wp.length];
            const pEn = wp[(tu.startI + tu.len + 1) % wp.length];
            [[p0, p1, false], [pE, pEn, true]].forEach(([pt, ptn, flip]) => {
                const ang = Math.atan2(ptn.y - pt.y, ptn.x - pt.x) + (flip ? Math.PI : 0);
                vx.save();
                vx.translate(pt.x, pt.y); vx.rotate(ang);
                vx.fillStyle = '#7a7a86'; vx.fillRect(-10, -halfW - 18, 20, halfW * 2 + 36);
                vx.fillStyle = '#1a1a24'; vx.fillRect(-6, -halfW, 12, halfW * 2);
                vx.fillStyle = '#ffe060';
                vx.beginPath(); vx.arc(0, -halfW - 8, 4, 0, Math.PI * 2); vx.fill();
                vx.restore();
            });
        });
    }

    // Draws yellow/black striped ramp markers on the road.
    drawTrackRamps(vx, t) {
        if (!t.ramps || !t.ramps.length) return;
        const hw = t.rw / 2 - 4;
        t.ramps.forEach(r => {
            vx.save();
            vx.translate(r.x, r.y); vx.rotate(r.a);
            for (let k = -3; k <= 3; k++) {
                vx.fillStyle = k % 2 === 0 ? '#1a1a1a' : '#ffdd22';
                vx.fillRect(k * 8 - 4, -hw, 8, hw * 2);
            }
            vx.fillStyle = 'rgba(255,255,255,0.45)';
            vx.fillRect(20, -hw, 3, hw * 2);
            vx.restore();
        });
    }

    // Draws blue water channel bodies (called BEFORE road so road bridges over water).
    drawTrackWater(vx, waterArr) {
        if (!waterArr || !waterArr.length) return;
        waterArr.forEach(w => {
            const wg = vx.createRadialGradient(w.x, w.y, 0, w.x, w.y, Math.max(w.rw, w.rh) / 2);
            wg.addColorStop(0, 'rgba(38,128,245,0.96)');
            wg.addColorStop(0.6, 'rgba(18,88,205,0.92)');
            wg.addColorStop(1, 'rgba(8,55,155,0.72)');
            vx.fillStyle = wg;
            vx.beginPath();
            vx.ellipse(w.x, w.y, w.rw / 2, w.rh / 2, 0, 0, Math.PI * 2);
            vx.fill();
            vx.strokeStyle = 'rgba(175,228,255,0.42)'; vx.lineWidth = 1.5;
            for (let i = -1; i <= 1; i++) {
                vx.beginPath();
                vx.moveTo(w.x - w.rw * 0.38, w.y + i * w.rh * 0.22);
                vx.bezierCurveTo(
                    w.x - w.rw * 0.1, w.y + i * w.rh * 0.22 - 3,
                    w.x + w.rw * 0.1, w.y + i * w.rh * 0.22 + 3,
                    w.x + w.rw * 0.38, w.y + i * w.rh * 0.22
                );
                vx.stroke();
            }
        });
    }

    genTracks() {
        TRACKS.forEach((t, idx) => this._genSingleTrack(t, idx));
    }

    _genSingleTrack(t, idx) {
        let seed = idx * 7919 + 42;
        function srand() { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646; }
            // Procedural tracks: build cp fresh each session
            if (t.procedural && !t.cp.length) generateDeskCp(t);
            // per-track world dimensions (default to screen size)
            t.W = t.W || GW;
            t.H = t.H || GH;
            const TW = t.W, TH = t.H;
            const wp = spline(t.cp, 20);
            t.wp = wp;

            // Convert fractional tunnel positions → waypoint indices for hand-crafted tracks
            if (t.tunnels && t.tunnels.length && typeof t.tunnels[0].frac === 'number') {
                t.tunnels = t.tunnels.map(tu => ({
                    startI: Math.round(tu.frac * wp.length) % wp.length,
                    len: tu.len,
                }));
            }

            // procedural extras that depend on the splined waypoints
            if (t.desk) generateDeskExtras(t, wp);

            const halloween = idx === 7;
            const soccer    = idx === 5;
            const asian     = idx === 2;
            const synth     = !!t.synth;
            const desk      = !!t.desk;
            const theme     = t.theme || '';

            // ── visual ──
            // Support internal canvas downscaling for huge tracks (keeps
            // textures and ImageData within sane limits). World coords are
            // unchanged — we just apply ctx.scale so draw calls can still
            // use world-space values.
            const cs = t.cpxScale || 1;
            const vc = document.createElement('canvas');
            vc.width = Math.round(TW / cs); vc.height = Math.round(TH / cs);
            const vx = vc.getContext('2d');
            if (cs !== 1) vx.scale(1 / cs, 1 / cs);

            // ── tiny scenery sprites (bugs, plants, litter) shared across tracks ──
            // All drawn in world coords; callers pass position, optional rotation, and scale.
            const drawAnt = (px, py, ang, sc) => {
                vx.save(); vx.translate(px, py); vx.rotate(ang); vx.scale(sc, sc);
                vx.fillStyle = '#1a0a05';
                vx.beginPath(); vx.arc(4, 0, 1.6, 0, Math.PI * 2); vx.fill();             // head
                vx.beginPath(); vx.arc(0, 0, 1.4, 0, Math.PI * 2); vx.fill();             // thorax
                vx.beginPath(); vx.ellipse(-3.2, 0, 2.4, 1.7, 0, 0, Math.PI * 2); vx.fill(); // abdomen
                vx.strokeStyle = '#1a0a05'; vx.lineWidth = 0.5;
                for (let s = -1; s <= 1; s++) {
                    vx.beginPath(); vx.moveTo(0, 0); vx.lineTo(s * 1.2, 3); vx.stroke();
                    vx.beginPath(); vx.moveTo(0, 0); vx.lineTo(s * 1.2, -3); vx.stroke();
                }
                vx.beginPath(); vx.moveTo(4, 0); vx.lineTo(6, -1.6); vx.stroke();
                vx.beginPath(); vx.moveTo(4, 0); vx.lineTo(6, 1.6); vx.stroke();
                vx.restore();
            };
            const drawSpider = (px, py, ang, sc) => {
                vx.save(); vx.translate(px, py); vx.rotate(ang); vx.scale(sc, sc);
                vx.strokeStyle = '#0a0a0a'; vx.lineWidth = 0.6; vx.lineCap = 'round';
                for (let l = 0; l < 4; l++) {
                    const a = (l / 4) * Math.PI - Math.PI / 2 + 0.4;
                    const lx = Math.cos(a) * 6, ly = Math.sin(a) * 6;
                    vx.beginPath(); vx.moveTo(0, 0); vx.quadraticCurveTo(lx * 0.6, ly * 0.6 - 1, lx, ly); vx.stroke();
                    vx.beginPath(); vx.moveTo(0, 0); vx.quadraticCurveTo(-lx * 0.6, ly * 0.6 - 1, -lx, ly); vx.stroke();
                }
                vx.fillStyle = '#0a0a0a';
                vx.beginPath(); vx.ellipse(0, 0.5, 2.6, 3, 0, 0, Math.PI * 2); vx.fill();
                vx.beginPath(); vx.arc(0, -2.5, 1.3, 0, Math.PI * 2); vx.fill();
                vx.restore();
            };
            const drawDaisy = (px, py, sc) => {
                vx.save(); vx.translate(px, py); vx.scale(sc, sc);
                vx.fillStyle = '#ffffff';
                for (let p = 0; p < 6; p++) {
                    const a = (p / 6) * Math.PI * 2;
                    vx.beginPath();
                    vx.ellipse(Math.cos(a) * 3, Math.sin(a) * 3, 2.4, 1.3, a, 0, Math.PI * 2);
                    vx.fill();
                }
                vx.fillStyle = '#f0c020';
                vx.beginPath(); vx.arc(0, 0, 1.7, 0, Math.PI * 2); vx.fill();
                vx.fillStyle = 'rgba(180,120,0,0.6)';
                vx.beginPath(); vx.arc(0, 0, 1.7, 0, Math.PI * 2); vx.stroke();
                vx.restore();
            };
            const drawMushroom = (px, py, sc) => {
                vx.save(); vx.translate(px, py); vx.scale(sc, sc);
                // shadow
                vx.fillStyle = 'rgba(0,0,0,0.25)';
                vx.beginPath(); vx.ellipse(0, 4.5, 4, 1.2, 0, 0, Math.PI * 2); vx.fill();
                // stem
                vx.fillStyle = '#f4ecd6';
                vx.fillRect(-1.6, 0, 3.2, 4.5);
                // cap
                vx.fillStyle = '#cc2020';
                vx.beginPath();
                vx.moveTo(-4.2, 1); vx.quadraticCurveTo(0, -5.5, 4.2, 1);
                vx.closePath(); vx.fill();
                // spots
                vx.fillStyle = '#ffffff';
                vx.beginPath(); vx.arc(-1.6, -1.4, 0.7, 0, Math.PI * 2); vx.fill();
                vx.beginPath(); vx.arc(1.8, -0.7, 0.6, 0, Math.PI * 2); vx.fill();
                vx.beginPath(); vx.arc(0.4, -2.6, 0.5, 0, Math.PI * 2); vx.fill();
                vx.restore();
            };
            const drawCigarette = (px, py, ang, sc) => {
                vx.save(); vx.translate(px, py); vx.rotate(ang); vx.scale(sc, sc);
                // paper body
                vx.fillStyle = '#f2efe4';
                vx.fillRect(-7, -1, 10, 2);
                // brown filter
                vx.fillStyle = '#a07030';
                vx.fillRect(3, -1, 4, 2);
                // dark band on filter
                vx.fillStyle = '#7a4e1c';
                vx.fillRect(3, -1, 0.8, 2);
                // burnt black tip
                vx.fillStyle = '#1a1a1a';
                vx.fillRect(-7.6, -1, 0.9, 2);
                // grey ash
                vx.fillStyle = '#9a9a9a';
                vx.fillRect(-8.2, -0.6, 0.7, 1.2);
                vx.strokeStyle = 'rgba(0,0,0,0.25)'; vx.lineWidth = 0.3;
                vx.strokeRect(-7, -1, 14, 2);
                vx.restore();
            };
            const drawFrog = (px, py, ang, sc) => {
                vx.save(); vx.translate(px, py); vx.rotate(ang); vx.scale(sc, sc);
                // back legs (splayed)
                vx.fillStyle = '#3aaa30';
                vx.beginPath(); vx.ellipse(-4, 3, 2.2, 1.2, 0.6, 0, Math.PI * 2); vx.fill();
                vx.beginPath(); vx.ellipse(4, 3, 2.2, 1.2, -0.6, 0, Math.PI * 2); vx.fill();
                // body
                vx.beginPath(); vx.ellipse(0, 0, 5, 4, 0, 0, Math.PI * 2); vx.fill();
                // back shading
                vx.fillStyle = '#2a8a20';
                vx.beginPath(); vx.ellipse(-2, 0.5, 1.2, 2.5, 0, 0, Math.PI * 2); vx.fill();
                vx.beginPath(); vx.ellipse(2, 0.5, 1.2, 2.5, 0, 0, Math.PI * 2); vx.fill();
                // front legs
                vx.fillStyle = '#3aaa30';
                vx.beginPath(); vx.ellipse(-3, -2.4, 1.4, 0.8, -0.4, 0, Math.PI * 2); vx.fill();
                vx.beginPath(); vx.ellipse(3, -2.4, 1.4, 0.8, 0.4, 0, Math.PI * 2); vx.fill();
                // bulging eyes
                vx.fillStyle = '#ffffff';
                vx.beginPath(); vx.arc(-1.7, -3, 1.1, 0, Math.PI * 2); vx.fill();
                vx.beginPath(); vx.arc(1.7, -3, 1.1, 0, Math.PI * 2); vx.fill();
                vx.fillStyle = '#000000';
                vx.beginPath(); vx.arc(-1.7, -3, 0.5, 0, Math.PI * 2); vx.fill();
                vx.beginPath(); vx.arc(1.7, -3, 0.5, 0, Math.PI * 2); vx.fill();
                vx.restore();
            };

            if (synth) {
                // ── SYNTHWAVE: top-down neon grid world ──
                // base: deep purple/black
                vx.fillStyle = '#0a0020'; vx.fillRect(0, 0, TW, TH);
                // subtle radial vignette gradients at corners for mood
                for (let i = 0; i < 6; i++) {
                    const rg = vx.createRadialGradient(srand()*TW, srand()*TH, 0, srand()*TW, srand()*TH, 300);
                    rg.addColorStop(0, `rgba(${120+(srand()*60|0)},0,${160+(srand()*95|0)},0.35)`);
                    rg.addColorStop(1, 'rgba(0,0,0,0)');
                    vx.fillStyle = rg; vx.fillRect(0, 0, TW, TH);
                }
                // neon grid — cyan
                vx.strokeStyle = 'rgba(42,240,255,0.35)'; vx.lineWidth = 1;
                const GRID = 48;
                for (let gx = 0; gx <= TW; gx += GRID) {
                    vx.beginPath(); vx.moveTo(gx, 0); vx.lineTo(gx, TH); vx.stroke();
                }
                for (let gy = 0; gy <= TH; gy += GRID) {
                    vx.beginPath(); vx.moveTo(0, gy); vx.lineTo(TW, gy); vx.stroke();
                }
                // every 4th line brighter magenta
                vx.strokeStyle = 'rgba(255,42,109,0.55)'; vx.lineWidth = 1.5;
                for (let gx = 0; gx <= TW; gx += GRID * 4) {
                    vx.beginPath(); vx.moveTo(gx, 0); vx.lineTo(gx, TH); vx.stroke();
                }
                for (let gy = 0; gy <= TH; gy += GRID * 4) {
                    vx.beginPath(); vx.moveTo(0, gy); vx.lineTo(TW, gy); vx.stroke();
                }
                // scattered stars / sparkles
                for (let i = 0; i < 500; i++) {
                    const sx2 = srand()*TW|0, sy2 = srand()*TH|0;
                    vx.fillStyle = `rgba(${200+(srand()*55|0)},${200+(srand()*55|0)},255,${0.3+srand()*0.5})`;
                    vx.fillRect(sx2, sy2, 1, 1);
                }
                // ── neon sun emblem (top-down "stylized") ──
                const sunCx = TW * 0.3, sunCy = TH * 0.2, sunR = 120;
                const sunG = vx.createRadialGradient(sunCx, sunCy, 0, sunCx, sunCy, sunR);
                sunG.addColorStop(0, 'rgba(255,233,74,0.95)');
                sunG.addColorStop(0.4, 'rgba(255,106,154,0.8)');
                sunG.addColorStop(1, 'rgba(255,42,109,0.1)');
                vx.fillStyle = sunG;
                vx.beginPath(); vx.arc(sunCx, sunCy, sunR, 0, Math.PI * 2); vx.fill();
                // horizontal slits
                vx.fillStyle = '#0a0020';
                for (let i = 0; i < 7; i++) {
                    vx.fillRect(sunCx - sunR, sunCy + 10 + i * 14, sunR * 2, 2.5 + i * 0.6);
                }
                // second smaller sun
                const sun2x = TW * 0.75, sun2y = TH * 0.75, sun2R = 80;
                const sun2G = vx.createRadialGradient(sun2x, sun2y, 0, sun2x, sun2y, sun2R);
                sun2G.addColorStop(0, 'rgba(42,240,255,0.95)');
                sun2G.addColorStop(0.5, 'rgba(130,80,255,0.6)');
                sun2G.addColorStop(1, 'rgba(80,40,200,0.05)');
                vx.fillStyle = sun2G;
                vx.beginPath(); vx.arc(sun2x, sun2y, sun2R, 0, Math.PI * 2); vx.fill();

                // palm tree silhouettes scattered around
                const drawPalm = (px, py, h) => {
                    // trunk
                    vx.strokeStyle = '#0a0010'; vx.lineWidth = 4;
                    vx.beginPath(); vx.moveTo(px, py); vx.lineTo(px + 2, py - h); vx.stroke();
                    // fronds
                    vx.strokeStyle = '#0a0010'; vx.lineWidth = 3;
                    for (let f = 0; f < 6; f++) {
                        const fa = (f / 6) * Math.PI + Math.PI + srand() * 0.3;
                        const fx = px + 2 + Math.cos(fa) * h * 0.45;
                        const fy = py - h + Math.sin(fa) * h * 0.3;
                        vx.beginPath(); vx.moveTo(px + 2, py - h); vx.quadraticCurveTo((px + fx)/2, py - h - 12, fx, fy); vx.stroke();
                    }
                    // neon outline on trunk
                    vx.strokeStyle = '#ff2a6d'; vx.lineWidth = 1;
                    vx.beginPath(); vx.moveTo(px - 1, py); vx.lineTo(px + 1, py - h); vx.stroke();
                };
                for (let i = 0; i < 28; i++) {
                    const px = srand() * TW, py = srand() * TH;
                    // skip if too close to track center (simple approximation)
                    drawPalm(px, py, 35 + srand() * 35);
                }
                // neon triangles / pyramids decor
                for (let i = 0; i < 20; i++) {
                    const tx = srand() * TW, ty = srand() * TH, tr = 12 + srand() * 18;
                    const col = srand() > 0.5 ? '#2af0ff' : '#ff2a6d';
                    vx.strokeStyle = col; vx.lineWidth = 1.5;
                    vx.beginPath();
                    vx.moveTo(tx, ty - tr);
                    vx.lineTo(tx - tr, ty + tr);
                    vx.lineTo(tx + tr, ty + tr);
                    vx.closePath(); vx.stroke();
                }
                // road shoulder — magenta glow
                vx.strokeStyle = '#ff2a6d'; vx.lineWidth = t.rw + 16;
                vx.lineCap = 'round'; vx.lineJoin = 'round';
                drawPath(vx, wp); vx.stroke();
                // inner shoulder — cyan glow
                vx.strokeStyle = '#2af0ff'; vx.lineWidth = t.rw + 6;
                drawPath(vx, wp); vx.stroke();
                // road surface — near-black
                vx.strokeStyle = '#0a0618'; vx.lineWidth = t.rw;
                drawPath(vx, wp); vx.stroke();
                // inner road highlight
                vx.strokeStyle = '#1a0a2a'; vx.lineWidth = t.rw - 14;
                drawPath(vx, wp); vx.stroke();
                // centre dashes — bright cyan
                vx.strokeStyle = '#2af0ff'; vx.lineWidth = 2; vx.setLineDash([10, 16]);
                drawPath(vx, wp); vx.stroke(); vx.setLineDash([]);
                // edge neon stripes (thin)
                vx.strokeStyle = 'rgba(255,42,109,0.9)'; vx.lineWidth = 1.5;
                vx.setLineDash([20, 6]); drawPath(vx, wp); vx.stroke(); vx.setLineDash([]);
                // mud as neon "glitch" pools
                t.mud.forEach(m => {
                    const g = vx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
                    g.addColorStop(0, 'rgba(170,0,255,0.9)'); g.addColorStop(1, 'rgba(80,0,160,0.1)');
                    vx.fillStyle = g; vx.beginPath(); vx.arc(m.x, m.y, m.r, 0, Math.PI * 2); vx.fill();
                    // glitch scanlines inside
                    vx.fillStyle = 'rgba(42,240,255,0.4)';
                    for (let s = -m.r; s < m.r; s += 4) {
                        vx.fillRect(m.x - m.r, m.y + s, m.r * 2, 1);
                    }
                });
            } else if (halloween) {
                // deep dark purple-black night sky
                vx.fillStyle = '#0d0010'; vx.fillRect(0, 0, GW, GH);
                // moody purple/dark patches
                for (let i = 0; i < 35; i++) {
                    const r2 = vx.createRadialGradient(srand()*GW, srand()*GH, 0, srand()*GW, srand()*GH, 30 + srand()*80);
                    r2.addColorStop(0, `rgba(${60+(srand()*40|0)},0,${80+(srand()*60|0)},0.55)`);
                    r2.addColorStop(1, 'rgba(0,0,0,0)');
                    vx.fillStyle = r2; vx.fillRect(0, 0, GW, GH);
                }
                // scattered stars
                for (let i = 0; i < 80; i++) {
                    vx.fillStyle = `rgba(255,220,255,${0.3 + srand()*0.7})`;
                    vx.fillRect(srand()*GW|0, srand()*GH|0, 1, 1);
                }
                // jack-o-lantern pumpkins scattered on field
                const drawPumpkin = (px, py, r) => {
                    vx.fillStyle = '#c85000';
                    vx.beginPath(); vx.ellipse(px, py, r, r*0.8, 0, 0, Math.PI*2); vx.fill();
                    vx.fillStyle = '#e06000';
                    vx.beginPath(); vx.ellipse(px-r*0.28, py, r*0.5, r*0.72, 0, 0, Math.PI*2); vx.fill();
                    vx.beginPath(); vx.ellipse(px+r*0.28, py, r*0.5, r*0.72, 0, 0, Math.PI*2); vx.fill();
                    // stem
                    vx.fillStyle = '#2a5500'; vx.fillRect(px-2, py-r*0.8-6, 4, 7);
                    // eyes
                    vx.fillStyle = '#ffcc00';
                    vx.beginPath(); vx.moveTo(px-r*0.35, py-r*0.1); vx.lineTo(px-r*0.15, py-r*0.3); vx.lineTo(px-r*0.15, py-r*0.1); vx.fill();
                    vx.beginPath(); vx.moveTo(px+r*0.35, py-r*0.1); vx.lineTo(px+r*0.15, py-r*0.3); vx.lineTo(px+r*0.15, py-r*0.1); vx.fill();
                    // mouth
                    vx.beginPath(); vx.moveTo(px-r*0.35, py+r*0.2);
                    vx.lineTo(px-r*0.2, py+r*0.35); vx.lineTo(px-r*0.05, py+r*0.22);
                    vx.lineTo(px+r*0.05, py+r*0.35); vx.lineTo(px+r*0.2, py+r*0.22);
                    vx.lineTo(px+r*0.35, py+r*0.35); vx.lineTo(px+r*0.35, py+r*0.2); vx.fill();
                };
                for (let i = 0; i < 12; i++) drawPumpkin(srand()*GW, srand()*GH, 8 + srand()*10);
                // road shoulder — purple-tinged
                vx.strokeStyle = '#4a1a6a'; vx.lineWidth = t.rw + 10;
                vx.lineCap = 'round'; vx.lineJoin = 'round';
                drawPath(vx, wp); vx.stroke();
                // road surface — very dark
                vx.strokeStyle = '#1a0828'; vx.lineWidth = t.rw;
                drawPath(vx, wp); vx.stroke();
                // inner detail
                vx.strokeStyle = '#220a32'; vx.lineWidth = t.rw - 12;
                drawPath(vx, wp); vx.stroke();
                // centre dashes — orange
                vx.strokeStyle = '#cc5500'; vx.lineWidth = 1; vx.setLineDash([8, 14]);
                drawPath(vx, wp); vx.stroke(); vx.setLineDash([]);
                // mud as glowing purple slime pools
                t.mud.forEach(m => {
                    const g = vx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
                    g.addColorStop(0, 'rgba(160,0,200,0.9)'); g.addColorStop(1, 'rgba(80,0,100,0.15)');
                    vx.fillStyle = g; vx.beginPath(); vx.arc(m.x, m.y, m.r, 0, Math.PI * 2); vx.fill();
                });
            } else if (soccer) {
                // ── SOCCER: vivid green pitch with field markings ──
                vx.fillStyle = '#2e8b2e'; vx.fillRect(0, 0, GW, GH);
                // alternating mow stripes
                for (let s = 0; s < GH; s += 40) {
                    vx.fillStyle = s % 80 === 0 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.04)';
                    vx.fillRect(0, s, GW, 40);
                }
                // field boundary
                vx.strokeStyle = 'rgba(255,255,255,0.55)'; vx.lineWidth = 3; vx.setLineDash([]);
                vx.strokeRect(60, 60, GW - 120, GH - 120);
                // centre circle
                vx.beginPath(); vx.arc(GW/2, GH/2, 70, 0, Math.PI*2); vx.stroke();
                vx.beginPath(); vx.arc(GW/2, GH/2, 3, 0, Math.PI*2);
                vx.fillStyle = 'rgba(255,255,255,0.8)'; vx.fill();
                // halfway line
                vx.beginPath(); vx.moveTo(60, GH/2); vx.lineTo(GW-60, GH/2); vx.stroke();
                // penalty boxes
                vx.strokeRect(60, GH/2 - 80, 100, 160);
                vx.strokeRect(GW - 160, GH/2 - 80, 100, 160);
                // corner arcs
                [[60,60],[GW-60,60],[60,GH-60],[GW-60,GH-60]].forEach(([cx2,cy2]) => {
                    const aStart = Math.atan2(GH/2-cy2, GW/2-cx2) - 0.4;
                    vx.beginPath(); vx.arc(cx2, cy2, 20, aStart, aStart + 0.8); vx.stroke();
                });
                // soccer balls scattered off-road
                const drawBall = (bx, by, r) => {
                    // white base
                    vx.save();
                    vx.beginPath(); vx.arc(bx, by, r, 0, Math.PI*2); vx.closePath(); vx.clip();
                    vx.fillStyle = '#fff';
                    vx.fillRect(bx - r, by - r, r*2, r*2);
                    // centre pentagon
                    const drawPentagon = (cx2, cy2, pr) => {
                        vx.beginPath();
                        for (let p = 0; p < 5; p++) {
                            const a = (p / 5) * Math.PI * 2 - Math.PI / 2;
                            const px2 = cx2 + Math.cos(a) * pr;
                            const py2 = cy2 + Math.sin(a) * pr;
                            p === 0 ? vx.moveTo(px2, py2) : vx.lineTo(px2, py2);
                        }
                        vx.closePath();
                    };
                    vx.fillStyle = '#222';
                    drawPentagon(bx, by, r * 0.35); vx.fill();
                    // outer pentagons
                    for (let p = 0; p < 5; p++) {
                        const a = (p / 5) * Math.PI * 2 - Math.PI / 2;
                        const ox = bx + Math.cos(a) * r * 0.72;
                        const oy = by + Math.sin(a) * r * 0.72;
                        vx.fillStyle = '#222';
                        drawPentagon(ox, oy, r * 0.25); vx.fill();
                    }
                    // seam lines from centre pentagon vertices to outer pentagons
                    vx.strokeStyle = '#555'; vx.lineWidth = r * 0.06;
                    for (let p = 0; p < 5; p++) {
                        const a1 = (p / 5) * Math.PI * 2 - Math.PI / 2;
                        const ix = bx + Math.cos(a1) * r * 0.35;
                        const iy = by + Math.sin(a1) * r * 0.35;
                        const ox = bx + Math.cos(a1) * r * 0.72;
                        const oy = by + Math.sin(a1) * r * 0.72;
                        vx.beginPath(); vx.moveTo(ix, iy); vx.lineTo(ox, oy); vx.stroke();
                        // connect adjacent outer pentagons
                        const a2 = ((p+1) / 5) * Math.PI * 2 - Math.PI / 2;
                        const ox2 = bx + Math.cos(a2) * r * 0.72;
                        const oy2 = by + Math.sin(a2) * r * 0.72;
                        const mx = (ox + ox2) / 2 + (by - (oy + oy2)/2) * 0.15;
                        const my = (oy + oy2) / 2 + ((ox + ox2)/2 - bx) * 0.15;
                        vx.beginPath(); vx.moveTo(ox, oy); vx.quadraticCurveTo(mx, my, ox2, oy2); vx.stroke();
                    }
                    vx.restore();
                    // outer edge
                    vx.strokeStyle = '#333'; vx.lineWidth = r * 0.1;
                    vx.beginPath(); vx.arc(bx, by, r, 0, Math.PI*2); vx.stroke();
                    // subtle highlight
                    const hl = vx.createRadialGradient(bx - r*0.3, by - r*0.3, 0, bx, by, r);
                    hl.addColorStop(0, 'rgba(255,255,255,0.5)'); hl.addColorStop(1, 'rgba(0,0,0,0)');
                    vx.fillStyle = hl;
                    vx.beginPath(); vx.arc(bx, by, r, 0, Math.PI*2); vx.fill();
                };
                // store ball positions for runtime collision (drawn dynamically, not on static canvas)
                t.soccerBalls = [];
                for (let i = 0; i < 10; i++) {
                    const bx2 = srand()*GW, by2 = srand()*GH, br = 5 + srand()*5;
                    t.soccerBalls.push({ x: bx2, y: by2, r: br });
                }

                // subbuteo player — store position for runtime collision (drawn dynamically, not on static canvas)
                const spx = 100 + srand() * (GW - 200), spy = 100 + srand() * (GH - 200);
                t.subbuteo = { x: spx, y: spy };

                // Rangers vs Celtic match ticket — angled as a RAMP
                srand(); srand(); // consume random values to keep seed in sync
                const tkx = GW / 2 - 60, tky = GH / 2 - 10;
                const rampAngle = -10 * Math.PI / 180; // ~10 degrees tilted up from left
                // store ramp zone for collision detection
                t.ramp = { x: tkx + 60, y: tky + 26, hw: 65, hh: 30, angle: rampAngle };
                vx.save();
                vx.translate(tkx, tky);
                // shadow underneath the ramp to show it's elevated
                vx.save();
                vx.translate(6, 10);
                vx.rotate(rampAngle * 0.3); // shadow less tilted (on ground)
                vx.fillStyle = 'rgba(0,0,0,0.45)';
                vx.beginPath();
                vx.moveTo(0, 52); vx.lineTo(120, 52);
                vx.lineTo(115, 56); vx.lineTo(5, 58);
                vx.closePath(); vx.fill();
                // broader soft shadow
                vx.fillStyle = 'rgba(0,0,0,0.18)';
                vx.beginPath();
                vx.ellipse(60, 58, 65, 10, 0, 0, Math.PI * 2);
                vx.fill();
                vx.restore();
                // tilt the ticket like a ramp — left side on the ground
                vx.rotate(rampAngle);
                // ticket background
                const tg = vx.createLinearGradient(0, 0, 120, 0);
                tg.addColorStop(0, '#f5f0e0'); tg.addColorStop(1, '#ece5cc');
                vx.fillStyle = tg;
                vx.fillRect(0, 0, 120, 52);
                // thin edge strip to show thickness/ramp depth
                vx.fillStyle = '#c8b888';
                vx.beginPath();
                vx.moveTo(0, 52); vx.lineTo(120, 52);
                vx.lineTo(120, 55); vx.lineTo(0, 54);
                vx.closePath(); vx.fill();
                // ticket border
                vx.strokeStyle = '#8a7a5a'; vx.lineWidth = 1.2;
                vx.strokeRect(0, 0, 120, 52);
                // perforated edge
                vx.setLineDash([2, 3]); vx.strokeStyle = '#aaa'; vx.lineWidth = 0.8;
                vx.beginPath(); vx.moveTo(90, 0); vx.lineTo(90, 52); vx.stroke();
                vx.setLineDash([]);
                // header bar
                vx.fillStyle = '#1a3c7a'; vx.fillRect(2, 2, 86, 12);
                vx.fillStyle = '#fff'; vx.font = 'bold 7px sans-serif'; vx.textAlign = 'center';
                vx.fillText('OLD FIRM DERBY', 45, 11);
                // team names
                vx.fillStyle = '#0033a0'; vx.font = 'bold 8px sans-serif'; vx.textAlign = 'left';
                vx.fillText('RANGERS', 6, 26);
                vx.fillStyle = '#333'; vx.font = 'bold 7px sans-serif';
                vx.fillText('vs', 54, 26);
                vx.fillStyle = '#006b35'; vx.font = 'bold 8px sans-serif';
                vx.fillText('CELTIC', 64, 26);
                // match details
                vx.fillStyle = '#555'; vx.font = '5.5px sans-serif'; vx.textAlign = 'left';
                vx.fillText('IBROX STADIUM', 6, 35);
                vx.fillText('SAT 15:00  ADMIT ONE', 6, 43);
                // stub section
                vx.fillStyle = '#666'; vx.font = '5px sans-serif'; vx.textAlign = 'center';
                vx.fillText('SECT', 105, 18);
                vx.fillStyle = '#1a3c7a'; vx.font = 'bold 10px sans-serif';
                vx.fillText('A7', 105, 30);
                vx.fillStyle = '#888'; vx.font = '4.5px sans-serif';
                vx.fillText('ROW 12', 105, 38);
                vx.fillText('SEAT 4', 105, 45);
                vx.restore();
                // frogs hopping around the pitch
                for (let i = 0; i < 18; i++) drawFrog(srand() * GW, srand() * GH, srand() * Math.PI * 2, 2.0 + srand() * 1.4);
                // road shoulder — white line
                vx.strokeStyle = '#bbb'; vx.lineWidth = t.rw + 10; vx.setLineDash([]);
                vx.lineCap = 'round'; vx.lineJoin = 'round';
                drawPath(vx, wp); vx.stroke();
                // road surface — clean short-cut grass
                vx.strokeStyle = '#3aaa3a'; vx.lineWidth = t.rw;
                drawPath(vx, wp); vx.stroke();
                // inner detail
                vx.strokeStyle = '#35993a'; vx.lineWidth = t.rw - 12;
                drawPath(vx, wp); vx.stroke();
                // centre line — white dashes
                vx.strokeStyle = '#fff'; vx.lineWidth = 2; vx.setLineDash([6, 10]);
                drawPath(vx, wp); vx.stroke(); vx.setLineDash([]);
                // mud as puddles
                t.mud.forEach(m => {
                    const g = vx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
                    g.addColorStop(0, 'rgba(100,70,30,0.85)'); g.addColorStop(1, 'rgba(60,40,10,0.1)');
                    vx.fillStyle = g; vx.beginPath(); vx.arc(m.x, m.y, m.r, 0, Math.PI * 2); vx.fill();
                });

            } else if (asian) {
                // ── ASIAN: cherry blossom park with pagoda silhouettes ──
                // soft pale sky
                vx.fillStyle = '#f5e6f0'; vx.fillRect(0, 0, GW, GH);
                // gentle pink-purple gradient wash
                const skyG = vx.createLinearGradient(0,0,0,GH);
                skyG.addColorStop(0,'rgba(220,160,190,0.45)'); skyG.addColorStop(1,'rgba(180,120,160,0.1)');
                vx.fillStyle = skyG; vx.fillRect(0,0,GW,GH);
                // blossom petal rain clusters
                const drawPetal = (px2, py2, r, angle) => {
                    vx.save(); vx.translate(px2, py2); vx.rotate(angle);
                    vx.fillStyle = `rgba(${220+(srand()*30|0)},${100+(srand()*60|0)},${150+(srand()*40|0)},0.75)`;
                    vx.beginPath(); vx.ellipse(0, 0, r*1.6, r*0.8, 0, 0, Math.PI*2); vx.fill();
                    vx.restore();
                };
                for (let i = 0; i < 120; i++) drawPetal(srand()*GW, srand()*GH, 2+srand()*4, srand()*Math.PI*2);
                // cherry blossom trees (trunk + blossom cloud)
                const drawTree = (tx, ty, h) => {
                    vx.fillStyle = '#5a3010'; vx.fillRect(tx-3, ty-h, 6, h);
                    // branches
                    vx.strokeStyle = '#5a3010'; vx.lineWidth = 2;
                    [[-0.6,-0.35],[0.5,-0.4],[-0.3,-0.6],[0.2,-0.65]].forEach(([dx,dy]) => {
                        vx.beginPath(); vx.moveTo(tx, ty-h*0.6);
                        vx.lineTo(tx+dx*h*0.5, ty+dy*h); vx.stroke();
                    });
                    // blossom cloud
                    for (let b = 0; b < 7; b++) {
                        const ba = srand()*Math.PI*2, bd = srand()*h*0.55;
                        vx.fillStyle = `rgba(240,${140+(srand()*60|0)},${170+(srand()*40|0)},0.7)`;
                        vx.beginPath(); vx.arc(tx+Math.cos(ba)*bd, ty-h+Math.sin(ba)*bd*0.6, h*0.18+srand()*h*0.1, 0, Math.PI*2); vx.fill();
                    }
                };
                for (let i = 0; i < 8; i++) drawTree(srand()*GW, srand()*GH*0.85+GH*0.1, 35+srand()*30);
                // pagoda silhouettes
                const drawPagoda = (px3, py3, scale) => {
                    const floors = 3;
                    vx.fillStyle = 'rgba(80,20,10,0.7)';
                    for (let f = 0; f < floors; f++) {
                        const fw = (floors-f)*22*scale, fh = 12*scale, fy = py3 - f*18*scale;
                        vx.fillRect(px3-fw/2, fy-fh, fw, fh);
                        // roof flare
                        vx.beginPath(); vx.moveTo(px3-fw/2-6*scale, fy-fh);
                        vx.lineTo(px3, fy-fh-10*scale); vx.lineTo(px3+fw/2+6*scale, fy-fh); vx.fill();
                    }
                    // spire
                    vx.fillRect(px3-2*scale, py3-floors*18*scale-20*scale, 4*scale, 20*scale);
                };
                drawPagoda(120, 580, 1.0);
                drawPagoda(880, 200, 0.8);
                drawPagoda(550, 680, 0.7);
                // road shoulder — stone path
                vx.strokeStyle = '#c8a888'; vx.lineWidth = t.rw + 10;
                vx.lineCap = 'round'; vx.lineJoin = 'round'; vx.setLineDash([]);
                drawPath(vx, wp); vx.stroke();
                // road surface — terracotta
                vx.strokeStyle = '#d4907a'; vx.lineWidth = t.rw;
                drawPath(vx, wp); vx.stroke();
                // inner detail
                vx.strokeStyle = '#c8806a'; vx.lineWidth = t.rw - 12;
                drawPath(vx, wp); vx.stroke();
                // centre dashes — red
                vx.strokeStyle = '#cc2020'; vx.lineWidth = 1; vx.setLineDash([8, 14]);
                drawPath(vx, wp); vx.stroke(); vx.setLineDash([]);
                // mud as koi pond puddles
                t.mud.forEach(m => {
                    const g = vx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
                    g.addColorStop(0, 'rgba(60,100,160,0.8)'); g.addColorStop(1, 'rgba(40,80,140,0.1)');
                    vx.fillStyle = g; vx.beginPath(); vx.arc(m.x, m.y, m.r, 0, Math.PI * 2); vx.fill();
                    // koi dot
                    vx.fillStyle = 'rgba(255,80,0,0.7)';
                    vx.beginPath(); vx.arc(m.x+srand()*m.r*0.4, m.y+srand()*m.r*0.4, 3, 0, Math.PI*2); vx.fill();
                });

                // ── takeaway rice container with chopsticks (3× size) ──
                const rcx = GW / 2, rcy = GH / 2 - 40;
                vx.save(); vx.translate(rcx, rcy); vx.scale(3, 3); vx.rotate(-0.1);
                // container body — white
                const cg = vx.createLinearGradient(-16, -10, 16, -10);
                cg.addColorStop(0, '#e8e8e8'); cg.addColorStop(0.5, '#ffffff'); cg.addColorStop(1, '#e8e8e8');
                vx.fillStyle = cg;
                vx.beginPath();
                vx.moveTo(-14, 20); vx.lineTo(-18, -10); vx.lineTo(18, -10); vx.lineTo(14, 20);
                vx.closePath(); vx.fill();
                // container outline
                vx.strokeStyle = '#bbb'; vx.lineWidth = 0.6;
                vx.beginPath();
                vx.moveTo(-14, 20); vx.lineTo(-18, -10); vx.lineTo(18, -10); vx.lineTo(14, 20);
                vx.closePath(); vx.stroke();
                // wire handle
                vx.strokeStyle = '#888'; vx.lineWidth = 1.2;
                vx.beginPath(); vx.arc(0, -10, 14, Math.PI + 0.3, -0.3); vx.stroke();
                // red sign — "Lee's Takeaway"
                vx.fillStyle = '#cc1111';
                vx.fillRect(-13, -4, 26, 16);
                vx.fillStyle = '#fff'; vx.font = 'bold 5px sans-serif'; vx.textAlign = 'center';
                vx.fillText("LEE'S", 0, 3);
                vx.fillText("TAKEAWAY", 0, 9);
                // rice peeking out top
                for (let i = 0; i < 7; i++) {
                    vx.fillStyle = '#f5f0e0';
                    vx.beginPath(); vx.arc(-10 + i * 3.5, -11 - Math.sin(i * 1.2) * 2, 2.5, 0, Math.PI * 2); vx.fill();
                }
                // chopsticks sticking out
                vx.strokeStyle = '#c8a050'; vx.lineWidth = 2; vx.lineCap = 'round';
                vx.beginPath(); vx.moveTo(-2, -12); vx.lineTo(-10, -36); vx.stroke();
                vx.beginPath(); vx.moveTo(3, -12); vx.lineTo(8, -34); vx.stroke();
                // chopstick tips
                vx.strokeStyle = '#e8c878'; vx.lineWidth = 1.5;
                vx.beginPath(); vx.moveTo(-10, -36); vx.lineTo(-11, -39); vx.stroke();
                vx.beginPath(); vx.moveTo(8, -34); vx.lineTo(9, -37); vx.stroke();
                vx.restore();

                // ── opened fortune cookie with message (2× size) ──
                const fcx = 820, fcy = 520;
                vx.save(); vx.translate(fcx, fcy); vx.scale(2, 2); vx.rotate(0.15);
                // left half of cracked cookie
                vx.fillStyle = '#e8b84c';
                vx.beginPath();
                vx.moveTo(-18, 4); vx.quadraticCurveTo(-22, -8, -10, -12);
                vx.quadraticCurveTo(-2, -14, 0, -4);
                vx.quadraticCurveTo(-4, 2, -18, 4);
                vx.closePath(); vx.fill();
                // left half shadow
                vx.fillStyle = '#d0a030';
                vx.beginPath();
                vx.moveTo(-16, 2); vx.quadraticCurveTo(-18, -4, -10, -8);
                vx.quadraticCurveTo(-6, -9, -3, -3);
                vx.quadraticCurveTo(-6, 1, -16, 2);
                vx.closePath(); vx.fill();
                // right half of cracked cookie (slightly separated)
                vx.fillStyle = '#e8b84c';
                vx.beginPath();
                vx.moveTo(18, 4); vx.quadraticCurveTo(22, -8, 10, -12);
                vx.quadraticCurveTo(2, -14, 0, -4);
                vx.quadraticCurveTo(4, 2, 18, 4);
                vx.closePath(); vx.fill();
                // right half highlight
                vx.fillStyle = '#f0c860';
                vx.beginPath();
                vx.moveTo(14, 0); vx.quadraticCurveTo(16, -6, 10, -9);
                vx.quadraticCurveTo(6, -10, 3, -4);
                vx.quadraticCurveTo(5, -1, 14, 0);
                vx.closePath(); vx.fill();
                // fortune paper strip poking out
                vx.save(); vx.rotate(-0.08);
                vx.fillStyle = '#fff';
                vx.beginPath();
                vx.moveTo(-28, 2); vx.lineTo(28, -2); vx.lineTo(29, 4); vx.lineTo(-27, 8);
                vx.closePath(); vx.fill();
                // paper shadow
                vx.fillStyle = 'rgba(0,0,0,0.06)';
                vx.fillRect(-26, 4, 54, 3);
                // fortune text
                vx.fillStyle = '#cc1111'; vx.font = 'bold 4.5px serif'; vx.textAlign = 'center';
                vx.fillText("If you're not first", 0, 3);
                vx.fillText("you're last", 0, 8);
                vx.restore();
                // crumbs
                vx.fillStyle = '#d8a840';
                for (let i = 0; i < 5; i++) {
                    vx.beginPath();
                    vx.arc(-8 + srand() * 16, 6 + srand() * 8, 0.8 + srand() * 1.2, 0, Math.PI * 2);
                    vx.fill();
                }
                vx.restore();


            } else if (theme === 'african') {
                // ── SAFARI RUSH: African savanna ──
                const skyGaf = vx.createLinearGradient(0,0,0,GH);
                skyGaf.addColorStop(0,'#c8a040'); skyGaf.addColorStop(1,'#e8c870');
                vx.fillStyle = skyGaf; vx.fillRect(0,0,GW,GH);
                for (let i = 0; i < 25; i++) {
                    vx.fillStyle = `rgba(${140+(srand()*40|0)},${100+(srand()*30|0)},${20+(srand()*20|0)},0.35)`;
                    vx.beginPath(); vx.ellipse(srand()*GW, srand()*GH, 30+srand()*60, 15+srand()*30, 0, 0, Math.PI*2); vx.fill();
                }
                const drawAcacia = (tx,ty,h) => {
                    vx.strokeStyle='#5a3010'; vx.lineWidth=5;
                    vx.beginPath(); vx.moveTo(tx,ty); vx.lineTo(tx,ty-h); vx.stroke();
                    vx.fillStyle='rgba(40,80,10,0.8)';
                    vx.beginPath(); vx.ellipse(tx,ty-h,h*0.7,h*0.25,0,0,Math.PI*2); vx.fill();
                };
                for (let i=0;i<8;i++) drawAcacia(srand()*GW, 200+srand()*(GH-250), 30+srand()*35);
                // elephant
                const aef_ex=160, aef_ey=520;
                vx.fillStyle='rgba(80,80,80,0.75)';
                vx.fillRect(aef_ex-30,aef_ey-50,60,50);
                vx.beginPath(); vx.arc(aef_ex+30,aef_ey-55,22,0,Math.PI*2); vx.fill();
                vx.fillRect(aef_ex+38,aef_ey-48,6,40);
                [aef_ex-22,aef_ex+4].forEach(lx=>{ vx.fillRect(lx,aef_ey,10,30); });
                // lion
                const aef_lx=760, aef_ly=300;
                vx.fillStyle='rgba(200,150,40,0.8)';
                vx.beginPath(); vx.arc(aef_lx,aef_ly,28,0,Math.PI*2); vx.fill();
                vx.fillStyle='rgba(220,175,60,0.9)';
                vx.beginPath(); vx.arc(aef_lx,aef_ly,20,0,Math.PI*2); vx.fill();
                vx.fillStyle='rgba(180,130,30,0.7)';
                vx.fillRect(aef_lx-45,aef_ly+5,55,18);
                vx.strokeStyle='#aa8855'; vx.lineWidth=t.rw+10; vx.lineCap='round'; vx.lineJoin='round'; vx.setLineDash([]);
                drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#8a6840'; vx.lineWidth=t.rw; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#7a5a30'; vx.lineWidth=t.rw-12; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#c8a040'; vx.lineWidth=1; vx.setLineDash([8,14]); drawPath(vx,wp); vx.stroke(); vx.setLineDash([]);
                t.mud.forEach(m => {
                    const g=vx.createRadialGradient(m.x,m.y,0,m.x,m.y,m.r);
                    g.addColorStop(0,'rgba(60,120,180,0.8)'); g.addColorStop(1,'rgba(40,90,140,0.1)');
                    vx.fillStyle=g; vx.beginPath(); vx.arc(m.x,m.y,m.r,0,Math.PI*2); vx.fill();
                });

            } else if (theme === 'arabic') {
                // ── DESERT MIRAGE: Middle-Eastern desert ──
                const skyGar = vx.createLinearGradient(0,0,0,GH);
                skyGar.addColorStop(0,'#87ceeb'); skyGar.addColorStop(0.5,'#e8c870'); skyGar.addColorStop(1,'#d4a848');
                vx.fillStyle=skyGar; vx.fillRect(0,0,GW,GH);
                for (let i=0;i<5;i++) {
                    const arDx=srand()*GW, arDy=400+srand()*200, arDw=120+srand()*200, arDh=40+srand()*60;
                    vx.fillStyle=`rgba(${200+(srand()*40|0)},${160+(srand()*30|0)},${80+(srand()*30|0)},0.6)`;
                    vx.beginPath(); vx.ellipse(arDx,arDy,arDw,arDh,0,Math.PI,Math.PI*2); vx.fill();
                }
                const drawMinaret = (mx,my,h) => {
                    vx.fillStyle='rgba(60,40,20,0.75)';
                    vx.fillRect(mx-8,my-h,16,h);
                    vx.beginPath(); vx.arc(mx,my-h,10,0,Math.PI*2); vx.fill();
                    vx.fillRect(mx-2,my-h-14,4,6);
                    vx.fillRect(mx-12,my-h*0.6,24,4);
                };
                drawMinaret(130,600,120); drawMinaret(870,560,90); drawMinaret(500,620,70);
                vx.strokeStyle='rgba(180,120,40,0.4)'; vx.lineWidth=1;
                for (let r=0;r<5;r++) for (let c=0;c<8;c++) {
                    const arTx=c*28+10, arTy=r*28+10;
                    vx.strokeRect(arTx,arTy,24,24);
                    vx.beginPath(); vx.moveTo(arTx+12,arTy); vx.lineTo(arTx+24,arTy+12);
                    vx.lineTo(arTx+12,arTy+24); vx.lineTo(arTx,arTy+12); vx.closePath(); vx.stroke();
                }
                vx.strokeStyle='#d4a848'; vx.lineWidth=t.rw+10; vx.lineCap='round'; vx.lineJoin='round'; vx.setLineDash([]);
                drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#b89030'; vx.lineWidth=t.rw; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#a07820'; vx.lineWidth=t.rw-12; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#e8c038'; vx.lineWidth=1; vx.setLineDash([8,14]); drawPath(vx,wp); vx.stroke(); vx.setLineDash([]);
                t.mud.forEach(m => {
                    const g=vx.createRadialGradient(m.x,m.y,0,m.x,m.y,m.r);
                    g.addColorStop(0,'rgba(20,160,160,0.8)'); g.addColorStop(1,'rgba(0,120,120,0.1)');
                    vx.fillStyle=g; vx.beginPath(); vx.arc(m.x,m.y,m.r,0,Math.PI*2); vx.fill();
                });

            } else if (theme === 'brazil') {
                // ── COPACABANA CRUNCH: Brazilian beach ──
                const skyGbr = vx.createLinearGradient(0,0,0,GH*0.55);
                skyGbr.addColorStop(0,'#4aa8e8'); skyGbr.addColorStop(1,'#87ceeb');
                vx.fillStyle=skyGbr; vx.fillRect(0,0,GW,GH*0.55);
                const sandGbr = vx.createLinearGradient(0,GH*0.5,0,GH);
                sandGbr.addColorStop(0,'#f0d060'); sandGbr.addColorStop(1,'#e8c040');
                vx.fillStyle=sandGbr; vx.fillRect(0,GH*0.5,GW,GH*0.5);
                vx.fillStyle='rgba(30,130,200,0.7)'; vx.fillRect(0,GH*0.48,GW,GH*0.1);
                vx.strokeStyle='rgba(255,255,255,0.5)'; vx.lineWidth=2;
                for (let w=0;w<3;w++) {
                    vx.beginPath(); vx.moveTo(0,GH*0.5+w*8);
                    for (let brWx=0;brWx<GW;brWx+=40) vx.quadraticCurveTo(brWx+20,GH*0.48+w*8-6,brWx+40,GH*0.5+w*8);
                    vx.stroke();
                }
                // beach towel stripes
                vx.save(); vx.translate(800,550); vx.rotate(0.2);
                ['#e03030','#fff','#3060c8','#fff','#e03030'].forEach((c,i)=>{ vx.fillStyle=c; vx.fillRect(0,i*8,70,8); });
                vx.restore();
                // Brazilian flag towel
                vx.save(); vx.translate(120,560); vx.rotate(-0.15);
                vx.fillStyle='#009c3b'; vx.fillRect(0,0,60,36);
                vx.fillStyle='#fedf00'; vx.beginPath(); vx.moveTo(30,4); vx.lineTo(56,18); vx.lineTo(30,32); vx.lineTo(4,18); vx.closePath(); vx.fill();
                vx.fillStyle='#002776'; vx.beginPath(); vx.arc(30,18,8,0,Math.PI*2); vx.fill();
                vx.restore();
                // pink bikini bra
                vx.save(); vx.translate(440,620); vx.rotate(0.3);
                vx.fillStyle='#ff69b4';
                vx.beginPath(); vx.ellipse(-10,0,14,8,0,0,Math.PI*2); vx.fill();
                vx.beginPath(); vx.ellipse(10,0,14,8,0,0,Math.PI*2); vx.fill();
                vx.strokeStyle='#ff1493'; vx.lineWidth=1.5;
                vx.beginPath(); vx.moveTo(-24,0); vx.lineTo(-10,-4); vx.lineTo(0,1); vx.lineTo(10,-4); vx.lineTo(24,0); vx.stroke();
                vx.restore();
                vx.strokeStyle='#e8c060'; vx.lineWidth=t.rw+10; vx.lineCap='round'; vx.lineJoin='round'; vx.setLineDash([]);
                drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#d0a840'; vx.lineWidth=t.rw; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#c09030'; vx.lineWidth=t.rw-12; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#ffffa0'; vx.lineWidth=1; vx.setLineDash([8,14]); drawPath(vx,wp); vx.stroke(); vx.setLineDash([]);
                t.mud.forEach(m => {
                    const g=vx.createRadialGradient(m.x,m.y,0,m.x,m.y,m.r);
                    g.addColorStop(0,'rgba(80,60,20,0.7)'); g.addColorStop(1,'rgba(60,40,10,0.1)');
                    vx.fillStyle=g; vx.beginPath(); vx.arc(m.x,m.y,m.r,0,Math.PI*2); vx.fill();
                });

            } else if (theme === 'country') {
                // ── LONE STAR RALLY: Texas cowboy ──
                const skyGco = vx.createLinearGradient(0,0,0,GH*0.5);
                skyGco.addColorStop(0,'#4a90d0'); skyGco.addColorStop(1,'#87ceeb');
                vx.fillStyle=skyGco; vx.fillRect(0,0,GW,GH*0.5);
                vx.fillStyle='#6aa040'; vx.fillRect(0,GH*0.45,GW,GH*0.55);
                for (let i=0;i<20;i++) {
                    vx.fillStyle=`rgba(${80+(srand()*40|0)},${120+(srand()*40|0)},${20+(srand()*20|0)},0.5)`;
                    vx.beginPath(); vx.arc(srand()*GW,GH*0.5+srand()*GH*0.45,10+srand()*25,0,Math.PI*2); vx.fill();
                }
                for (let f=0;f<12;f++) {
                    const coFx=50+f*80, coFy=430+srand()*40;
                    vx.fillStyle='#8a5a28'; vx.fillRect(coFx-3,coFy,6,40);
                    vx.fillRect(coFx-10,coFy+8,20,4); vx.fillRect(coFx-10,coFy+18,20,4);
                }
                // cowboy hat
                vx.fillStyle='#5a3010';
                vx.beginPath(); vx.ellipse(700,288,55,12,0,0,Math.PI*2); vx.fill();
                vx.fillRect(682,250,36,38);
                vx.beginPath(); vx.ellipse(700,250,18,8,0,0,Math.PI*2); vx.fill();
                vx.fillStyle='#c8a060'; vx.fillRect(682,270,36,4);
                // Jack Daniels bottle
                vx.fillStyle='#1a1a1a'; vx.fillRect(190,530,20,50);
                vx.fillRect(195,515,10,18);
                vx.fillStyle='#333'; vx.fillRect(188,562,24,4);
                vx.fillStyle='#fff'; vx.font='bold 4px sans-serif'; vx.textAlign='center';
                vx.fillText('JACK',200,572); vx.fillText("DANIEL'S",200,578);
                vx.fillStyle='#888'; vx.beginPath(); vx.arc(200,515,5,0,Math.PI*2); vx.fill();
                vx.strokeStyle='#9a7040'; vx.lineWidth=t.rw+10; vx.lineCap='round'; vx.lineJoin='round'; vx.setLineDash([]);
                drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#7a5020'; vx.lineWidth=t.rw; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#6a4010'; vx.lineWidth=t.rw-12; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#d0a040'; vx.lineWidth=1; vx.setLineDash([8,14]); drawPath(vx,wp); vx.stroke(); vx.setLineDash([]);
                t.mud.forEach(m => {
                    const g=vx.createRadialGradient(m.x,m.y,0,m.x,m.y,m.r);
                    g.addColorStop(0,'rgba(60,40,10,0.9)'); g.addColorStop(1,'rgba(40,20,0,0.15)');
                    vx.fillStyle=g; vx.beginPath(); vx.arc(m.x,m.y,m.r,0,Math.PI*2); vx.fill();
                });

            } else if (theme === 'christmas') {
                // ── JINGLE RALLY: Christmas snow ──
                vx.fillStyle='#dce8f8'; vx.fillRect(0,0,GW,GH);
                for (let i=0;i<40;i++) {
                    vx.fillStyle=`rgba(255,255,255,${0.4+srand()*0.5})`;
                    vx.beginPath(); vx.arc(srand()*GW,srand()*GH,15+srand()*50,0,Math.PI*2); vx.fill();
                }
                for (let i=0;i<60;i++) {
                    const xmSx=srand()*GW, xmSy=srand()*GH, xmSr=2+srand()*4;
                    vx.strokeStyle=`rgba(200,220,255,${0.5+srand()*0.5})`; vx.lineWidth=1;
                    for (let a=0;a<3;a++) {
                        const xmAng=a*Math.PI/3;
                        vx.beginPath(); vx.moveTo(xmSx+Math.cos(xmAng)*xmSr,xmSy+Math.sin(xmAng)*xmSr);
                        vx.lineTo(xmSx-Math.cos(xmAng)*xmSr,xmSy-Math.sin(xmAng)*xmSr); vx.stroke();
                    }
                }
                // Christmas table
                const xmTx=GW/2-80, xmTy=GH/2-60;
                vx.fillStyle='#8a5a28'; vx.fillRect(xmTx,xmTy,160,90);
                vx.fillStyle='#c8a060'; vx.fillRect(xmTx+4,xmTy+4,152,82);
                [[xmTx+30,xmTy+35],[xmTx+90,xmTy+35],[xmTx+60,xmTy+20]].forEach(([px,py])=>{
                    vx.fillStyle='#eee'; vx.beginPath(); vx.arc(px,py,16,0,Math.PI*2); vx.fill();
                    vx.fillStyle='rgba(180,100,30,0.8)'; vx.beginPath(); vx.arc(px,py,10,0,Math.PI*2); vx.fill();
                });
                // Christmas cracker
                vx.save(); vx.translate(xmTx+145,xmTy+45); vx.rotate(0.4);
                vx.fillStyle='#cc0000'; vx.fillRect(-35,-8,70,16);
                vx.fillStyle='#ffcc00'; vx.fillRect(-33,-6,66,12);
                vx.fillStyle='#cc0000';
                vx.beginPath(); vx.ellipse(-35,0,10,5,0.5,0,Math.PI*2); vx.fill();
                vx.beginPath(); vx.ellipse(35,0,10,5,-0.5,0,Math.PI*2); vx.fill();
                vx.fillStyle='#fff'; vx.font='bold 5px sans-serif'; vx.textAlign='center';
                vx.fillText('POP!',0,3);
                vx.restore();
                // Christmas lights
                vx.strokeStyle='#555'; vx.lineWidth=1;
                vx.beginPath(); vx.moveTo(0,28);
                for (let l=0;l<GW;l+=30) vx.quadraticCurveTo(l+15,30+srand()*12,l+30,28+srand()*8);
                vx.stroke();
                ['#ff0000','#ffcc00','#00cc00','#0044ff','#ff6600'].forEach((c,li)=>{
                    vx.fillStyle=c; vx.beginPath(); vx.arc(li*30+15,34,5,0,Math.PI*2); vx.fill();
                });
                vx.strokeStyle='#c0d0e0'; vx.lineWidth=t.rw+10; vx.lineCap='round'; vx.lineJoin='round'; vx.setLineDash([]);
                drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#a0b8c8'; vx.lineWidth=t.rw; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#90a8b8'; vx.lineWidth=t.rw-12; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#ff0000'; vx.lineWidth=1; vx.setLineDash([8,14]); drawPath(vx,wp); vx.stroke(); vx.setLineDash([]);
                t.mud.forEach(m => {
                    const g=vx.createRadialGradient(m.x,m.y,0,m.x,m.y,m.r);
                    g.addColorStop(0,'rgba(180,210,240,0.8)'); g.addColorStop(1,'rgba(160,200,230,0.1)');
                    vx.fillStyle=g; vx.beginPath(); vx.arc(m.x,m.y,m.r,0,Math.PI*2); vx.fill();
                });

            } else if (theme === 'indian') {
                // ── CURRY CORNER: Indian restaurant / Diwali ──
                const bgIn=vx.createLinearGradient(0,0,0,GH);
                bgIn.addColorStop(0,'#aa3300'); bgIn.addColorStop(0.5,'#cc6600'); bgIn.addColorStop(1,'#ff9933');
                vx.fillStyle=bgIn; vx.fillRect(0,0,GW,GH);
                for (let i=0;i<18;i++) {
                    const inDx=srand()*GW, inDy=srand()*GH;
                    vx.fillStyle='rgba(210,140,30,0.8)';
                    vx.beginPath(); vx.ellipse(inDx,inDy,8,5,0,0,Math.PI*2); vx.fill();
                    vx.fillStyle='rgba(255,200,0,0.9)';
                    vx.beginPath(); vx.ellipse(inDx,inDy-7,3,7,0,0,Math.PI*2); vx.fill();
                    vx.fillStyle='rgba(255,120,0,0.6)';
                    vx.beginPath(); vx.ellipse(inDx,inDy-9,2,5,0,0,Math.PI*2); vx.fill();
                }
                // curry plate
                vx.fillStyle='#e8e0d0'; vx.beginPath(); vx.arc(GW/2,GH/2+20,45,0,Math.PI*2); vx.fill();
                vx.fillStyle='#c86020'; vx.beginPath(); vx.arc(GW/2,GH/2+20,32,0,Math.PI*2); vx.fill();
                vx.fillStyle='rgba(255,200,100,0.7)'; vx.beginPath(); vx.arc(GW/2-8,GH/2+15,10,0,Math.PI*2); vx.fill();
                // naan
                vx.save(); vx.translate(GW/2+75,GH/2+30); vx.rotate(0.3);
                vx.fillStyle='#d4a860';
                vx.beginPath(); vx.ellipse(0,0,35,22,0,0,Math.PI*2); vx.fill();
                vx.strokeStyle='#b08040'; vx.lineWidth=1;
                vx.beginPath(); vx.moveTo(-20,-5); vx.quadraticCurveTo(0,-12,20,-5); vx.stroke();
                vx.beginPath(); vx.moveTo(-15,5); vx.quadraticCurveTo(0,12,15,5); vx.stroke();
                vx.restore();
                vx.strokeStyle='#cc7722'; vx.lineWidth=t.rw+10; vx.lineCap='round'; vx.lineJoin='round'; vx.setLineDash([]);
                drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#aa5500'; vx.lineWidth=t.rw; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#993300'; vx.lineWidth=t.rw-12; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#ffcc00'; vx.lineWidth=1; vx.setLineDash([8,14]); drawPath(vx,wp); vx.stroke(); vx.setLineDash([]);
                t.mud.forEach(m => {
                    const g=vx.createRadialGradient(m.x,m.y,0,m.x,m.y,m.r);
                    g.addColorStop(0,'rgba(200,100,20,0.85)'); g.addColorStop(1,'rgba(180,80,10,0.1)');
                    vx.fillStyle=g; vx.beginPath(); vx.arc(m.x,m.y,m.r,0,Math.PI*2); vx.fill();
                });

            } else if (theme === 'italian') {
                // ── BELLA STRADA: Italian countryside ──
                const skyGit = vx.createLinearGradient(0,0,0,GH*0.5);
                skyGit.addColorStop(0,'#5090d0'); skyGit.addColorStop(1,'#87ceeb');
                vx.fillStyle=skyGit; vx.fillRect(0,0,GW,GH*0.5);
                vx.fillStyle='#a8c070'; vx.fillRect(0,GH*0.45,GW,GH*0.55);
                // vineyard rows
                for (let r=0;r<4;r++) {
                    const itVy=GH*0.5+r*40;
                    vx.strokeStyle='rgba(60,90,20,0.5)'; vx.lineWidth=1.5;
                    vx.beginPath(); vx.moveTo(50,itVy); vx.lineTo(350,itVy); vx.stroke();
                    for(let p=60;p<350;p+=30){vx.fillStyle='rgba(40,80,20,0.6)';vx.beginPath();vx.arc(p,itVy-4,5,0,Math.PI*2);vx.fill();}
                }
                // wine glass
                const itWgx=GW-160, itWgy=300;
                vx.strokeStyle='rgba(200,40,40,0.8)'; vx.lineWidth=2;
                vx.beginPath(); vx.moveTo(itWgx,itWgy+40); vx.lineTo(itWgx,itWgy+55); vx.stroke();
                vx.beginPath(); vx.moveTo(itWgx-12,itWgy+56); vx.lineTo(itWgx+12,itWgy+56); vx.stroke();
                vx.fillStyle='rgba(180,20,20,0.75)';
                vx.beginPath(); vx.moveTo(itWgx-18,itWgy); vx.quadraticCurveTo(itWgx-18,itWgy+35,itWgx,itWgy+40);
                vx.quadraticCurveTo(itWgx+18,itWgy+35,itWgx+18,itWgy); vx.closePath(); vx.fill();
                vx.fillStyle='rgba(255,80,80,0.2)'; vx.beginPath(); vx.arc(itWgx-6,itWgy+12,5,0,Math.PI*2); vx.fill();
                // olive branch
                vx.strokeStyle='#5a7a20'; vx.lineWidth=3;
                vx.beginPath(); vx.moveTo(300,520); vx.quadraticCurveTo(340,490,380,510); vx.stroke();
                [[320,510],[345,498],[368,506]].forEach(([olx,oly])=>{
                    vx.fillStyle='#2a5a10'; vx.beginPath(); vx.ellipse(olx,oly,10,5,-0.4,0,Math.PI*2); vx.fill();
                    vx.fillStyle='#1a3a08'; vx.beginPath(); vx.ellipse(olx,oly,4,7,0.3,0,Math.PI*2); vx.fill();
                });
                vx.strokeStyle='#c0a878'; vx.lineWidth=t.rw+10; vx.lineCap='round'; vx.lineJoin='round'; vx.setLineDash([]);
                drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#a09070'; vx.lineWidth=t.rw; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#908060'; vx.lineWidth=t.rw-12; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#cc3333'; vx.lineWidth=1; vx.setLineDash([8,14]); drawPath(vx,wp); vx.stroke(); vx.setLineDash([]);
                t.mud.forEach(m => {
                    const g=vx.createRadialGradient(m.x,m.y,0,m.x,m.y,m.r);
                    g.addColorStop(0,'rgba(120,20,20,0.75)'); g.addColorStop(1,'rgba(80,10,10,0.1)');
                    vx.fillStyle=g; vx.beginPath(); vx.arc(m.x,m.y,m.r,0,Math.PI*2); vx.fill();
                });

            } else if (theme === 'casino') {
                // ── LOOSE SLOPS: Craps table / Las Vegas ──
                vx.fillStyle='#0d3d0d'; vx.fillRect(0,0,GW,GH); // dark felt base
                // felt texture patches
                for (let i=0;i<30;i++) {
                    vx.fillStyle=`rgba(${20+(srand()*20|0)},${80+(srand()*30|0)},${20+(srand()*20|0)},0.3)`;
                    vx.beginPath(); vx.arc(srand()*GW,srand()*GH,20+srand()*60,0,Math.PI*2); vx.fill();
                }
                // craps table border lines
                vx.strokeStyle='rgba(255,215,0,0.6)'; vx.lineWidth=3;
                vx.strokeRect(40,40,GW-80,GH-80);
                vx.strokeRect(60,60,GW-120,GH-120);
                // LOOSE SLOPS text zones
                vx.fillStyle='rgba(0,80,0,0.5)'; vx.fillRect(80,200,200,80);
                vx.strokeStyle='rgba(255,215,0,0.5)'; vx.lineWidth=1; vx.strokeRect(80,200,200,80);
                vx.fillStyle='rgba(255,215,0,0.8)'; vx.font='bold 11px monospace'; vx.textAlign='center';
                vx.fillText('LOOSE SLOPS',180,248);
                // Pass line, Don't Pass
                vx.fillStyle='rgba(255,255,255,0.08)'; vx.fillRect(80,140,GW-160,50);
                vx.fillStyle='rgba(255,215,0,0.5)'; vx.font='7px monospace'; vx.textAlign='center';
                vx.fillText('PASS LINE',GW/2,170);
                // dice stored for runtime physics — draw placeholder silhouettes
                const casinoDicePos = [{x:320,y:360,r:22},{x:680,y:480,r:22},{x:500,y:200,r:20},{x:820,y:320,r:18},{x:160,y:540,r:20}];
                t.casinoDice = casinoDicePos.map(d=>({...d, vx:0, vy:0, face:srand()*6+1|0, spin:0}));
                // road — dark green felt
                vx.strokeStyle='#2a6a2a'; vx.lineWidth=t.rw+10; vx.lineCap='round'; vx.lineJoin='round'; vx.setLineDash([]);
                drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#1a4a1a'; vx.lineWidth=t.rw; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#143a14'; vx.lineWidth=t.rw-12; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='rgba(255,215,0,0.6)'; vx.lineWidth=1; vx.setLineDash([8,14]); drawPath(vx,wp); vx.stroke(); vx.setLineDash([]);
                t.mud.forEach(m => {
                    // chip piles
                    const g=vx.createRadialGradient(m.x,m.y,0,m.x,m.y,m.r);
                    g.addColorStop(0,'rgba(255,215,0,0.6)'); g.addColorStop(1,'rgba(200,160,0,0.1)');
                    vx.fillStyle=g; vx.beginPath(); vx.arc(m.x,m.y,m.r,0,Math.PI*2); vx.fill();
                    for(let ch=0;ch<5;ch++){
                        vx.strokeStyle=['#e00','#00e','#0e0','#ee0','#e0e'][ch];vx.lineWidth=2;
                        vx.beginPath();vx.arc(m.x,m.y,m.r-ch*3,0,Math.PI*2);vx.stroke();
                    }
                });

            } else if (theme === 'irish') {
                // ── SHAMROCK SPRINT: Ireland ──
                vx.fillStyle='#2a7a18'; vx.fillRect(0,0,GW,GH);
                // rolling hills
                vx.fillStyle='rgba(40,110,25,0.5)';
                [[200,GH,350,0],[600,GH,280,0],[900,GH,300,0]].forEach(([hx,hy,hw,off])=>{
                    vx.beginPath(); vx.arc(hx+off,hy,hw,Math.PI,Math.PI*2); vx.fill();
                });
                // four-leaf clovers
                const drawClover = (cx3,cy3,r) => {
                    vx.fillStyle='rgba(30,150,20,0.8)';
                    [[0,-1],[1,0],[0,1],[-1,0]].forEach(([dx,dy])=>{
                        vx.beginPath(); vx.arc(cx3+dx*r,cy3+dy*r,r,0,Math.PI*2); vx.fill();
                    });
                    vx.fillStyle='rgba(20,120,10,0.5)'; vx.lineWidth=1;
                    vx.beginPath(); vx.moveTo(cx3,cy3+r); vx.quadraticCurveTo(cx3+r*0.5,cy3+r*2.5,cx3,cy3+r*3); vx.stroke();
                };
                for (let i=0;i<14;i++) drawClover(srand()*GW, srand()*GH, 7+srand()*8);
                // Guinness pint
                const gpx=800, gpy=250;
                vx.fillStyle='#111';
                vx.beginPath(); vx.moveTo(gpx-18,gpy+60); vx.lineTo(gpx-15,gpy); vx.lineTo(gpx+15,gpy); vx.lineTo(gpx+18,gpy+60); vx.closePath(); vx.fill();
                vx.fillStyle='#fdf5d0'; // cream head
                vx.beginPath(); vx.ellipse(gpx,gpy,15,8,0,0,Math.PI*2); vx.fill();
                vx.fillStyle='#333';
                vx.beginPath(); vx.moveTo(gpx-14,gpy+5); vx.lineTo(gpx-16,gpy+60); vx.lineTo(gpx+16,gpy+60); vx.lineTo(gpx+14,gpy+5); vx.closePath(); vx.fill();
                vx.strokeStyle='rgba(255,255,200,0.3)'; vx.lineWidth=1;
                vx.beginPath(); vx.moveTo(gpx-8,gpy+10); vx.lineTo(gpx-10,gpy+55); vx.stroke(); // bubble stream
                vx.strokeStyle='#888'; vx.lineWidth=1;
                vx.strokeRect(gpx-18,gpy-8,36,68);
                vx.strokeStyle='#888'; vx.lineWidth=t.rw+10; vx.lineCap='round'; vx.lineJoin='round'; vx.setLineDash([]);
                drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#666'; vx.lineWidth=t.rw; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#555'; vx.lineWidth=t.rw-12; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#fff'; vx.lineWidth=1; vx.setLineDash([8,14]); drawPath(vx,wp); vx.stroke(); vx.setLineDash([]);
                t.mud.forEach(m => {
                    const g=vx.createRadialGradient(m.x,m.y,0,m.x,m.y,m.r);
                    g.addColorStop(0,'rgba(40,20,10,0.9)'); g.addColorStop(1,'rgba(30,15,5,0.1)');
                    vx.fillStyle=g; vx.beginPath(); vx.arc(m.x,m.y,m.r,0,Math.PI*2); vx.fill();
                });

            } else if (theme === 'mexican') {
                // ── EL GRANDE LOOP: Mexico ──
                const skyGmx = vx.createLinearGradient(0,0,0,GH*0.5);
                skyGmx.addColorStop(0,'#3080c8'); skyGmx.addColorStop(1,'#87ceeb');
                vx.fillStyle=skyGmx; vx.fillRect(0,0,GW,GH*0.5);
                vx.fillStyle='#c8783a'; vx.fillRect(0,GH*0.45,GW,GH*0.55);
                for (let i=0;i<15;i++) {
                    vx.fillStyle=`rgba(${160+(srand()*40|0)},${90+(srand()*30|0)},${30+(srand()*20|0)},0.4)`;
                    vx.beginPath(); vx.arc(srand()*GW,GH*0.5+srand()*GH*0.45,10+srand()*30,0,Math.PI*2); vx.fill();
                }
                // sombrero
                const mxHx=700, mxHy=260;
                vx.fillStyle='#c8a020';
                vx.beginPath(); vx.ellipse(mxHx,mxHy+10,75,14,0,0,Math.PI*2); vx.fill(); // brim
                vx.fillRect(mxHx-22,mxHy-35,44,45); // crown
                vx.beginPath(); vx.ellipse(mxHx,mxHy-35,22,10,0,0,Math.PI*2); vx.fill(); // top
                vx.fillStyle='#cc3300'; vx.fillRect(mxHx-22,mxHy-12,44,5); // band
                // chips and guacamole
                const mxCx=200, mxCy=540;
                vx.fillStyle='#3a7a20'; vx.beginPath(); vx.ellipse(mxCx,mxCy,30,20,0,0,Math.PI*2); vx.fill(); // guac bowl
                vx.fillStyle='#4a9a28'; vx.beginPath(); vx.ellipse(mxCx,mxCy,22,14,0,0,Math.PI*2); vx.fill();
                for(let ch=0;ch<8;ch++){
                    vx.fillStyle='#e8c060'; vx.save(); vx.translate(mxCx+40+srand()*30,mxCy-10+srand()*20); vx.rotate(srand()*Math.PI);
                    vx.beginPath(); vx.moveTo(-12,-6); vx.lineTo(12,-6); vx.lineTo(8,6); vx.lineTo(-8,6); vx.closePath(); vx.fill();
                    vx.restore();
                }
                // Corona bottle
                const mxBx=860, mxBy=500;
                vx.fillStyle='rgba(220,200,100,0.7)'; vx.fillRect(mxBx-8,mxBy-60,16,60);
                vx.fillRect(mxBx-5,mxBy-75,10,18);
                vx.strokeStyle='rgba(180,160,60,0.8)'; vx.lineWidth=1; vx.strokeRect(mxBx-8,mxBy-60,16,60);
                vx.fillStyle='rgba(255,255,255,0.5)'; vx.font='bold 4px sans-serif'; vx.textAlign='center';
                vx.fillText('CORONA',mxBx,mxBy-30);
                vx.fillStyle='#ccc'; vx.beginPath(); vx.arc(mxBx,mxBy-75,5,0,Math.PI*2); vx.fill();
                // ants marching around the dusty plaza
                for (let i = 0; i < 26; i++) drawAnt(srand()*GW, srand()*GH, srand()*Math.PI*2, 2.2 + srand()*1.4);
                vx.strokeStyle='#cc8830'; vx.lineWidth=t.rw+10; vx.lineCap='round'; vx.lineJoin='round'; vx.setLineDash([]);
                drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#aa6618'; vx.lineWidth=t.rw; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#884408'; vx.lineWidth=t.rw-12; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#ffcc00'; vx.lineWidth=1; vx.setLineDash([8,14]); drawPath(vx,wp); vx.stroke(); vx.setLineDash([]);
                t.mud.forEach(m => {
                    const g=vx.createRadialGradient(m.x,m.y,0,m.x,m.y,m.r);
                    g.addColorStop(0,'rgba(200,80,20,0.8)'); g.addColorStop(1,'rgba(160,60,10,0.1)');
                    vx.fillStyle=g; vx.beginPath(); vx.arc(m.x,m.y,m.r,0,Math.PI*2); vx.fill();
                });

            } else if (theme === 'reggae') {
                // ── IRIE CIRCUIT: Reggae / Jamaica ──
                // bold alternating horizontal stripes
                const rgStripes=['#009900','#000000','#ffcc00','#000000','#cc0000','#000000','#009900'];
                rgStripes.forEach((c,i)=>{ vx.fillStyle=c; vx.fillRect(0,i*(GH/rgStripes.length),GW,GH/rgStripes.length+2); });
                // diagonal stripe accents
                for (let d=0;d<GW+GH;d+=90) {
                    vx.strokeStyle='rgba(255,204,0,0.12)'; vx.lineWidth=30;
                    vx.beginPath(); vx.moveTo(d,0); vx.lineTo(d-GH,GH); vx.stroke();
                }
                // Rasta star / geometric
                vx.strokeStyle='rgba(255,204,0,0.3)'; vx.lineWidth=2;
                const rgStarCx=GW/2, rgStarCy=GH/2, rgStarR=80;
                for(let p=0;p<5;p++){
                    const a1=p*Math.PI*2/5-Math.PI/2, a2=(p+2)*Math.PI*2/5-Math.PI/2;
                    vx.beginPath(); vx.moveTo(rgStarCx+Math.cos(a1)*rgStarR,rgStarCy+Math.sin(a1)*rgStarR);
                    vx.lineTo(rgStarCx+Math.cos(a2)*rgStarR,rgStarCy+Math.sin(a2)*rgStarR); vx.stroke();
                }
                // road — black with reggae yellow dashes
                if (t.water) this.drawTrackWater(vx, t.water);
                vx.strokeStyle='#333'; vx.lineWidth=t.rw+10; vx.lineCap='round'; vx.lineJoin='round'; vx.setLineDash([]);
                drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#111'; vx.lineWidth=t.rw; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#0a0a0a'; vx.lineWidth=t.rw-12; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#ffcc00'; vx.lineWidth=2; vx.setLineDash([8,14]); drawPath(vx,wp); vx.stroke(); vx.setLineDash([]);
                t.mud.forEach(m => {
                    const g=vx.createRadialGradient(m.x,m.y,0,m.x,m.y,m.r);
                    g.addColorStop(0,'rgba(0,0,0,0.85)'); g.addColorStop(1,'rgba(0,0,0,0.1)');
                    vx.fillStyle=g; vx.beginPath(); vx.arc(m.x,m.y,m.r,0,Math.PI*2); vx.fill();
                });

            } else if (theme === 'spanish') {
                // ── OLÉ DASH: Spain / Bullfighting ──
                const skyGsp = vx.createLinearGradient(0,0,0,GH*0.5);
                skyGsp.addColorStop(0,'#d06010'); skyGsp.addColorStop(1,'#e8a050');
                vx.fillStyle=skyGsp; vx.fillRect(0,0,GW,GH*0.5);
                vx.fillStyle='#c89050'; vx.fillRect(0,GH*0.45,GW,GH*0.55); // arena sand
                // arena circular pattern
                vx.strokeStyle='rgba(160,80,20,0.25)'; vx.lineWidth=2;
                [140,220,300,380].forEach(r=>{ vx.beginPath(); vx.arc(GW/2,GH,r,Math.PI,Math.PI*2); vx.stroke(); });
                // bullfighting poster
                const spPx=GW-200, spPy=120;
                vx.fillStyle='#e8d0a0'; vx.fillRect(spPx,spPy,120,160);
                vx.strokeStyle='#cc2200'; vx.lineWidth=4; vx.strokeRect(spPx,spPy,120,160);
                vx.fillStyle='#cc2200'; vx.fillRect(spPx,spPy,120,30);
                vx.fillStyle='#fff'; vx.font='bold 9px sans-serif'; vx.textAlign='center';
                vx.fillText('GRAN CORRIDA',spPx+60,spPy+19);
                // bull silhouette
                vx.fillStyle='rgba(30,10,0,0.85)';
                vx.fillRect(spPx+20,spPy+50,70,35); // body
                vx.beginPath(); vx.arc(spPx+85,spPy+50,18,0,Math.PI*2); vx.fill(); // head
                vx.fillRect(spPx+14,spPy+80,10,25); vx.fillRect(spPx+36,spPy+80,10,25); // back legs
                vx.fillRect(spPx+60,spPy+80,10,25); vx.fillRect(spPx+78,spPy+80,10,25); // front legs
                vx.fillStyle='#1a0500';
                vx.beginPath(); vx.moveTo(spPx+96,spPy+38); vx.lineTo(spPx+112,spPy+30); // horns
                vx.moveTo(spPx+96,spPy+44); vx.lineTo(spPx+108,spPy+52); vx.stroke();
                vx.fillStyle='#cc2200'; vx.font='10px sans-serif'; vx.textAlign='center';
                vx.fillText('OL\u00c9!',spPx+60,spPy+140);
                // matador cape stripe
                vx.save(); vx.translate(200,500); vx.rotate(-0.2);
                vx.fillStyle='#cc2200'; vx.fillRect(0,0,60,80);
                vx.fillStyle='#ffcc00'; vx.fillRect(0,0,8,80); vx.fillRect(52,0,8,80);
                vx.restore();
                if (t.water) this.drawTrackWater(vx, t.water);
                vx.strokeStyle='#d0a060'; vx.lineWidth=t.rw+10; vx.lineCap='round'; vx.lineJoin='round'; vx.setLineDash([]);
                drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#b08040'; vx.lineWidth=t.rw; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#a07030'; vx.lineWidth=t.rw-12; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#cc2200'; vx.lineWidth=1; vx.setLineDash([8,14]); drawPath(vx,wp); vx.stroke(); vx.setLineDash([]);
                t.mud.forEach(m => {
                    const g=vx.createRadialGradient(m.x,m.y,0,m.x,m.y,m.r);
                    g.addColorStop(0,'rgba(80,40,10,0.85)'); g.addColorStop(1,'rgba(60,30,5,0.1)');
                    vx.fillStyle=g; vx.beginPath(); vx.arc(m.x,m.y,m.r,0,Math.PI*2); vx.fill();
                });

            } else if (theme === 'jungle') {
                // ── JUNGLE JAMBOREE: Dense jungle ──
                vx.fillStyle='#0d3a08'; vx.fillRect(0,0,GW,GH);
                for (let i=0;i<35;i++) {
                    vx.fillStyle=`rgba(${15+(srand()*20|0)},${60+(srand()*40|0)},${10+(srand()*20|0)},0.5)`;
                    vx.beginPath(); vx.arc(srand()*GW,srand()*GH,20+srand()*70,0,Math.PI*2); vx.fill();
                }
                // jungle trees
                const drawJungleTree = (jx,jy,jh) => {
                    vx.fillStyle='#4a2808'; vx.fillRect(jx-5,jy-jh,10,jh);
                    vx.fillStyle=`rgba(${20+(srand()*20|0)},${100+(srand()*40|0)},${10+(srand()*15|0)},0.85)`;
                    vx.beginPath(); vx.arc(jx,jy-jh,jh*0.5,0,Math.PI*2); vx.fill();
                    vx.fillStyle=`rgba(${30+(srand()*20|0)},${130+(srand()*40|0)},${20+(srand()*15|0)},0.7)`;
                    vx.beginPath(); vx.arc(jx+srand()*20-10,jy-jh-jh*0.25,jh*0.38,0,Math.PI*2); vx.fill();
                };
                for (let i=0;i<12;i++) drawJungleTree(srand()*GW, srand()*GH*0.8+GH*0.1, 40+srand()*50);
                // hanging vines
                vx.strokeStyle='rgba(30,100,10,0.6)'; vx.lineWidth=2;
                for (let v=0;v<8;v++) {
                    const jvx=srand()*GW, jvh=80+srand()*120;
                    vx.beginPath(); vx.moveTo(jvx,0);
                    vx.quadraticCurveTo(jvx+20,jvh*0.5,jvx+5,jvh); vx.stroke();
                    vx.fillStyle='rgba(20,130,10,0.6)';
                    for(let lv=0;lv<3;lv++){vx.beginPath();vx.ellipse(jvx+5+lv*3,jvh*0.25+lv*jvh*0.25,8,5,0.5,0,Math.PI*2);vx.fill();}
                }
                // swinging monkeys
                const drawMonkey = (jmx,jmy) => {
                    vx.fillStyle='rgba(80,50,20,0.85)';
                    vx.beginPath(); vx.arc(jmx,jmy,10,0,Math.PI*2); vx.fill(); // body
                    vx.beginPath(); vx.arc(jmx,jmy-12,7,0,Math.PI*2); vx.fill(); // head
                    vx.fillStyle='rgba(120,80,40,0.8)';
                    vx.beginPath(); vx.arc(jmx,jmy-11,4,0,Math.PI*2); vx.fill(); // face
                    // arms up (holding vine)
                    vx.strokeStyle='rgba(80,50,20,0.85)'; vx.lineWidth=2;
                    vx.beginPath(); vx.moveTo(jmx-8,jmy-8); vx.lineTo(jmx-14,jmy-22); vx.stroke();
                    vx.beginPath(); vx.moveTo(jmx+8,jmy-8); vx.lineTo(jmx+14,jmy-22); vx.stroke();
                    vx.beginPath(); vx.moveTo(jmx-5,jmy+8); vx.lineTo(jmx-3,jmy+18); vx.stroke(); // tail
                    vx.beginPath(); vx.moveTo(jmx+5,jmy+8); vx.lineTo(jmx+2,jmy+18); vx.stroke();
                };
                drawMonkey(250,150); drawMonkey(720,220); drawMonkey(480,90);
                vx.strokeStyle='#3a6a20'; vx.lineWidth=t.rw+10; vx.lineCap='round'; vx.lineJoin='round'; vx.setLineDash([]);
                drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#2a5015'; vx.lineWidth=t.rw; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='#1e3e10'; vx.lineWidth=t.rw-12; drawPath(vx,wp); vx.stroke();
                vx.strokeStyle='rgba(180,255,100,0.5)'; vx.lineWidth=1; vx.setLineDash([8,14]); drawPath(vx,wp); vx.stroke(); vx.setLineDash([]);
                t.mud.forEach(m => {
                    const g=vx.createRadialGradient(m.x,m.y,0,m.x,m.y,m.r);
                    g.addColorStop(0,'rgba(30,60,10,0.9)'); g.addColorStop(1,'rgba(20,40,5,0.1)');
                    vx.fillStyle=g; vx.beginPath(); vx.arc(m.x,m.y,m.r,0,Math.PI*2); vx.fill();
                });

            } else if (desk) {
                drawDeskTrack(vx, t, wp, srand);
            } else {
                // grass background with subtle patches
                vx.fillStyle = '#4a8a3a'; vx.fillRect(0, 0, GW, GH);
                for (let i = 0; i < 30; i++) {
                    const shade = 60 + (srand() * 30 | 0);
                    vx.fillStyle = `rgb(${shade},${shade + 50},${shade - 10})`;
                    vx.beginPath(); vx.arc(srand() * GW, srand() * GH, 20 + srand() * 60, 0, Math.PI * 2); vx.fill();
                }
                // per-track ground critters / props (drawn before road so the road covers them)
                if (idx === 0) {
                    // SIDEWINDER — ants crawling around
                    for (let i = 0; i < 32; i++) drawAnt(srand() * GW, srand() * GH, srand() * Math.PI * 2, 2.4 + srand() * 1.6);
                } else if (idx === 1) {
                    // FANDANGO — spiders crawling around
                    for (let i = 0; i < 18; i++) drawSpider(srand() * GW, srand() * GH, srand() * Math.PI * 2, 2.4 + srand() * 1.6);
                } else if (idx === 3) {
                    // BLASTER — daisies dotting the field
                    for (let i = 0; i < 36; i++) drawDaisy(srand() * GW, srand() * GH, 2.2 + srand() * 1.6);
                } else if (idx === 4) {
                    // HUEVOS GRANDE — toadstools sprouting in the grass
                    for (let i = 0; i < 24; i++) drawMushroom(srand() * GW, srand() * GH, 2.2 + srand() * 1.6);
                } else if (idx === 6) {
                    // BIG DUKES — used cigarettes left behind by the Duke boys
                    for (let i = 0; i < 22; i++) drawCigarette(srand() * GW, srand() * GH, srand() * Math.PI * 2, 1.8 + srand() * 1.2);
                }
                // road shoulder
                vx.strokeStyle = '#888'; vx.lineWidth = t.rw + 10;
                vx.lineCap = 'round'; vx.lineJoin = 'round';
                drawPath(vx, wp); vx.stroke();
                // road surface
                vx.strokeStyle = '#555'; vx.lineWidth = t.rw;
                drawPath(vx, wp); vx.stroke();
                // inner detail (subtle asphalt variation)
                vx.strokeStyle = '#5a5a5a'; vx.lineWidth = t.rw - 12;
                drawPath(vx, wp); vx.stroke();
                // centre dashes
                vx.strokeStyle = '#6a6a6a'; vx.lineWidth = 1; vx.setLineDash([8, 14]);
                drawPath(vx, wp); vx.stroke(); vx.setLineDash([]);
                // mud zones
                t.mud.forEach(m => {
                    const g = vx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
                    g.addColorStop(0, 'rgba(80,60,35,0.9)'); g.addColorStop(1, 'rgba(80,60,35,0.2)');
                    vx.fillStyle = g; vx.beginPath(); vx.arc(m.x, m.y, m.r, 0, Math.PI * 2); vx.fill();
                });
            }

            // Post-road overlays: tunnels and ramp markers (all hand-crafted tracks)
            this.drawTrackTunnels(vx, t, wp);
            this.drawTrackRamps(vx, t);

            // start / finish line
            const s0 = wp[0], s1 = wp[1];
            const sa = Math.atan2(s1.y - s0.y, s1.x - s0.x);
            const pa = sa + Math.PI / 2;
            vx.save();
            // theme-keyed start/finish colours
            const sfLine = synth?'#2af0ff': halloween?'#ff6600': soccer?'#fff': asian?'#cc2020':
                theme==='reggae'?'#ffcc00': theme==='christmas'?'#ff0000': theme==='casino'?'#ffd700':
                theme==='italian'?'#cc3333': theme==='spanish'?'#cc2200': desk?'#00ff99': '#fff';
            const sfA = synth?'#ff2a6d': halloween?'#c85000': soccer?'#fff': asian?'#cc2020':
                theme==='reggae'?'#ffcc00': theme==='christmas'?'#cc0000': theme==='casino'?'#ffd700':
                theme==='italian'?'#cc3333': theme==='spanish'?'#cc2200': desk?'#222': '#000';
            const sfB = synth?'#2af0ff': halloween?'#300030': soccer?'#1a6e1a': asian?'#ffd0d0':
                theme==='reggae'?'#009900': theme==='christmas'?'#006600': theme==='casino'?'#0d3d0d':
                theme==='italian'?'#a09070': theme==='spanish'?'#c89050': desk?'#eee': '#fff';
            const wmCol = synth?'rgba(255,42,109,0.7)': halloween?'rgba(200,80,0,0.5)':
                soccer?'rgba(0,80,0,0.35)': asian?'rgba(160,30,30,0.45)':
                theme==='reggae'?'rgba(0,120,0,0.55)': theme==='christmas'?'rgba(180,0,0,0.55)':
                theme==='casino'?'rgba(0,100,0,0.55)': theme==='african'?'rgba(140,90,0,0.5)':
                theme==='arabic'?'rgba(160,120,30,0.5)': theme==='jungle'?'rgba(20,80,10,0.6)':
                desk?'rgba(40,30,20,0.4)': 'rgba(0,0,0,0.25)';
            vx.strokeStyle = sfLine; vx.lineWidth = 5;
            vx.beginPath();
            vx.moveTo(s0.x + Math.cos(pa) * t.rw / 2, s0.y + Math.sin(pa) * t.rw / 2);
            vx.lineTo(s0.x - Math.cos(pa) * t.rw / 2, s0.y - Math.sin(pa) * t.rw / 2);
            vx.stroke();
            // checkerboard
            for (let i = -3; i <= 3; i++) {
                vx.fillStyle = i % 2 === 0 ? sfA : sfB;
                const bx = s0.x + Math.cos(pa) * i * (t.rw / 7);
                const by = s0.y + Math.sin(pa) * i * (t.rw / 7);
                vx.fillRect(bx - 3, by - 3, 6, 6);
            }
            vx.restore();

            // track name subtle watermark
            vx.fillStyle = wmCol; vx.font = 'bold 13px monospace';
            vx.textAlign = 'left'; vx.fillText(t.name, 8, TH - 8);

            this.textures.addCanvas('tv_' + idx, vc);

            // ── collision map ──
            const cc = document.createElement('canvas');
            cc.width = Math.round(TW / cs); cc.height = Math.round(TH / cs);
            const cx = cc.getContext('2d');
            if (cs !== 1) cx.scale(1 / cs, 1 / cs);
            cx.fillStyle = '#804000'; cx.fillRect(0, 0, TW, TH);
            cx.strokeStyle = '#00ff00'; cx.lineWidth = t.rw;
            cx.lineCap = 'round'; cx.lineJoin = 'round';
            drawPath(cx, wp); cx.stroke();
            t.mud.forEach(m => {
                cx.fillStyle = '#0000ff'; cx.beginPath(); cx.arc(m.x, m.y, m.r, 0, Math.PI * 2); cx.fill();
            });
            t.cpx = cx.getImageData(0, 0, cc.width, cc.height).data;
            t.cpxW = cc.width; t.cpxH = cc.height;

            // ── checkpoints at 1/4, 2/4, 3/4, 0 ──
            t.cks = [];
            for (let c = 0; c < 4; c++) {
                const ci = Math.floor(((c + 1) % 4 === 0 ? 0 : (c + 1) / 4) * wp.length) % wp.length;
                // 1/4, 2/4, 3/4, 0
                const realIdx = c < 3 ? Math.floor((c + 1) / 4 * wp.length) : 0;
                const pt = wp[realIdx];
                const ptN = wp[(realIdx + 1) % wp.length];
                t.cks.push({ x: pt.x, y: pt.y, a: Math.atan2(ptN.y - pt.y, ptN.x - pt.x) });
            }

            // ── start positions (staggered behind start line) ──
            t.starts = [];
            for (let s = 0; s < 4; s++) {
                const wi = (wp.length - 4 - s * 4 + wp.length) % wp.length;
                const p = wp[wi], pn = wp[(wi + 1) % wp.length];
                const a = Math.atan2(pn.y - p.y, pn.x - p.x);
                const perp = a + Math.PI / 2;
                const off = (s % 2 === 0 ? -1 : 1) * 10;
                t.starts.push({ x: p.x + Math.cos(perp) * off, y: p.y + Math.sin(perp) * off, a });
            }

            // ── pickups (deterministic placement using seeded random) ──
            t.pks = [];
            for (let p = 0; p < 5; p++) {
                const wi = Math.floor(srand() * wp.length);
                const pt = wp[wi];
                const ra = srand() * Math.PI * 2, rd = srand() * t.rw * 0.3;
                t.pks.push({ x: pt.x + Math.cos(ra) * rd, y: pt.y + Math.sin(ra) * rd, type: 'money', val: (1 + (srand() * 4 | 0)) * 10000 });
            }
            for (let p = 0; p < 3; p++) {
                const wi = Math.floor(srand() * wp.length);
                const pt = wp[wi];
                const ra = srand() * Math.PI * 2, rd = srand() * t.rw * 0.3;
                t.pks.push({ x: pt.x + Math.cos(ra) * rd, y: pt.y + Math.sin(ra) * rd, type: 'nitro' });
            }
    }

    // ── Loading screen helpers ───────────────────────────────

    _createLoadingUI() {
        const cx = GW / 2, cy = GH / 2;
        const barW = 480, barH = 20;
        this.add.rectangle(cx, cy, GW, GH, 0x000000);
        this.add.text(cx, cy - 100, 'MICRO MACHINES', {
            fontSize: '52px', fontFamily: 'monospace', color: '#FFD700',
            fontStyle: 'bold', stroke: '#6B3410', strokeThickness: 6,
        }).setOrigin(0.5);
        this.add.text(cx, cy - 40, 'Loading…', {
            fontSize: '18px', fontFamily: 'monospace', color: '#888',
        }).setOrigin(0.5);
        // track outline then fill so the fill overlaps cleanly
        this.add.rectangle(cx, cy + 10, barW + 4, barH + 4, 0x333333);
        this._loadBar = this.add.rectangle(cx - barW / 2, cy + 10, 1, barH, 0xFFD700).setOrigin(0, 0.5);
        this._statusText = this.add.text(cx, cy + 45, '', {
            fontSize: '14px', fontFamily: 'monospace', color: '#aaa',
        }).setOrigin(0.5);
        this._barW = barW;
    }

    _updateBar(fraction) {
        if (this._loadBar) this._loadBar.width = this._barW * Math.min(fraction, 1);
    }

    _setStatus(msg) {
        if (this._statusText) this._statusText.setText(msg);
    }

    // Generates tracks one per animation frame so the progress bar stays live.
    _genTracksAsync(onComplete) {
        let idx = 0;
        const total = TRACKS.length;
        const step = () => {
            if (idx >= total) { onComplete(); return; }
            this._updateBar(0.4 + 0.6 * (idx / total));
            this._setStatus(`Building tracks… ${idx + 1} / ${total}`);
            this._genSingleTrack(TRACKS[idx], idx);
            idx++;
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }
}

// ── MAIN MENU SCENE ─────────────────────────────────────────
class MainMenuScene extends Phaser.Scene {
    constructor() { super('MainMenuScene'); }

    create() {
        this.cameras.main.setBackgroundColor('#000');

        // Decorative background track preview
        const tidx = Math.floor(Math.random() * TRACKS.length);
        if (this.textures.exists('tv_' + tidx)) {
            const bgT = TRACKS[tidx];
            const bgImg = this.add.image(GW / 2, GH / 2, 'tv_' + tidx).setAlpha(0.12);
            if ((bgT.W || GW) > GW || (bgT.H || GH) > GH) bgImg.setDisplaySize(GW, GH);
        }

        // Title
        this.add.text(GW / 2, 120, 'MICRO MACHINES', {
            fontSize: '60px', fontFamily: 'monospace', color: '#FFD700',
            fontStyle: 'bold', stroke: '#6B3410', strokeThickness: 8,
        }).setOrigin(0.5);

        this.add.text(GW / 2, 200, 'Web Recreation', {
            fontSize: '22px', fontFamily: 'monospace', color: '#bbb',
        }).setOrigin(0.5);

        // Menu items
        const ITEMS = ['PLAY', 'OPTIONS', 'ABOUT', 'CREDITS', 'CONTROLS'];
        this.menuSel = 0;
        this.currentPanel = null;

        const menuStartY = 305;
        const menuSpacing = 60;
        this.menuTexts = ITEMS.map((label, i) =>
            this.add.text(GW / 2, menuStartY + i * menuSpacing, label, {
                fontSize: '34px', fontFamily: 'monospace',
                color: i === 0 ? '#FFD700' : '#888', fontStyle: 'bold',
            }).setOrigin(0.5)
        );

        this.cursor = this.add.text(GW / 2 - 175, menuStartY, '▶', {
            fontSize: '30px', fontFamily: 'monospace', color: '#FFD700',
        }).setOrigin(0.5);

        // Sub-panels
        this.aboutPanel    = this._buildAbout();
        this.creditsPanel  = this._buildCredits();
        this.controlsPanel = this._buildControls();
        this.optionsPanel  = this._buildOptions();
        [this.aboutPanel, this.creditsPanel, this.controlsPanel, this.optionsPanel].forEach(p => p.setVisible(false));

        // Track cheat code (*NN)
        const mapSelect = this.add.text(GW / 2, GH - 36, '', {
            fontSize: '20px', fontFamily: 'monospace', color: '#ff6600', fontStyle: 'bold',
        }).setOrigin(0.5);
        let starMode = false, starBuf = '', starTimer = null;
        const flushStar = () => { starMode = false; starBuf = ''; mapSelect.setText(''); starTimer = null; };

        this.input.keyboard.on('keydown', (ev) => {
            const d = ev.key;
            if (d === '*') {
                if (starTimer) clearTimeout(starTimer);
                starMode = true; starBuf = '';
                mapSelect.setText('TRACK SELECT: *');
                starTimer = setTimeout(flushStar, 2000);
                return;
            }
            if (starMode && d >= '0' && d <= '9') {
                starBuf += d;
                mapSelect.setText('TRACK SELECT: *' + starBuf);
                if (starTimer) clearTimeout(starTimer);
                if (starBuf.length === 2) {
                    const idx = Math.min(parseInt(starBuf, 10), TRACKS.length - 1);
                    gs = resetGameState();
                    gs.raceNum = idx;
                    gs.highestUnlocked = idx;
                    flushStar();
                    this.scene.start('PlayerSelectScene');
                } else {
                    starTimer = setTimeout(flushStar, 2000);
                }
            }
        });

        this.input.keyboard.on('keydown-UP', () => {
            if (this.currentPanel === this.optionsPanel) {
                this.optSel = Math.max(0, this.optSel - 1);
                this._updateOptCursor();
            } else { this._nav(-1); }
        });
        this.input.keyboard.on('keydown-DOWN', () => {
            if (this.currentPanel === this.optionsPanel) {
                this.optSel = Math.min(this.optTexts.length - 1, this.optSel + 1);
                this._updateOptCursor();
            } else { this._nav(1); }
        });
        this.input.keyboard.on('keydown-LEFT', () => {
            if (this.currentPanel === this.optionsPanel) this._adjustOpt(this.optSel, -1);
        });
        this.input.keyboard.on('keydown-RIGHT', () => {
            if (this.currentPanel === this.optionsPanel) this._adjustOpt(this.optSel, 1);
        });
        this.input.keyboard.on('keydown-ENTER', () => {
            if (this.currentPanel === this.optionsPanel) this._adjustOpt(this.optSel, 1);
            else this._select();
        });
        this.input.keyboard.on('keydown-SPACE', () => {
            if (this.currentPanel === this.optionsPanel) this._adjustOpt(this.optSel, 1);
            else if (!this.currentPanel) this._select();
        });
        this.input.keyboard.on('keydown-ESC',   () => this._showMain());
    }

    _nav(dir) {
        if (this.currentPanel) return;
        this.menuTexts[this.menuSel].setColor('#888');
        this.menuSel = Phaser.Math.Clamp(this.menuSel + dir, 0, this.menuTexts.length - 1);
        this.menuTexts[this.menuSel].setColor('#FFD700');
        this.cursor.setY(this.menuTexts[this.menuSel].y);
    }

    _select() {
        if (this.currentPanel) return;
        switch (this.menuSel) {
            case 0: gs = resetGameState(); this.scene.start('PlayerSelectScene'); break;
            case 1: this.optSel = 0; this._updateOptCursor(); this._showPanel(this.optionsPanel); break;
            case 2: this._showPanel(this.aboutPanel);    break;
            case 3: this._showPanel(this.creditsPanel);  break;
            case 4: this._showPanel(this.controlsPanel); break;
        }
    }

    _showPanel(panel) {
        this.currentPanel = panel;
        this.menuTexts.forEach(t => t.setVisible(false));
        this.cursor.setVisible(false);
        panel.setVisible(true);
    }

    _showMain() {
        if (this.currentPanel) {
            this.currentPanel.setVisible(false);
            this.currentPanel = null;
        }
        this.menuTexts.forEach(t => t.setVisible(true));
        this.cursor.setVisible(true);
    }

    _toggleOpt(idx) {
        const entry = this.optTexts[idx];
        if (!entry || entry.type !== 'toggle') return;
        const key = entry.key;
        opts[key] = !opts[key];
        entry.check.setText(opts[key] ? '[✓]' : '[ ]').setColor(opts[key] ? '#00ff88' : '#444');
        entry.label.setColor(opts[key] ? '#FFD700' : '#888');
    }

    _adjustOpt(idx, dir) {
        const entry = this.optTexts[idx];
        if (!entry) return;
        if (entry.type === 'toggle') { this._toggleOpt(idx); return; }
        if (entry.type === 'stepper') {
            const min = entry.min, max = entry.max;
            let v = opts[entry.key] + dir;
            if (v < min) v = max;
            if (v > max) v = min;
            opts[entry.key] = v;
            entry.check.setText('< ' + v + ' >').setColor('#00ff88');
            entry.label.setColor('#FFD700');
        }
    }

    _updateOptCursor() {
        if (!this.optCursor || !this.optTexts) return;
        this.optCursor.setY(330 + this.optSel * 80);
    }

    _buildOptions() {
        const c = this.add.container(0, 0);
        const addTxt = (x, y, txt, style) => {
            const t = this.add.text(x, y, txt, { fontFamily: 'monospace', ...style });
            c.add(t); return t;
        };

        addTxt(GW / 2, 180, 'OPTIONS', {
            fontSize: '36px', color: '#FFD700', fontStyle: 'bold',
        }).setOrigin(0.5);
        addTxt(GW / 2, 228, 'All options off by default — mix for maximum chaos', {
            fontSize: '13px', color: '#555', fontStyle: 'italic',
        }).setOrigin(0.5);

        const OPTIONS = [
            { key: 'drift',      label: 'DRIFT MODE',  desc: 'Wild skid turns — hold your nerve!', type: 'toggle' },
            { key: 'guardrails', label: 'GUARDRAILS',  desc: 'Bounce off road edges like bumper cars', type: 'toggle' },
            { key: 'gravity',    label: 'GRAVITY',     desc: 'Fall off track, shrink, respawn with a bang', type: 'toggle' },
            { key: 'laps',       label: 'LAPS',        desc: 'Number of laps per race (1–5)', type: 'stepper', min: 1, max: 5 },
        ];

        this.optSel = 0;
        this.optTexts = [];

        OPTIONS.forEach((opt, i) => {
            const oy = 330 + i * 80;
            let checkTxt, labelColor;
            if (opt.type === 'stepper') {
                checkTxt = addTxt(GW / 2 - 155, oy, '< ' + opts[opt.key] + ' >', {
                    fontSize: '24px', color: '#00ff88',
                }).setOrigin(0.5);
                labelColor = '#FFD700';
            } else {
                checkTxt = addTxt(GW / 2 - 155, oy, opts[opt.key] ? '[✓]' : '[ ]', {
                    fontSize: '24px', color: opts[opt.key] ? '#00ff88' : '#444',
                }).setOrigin(0.5);
                labelColor = opts[opt.key] ? '#FFD700' : '#888';
            }
            const labelTxt = addTxt(GW / 2 - 105, oy, opt.label, {
                fontSize: '24px', color: labelColor, fontStyle: 'bold',
            }).setOrigin(0, 0.5);
            addTxt(GW / 2 - 105, oy + 24, opt.desc, {
                fontSize: '13px', color: '#555',
            }).setOrigin(0, 0.5);
            this.optTexts.push({ check: checkTxt, label: labelTxt, key: opt.key, type: opt.type, min: opt.min, max: opt.max });

            // Mouse click zone
            const zone = this.add.zone(GW / 2, oy + 10, GW * 0.65, 56).setInteractive({ useHandCursor: true });
            c.add(zone);
            zone.on('pointerover', () => { this.optSel = i; this._updateOptCursor(); });
            zone.on('pointerdown', () => { this.optSel = i; this._adjustOpt(i, 1); });
        });

        // Cursor arrow
        this.optCursor = addTxt(GW / 2 - 195, 330, '▶', {
            fontSize: '22px', color: '#FFD700',
        }).setOrigin(0.5);

        addTxt(GW / 2, GH - 46, '↑ ↓  navigate   ← →  adjust   ENTER  toggle/cycle   ESC  back', {
            fontSize: '14px', color: '#444',
        }).setOrigin(0.5);

        return c;
    }

    _buildAbout() {
        const c = this.add.container(0, 0);
        const addTxt = (x, y, txt, style) => {
            const t = this.add.text(x, y, txt, { fontFamily: 'monospace', ...style });
            c.add(t);
            return t;
        };

        addTxt(GW / 2, 215, 'ABOUT', {
            fontSize: '36px', color: '#FFD700', fontStyle: 'bold',
        }).setOrigin(0.5);

        const lines = [
            'Built for the GameDev.js Jam 2026',
            'for the theme "Machines".',
            '',
            'Inspired by the classic late \'80s and',
            'early \'90s Micro Machines, and Ivan',
            '"Ironman" Stewart\'s Super Off Road.',
        ];
        let bodyY = 305;
        lines.forEach(line => {
            if (!line) { bodyY += 22; return; }
            addTxt(GW / 2, bodyY, line, { fontSize: '21px', color: '#ccc' }).setOrigin(0.5);
            bodyY += 44;
        });

        addTxt(GW / 2, GH - 46, 'ESC  ·  BACK', { fontSize: '16px', color: '#555' }).setOrigin(0.5);
        return c;
    }

    _buildCredits() {
        const c = this.add.container(0, 0);
        const addTxt = (x, y, txt, style) => {
            const t = this.add.text(x, y, txt, { fontFamily: 'monospace', ...style });
            c.add(t);
            return t;
        };

        addTxt(GW / 2, 175, 'CREDITS', {
            fontSize: '36px', color: '#FFD700', fontStyle: 'bold',
        }).setOrigin(0.5);

        const sections = [
            {
                header: 'GAME DESIGN & DEVELOPMENT',
                entries: [
                    { text: 'Lee Reilly',     color: '#fff' },
                    { text: 'GitHub Copilot', color: '#7b5ea7' },
                ],
            },
            {
                header: 'GAME ASSETS',
                entries: [
                    { text: 'Kenney — Racing Pack',         color: '#fff' },
                    { text: 'kenney.nl/assets/racing-pack', color: '#888', small: true },
                ],
            },
            {
                header: 'MUSIC',
                entries: [
                    { text: 'MFCC — Pixabay',              color: '#fff' },
                    { text: 'pixabay.com/users/28627740/',  color: '#888', small: true },
                ],
            },
        ];

        let y = 245;
        sections.forEach(sec => {
            addTxt(GW / 2, y, sec.header, {
                fontSize: '14px', color: '#666', fontStyle: 'italic',
            }).setOrigin(0.5);
            y += 28;
            sec.entries.forEach(e => {
                addTxt(GW / 2, y, e.text, {
                    fontSize: e.small ? '15px' : '21px', color: e.color, fontStyle: 'bold',
                }).setOrigin(0.5);
                y += e.small ? 24 : 34;
            });
            y += 20;
        });

        addTxt(GW / 2, GH - 46, 'ESC  ·  BACK', { fontSize: '16px', color: '#555' }).setOrigin(0.5);
        return c;
    }

    _buildControls() {
        const c = this.add.container(0, 0);
        const addTxt = (x, y, txt, style) => {
            const t = this.add.text(x, y, txt, { fontFamily: 'monospace', ...style });
            c.add(t);
            return t;
        };

        addTxt(GW / 2, 215, 'CONTROLS', {
            fontSize: '36px', color: '#FFD700', fontStyle: 'bold',
        }).setOrigin(0.5);

        const controls = [
            ['↑',     'Accelerate'],
            ['↓',     'Brake / Reverse'],
            ['←  →',  'Steer'],
            ['SPACE', 'Nitro Boost'],
        ];
        controls.forEach(([key, action], i) => {
            const y = 310 + i * 64;
            addTxt(GW / 2 - 20, y, key,    { fontSize: '26px', color: '#FFD700', fontStyle: 'bold' }).setOrigin(1, 0.5);
            addTxt(GW / 2 + 10, y, action, { fontSize: '24px', color: '#ccc' }).setOrigin(0, 0.5);
        });

        addTxt(GW / 2, GH - 46, 'ESC  ·  BACK', { fontSize: '16px', color: '#555' }).setOrigin(0.5);
        return c;
    }
}

// ── TITLE SCENE ─────────────────────────────────────────────
class TitleScene extends Phaser.Scene {
    constructor() { super('TitleScene'); }

    create() {
        this.cameras.main.setBackgroundColor('#000');

        // decorative track preview in background
        const tidx = Math.floor(Math.random() * TRACKS.length);
        if (this.textures.exists('tv_' + tidx)) {
            const bgT = TRACKS[tidx];
            const bgImg = this.add.image(GW / 2, GH / 2, 'tv_' + tidx).setAlpha(0.15);
            if ((bgT.W || GW) > GW || (bgT.H || GH) > GH) {
                bgImg.setDisplaySize(GW, GH);
            }
        }

        this.add.text(GW / 2, 150, 'MICRO MACHINES', {
            fontSize: '60px', fontFamily: 'monospace', color: '#FFD700',
            fontStyle: 'bold', stroke: '#6B3410', strokeThickness: 8,
        }).setOrigin(0.5);

        this.add.text(GW / 2, 225, 'Web Recreation', {
            fontSize: '22px', fontFamily: 'monospace', color: '#bbb',
        }).setOrigin(0.5);

        const lines = [
            ['CONTROLS', '#fff', '24px'],
            ['', '', '6px'],
            ['↑  Accelerate', '#aaa', '18px'],
            ['← →  Steer', '#aaa', '18px'],
            ['SPACE  Nitro Boost', '#ff6600', '18px'],
            ['', '', '10px'],
            ['Race 1 lap · Earn prize money', '#888', '16px'],
            ['Upgrade your truck at the Speed Shop', '#888', '16px'],
        ];
        let ly = 320;
        lines.forEach(([txt, col, sz]) => {
            if (txt) this.add.text(GW / 2, ly, txt, { fontSize: sz, fontFamily: 'monospace', color: col }).setOrigin(0.5);
            ly += parseInt(sz) + 8;
        });

        const pt = this.add.text(GW / 2, 620, 'PRESS ENTER TO START', {
            fontSize: '26px', fontFamily: 'monospace', color: '#fff',
        }).setOrigin(0.5);
        this.tweens.add({ targets: pt, alpha: 0.2, duration: 600, yoyo: true, repeat: -1 });

        // track display — updated as player types
        const mapSelect = this.add.text(GW / 2, 700, '', {
            fontSize: '20px', fontFamily: 'monospace', color: '#ff6600', fontStyle: 'bold',
        }).setOrigin(0.5);

        // *NN track select: press * then two digits (e.g. *01, *15)
        let starMode = false;
        let starBuf = '';
        let starTimer = null;
        const flushStar = () => {
            starMode = false;
            starBuf = '';
            mapSelect.setText('');
            starTimer = null;
        };

        this.input.keyboard.on('keydown', (ev) => {
            const d = ev.key;
            if (d === '*') {
                if (starTimer) clearTimeout(starTimer);
                starMode = true;
                starBuf = '';
                mapSelect.setText('TRACK SELECT: *');
                starTimer = setTimeout(flushStar, 2000);
                return;
            }
            if (starMode && d >= '0' && d <= '9') {
                starBuf += d;
                mapSelect.setText('TRACK SELECT: *' + starBuf);
                if (starTimer) clearTimeout(starTimer);
                if (starBuf.length === 2) {
                    const idx = Math.min(parseInt(starBuf, 10), TRACKS.length - 1);
                    gs = resetGameState();
                    gs.raceNum = idx;
                    gs.highestUnlocked = idx;
                    flushStar();
                    this.scene.start('PlayerSelectScene');
                } else {
                    starTimer = setTimeout(flushStar, 2000);
                }
            }
        });

        const startGame = () => {
            gs = resetGameState();
            this.scene.start('PlayerSelectScene');
        };
        this.input.keyboard.on('keydown-ENTER', startGame);
        this.input.keyboard.on('keydown-SPACE', startGame);
    }
}

// ── PLAYER SELECT SCENE ─────────────────────────────────────
class PlayerSelectScene extends Phaser.Scene {
    constructor() { super('PlayerSelectScene'); }

    create() {
        this.cameras.main.setBackgroundColor('#0a0a1a');
        this.sel = gs.playerIdx || 0;

        this.add.text(GW / 2, 80, 'CHOOSE YOUR DRIVER', {
            fontSize: '40px', fontFamily: 'monospace', color: '#FFD700',
            fontStyle: 'bold', stroke: '#6B3410', strokeThickness: 6,
        }).setOrigin(0.5);

        this.add.text(GW / 2, 135, '← →  to select  ·  ENTER to confirm', {
            fontSize: '18px', fontFamily: 'monospace', color: '#888',
        }).setOrigin(0.5);

        // layout: 4 characters evenly spaced
        const startX = GW / 2 - 1.5 * 180;
        const yAvatar = 350;
        const yName = 500;
        const spacing = 180;
        const avatarSize = 120;

        this.cards = [];
        for (let i = 0; i < 4; i++) {
            const cx = startX + i * spacing;

            // background card
            const bg = this.add.rectangle(cx, 400, 150, 240, 0x222244, 0.6)
                .setStrokeStyle(3, 0x444466);

            // avatar
            const img = this.add.image(cx, yAvatar, PLAYER_IMGS[i])
                .setDisplaySize(avatarSize, avatarSize);

            // name
            const name = this.add.text(cx, yName, NAMES[i], {
                fontSize: '22px', fontFamily: 'monospace', color: '#ccc',
                fontStyle: 'bold',
            }).setOrigin(0.5);

            this.cards.push({ bg, img, name, x: cx });
        }

        // highlight indicator
        this.highlight = this.add.rectangle(0, 400, 160, 250, 0x000000, 0)
            .setStrokeStyle(4, 0xFFD700).setDepth(5);

        // arrow indicators
        this.arrowL = this.add.text(startX - 100, 400, '◀', {
            fontSize: '48px', fontFamily: 'monospace', color: '#FFD700',
        }).setOrigin(0.5);
        this.arrowR = this.add.text(startX + 3 * spacing + 100, 400, '▶', {
            fontSize: '48px', fontFamily: 'monospace', color: '#FFD700',
        }).setOrigin(0.5);

        this.updateSelection();

        // controls
        this.input.keyboard.on('keydown-LEFT', () => {
            this.sel = (this.sel - 1 + 4) % 4;
            this.updateSelection();
        });
        this.input.keyboard.on('keydown-RIGHT', () => {
            this.sel = (this.sel + 1) % 4;
            this.updateSelection();
        });
        this.input.keyboard.on('keydown-ENTER', () => this.confirm());
        this.input.keyboard.on('keydown-SPACE', () => this.confirm());
    }

    updateSelection() {
        const card = this.cards[this.sel];
        this.highlight.setPosition(card.x, 400);
        this.cards.forEach((c, i) => {
            const active = i === this.sel;
            c.bg.setFillStyle(active ? 0x334488 : 0x222244, active ? 0.9 : 0.6);
            c.bg.setStrokeStyle(3, active ? 0xFFD700 : 0x444466);
            c.img.setAlpha(active ? 1.0 : 0.5);
            c.img.setDisplaySize(active ? 130 : 120, active ? 130 : 120);
            c.name.setColor(active ? '#FFD700' : '#888');
        });
        // pulse arrows based on edges
        this.arrowL.setAlpha(1);
        this.arrowR.setAlpha(1);
    }

    confirm() {
        gs.playerIdx = this.sel;
        // brief flash effect
        this.cameras.main.flash(300, 255, 215, 0);
        this.time.delayedCall(300, () => this.scene.start('TrackSelectScene'));
    }
}

// ── RACE SCENE ──────────────────────────────────────────────
class RaceScene extends Phaser.Scene {
    constructor() { super('RaceScene'); }

    create() {
        const ti = gs.raceNum % TRACKS.length;
        this.td = TRACKS[ti];
        this.wp = this.td.wp;
        const TW = this.td.W, TH = this.td.H;
        this.isBig = TW > GW || TH > GH;

        // track background (positioned so top-left = world origin)
        const bg = this.add.image(TW / 2, TH / 2, 'tv_' + ti);
        if (this.td.cpxScale && this.td.cpxScale !== 1) bg.setDisplaySize(TW, TH);

        // camera bounds & follow for multi-screen tracks
        this.cameras.main.setBounds(0, 0, TW, TH);

        // music: stop any previous track, load + play current, then prefetch next in background
        this.sound.stopAll();
        const musicKey = 'music_' + (gs.raceNum % TRACK_MUSIC.length);
        const playCurrentMusic = () => {
            if (this.cache.audio.exists(musicKey)) {
                this.sound.play(musicKey, { loop: true, volume: 0.5 });
            }
            this.prefetchNextMusic();
        };
        if (this.cache.audio.exists(musicKey)) {
            playCurrentMusic();
        } else {
            this.load.audio(musicKey, TRACK_MUSIC[gs.raceNum % TRACK_MUSIC.length]);
            this.load.once('complete', playCurrentMusic);
            this.load.start();
        }

        // create trucks
        this.trucks = [];
        const charOrder = getCharOrder();
        for (let i = 0; i < 4; i++) {
            const sp = this.td.starts[i];
            const isP = i === 0;
            const ci = charOrder[i]; // character index
            const spriteKey = this.textures.exists(CAR_SPRITES[ci]) ? CAR_SPRITES[ci] : `truck_${TKEYS[i]}`;
            const t = {
                spr: this.add.sprite(sp.x, sp.y, spriteKey)
                    .setOrigin(0.5)
                    .setDepth(10 + i)
                    .setDisplaySize(TRUCK_W, TRUCK_H),
                x: sp.x, y: sp.y, a: sp.a, vx: 0, vy: 0,
                isP, name: NAMES[ci], col: CHAR_COLORS[ci], imgKey: PLAYER_IMGS[ci], idx: i,
                maxSpd: isP ? 3.0 + gs.topSpeed * 0.25 : 3.0 + Math.min(gs.raceNum * 0.06, 2.0),
                acc:    isP ? 0.06 + gs.acceleration * 0.008 : 0.06 + Math.min(gs.raceNum * 0.003, 0.04),
                hand:   isP ? 0.038 + gs.tires * 0.003 : 0.038 + Math.min(gs.raceNum * 0.001, 0.015),
                stab:   isP ? 0.85 + gs.shocks * 0.012 : 0.85 + Math.min(gs.raceNum * 0.004, 0.1),
                nitros: isP ? gs.nitros : 3 + Math.floor(gs.raceNum / 3),
                nAct: false, nTmr: 0,
                laps: 0, nxtCk: 0, fin: false, finPos: -1,
                tMult: 1.0,
                aiWp: Math.floor(this.td.wp.length * 0.96),
                aiDiff: isP ? 0 : 0.8 + i * 0.08 + Math.min(gs.raceNum * 0.025, 0.6),
                // Driving skill tier per AI slot: very good / ok / bad.
                // Higher = cleaner line, better braking, less steering noise.
                aiSkill:  isP ? 1 : [0, 0.95, 0.72, 0.48][i],
                aiPhase:  Math.random() * Math.PI * 2,
                frozenTimer: 0,
                // Options state
                lastRoadX: sp.x, lastRoadY: sp.y, lastRoadA: sp.a,
                falling: false, _guardrailCd: 0, _fallGrace: 0, _fallMs: 0, _fallVx: 0, _fallVy: 0,
            };
            this.syncSprite(t);
            this.trucks.push(t);
        }

        // pickups
        this.pkActive = this.td.pks.map((p, i) => ({ ...p, on: true, i }));
        this.pkSprites = this.pkActive.map(p => {
            const img = this.add.image(p.x, p.y, p.type === 'money' ? 'pk_money' : 'pk_nitro').setDepth(5);
            // gentle pulse & rotate for liveliness
            this.tweens.add({ targets: img, scale: { from: 1.0, to: 1.35 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            if (p.type === 'nitro') {
                this.tweens.add({ targets: img, angle: 360, duration: 1600, repeat: -1 });
            }
            return img;
        });

        // soccer props: interactive balls + subbuteo figure
        this.soccerBalls = [];
        this.subbuteo = null;
        if (this.td.soccerBalls) {
            this.td.soccerBalls.forEach(b => {
                const gfx = this.add.graphics().setDepth(7);
                this.drawSoccerBallGfx(gfx, 0, 0, b.r);
                gfx.x = b.x; gfx.y = b.y;
                this.soccerBalls.push({ x: b.x, y: b.y, vx: 0, vy: 0, r: b.r, gfx, spin: 0 });
            });
        }
        if (this.td.subbuteo) {
            const sb = this.td.subbuteo;
            const gfx = this.add.graphics().setDepth(7);
            this.drawSubbuteoGfx(gfx, 0, 0);
            gfx.x = sb.x; gfx.y = sb.y;
            this.subbuteo = { x: sb.x, y: sb.y, gfx, tilt: 0, tiltVel: 0, baseY: sb.y };
        }

        // casino dice: interactive physics objects for LOOSE SLOPS
        this.casinoDice = [];
        if (this.td.casinoDice && this.td.casinoDice.length) {
            this.td.casinoDice.forEach(d => {
                const gfx = this.add.graphics().setDepth(7);
                this.drawDiceGfx(gfx, 0, 0, d.r, d.face);
                gfx.x = d.x; gfx.y = d.y;
                this.casinoDice.push({ x: d.x, y: d.y, vx: 0, vy: 0, r: d.r, face: d.face, gfx, spin: 0 });
            });
        }

        // halloween ghost
        this.ghost = null;
        if (ti === 7) {
            const gfx = this.add.graphics().setDepth(20);
            this.ghost = {
                x: GW / 2, y: GH / 2, vx: 1.5, vy: 1.0,
                gfx, alpha: 0.85, wobble: 0, cooldown: 0,
            };
            this.drawGhostGfx(gfx, 0, 0);
        }

        // controls
        this.cur = this.input.keyboard.createCursorKeys();
        this.spc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        // race state
        this.started = false; this.over = false;
        this.finOrder = []; this.raceTime = 0; this.endScheduled = false;

        // particles
        this.dust = [];

        // Desk-track runtime: per-race cooldowns for boosts/ramps, plus
        // a graphics overlay on top of the player when inside a tunnel.
        this.boostState = (this.td.boosts || []).map(() => ({ cd: 0 }));
        this.rampState  = (this.td.ramps  || []).map(() => ({ cd: 0 }));
        this.tunnelOverlays = [];
        if (this.td.tunnels && this.td.tunnels.length) {
            this.td.tunnels.forEach(tu => {
                const g = this.add.graphics().setDepth(15);
                g.fillStyle(0x000000, 0.55);
                const halfW = this.td.rw / 2 + 8;
                const pts = [];
                const wp = this.td.wp;
                for (let i = 0; i <= tu.len; i++) {
                    const pp = wp[(tu.startI + i) % wp.length];
                    const nxt = wp[(tu.startI + i + 1) % wp.length];
                    const a = Math.atan2(nxt.y - pp.y, nxt.x - pp.x) + Math.PI / 2;
                    pts.push({ ux: pp.x + Math.cos(a) * halfW, uy: pp.y + Math.sin(a) * halfW,
                               dx: pp.x - Math.cos(a) * halfW, dy: pp.y - Math.sin(a) * halfW });
                }
                g.beginPath();
                g.moveTo(pts[0].ux, pts[0].uy);
                for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].ux, pts[i].uy);
                for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i].dx, pts[i].dy);
                g.closePath(); g.fillPath();
                // subtle horizontal "beam" highlights inside
                g.fillStyle(0xfff0a0, 0.08);
                for (let i = 2; i < pts.length - 2; i += 3) {
                    g.fillCircle((pts[i].ux + pts[i].dx) / 2, (pts[i].uy + pts[i].dy) / 2, halfW * 0.6);
                }
                this.tunnelOverlays.push(g);
            });
        }

        // HUD
        this.buildHUD();

        // camera follow for multi-screen tracks
        if (this.isBig) {
            this.cameras.main.startFollow(this.trucks[0].spr, true, 0.12, 0.12);
        }

        // countdown — pinned to viewport
        this.cdTxt = this.add.text(GW / 2, GH / 2 - 60, '3', {
            fontSize: '72px', fontFamily: 'monospace', color: '#ff0000',
            fontStyle: 'bold', stroke: '#000', strokeThickness: 5,
        }).setOrigin(0.5).setDepth(100).setScrollFactor(0);

        SFX.countdownBeep(false); // '3' beep

        this.time.delayedCall(1000, () => {
            this.cdTxt.setText('2'); SFX.countdownBeep(false);
            this.time.delayedCall(1000, () => {
                this.cdTxt.setText('1'); SFX.countdownBeep(false);
                this.time.delayedCall(1000, () => {
                    this.cdTxt.setText('GO!').setColor('#00ff00');
                    SFX.countdownBeep(true);
                    SFX.engineStart();
                    this.started = true;
                    this.time.delayedCall(600, () => this.cdTxt.destroy());
                });
            });
        });
    }

    buildHUD() {
        const bar = this.add.rectangle(GW / 2, 22, GW, 44, 0x111111, 0.88).setDepth(50).setScrollFactor(0);
        const s = { fontSize: '15px', fontFamily: 'monospace', color: '#fff' };
        this.hPos = this.add.text(16, 8, 'POS: 1st', s).setDepth(51).setScrollFactor(0);
        this.hLap = this.add.text(150, 8, 'LAP: 1/1', s).setDepth(51).setScrollFactor(0);
        this.hMon = this.add.text(300, 8, '$200,000', { ...s, color: '#FFD700' }).setDepth(51).setScrollFactor(0);
        this.hNit = this.add.text(480, 8, 'NITRO: 3', { ...s, color: '#ff6600' }).setDepth(51).setScrollFactor(0);
        this.hRce = this.add.text(640, 8, `RACE ${gs.raceNum + 1}`, { ...s, color: '#aaa' }).setDepth(51).setScrollFactor(0);
        // speed meter bar
        this.hSpdLbl = this.add.text(780, 8, 'SPD', s).setDepth(51).setScrollFactor(0);
        this.hSpdBg = this.add.rectangle(820, 18, 90, 10, 0x222222, 0.8).setOrigin(0, 0.5).setDepth(50).setScrollFactor(0);
        this.hSpdFill = this.add.rectangle(820, 18, 0, 8, 0x00ff88, 1).setOrigin(0, 0.5).setDepth(51).setScrollFactor(0);
        this.hBoard = [];
        const pad = 10, imgSz = 30, rowH = 42, fontSize = '28px';
        const bw = 300, bh = pad + 4 * rowH + pad, bx = GW - bw - pad, by = 46;
        this.add.rectangle(bx + bw / 2, by + bh / 2, bw, bh, 0x111111, 0.85).setDepth(50).setOrigin(0.5).setScrollFactor(0);
        for (let i = 0; i < 4; i++) {
            const ry = by + pad + i * rowH;
            const img = this.add.image(bx + pad + imgSz / 2, ry + rowH / 2, this.trucks[i].imgKey).setDepth(51).setDisplaySize(imgSz, imgSz).setScrollFactor(0);
            const nameTxt = this.add.text(bx + pad + imgSz + 8, ry + rowH / 2, '', { fontSize, fontFamily: 'monospace', color: '#ccc' }).setDepth(51).setOrigin(0, 0.5).setScrollFactor(0);
            const posTxt = this.add.text(bx + bw - pad, ry + rowH / 2, '', { fontSize, fontFamily: 'monospace', color: '#ccc' }).setDepth(51).setOrigin(1, 0.5).setScrollFactor(0);
            this.hBoard.push({ img, nameTxt, posTxt });
        }

        // mini-map for multi-screen tracks
        if (this.isBig) {
            const mw = 140, mh = Math.round(mw * this.td.H / this.td.W);
            const mx = GW - mw - 12, my = GH - mh - 12;
            this.miniBg = this.add.rectangle(mx, my, mw, mh, 0x000022, 0.7).setOrigin(0, 0).setDepth(50).setScrollFactor(0).setStrokeStyle(2, 0xff2a6d, 0.9);
            this.miniG = this.add.graphics().setDepth(51).setScrollFactor(0);
            this.miniX = mx; this.miniY = my; this.miniW = mw; this.miniH = mh;
            // draw static track path
            this.miniG.lineStyle(2, 0x2af0ff, 0.8);
            this.miniG.beginPath();
            const wp = this.td.wp;
            for (let i = 0; i < wp.length; i++) {
                const sx = mx + wp[i].x / this.td.W * mw;
                const sy = my + wp[i].y / this.td.H * mh;
                i === 0 ? this.miniG.moveTo(sx, sy) : this.miniG.lineTo(sx, sy);
            }
            this.miniG.closePath(); this.miniG.strokePath();
        }
    }

    update(time, delta) {
        if (!this.started || this.over) return;
        const dt = Math.min(delta / 16.67, 3); // cap dt to prevent tunnelling
        this.raceTime += delta;

        // update trucks
        this.trucks.forEach(t => {
            if (t.fin) { this.syncSprite(t); return; }
            // frozen state — tick down, skip driving
            if (t.frozenTimer > 0) {
                t.frozenTimer -= delta;
                t.vx *= 0.9; t.vy *= 0.9; // skid to halt
                if (t.frozenTimer <= 0) {
                    t.frozenTimer = 0;
                    t.spr.clearTint();
                }
                t.x += t.vx * dt; t.y += t.vy * dt;
                t.x = Phaser.Math.Clamp(t.x, 8, this.td.W - 8);
                t.y = Phaser.Math.Clamp(t.y, 8, this.td.H - 8);
                this.syncSprite(t);
                return;
            }
            // falling — keep momentum while shrinking
            if (t.falling) {
                if (t._fallMs > 0) {
                    t._fallMs -= delta;
                    const frac = Math.max(0, t._fallMs / 680);
                    t.x += t._fallVx * frac * dt;
                    t.y += t._fallVy * frac * dt;
                    t.x = Phaser.Math.Clamp(t.x, 8, this.td.W - 8);
                    t.y = Phaser.Math.Clamp(t.y, 8, this.td.H - 8);
                }
                this.syncSprite(t);
                return;
            }

            // Track last safe position (any non-offroad terrain)
            if (this.terrain(t.x, t.y) !== 'offroad') {
                t.lastRoadX = t.x; t.lastRoadY = t.y; t.lastRoadA = t.a;
            }
            // Decay fall grace timer
            if (t._fallGrace > 0) t._fallGrace -= dt;

            if (t.isP) this.drivePlayer(t, dt);
            else this.driveAI(t, dt);
            this.physics(t, dt);
            this.checkCks(t);
            if (t.isP) this.checkPks(t);
            this.syncSprite(t);
        });

        this.updateDust(dt);
        if (this.soccerBalls.length > 0 || this.subbuteo) this.updateSoccerProps(dt);
        if (this.casinoDice.length > 0) this.updateCasinoDice(dt);
        if (this.ghost) this.updateGhost(dt, delta);
        if ((this.td.boosts && this.td.boosts.length) || (this.td.ramps && this.td.ramps.length)) this.updateDeskHazards(dt);
        this.calcPositions();
        this.drawHUD();

        // end race check
        if (!this.endScheduled && (this.finOrder.length >= 4 || this.finOrder.some(t => t.isP))) {
            this.endScheduled = true;
            this.time.delayedCall(2000, () => this.endRace());
        }
    }

    drivePlayer(t, dt) {
        const spd = Math.hypot(t.vx, t.vy);
        const sf = Math.min(1, spd / (t.maxSpd * 0.6 + 0.01));
        // drift mode: slightly wider steering arc to initiate oversteer
        const steer = t.hand * dt * (opts.drift ? (0.75 + 0.75 * sf) : (0.55 + 0.55 * sf));
        if (this.cur.left.isDown) t.a -= steer;
        if (this.cur.right.isDown) t.a += steer;

        if (this.cur.up.isDown) {
            const am = t.nAct ? 1.8 : 1.0;
            t.vx += Math.cos(t.a) * t.acc * am * t.tMult * dt;
            t.vy += Math.sin(t.a) * t.acc * am * t.tMult * dt;
        }
        // brake / reverse with DOWN — more responsive controls
        if (this.cur.down.isDown) {
            const dx = Math.cos(t.a), dy = Math.sin(t.a);
            const fwd = t.vx * dx + t.vy * dy;
            if (fwd > 0) {
                // braking
                t.vx *= Math.pow(0.88, dt);
                t.vy *= Math.pow(0.88, dt);
            } else {
                // reverse
                t.vx -= dx * t.acc * 0.5 * dt;
                t.vy -= dy * t.acc * 0.5 * dt;
            }
        }

        // engine SFX
        SFX.engineUpdate(Math.hypot(t.vx, t.vy), t.maxSpd, this.cur.up.isDown);

        if (Phaser.Input.Keyboard.JustDown(this.spc) && t.nitros > 0 && !t.nAct) {
            t.nAct = true; t.nitros--; gs.nitros = t.nitros; t.nTmr = 90;
            this.nitroFX(t);
            SFX.nitro();
            // punchy camera shake + flash
            this.cameras.main.shake(180, 0.008);
            this.cameras.main.flash(120, 255, 120, 40, true);
        }

        // speed lines at high velocity (only player, on-screen effect)
        if (spd > t.maxSpd * 0.85 && Math.random() < 0.5) this.spawnSpeedLine(t);
    }

    driveAI(t, dt) {
        const wps = this.wp, N = wps.length;
        const skill = t.aiSkill ?? 0.7;

        // Advance the waypoint as soon as we're close OR we've passed it
        // (projection on forward axis is behind us). Prevents orbiting
        // a target the AI repeatedly overshoots.
        for (let guard = 0; guard < 4; guard++) {
            const w = wps[t.aiWp];
            const dx = w.x - t.x, dy = w.y - t.y;
            const d2 = dx * dx + dy * dy;
            const fx = Math.cos(t.a), fy = Math.sin(t.a);
            const passed = (dx * fx + dy * fy) < 0 && d2 < (WP_DIST * 3) * (WP_DIST * 3);
            if (d2 < WP_DIST * WP_DIST || passed) {
                t.aiWp = (t.aiWp + 1) % N;
            } else break;
        }

        // Look ahead: better drivers read further down the road.
        const look = 1 + Math.floor(skill * 4);               // 1..5 points
        const aim = wps[(t.aiWp + look) % N];

        // Desired heading toward the aim point, plus a touch of
        // wandering noise for weaker AIs (feels human, not robotic).
        let ta = Math.atan2(aim.y - t.y, aim.x - t.x);
        const noiseAmp = (1 - skill) * 0.35;
        if (noiseAmp > 0) {
            t.aiPhase = (t.aiPhase || 0) + dt * 0.04;
            ta += Math.sin(t.aiPhase) * noiseAmp;
        }

        let ad = ta - t.a;
        while (ad > Math.PI) ad -= Math.PI * 2;
        while (ad < -Math.PI) ad += Math.PI * 2;

        // Steering rate scales with handling, difficulty and skill.
        const ss = t.hand * t.aiDiff * (0.7 + skill * 0.6) * dt;
        if (ad < -0.05) t.a -= Math.min(ss, -ad);
        else if (ad > 0.05) t.a += Math.min(ss, ad);

        // Corner braking: if the road ahead curves sharply, good drivers
        // back off the throttle; bad drivers plow straight through.
        const p1 = wps[(t.aiWp + 2) % N];
        const p2 = wps[(t.aiWp + 5) % N];
        const curveA = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        let curveErr = Math.abs(((curveA - t.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        const brakeStrength = 0.3 + skill * 0.7;              // 0.3..1.0
        let throttle = 1.0;
        if (curveErr > 0.55) throttle -= (curveErr - 0.55) * brakeStrength;
        // Heading error also reduces throttle (good AI doesn't floor it sideways).
        throttle -= Math.min(0.5, Math.abs(ad) * (0.3 + skill * 0.5));
        throttle = Math.max(0.25, Math.min(1.0, throttle));

        // Occasional mistake — weaker AIs briefly lift off the gas.
        if (skill < 0.85 && Math.random() < (1 - skill) * 0.0008 * dt) {
            throttle *= 0.3;
        }

        const am = t.nAct ? 1.8 : 1.0;
        t.vx += Math.cos(t.a) * t.acc * am * t.aiDiff * t.tMult * throttle * dt;
        t.vy += Math.sin(t.a) * t.acc * am * t.aiDiff * t.tMult * throttle * dt;

        // rubber-banding (unchanged)
        const pl = this.trucks[0];
        const pp = pl.laps * 1000 + pl.nxtCk * 250;
        const ap = t.laps * 1000 + t.nxtCk * 250;
        if (ap > pp + 400) t.aiDiff = Math.max(0.55, t.aiDiff - 0.0008 * dt);
        else if (ap < pp - 300) t.aiDiff = Math.min(1.45, t.aiDiff + 0.001 * dt);

        // AI nitro — skilled drivers save it for straights.
        if (t.nitros > 0 && !t.nAct) {
            const straight = curveErr < 0.3 && Math.abs(ad) < 0.25;
            const want = straight ? 0.006 * skill : 0.0008;
            if ((ap < pp && Math.random() < want) || Math.random() < 0.0004) {
                t.nAct = true; t.nitros--; t.nTmr = 90;
            }
        }
    }

    physics(t, dt) {
        // nitro timer
        if (t.nAct) {
            t.nTmr -= dt;
            if (t.nTmr <= 0) t.nAct = false;
            // continuous flame trail while active
            if (Math.random() < 0.7) this.nitroFX(t);
        }

        // Decrement guardrail sound cooldown
        if (t._guardrailCd > 0) t._guardrailCd -= dt;

        // decompose velocity
        const fx = Math.cos(t.a), fy = Math.sin(t.a);
        const rx = -Math.sin(t.a), ry = Math.cos(t.a);
        const fwd = t.vx * fx + t.vy * fy;
        const lat = t.vx * rx + t.vy * ry;

        // Drift mode: lower skid threshold — constant spectacular tire marks
        const skidLat = opts.drift ? 0.25 : 1.0;
        const skidSpd = opts.drift ? 0.35 : 1.2;
        if (t.isP && Math.abs(lat) > skidLat && Math.hypot(t.vx, t.vy) > skidSpd) {
            this.spawnSkid(t);
        }

        // Drift mode: lower lateral friction — velocity lags behind heading = natural slide
        const latFric = opts.drift ? Math.pow(0.93, dt) : Math.pow(t.stab, dt);
        const fwdFric = Math.pow(0.994, dt);
        const nf = fwd * fwdFric, nl = lat * latFric;
        t.vx = nf * fx + nl * rx;
        t.vy = nf * fy + nl * ry;

        // speed clamp
        const spd = Math.hypot(t.vx, t.vy);
        const eMax = (t.nAct ? t.maxSpd * 1.5 : t.maxSpd) * t.tMult;
        if (spd > eMax) { const s = eMax / spd; t.vx *= s; t.vy *= s; }

        let nx = t.x + t.vx * dt, ny = t.y + t.vy * dt;

        // ── GUARDRAILS: slide along road edge (kill into-wall component, keep tangential)
        if (opts.guardrails && this.terrain(nx, ny) === 'offroad') {
            const xBlocked = this.terrain(nx, t.y) === 'offroad';  // X alone goes offroad → vertical wall
            const yBlocked = this.terrain(t.x, ny) === 'offroad';  // Y alone goes offroad → horizontal wall
            if (xBlocked && !yBlocked) {
                t.vx = 0; nx = t.x;          // vertical wall: kill X, keep Y (slide along wall)
            } else if (yBlocked && !xBlocked) {
                t.vy = 0; ny = t.y;          // horizontal wall: kill Y, keep X (slide along wall)
            } else {
                t.vx = 0; t.vy = 0; nx = t.x; ny = t.y;  // corner: stop
            }
            if (t.isP && t._guardrailCd <= 0) {
                this.spawnGuardrailSparks(t);
                SFX.guardrailBounce();
                t._guardrailCd = 9;
            }
        }

        // terrain (computed at corrected position)
        const ter = this.terrain(nx, ny);
        switch (ter) {
            case 'road': t.tMult = 1.0; break;
            case 'mud':  t.tMult = 0.45; break;
            case 'offroad':
                t.tMult = 0.55;
                if (spd > 0.5 && Math.random() < 0.25) this.spawnDust(t.x, t.y);
                break;
        }

        // ── GRAVITY: fall off track only if the whole car is completely off track
        // Check all four corners of the car to ensure the entire car is offroad
        if (opts.gravity && ter === 'offroad' && !t.falling && !t.fin && t._fallGrace <= 0) {
            const carHalfW = TRUCK_W / 2;
            const carHalfH = TRUCK_H / 2;
            const corners = [
                { x: nx - carHalfW, y: ny - carHalfH },  // top-left
                { x: nx + carHalfW, y: ny - carHalfH },  // top-right
                { x: nx - carHalfW, y: ny + carHalfH },  // bottom-left
                { x: nx + carHalfW, y: ny + carHalfH }   // bottom-right
            ];
            // Only trigger fall if all four corners are offroad
            const allCornersOffroad = corners.every(c => this.terrain(c.x, c.y) === 'offroad');
            if (allCornersOffroad) {
                t.falling = true;
                t._fallVx = t.vx; t._fallVy = t.vy;  // save momentum before zeroing
                t.vx = 0; t.vy = 0;
                this.triggerFall(t);
            }
        }

        // boundary
        t.x = Phaser.Math.Clamp(nx, 8, this.td.W - 8);
        t.y = Phaser.Math.Clamp(ny, 8, this.td.H - 8);

        // truck-truck collisions (skip falling trucks — they're "in the air")
        for (const o of this.trucks) {
            if (o === t || o.falling) continue;
            const d = dist(t, o);
            if (d < TS * 2 && d > 0.1) {
                const push = (TS * 2 - d) * 0.3;
                const dnx = (o.x - t.x) / d, dny = (o.y - t.y) / d;
                t.x -= dnx * push * 0.5; t.y -= dny * push * 0.5;
                o.x += dnx * push * 0.5; o.y += dny * push * 0.5;
                t.vx -= dnx * push * 0.08; t.vy -= dny * push * 0.08;
                o.vx += dnx * push * 0.08; o.vy += dny * push * 0.08;
            }
        }
    }

    updateDeskHazards(dt) {
        // decrement cooldowns
        this.boostState.forEach(s => { if (s.cd > 0) s.cd -= dt; });
        this.rampState.forEach(s => { if (s.cd > 0) s.cd -= dt; });

        const BOOST_R = 45, RAMP_R = 45;
        const BOOST_CD = 30, RAMP_CD = 60;

        this.trucks.forEach(t => {
            if (t.fin || t.frozenTimer > 0 || t.falling) return;
            // Boost chevrons (">>" markers on the road)
            (this.td.boosts || []).forEach((b, i) => {
                const st = this.boostState[i];
                if (st.cd > 0) return;
                if (Math.hypot(t.x - b.x, t.y - b.y) < BOOST_R) {
                    // punch velocity along the boost direction
                    const kick = 3.2;
                    t.vx += Math.cos(b.a) * kick;
                    t.vy += Math.sin(b.a) * kick;
                    // temporarily lift the speed cap via nitro-like flag
                    t.nAct = true;
                    t.nTmr = Math.max(t.nTmr, 35);
                    st.cd = BOOST_CD;
                    if (t.isP) {
                        this.cameras.main.flash(90, 255, 230, 80, true);
                        SFX.nitro();
                    }
                }
            });
            // Ramps — burst forward + sprite "airtime" scale bump
            (this.td.ramps || []).forEach((r, i) => {
                const st = this.rampState[i];
                if (st.cd > 0) return;
                if (Math.hypot(t.x - r.x, t.y - r.y) < RAMP_R) {
                    const kick = 2.4;
                    t.vx += Math.cos(r.a) * kick;
                    t.vy += Math.sin(r.a) * kick;
                    t.nAct = true;
                    t.nTmr = Math.max(t.nTmr, 50);
                    st.cd = RAMP_CD;
                    // fake airtime: temporarily upscale the sprite
                    if (t.spr && !t.spr._rampTween) {
                        const base = t.spr.scaleX;
                        t.spr._rampTween = true;
                        this.tweens.add({
                            targets: t.spr,
                            scaleX: base * 1.6, scaleY: base * 1.6,
                            duration: 180, yoyo: true,
                            onComplete: () => { t.spr._rampTween = false; },
                        });
                    }
                    if (t.isP) {
                        this.cameras.main.shake(140, 0.006);
                        SFX.nitro();
                    }
                }
            });
        });
    }

    terrain(x, y) {
        const px = this.td.cpx;
        const s = this.td.cpxScale || 1;
        const TW = this.td.cpxW || this.td.W, TH = this.td.cpxH || this.td.H;
        const ix = Math.floor(x / s), iy = Math.floor(y / s);
        if (ix < 0 || ix >= TW || iy < 0 || iy >= TH) return 'offroad';
        const i = (iy * TW + ix) * 4;
        if (px[i + 1] > 200 && px[i] < 100 && px[i + 2] < 100) return 'road';
        if (px[i + 2] > 200 && px[i] < 100 && px[i + 1] < 100) return 'mud';
        return 'offroad';
    }

    syncSprite(t) {
        t.spr.x = t.x; t.spr.y = t.y;
        if (t.spr.texture && (t.spr.texture.key.startsWith('kenney_car_') || t.spr.texture.key.startsWith('car_'))) {
            // Kenney cars face up by default; gameplay heading angle 0 points right.
            t.spr.setRotation(t.a + Math.PI / 2);
            return;
        }
        let deg = Phaser.Math.RadToDeg(t.a);
        deg = ((deg % 360) + 360) % 360;
        t.spr.setFrame(Math.round(deg / (360 / ROT_FRAMES)) % ROT_FRAMES);
    }

    checkCks(t) {
        if (t.fin) return;
        const ck = this.td.cks[t.nxtCk];
        if (dist(t, ck) < CP_DIST) {
            t.nxtCk++;
            if (t.nxtCk >= this.td.cks.length) {
                t.nxtCk = 0; t.laps++;
                const lapGoal = this.td.laps || opts.laps || TOTAL_LAPS;
                if (t.laps >= lapGoal) {
                    t.fin = true; t.finPos = this.finOrder.length;
                    this.finOrder.push(t);
                    if (t.isP) {
                        const lbl = ['1st', '2nd', '3rd', '4th'][t.finPos];
                        this.add.text(GW / 2, GH / 2, lbl + ' PLACE!', {
                            fontSize: '48px', fontFamily: 'monospace',
                            color: t.finPos === 0 ? '#FFD700' : '#fff',
                            fontStyle: 'bold', stroke: '#000', strokeThickness: 5,
                        }).setOrigin(0.5).setDepth(100).setScrollFactor(0);
                        this.cameras.main.flash(400, 255, 215, 0);
                    }
                }
            }
        }
    }

    checkPks(t) {
        this.pkActive.forEach((p, i) => {
            if (!p.on) return;
            if (dist(t, p) < PICKUP_R + TS) {
                p.on = false; this.pkSprites[i].setVisible(false);
                if (p.type === 'money') {
                    gs.money += p.val;
                    this.floatTxt(p.x, p.y, '+$' + p.val.toLocaleString(), '#FFD700');
                    SFX.pickupMoney();
                } else {
                    t.nitros++; gs.nitros = t.nitros;
                    this.floatTxt(p.x, p.y, '+1 NITRO', '#ff6600');
                    SFX.pickupNitro();
                }
            }
        });
    }

    floatTxt(x, y, txt, col) {
        const ft = this.add.text(x, y, txt, {
            fontSize: '14px', fontFamily: 'monospace', color: col,
            fontStyle: 'bold', stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(90);
        this.tweens.add({ targets: ft, y: y - 40, alpha: 0, duration: 1000, onComplete: () => ft.destroy() });
    }

    spawnDust(x, y) {
        const d = this.add.circle(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 10,
            2 + Math.random() * 3, 0x998877, 0.5).setDepth(4);
        d._life = 30; this.dust.push(d);
    }

    // thin streaks behind the player showing speed
    spawnSpeedLine(t) {
        const bx = t.x - Math.cos(t.a) * TS * 1.4, by = t.y - Math.sin(t.a) * TS * 1.4;
        const color = this.td.synth ? 0x2af0ff : 0xffffff;
        const l = this.add.rectangle(bx, by, 8 + Math.random() * 10, 1.5, color, 0.8).setDepth(4);
        l.setRotation(t.a);
        l._life = 14; this.dust.push(l);
    }

    // tire skid marks on sharp turns
    spawnSkid(t) {
        const rx = -Math.sin(t.a), ry = Math.cos(t.a);
        const off = TS * 0.5;
        const color = this.td.synth ? 0x220033 : 0x111111;
        for (const s of [-1, 1]) {
            const sx = t.x + rx * off * s, sy = t.y + ry * off * s;
            const m = this.add.rectangle(sx, sy, 3, 3, color, 0.4).setDepth(2);
            m._life = 120; this.dust.push(m);
        }
    }

    // Guardrail collision sparks
    spawnGuardrailSparks(t) {
        for (let i = 0; i < 7; i++) {
            const angle = t.a + Math.PI + (Math.random() - 0.5) * 2.0;
            const spark = this.add.rectangle(
                t.x + Math.cos(angle) * 10, t.y + Math.sin(angle) * 10,
                2, 2, 0xffdd00, 1
            ).setDepth(20);
            spark._life = 6 + Math.random() * 10;
            this.dust.push(spark);
        }
    }

    // Landing smoke burst (gravity respawn)
    spawnLandingSmoke(x, y) {
        for (let i = 0; i < 18; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 6 + Math.random() * 22;
            const r = 3 + Math.random() * 7;
            const smoke = this.add.circle(x, y, r, 0xcccccc, 0.8).setDepth(18);
            this.tweens.add({
                targets: smoke,
                x: x + Math.cos(angle) * dist,
                y: y + Math.sin(angle) * dist - 14,
                scaleX: 2.8, scaleY: 2.8,
                alpha: 0,
                duration: 550 + Math.random() * 350,
                ease: 'Power1',
                onComplete: () => smoke.destroy(),
            });
        }
    }

    // Gravity: shrink, teleport to last road position, pop back up with a bang
    triggerFall(t) {
        const rx = t.lastRoadX, ry = t.lastRoadY;

        // Find the nearest waypoint segment to determine track-aligned respawn angle
        const wp = this.td.wp;
        let bestDist = Infinity, bestI = 0;
        for (let i = 0; i < wp.length; i++) {
            const ax = wp[i].x, ay = wp[i].y;
            const bx = wp[(i + 1) % wp.length].x, by = wp[(i + 1) % wp.length].y;
            const abx = bx - ax, aby = by - ay;
            const abLen2 = abx * abx + aby * aby;
            if (abLen2 < 1) continue;
            let tp = ((rx - ax) * abx + (ry - ay) * aby) / abLen2;
            tp = Phaser.Math.Clamp(tp, 0, 1);
            const d = Math.hypot(ax + tp * abx - rx, ay + tp * aby - ry);
            if (d < bestDist) { bestDist = d; bestI = i; }
        }
        const ra = Math.atan2(
            wp[(bestI + 1) % wp.length].y - wp[bestI].y,
            wp[(bestI + 1) % wp.length].x - wp[bestI].x
        );

        // Initialize fall timer (matches tween duration)
        t._fallMs = 680;

        // Kill any scale tweens (e.g. ramp animation) and reset to clean size
        this.tweens.killTweensOf(t.spr);
        t.spr.setDisplaySize(TRUCK_W, TRUCK_H);
        const normSx = t.spr.scaleX, normSy = t.spr.scaleY;

        if (t.isP) {
            SFX.fallWhoosh();
            this.cameras.main.shake(120, 0.005);
        }

        // Shrink to a dot — simulate falling into the distance
        this.tweens.add({
            targets: t.spr,
            scaleX: normSx * 0.04,
            scaleY: normSy * 0.04,
            duration: 680,
            ease: 'Power2.easeIn',
            onComplete: () => {
                // Teleport to last safe position and reset state
                t.x = rx; t.y = ry; t.a = ra;
                t.vx = 0; t.vy = 0;
                t.nAct = false; t.nTmr = 0;
                t.tMult = 1.0;
                t.spr.x = rx; t.spr.y = ry;

                this.spawnLandingSmoke(rx, ry);

                if (t.isP) {
                    SFX.landThud();
                    this.cameras.main.shake(250, 0.018);
                    this.floatTxt(rx, ry - 38, '💥 BACK ON TRACK!', '#FFD700');
                    this.cameras.main.flash(180, 255, 140, 0, true);
                }

                // Pop back up with a bouncy scale
                this.tweens.add({
                    targets: t.spr,
                    scaleX: normSx,
                    scaleY: normSy,
                    duration: 420,
                    ease: 'Back.easeOut',
                    onComplete: () => {
                        t.spr.setDisplaySize(TRUCK_W, TRUCK_H); // snap to exact size
                        t.falling = false;
                        t._fallGrace = 55; // brief immunity to prevent immediate re-fall
                    },
                });
            },
        });
    }

    nitroFX(t) {
        for (let i = 0; i < 12; i++) {
            const bx = t.x - Math.cos(t.a) * TS, by = t.y - Math.sin(t.a) * TS;
            // layered hot colours: cyan/yellow/orange/red for flame effect
            const col = this.td.synth
                ? [0x2af0ff, 0xff2a6d, 0xffee00, 0xff66cc][i % 4]
                : [0xffee00, 0xff8800, 0xff4400, 0xcc0000][i % 4];
            const fl = this.add.circle(bx + (Math.random() - 0.5) * 12, by + (Math.random() - 0.5) * 12,
                2 + Math.random() * 5, col, 0.95).setDepth(3);
            fl._life = 10 + Math.random() * 20; this.dust.push(fl);
        }
    }

    updateDust(dt) {
        for (let i = this.dust.length - 1; i >= 0; i--) {
            const p = this.dust[i]; p._life -= dt;
            const maxLife = p._maxLife || 30;
            if (!p._maxLife) p._maxLife = Math.max(30, p._life + dt);
            p.setAlpha(Math.max(0, p._life / p._maxLife));
            if (p._life <= 0) { p.destroy(); this.dust.splice(i, 1); }
        }
    }

    // ── Soccer ball graphics ──
    // ── Casino dice graphics ──
    drawDiceGfx(gfx, cx, cy, r, face) {
        gfx.clear();
        // die body — white square with rounded feel
        gfx.fillStyle(0xfafafa, 1);
        gfx.fillRoundedRect(cx - r, cy - r, r * 2, r * 2, r * 0.25);
        gfx.lineStyle(r * 0.08, 0x333333, 1);
        gfx.strokeRoundedRect(cx - r, cy - r, r * 2, r * 2, r * 0.25);
        // pips
        gfx.fillStyle(0x111111, 1);
        const pip = (px, py) => gfx.fillCircle(cx + px * r * 0.55, cy + py * r * 0.55, r * 0.13);
        const layouts = {
            1: [[0,0]],
            2: [[-1,-1],[1,1]],
            3: [[-1,-1],[0,0],[1,1]],
            4: [[-1,-1],[1,-1],[-1,1],[1,1]],
            5: [[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],
            6: [[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]],
        };
        (layouts[face] || layouts[1]).forEach(([px, py]) => pip(px, py));
    }

    // ── Casino dice collision + physics ──
    updateCasinoDice(dt) {
        const FRIC = 0.96, BOUNCE = 0.65;
        const TW = this.td.W || GW, TH = this.td.H || GH;
        this.casinoDice.forEach(d => {
            this.trucks.forEach(t => {
                const dist2 = Math.hypot(t.x - d.x, t.y - d.y);
                if (dist2 < d.r + TS && dist2 > 0.1) {
                    const nx = (d.x - t.x) / dist2, ny = (d.y - t.y) / dist2;
                    const overlap = d.r + TS - dist2;
                    d.x += nx * overlap; d.y += ny * overlap;
                    const spd = Math.hypot(t.vx, t.vy);
                    const imp = Math.max(t.vx * nx + t.vy * ny, spd * 0.3);
                    d.vx += nx * imp * 1.6; d.vy += ny * imp * 1.6;
                    t.vx -= nx * imp * 0.12; t.vy -= ny * imp * 0.12;
                    d.spin = (t.vx * ny - t.vy * nx) * 0.25;
                    // flip face when knocked hard enough
                    if (spd > 0.5) d.face = (Math.random() * 6 + 1) | 0;
                    SFX.ballKick();
                }
            });
            d.vx *= Math.pow(FRIC, dt); d.vy *= Math.pow(FRIC, dt);
            d.spin *= Math.pow(0.94, dt);
            d.x += d.vx * dt; d.y += d.vy * dt;
            if (d.x < d.r) { d.x = d.r; d.vx = Math.abs(d.vx) * BOUNCE; }
            if (d.x > TW - d.r) { d.x = TW - d.r; d.vx = -Math.abs(d.vx) * BOUNCE; }
            if (d.y < d.r) { d.y = d.r; d.vy = Math.abs(d.vy) * BOUNCE; }
            if (d.y > TH - d.r) { d.y = TH - d.r; d.vy = -Math.abs(d.vy) * BOUNCE; }
            d.gfx.x = d.x; d.gfx.y = d.y;
            d.gfx.rotation += d.spin * dt * 0.1;
            // redraw face if it changed (on knockover)
            if (d._lastFace !== d.face) {
                this.drawDiceGfx(d.gfx, 0, 0, d.r, d.face);
                d._lastFace = d.face;
            }
        });
    }

    drawSoccerBallGfx(gfx, cx, cy, r) {
        gfx.clear();
        // white base
        gfx.fillStyle(0xffffff, 1); gfx.fillCircle(cx, cy, r);
        // centre pentagon (dark)
        gfx.fillStyle(0x222222, 1);
        gfx.beginPath();
        for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2 - Math.PI / 2;
            const px2 = cx + Math.cos(a) * r * 0.35;
            const py2 = cy + Math.sin(a) * r * 0.35;
            p === 0 ? gfx.moveTo(px2, py2) : gfx.lineTo(px2, py2);
        }
        gfx.closePath(); gfx.fillPath();
        // outer pentagons
        for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2 - Math.PI / 2;
            const ox = cx + Math.cos(a) * r * 0.72;
            const oy = cy + Math.sin(a) * r * 0.72;
            gfx.beginPath();
            for (let q = 0; q < 5; q++) {
                const a2 = (q / 5) * Math.PI * 2 - Math.PI / 2;
                const px2 = ox + Math.cos(a2) * r * 0.25;
                const py2 = oy + Math.sin(a2) * r * 0.25;
                q === 0 ? gfx.moveTo(px2, py2) : gfx.lineTo(px2, py2);
            }
            gfx.closePath(); gfx.fillPath();
        }
        // outline
        gfx.lineStyle(r * 0.1, 0x333333, 1);
        gfx.strokeCircle(cx, cy, r);
    }

    // ── Subbuteo figure graphics ──
    drawSubbuteoGfx(gfx, cx, cy) {
        gfx.clear();
        // dome base
        gfx.fillStyle(0x1a1a1a, 1);
        gfx.fillEllipse(cx, cy + 12, 24, 10);
        gfx.fillStyle(0x222222, 1);
        gfx.fillEllipse(cx, cy + 10, 22, 8);
        // rod / peg
        gfx.fillStyle(0x333333, 1);
        gfx.fillRect(cx - 1.5, cy - 2, 3, 14);
        // body (blue shirt)
        gfx.fillStyle(0x1a4fc4, 1);
        gfx.fillRect(cx - 5, cy - 10, 10, 10);
        // white shorts
        gfx.fillStyle(0xffffff, 1);
        gfx.fillRect(cx - 4, cy, 8, 4);
        // legs
        gfx.fillStyle(0xe8c090, 1);
        gfx.fillRect(cx - 3, cy + 4, 2.5, 5);
        gfx.fillRect(cx + 0.5, cy + 4, 2.5, 5);
        // boots
        gfx.fillStyle(0x111111, 1);
        gfx.fillRect(cx - 3, cy + 9, 3, 2);
        gfx.fillRect(cx + 0.5, cy + 9, 3, 2);
        // head
        gfx.fillStyle(0xe8c090, 1);
        gfx.fillCircle(cx, cy - 13, 4);
        // hair
        gfx.fillStyle(0x3a2a1a, 1);
        gfx.beginPath(); gfx.arc(cx, cy - 14.5, 3.5, Math.PI, Math.PI * 2); gfx.closePath(); gfx.fillPath();
    }

    // ── Soccer ball & subbuteo collision + physics ──
    updateSoccerProps(dt) {
        const BALL_FRIC = 0.97;
        const BALL_BOUNCE = 0.7;
        const SUB_RADIUS = 14;

        // update soccer balls
        this.soccerBalls.forEach(b => {
            // truck-ball collisions
            this.trucks.forEach(t => {
                const d = Math.hypot(t.x - b.x, t.y - b.y);
                if (d < b.r + TS && d > 0.1) {
                    const nx = (b.x - t.x) / d, ny = (b.y - t.y) / d;
                    // push ball out of truck
                    const overlap = b.r + TS - d;
                    b.x += nx * overlap;
                    b.y += ny * overlap;
                    // pool-ball velocity transfer
                    const truckSpd = Math.hypot(t.vx, t.vy);
                    const impactDot = t.vx * nx + t.vy * ny;
                    const transferFactor = Math.max(impactDot, truckSpd * 0.3);
                    b.vx += nx * transferFactor * 1.8;
                    b.vy += ny * transferFactor * 1.8;
                    // slight deflection to truck
                    t.vx -= nx * transferFactor * 0.15;
                    t.vy -= ny * transferFactor * 0.15;
                    b.spin = (t.vx * ny - t.vy * nx) * 0.3;
                    SFX.ballKick();
                }
            });

            // ball-ball collisions (pool style)
            this.soccerBalls.forEach(b2 => {
                if (b2 === b) return;
                const d = Math.hypot(b.x - b2.x, b.y - b2.y);
                const minD = b.r + b2.r;
                if (d < minD && d > 0.1) {
                    const nx = (b2.x - b.x) / d, ny = (b2.y - b.y) / d;
                    const overlap = minD - d;
                    b.x -= nx * overlap * 0.5;
                    b.y -= ny * overlap * 0.5;
                    b2.x += nx * overlap * 0.5;
                    b2.y += ny * overlap * 0.5;
                    // elastic collision along normal
                    const relVn = (b.vx - b2.vx) * nx + (b.vy - b2.vy) * ny;
                    if (relVn > 0) {
                        b.vx -= relVn * nx * 0.5;
                        b.vy -= relVn * ny * 0.5;
                        b2.vx += relVn * nx * 0.5;
                        b2.vy += relVn * ny * 0.5;
                    }
                }
            });

            // physics
            b.vx *= Math.pow(BALL_FRIC, dt);
            b.vy *= Math.pow(BALL_FRIC, dt);
            b.spin *= Math.pow(0.95, dt);
            b.x += b.vx * dt;
            b.y += b.vy * dt;

            // boundary bounce
            if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * BALL_BOUNCE; }
            if (b.x > GW - b.r) { b.x = GW - b.r; b.vx = -Math.abs(b.vx) * BALL_BOUNCE; }
            if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * BALL_BOUNCE; }
            if (b.y > GH - b.r) { b.y = GH - b.r; b.vy = -Math.abs(b.vy) * BALL_BOUNCE; }

            // update graphics
            b.gfx.x = b.x;
            b.gfx.y = b.y;
            b.gfx.rotation += b.spin * dt * 0.1;
        });

        // update subbuteo figure
        if (this.subbuteo) {
            const sb = this.subbuteo;
            // truck-subbuteo collisions
            this.trucks.forEach(t => {
                const d = Math.hypot(t.x - sb.x, t.y - sb.y);
                if (d < SUB_RADIUS + TS && d > 0.1) {
                    const nx = (sb.x - t.x) / d;
                    // push figure slightly
                    const overlap = SUB_RADIUS + TS - d;
                    sb.x += nx * overlap * 0.3;
                    // determine tilt direction from impact
                    const impactSide = (t.x < sb.x) ? 1 : -1;
                    const truckSpd = Math.hypot(t.vx, t.vy);
                    sb.tiltVel += impactSide * Math.min(truckSpd * 0.15, 0.6);
                    // slight truck deflection
                    t.vx *= 0.92; t.vy *= 0.92;
                    SFX.subbuteoHit();
                }
            });

            // spring-damper wobble physics (like real subbuteo weighted base)
            const SPRING = 0.12;   // restoring force
            const DAMPING = 0.92;  // energy loss per frame
            const MAX_TILT = 0.7;  // max tilt angle in radians (~40 degrees)

            sb.tiltVel += -sb.tilt * SPRING * dt;
            sb.tiltVel *= Math.pow(DAMPING, dt);
            sb.tilt += sb.tiltVel * dt;
            sb.tilt = Phaser.Math.Clamp(sb.tilt, -MAX_TILT, MAX_TILT);

            // snap to rest when nearly still
            if (Math.abs(sb.tilt) < 0.005 && Math.abs(sb.tiltVel) < 0.005) {
                sb.tilt = 0; sb.tiltVel = 0;
            }

            sb.gfx.x = sb.x;
            sb.gfx.y = sb.baseY;
            sb.gfx.rotation = sb.tilt;
        }
    }

    // ── Halloween ghost ──
    drawGhostGfx(gfx, cx, cy) {
        gfx.clear();
        // ghostly glow
        gfx.fillStyle(0xffffff, 0.15);
        gfx.fillCircle(cx, cy - 4, 20);
        // main body
        gfx.fillStyle(0xeeeeff, 0.85);
        gfx.beginPath();
        gfx.moveTo(cx - 12, cy + 10);
        gfx.lineTo(cx - 14, cy - 4);
        gfx.arc(cx, cy - 8, 14, Math.PI, 0, false);
        gfx.lineTo(cx + 14, cy - 4);
        gfx.lineTo(cx + 12, cy + 10);
        // wavy bottom
        gfx.lineTo(cx + 8, cy + 6);
        gfx.lineTo(cx + 4, cy + 12);
        gfx.lineTo(cx, cy + 7);
        gfx.lineTo(cx - 4, cy + 12);
        gfx.lineTo(cx - 8, cy + 6);
        gfx.closePath();
        gfx.fillPath();
        // eyes
        gfx.fillStyle(0x111133, 1);
        gfx.fillEllipse(cx - 5, cy - 8, 5, 6);
        gfx.fillEllipse(cx + 5, cy - 8, 5, 6);
        // pupils
        gfx.fillStyle(0x4444ff, 1);
        gfx.fillCircle(cx - 5, cy - 7, 1.5);
        gfx.fillCircle(cx + 5, cy - 7, 1.5);
        // open mouth
        gfx.fillStyle(0x222244, 0.8);
        gfx.fillEllipse(cx, cy - 1, 5, 4);
    }

    updateGhost(dt, deltaMs) {
        const g = this.ghost;
        const GHOST_SPD = 1.8;
        const GHOST_R = 16;
        const FREEZE_MS = 2000;

        g.wobble += dt * 0.15;
        if (g.cooldown > 0) g.cooldown -= deltaMs;

        // drift towards nearest non-frozen truck
        let closest = null, closestD = Infinity;
        this.trucks.forEach(t => {
            if (t.fin || t.frozenTimer > 0) return;
            const d = dist(g, t);
            if (d < closestD) { closestD = d; closest = t; }
        });

        if (closest) {
            const dx = closest.x - g.x, dy = closest.y - g.y;
            const d = Math.hypot(dx, dy) || 1;
            // steer towards target with some wobble
            g.vx += (dx / d * GHOST_SPD - g.vx) * 0.03 * dt;
            g.vy += (dy / d * GHOST_SPD - g.vy) * 0.03 * dt;
        }

        // add sinusoidal drift for spooky floating movement
        g.vx += Math.sin(g.wobble * 3.1) * 0.02 * dt;
        g.vy += Math.cos(g.wobble * 2.7) * 0.02 * dt;

        // clamp speed
        const spd = Math.hypot(g.vx, g.vy);
        if (spd > GHOST_SPD) {
            g.vx = g.vx / spd * GHOST_SPD;
            g.vy = g.vy / spd * GHOST_SPD;
        }

        g.x += g.vx * dt;
        g.y += g.vy * dt;

        // boundary wrap
        if (g.x < -20) g.x = GW + 20;
        if (g.x > GW + 20) g.x = -20;
        if (g.y < -20) g.y = GH + 20;
        if (g.y > GH + 20) g.y = -20;

        // collision with trucks — freeze on contact
        if (g.cooldown <= 0) {
            this.trucks.forEach(t => {
                if (t.fin || t.frozenTimer > 0) return;
                if (dist(g, t) < GHOST_R + TS) {
                    t.frozenTimer = FREEZE_MS;
                    t.spr.setTint(0x88bbff); // icy blue tint
                    g.cooldown = 1500; // ghost can't freeze again immediately
                    SFX.ghostFreeze();
                    // ghost bounces away
                    const dx = g.x - t.x, dy = g.y - t.y;
                    const d = Math.hypot(dx, dy) || 1;
                    g.vx = dx / d * GHOST_SPD * 1.5;
                    g.vy = dy / d * GHOST_SPD * 1.5;
                    // ice particles
                    if (t.isP) {
                        this.floatTxt(t.x, t.y - 20, '❄ FROZEN! ❄', '#88bbff');
                    }
                }
            });
        }

        // update graphics position + bobbing
        g.gfx.x = g.x;
        g.gfx.y = g.y + Math.sin(g.wobble * 4) * 3;
        g.gfx.alpha = 0.7 + Math.sin(g.wobble * 5) * 0.15;
        g.gfx.scaleX = 1 + Math.sin(g.wobble * 3) * 0.05;
    }

    calcPositions() {
        const sorted = this.trucks.map((t, i) => {
            const prog = t.laps * 10000 + t.nxtCk * 2500 + (t.nxtCk < this.td.cks.length ? (2500 - dist(t, this.td.cks[t.nxtCk])) : 0);
            return { i, prog, fin: t.fin, fp: t.finPos };
        });
        sorted.sort((a, b) => {
            if (a.fin !== b.fin) return a.fin ? -1 : 1;
            if (a.fin && b.fin) return a.fp - b.fp;
            return b.prog - a.prog;
        });
        this.posOrder = sorted.map(s => s.i);
    }

    drawHUD() {
        const pi = this.posOrder ? this.posOrder.indexOf(0) : 0;
        const pl = ['1st', '2nd', '3rd', '4th'];
        const t0 = this.trucks[0];
        this.hPos.setText('POS: ' + pl[pi]);
        const lapGoal = this.td.laps || opts.laps || TOTAL_LAPS;
        this.hLap.setText('LAP: ' + Math.min(t0.laps + 1, lapGoal) + '/' + lapGoal);
        this.hMon.setText('$' + gs.money.toLocaleString());
        this.hNit.setText('NITRO: ' + t0.nitros + (t0.nAct ? ' 🔥' : ''));
        // speed meter
        const spd = Math.hypot(t0.vx, t0.vy);
        const ratio = Math.min(1, spd / ((t0.nAct ? t0.maxSpd * 1.5 : t0.maxSpd) + 0.001));
        this.hSpdFill.width = 90 * ratio;
        const col = ratio > 0.9 ? 0xff2a6d : ratio > 0.6 ? 0xffcc00 : 0x00ff88;
        this.hSpdFill.fillColor = col;
        if (this.posOrder) {
            this.hBoard.forEach((entry, i) => {
                const ti = this.posOrder[i];
                const tk = this.trucks[ti];
                entry.img.setTexture(tk.imgKey);
                entry.nameTxt.setText(tk.name).setColor(hexCSS(tk.col));
                entry.posTxt.setText(pl[i]).setColor(hexCSS(tk.col));
            });
        }

        // update mini-map truck dots
        if (this.miniG && this.isBig) {
            // redraw dots only (preserve path by accumulating — cheaper: full redraw)
            this.miniG.clear();
            this.miniG.lineStyle(2, 0x2af0ff, 0.8);
            this.miniG.beginPath();
            const wp = this.td.wp;
            for (let i = 0; i < wp.length; i++) {
                const sx = this.miniX + wp[i].x / this.td.W * this.miniW;
                const sy = this.miniY + wp[i].y / this.td.H * this.miniH;
                i === 0 ? this.miniG.moveTo(sx, sy) : this.miniG.lineTo(sx, sy);
            }
            this.miniG.closePath(); this.miniG.strokePath();
            this.trucks.forEach(tk => {
                const mx = this.miniX + tk.x / this.td.W * this.miniW;
                const my = this.miniY + tk.y / this.td.H * this.miniH;
                this.miniG.fillStyle(tk.col, 1);
                this.miniG.fillCircle(mx, my, tk.isP ? 3.5 : 2.5);
            });
        }
    }

    prefetchNextMusic() {
        const nextIdx = (gs.raceNum + 1) % TRACK_MUSIC.length;
        const nextKey = 'music_' + nextIdx;
        if (!this.cache.audio.exists(nextKey)) {
            this.load.audio(nextKey, TRACK_MUSIC[nextIdx]);
            this.load.start();
        }
    }

    endRace() {
        if (this.over) return;
        this.over = true;
        this.trucks.forEach(t => {
            if (!t.fin) { t.finPos = this.finOrder.length; this.finOrder.push(t); }
        });
        const pp = this.trucks[0].finPos;
        const prize = PRIZES[Math.min(pp, 3)];
        gs.money += prize;
        gs.raceNum++;
        gs.highestUnlocked = Math.min(Math.max(gs.highestUnlocked || 0, gs.raceNum), TRACKS.length - 1);
        gs.lastRes = {
            track: this.td.name, race: gs.raceNum,
            order: this.finOrder.map(t => ({ name: t.name, imgKey: t.imgKey, isP: t.isP, pos: t.finPos })),
            pp, prize,
        };
        this.sound.stopAll();
        SFX.engineStop();
        this.time.delayedCall(1000, () => this.scene.start('ResultsScene'));
    }
}

// ── RESULTS SCENE ───────────────────────────────────────────
class ResultsScene extends Phaser.Scene {
    constructor() { super('ResultsScene'); }

    create() {
        this.cameras.main.setBackgroundColor('#111');
        const r = gs.lastRes;

        this.add.text(GW / 2, 60, 'RACE RESULTS', {
            fontSize: '36px', fontFamily: 'monospace', color: '#FFD700', fontStyle: 'bold',
        }).setOrigin(0.5);

        this.add.text(GW / 2, 110, `Track: ${r.track}  ·  Race ${r.race}`, {
            fontSize: '18px', fontFamily: 'monospace', color: '#aaa',
        }).setOrigin(0.5);

        const pl = ['1st', '2nd', '3rd', '4th'];
        r.order.forEach((e, i) => {
            const y = 200 + i * 65;
            const imgX = GW / 2 - 120;
            this.add.image(imgX, y, e.imgKey).setOrigin(0.5).setDisplaySize(40, 40).setDepth(1);
            this.add.text(GW / 2 - 80, y, `${pl[i]}  ${e.name}${e.isP ? '  ◄ YOU' : ''}`, {
                fontSize: '26px', fontFamily: 'monospace',
                color: e.isP ? hexCSS(CHAR_COLORS[gs.playerIdx]) : '#ccc', fontStyle: 'bold',
            }).setOrigin(0, 0.5);
        });

        this.add.text(GW / 2, 490, `PRIZE:  $${r.prize.toLocaleString()}`, {
            fontSize: '28px', fontFamily: 'monospace', color: '#FFD700', fontStyle: 'bold',
        }).setOrigin(0.5);

        this.add.text(GW / 2, 540, `TOTAL:  $${gs.money.toLocaleString()}`, {
            fontSize: '22px', fontFamily: 'monospace', color: '#fff',
        }).setOrigin(0.5);

        const ct = this.add.text(GW / 2, 660, 'PRESS ENTER TO CONTINUE', {
            fontSize: '22px', fontFamily: 'monospace', color: '#fff',
        }).setOrigin(0.5);
        this.tweens.add({ targets: ct, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });

        const advance = () => this.scene.start('ShopScene');
        this.input.keyboard.on('keydown-ENTER', advance);
        this.input.keyboard.on('keydown-SPACE', advance);
    }
}

// ── SHOP SCENE ──────────────────────────────────────────────
class ShopScene extends Phaser.Scene {
    constructor() { super('ShopScene'); }

    create() {
        this.cameras.main.setBackgroundColor('#0d0d1a');

        this.add.text(GW / 2, 45, "SPEED SHOP", {
            fontSize: '34px', fontFamily: 'monospace', color: '#FFD700', fontStyle: 'bold',
        }).setOrigin(0.5);

        this.monTxt = this.add.text(GW / 2, 95, 'CASH: $' + gs.money.toLocaleString(), {
            fontSize: '24px', fontFamily: 'monospace', color: '#00ff00',
        }).setOrigin(0.5);

        this.lvlTxts = [];
        this.bars = [];

        UPGRADES.forEach((u, i) => {
            const y = 160 + i * 85;
            this.add.text(180, y, u.name, {
                fontSize: '22px', fontFamily: 'monospace', color: '#fff', fontStyle: 'bold',
            });
            this.add.text(180, y + 28, '$' + u.cost.toLocaleString(), {
                fontSize: '14px', fontFamily: 'monospace', color: '#888',
            });

            const cur = gs[u.key];
            const lt = this.add.text(480, y, `${cur}/${u.max}`, {
                fontSize: '18px', fontFamily: 'monospace', color: '#0af',
            });
            this.lvlTxts.push(lt);

            // bar segments
            const barGroup = [];
            for (let b = 0; b < u.max && b < 12; b++) {
                const filled = b < cur;
                const seg = this.add.rectangle(480 + b * 20, y + 30, 16, 10,
                    filled ? 0x00aaff : 0x222244).setOrigin(0, 0);
                barGroup.push(seg);
            }
            this.bars.push(barGroup);

            // buy button
            const btn = this.add.text(780, y + 4, '[ BUY ]', {
                fontSize: '20px', fontFamily: 'monospace', color: '#0f0',
                backgroundColor: '#002200', padding: { x: 10, y: 4 },
            }).setInteractive({ useHandCursor: true });
            btn.on('pointerdown', () => this.buy(u, i));
            btn.on('pointerover', () => btn.setColor('#6f6'));
            btn.on('pointerout', () => btn.setColor('#0f0'));
        });

        // keyboard shortcuts
        this.add.text(GW / 2, 610, 'Keys 1-5 to buy  ·  ENTER to race', {
            fontSize: '14px', fontFamily: 'monospace', color: '#666',
        }).setOrigin(0.5);

        const go = this.add.text(GW / 2, 680, '▶  START RACE  ◀', {
            fontSize: '28px', fontFamily: 'monospace', color: '#FFD700', fontStyle: 'bold',
            backgroundColor: '#332200', padding: { x: 20, y: 10 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        go.on('pointerdown', () => this.race());
        go.on('pointerover', () => go.setColor('#ffe080'));
        go.on('pointerout', () => go.setColor('#FFD700'));

        this.input.keyboard.on('keydown-ONE',   () => this.buy(UPGRADES[0], 0));
        this.input.keyboard.on('keydown-TWO',   () => this.buy(UPGRADES[1], 1));
        this.input.keyboard.on('keydown-THREE', () => this.buy(UPGRADES[2], 2));
        this.input.keyboard.on('keydown-FOUR',  () => this.buy(UPGRADES[3], 3));
        this.input.keyboard.on('keydown-FIVE',  () => this.buy(UPGRADES[4], 4));
        this.input.keyboard.on('keydown-ENTER', () => this.race());
        this.input.keyboard.on('keydown-SPACE', () => this.race());
    }

    buy(u, i) {
        if (gs.money >= u.cost && gs[u.key] < u.max) {
            gs.money -= u.cost;
            gs[u.key]++;
            this.monTxt.setText('CASH: $' + gs.money.toLocaleString());
            this.lvlTxts[i].setText(gs[u.key] + '/' + u.max);
            // update bar
            const cur = gs[u.key];
            if (cur - 1 < this.bars[i].length) {
                this.bars[i][cur - 1].setFillStyle(0x00aaff);
            }
        }
    }

    race() { this.scene.start('TrackSelectScene'); }
}

// ── TRACK SELECT SCENE ──────────────────────────────────────
class TrackSelectScene extends Phaser.Scene {
    constructor() { super('TrackSelectScene'); }

    create() {
        this.cameras.main.setBackgroundColor('#000');

        const COLS = 7;
        const BOX_W = 90, BOX_H = 70;
        const GAP_X = 16, GAP_Y = 18;
        const CELL_W = BOX_W + GAP_X;
        const CELL_H = BOX_H + GAP_Y;
        const numTracks = TRACKS.length;
        const numRows = Math.ceil(numTracks / COLS);
        const gridW = COLS * BOX_W + (COLS - 1) * GAP_X;
        const startX = (GW - gridW) / 2;
        const startY = 140;

        this._cols = COLS; this._boxW = BOX_W; this._boxH = BOX_H;
        this._cellW = CELL_W; this._cellH = CELL_H;

        this.add.text(GW / 2, 58, 'SELECT TRACK', {
            fontSize: '36px', fontFamily: 'monospace', color: '#FFD700', fontStyle: 'bold',
        }).setOrigin(0.5);

        const highestUnlocked = gs.highestUnlocked || 0;
        this.sel = Math.min(gs.raceNum % numTracks, highestUnlocked);
        this.boxes = [];

        for (let i = 0; i < numTracks; i++) {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            const cx = startX + col * CELL_W + BOX_W / 2;
            const cy = startY + row * CELL_H + BOX_H / 2;
            const unlocked = i <= highestUnlocked;

            const g = this.add.graphics();
            g.fillStyle(unlocked ? 0x111111 : 0x080808, 1);
            g.fillRect(cx - BOX_W / 2, cy - BOX_H / 2, BOX_W, BOX_H);
            g.lineStyle(2, unlocked ? 0xffffff : 0x333333, 1);
            g.strokeRect(cx - BOX_W / 2, cy - BOX_H / 2, BOX_W, BOX_H);

            this.add.text(cx, cy, String(i + 1), {
                fontSize: '26px', fontFamily: 'monospace',
                color: unlocked ? '#ffffff' : '#222222', fontStyle: 'bold',
            }).setOrigin(0.5);

            if (!unlocked) {
                this.add.text(cx + BOX_W / 2 - 13, cy - BOX_H / 2 + 8, '🔒', {
                    fontSize: '13px',
                }).setOrigin(0.5);
            }

            if (unlocked) {
                const zone = this.add.zone(cx, cy, BOX_W, BOX_H).setInteractive({ useHandCursor: true });
                zone.on('pointerover', () => { this.sel = i; this.updateHighlight(); this.updateTrackName(); });
                zone.on('pointerdown', () => { this.sel = i; this.confirm(); });
            }

            this.boxes.push({ cx, cy, unlocked });
        }

        this.selGraphics = this.add.graphics();
        this.updateHighlight();

        const nameY = startY + numRows * CELL_H - GAP_Y + 30;
        this.trackNameTxt = this.add.text(GW / 2, nameY, '', {
            fontSize: '20px', fontFamily: 'monospace', color: '#FFD700',
        }).setOrigin(0.5);
        this.updateTrackName();

        this.add.text(GW / 2, GH - 36, '← → ↑ ↓  navigate   ENTER  race   ESC  back', {
            fontSize: '14px', fontFamily: 'monospace', color: '#444',
        }).setOrigin(0.5);

        this.input.keyboard.on('keydown-LEFT',  () => this.move(-1));
        this.input.keyboard.on('keydown-RIGHT', () => this.move(1));
        this.input.keyboard.on('keydown-UP',    () => this.move(-COLS));
        this.input.keyboard.on('keydown-DOWN',  () => this.move(COLS));
        this.input.keyboard.on('keydown-ENTER', () => this.confirm());
        this.input.keyboard.on('keydown-SPACE', () => this.confirm());
        this.input.keyboard.on('keydown-ESC',   () => this.scene.start('MainMenuScene'));
    }

    move(delta) {
        const max = Math.min(gs.highestUnlocked || 0, TRACKS.length - 1);
        this.sel = Phaser.Math.Clamp(this.sel + delta, 0, max);
        this.updateHighlight();
        this.updateTrackName();
    }

    updateHighlight() {
        this.selGraphics.clear();
        const box = this.boxes[this.sel];
        if (!box) return;
        this.selGraphics.lineStyle(3, 0xFFD700, 1);
        this.selGraphics.strokeRect(
            box.cx - this._boxW / 2 - 3,
            box.cy - this._boxH / 2 - 3,
            this._boxW + 6,
            this._boxH + 6
        );
    }

    updateTrackName() {
        if (this.trackNameTxt && TRACKS[this.sel]) {
            this.trackNameTxt.setText(TRACKS[this.sel].name);
        }
    }

    confirm() {
        const max = gs.highestUnlocked || 0;
        if (this.sel > max) return;
        gs.raceNum = this.sel;
        this.cameras.main.flash(200, 255, 215, 0);
        this.time.delayedCall(200, () => this.scene.start('RaceScene'));
    }
}

// ── PHASER CONFIG ───────────────────────────────────────────
const config = {
    type: Phaser.AUTO,
    width: GW,
    height: GH,
    backgroundColor: '#000000',
    parent: 'game-container',
    loader: {
        // Works better for local file:// runs (e.g. opening index.html directly).
        imageLoadType: 'HTMLImageElement',
    },
    scene: [BootScene, MainMenuScene, TitleScene, PlayerSelectScene, TrackSelectScene, RaceScene, ResultsScene, ShopScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        fullscreenTarget: 'parent',
    },
    pixelArt: true,
};

new Phaser.Game(config);
