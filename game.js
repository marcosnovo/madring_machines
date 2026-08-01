// ============================================================
// KILÓMETRO CERO — top-down arcade racer
// Derivative work of leereilly/micro-machines (MIT). See NOTICE.
// Built with Phaser 3 · Procedural tracks and driver art
// ============================================================

// ── CONSTANTS ───────────────────────────────────────────────
/**
 * The design resolution. Every scene lays itself out against these two
 * numbers, and Phaser's Scale.FIT maps that design box onto whatever the
 * device actually has.
 *
 * They are `let`, not `const`, because 1024x768 is a *landscape* box: on a
 * phone held upright, FIT can only honour it by shrinking it until it fits
 * the width, which on a 412x915 screen leaves a 412x309 strip of game
 * between two enormous black bars — measured, not guessed. A top-down racer
 * has no reason to be landscape-only, so a portrait phone gets a portrait
 * design box instead and the same layout code fills the screen.
 *
 * Chosen once at boot and never changed: re-picking it on rotation would
 * mean re-laying-out every scene mid-race. Rotating after boot just falls
 * back to FIT's letterboxing, which is survivable; starting in the wrong
 * shape is not.
 *
 * Desktop is untouched — same 1024x768 it has always had.
 */
let GW = 1024;
let GH = 768;

(function pickDesignSize() {
    if (typeof window === 'undefined') return;
    const vw = window.innerWidth, vh = window.innerHeight;
    // `isTouchDevice` is a hoisted function declaration further down.
    if (!isTouchDevice() || vh <= vw) return;
    // Width first, height from the real aspect, so a tall phone gets a tall
    // canvas and no bars at all. Clamped so a freakish aspect ratio can't
    // produce a canvas the menus were never laid out for.
    GW = 720;
    GH = Math.round(Math.min(1600, Math.max(1080, GW * (vh / vw))));
})();

/** Portrait phone layout — see GW/GH. Desktop is always false. */
const IS_PORTRAIT = GH > GW;
const TOTAL_LAPS = 4;               // fallback for tracks with no `laps` of their own
const TS = 12;                       // truck half-size
const ROT_FRAMES = 24;              // rotation angles per truck
const ROAD_W = 50;                  // default road width
const CP_DIST = 40;                 // checkpoint trigger distance
const WP_DIST = 25;                 // AI waypoint advance distance
const PICKUP_R = 15;                // pickup collection radius
const TRUCK_W = 26;
const TRUCK_H = 38;

/**
 * Where the light comes from, in world radians, for the two 2D lighting cues
 * the cars get: the contact shadow under them and the specular streak on the
 * bodywork. It is not a free choice — it is measured off the MADRING bake.
 * The floodlight masts around the Valdebebas pitches (world ≈1100,200 in
 * images/madring-overhead.jpg) throw their shadows down and to the LEFT, so
 * the sun in that photograph sits up and to the right: −45°. Shadows therefore
 * fall at +135°, and both offsets stay fixed in world space while the sprite
 * rotates, which is exactly what stops a top-down car reading as a sticker.
 */
const SUN_A = -Math.PI / 4;
const SHADOW_DX = Math.cos(SUN_A + Math.PI) * 3.2;
const SHADOW_DY = Math.sin(SUN_A + Math.PI) * 3.2;

const C = {
    player: 0x7b5ea7, ai1: 0xf0c020, ai2: 0xe08a1e, ai3: 0xe88acc,
    road: 0x606060, roadEdge: 0x888888, dirt: 0x8B7355, grass: 0x4a8a3a,
    mud: 0x5a4830, hud: 0x111111, money: 0xFFD700, nitro: 0xff4400,
};

// ── DRIVERS ─────────────────────────────────────────────────
// Original cast, Madrid-themed. The bear and the strawberry tree are the
// city's coat of arms; a "gata" is a Madrid native of several generations;
// Cibeles is the city's landmark fountain. The four avatars are drawn
// procedurally from simple shapes at boot (see genDrivers). The four car
// sprites are baked top-down renders of the 3D mode's formula car (APEX
// FORMULA 2026, Apache-2.0 — see NOTICE), with the procedural cars kept as
// a fallback. No third-party character art anywhere.
const NAMES = ['OSO', 'GATA', 'CIBELES', 'MADROÑO'];
const CHAR_COLORS = [0xd8892c, 0x4f8fe0, 0x46c2a8, 0xd8452f];
const TCOLORS = [C.player, C.ai1, C.ai2, C.ai3];
const PLAYER_IMGS = ['avatar_oso', 'avatar_gata', 'avatar_cibeles', 'avatar_madrono'];
const CAR_SPRITES = ['car_oso', 'car_gata', 'car_cibeles', 'car_madrono'];
// Baked top-down renders of the 3D mode's formula car, one per driver colour
// (scripts/bake-car-sprites.js). Loaded in BootScene; genDrivers() draws its
// procedural cars only for whichever of these fail to load.
const CAR_SPRITE_FILES = ['images/car-oso.png', 'images/car-gata.png',
                          'images/car-cibeles.png', 'images/car-madrono.png'];
const TKEYS = ['player', 'ai1', 'ai2', 'ai3'];
const PRIZES = [100000, 90000, 80000, 70000];

// Music library. Each track picks its own file through its `music:` property —
// nothing is keyed off a track's position in TRACKS, so tracks can be inserted
// or reordered without the soundtrack sliding out of step. Several tracks share
// a file where the mood fits.
const MUSIC = {
    racingSpeed:  'music/mfcc-racing-speed-action-music-115041.mp3',
    speedCycling: 'music/mfcc-speed-speed-racing-cycling-music-257904.mp3',
    speedAction:  'music/mfcc-speed-action-racing-music-120442.mp3',
    speedRacing:  'music/mfcc-speed-racing-action-music-115039.mp3',
    asian:        'music/mfcc-asian-background-music-1-min-25-sec-371823.mp3',
    african:      'music/mfcc-african-background-music-372732.mp3',
    african2:     'music/mfcc-african-background-music-372732 (1).mp3',
    soccer:       'music/mfcc-sports-football-soccer-music-414731.mp3',
    halloween:    'music/mfcc-halloween-background-music-428574.mp3',
    arabic:       'music/mfcc-arabic-islamic-middle-east-music-372733.mp3',
    brazil:       'music/mfcc-brazil-music-festival-football-rio-brazilian-background-274292.mp3',
    country:      'music/mfcc-country-country-texas-cowboy-music-322875.mp3',
    christmas:    'music/mfcc-happy-christmas-music-winter-holidays-celebration-background-theme-269352.mp3',
    indian:       'music/mfcc-indian-bollywood-diwali-music-306679.mp3',
    italian:      'music/mfcc-italian-italy-tarantella-music-321645.mp3',
    casino:       'music/mfcc-jazz-music-casino-poker-roulette-las-vegas-background-intro-theme-287498.mp3',
    irish:        'music/mfcc-medieval-irish-celtic-ireland-music-318197.mp3',
    mexican:      'music/mfcc-mexican-mexican-mexico-mariachi-music-290633.mp3',
    reggae:       'music/mfcc-reggae-reggaeton-jamaican-music-326054.mp3',
    spanish:      'music/mfcc-spanish-spanish-spain-music-373166.mp3',
    jungle:       'music/mfcc-wildlife-jungle-forest-background-music-263783.mp3',
};

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
    player: 'car_oso',
    ai1: 'car_gata',
    ai2: 'car_cibeles',
    ai3: 'car_madrono',
};

const UPGRADES = [
    { key: 'tires',        name: 'TIRES',         cost: 40000,  max: 10 },
    { key: 'shocks',       name: 'SHOCKS',        cost: 60000,  max: 10 },
    { key: 'acceleration', name: 'ACCELERATION',   cost: 80000,  max: 10 },
    { key: 'topSpeed',     name: 'TOP SPEED',      cost: 100000, max: 10 },
    { key: 'nitros',       name: 'NITRO (×1)',     cost: 1000,   max: 99 },
];

// MADRING ground texture — a real overhead view of the circuit rather than
// invented scenery, baked from the Sketchfab model by
// scripts/madring-bake-overhead.js at one image pixel per world pixel.
// See NOTICE for the model's CC-BY-4.0 attribution.
const MADRING_BG_KEY = 'madring_overhead';
const MADRING_BG_SRC = 'images/madring-overhead.jpg';

// ── TRACK DATA ──────────────────────────────────────────────
const TRACKS = [
    {
        // ── MADRING — the IFEMA-Valdebebas street course, Madrid ──
        // The control points below are MEASURED, not level design: generated by
        // scripts/madring-road-centre.js, which walks the middle of the real
        // circuit's asphalt in the 3D model the background is rendered from
        // (Dave Love, CC-BY-4.0 — see NOTICE) with the lap's identity — start
        // line, direction, corner order — taken from the published geodata
        // (bacinger/f1-circuits, MIT). They are inlined because game.js is
        // bundled standalone. Do not hand-tune the shape: every waypoint of it
        // currently lands on the model's tarmac, which is the same tarmac
        // images/madring-overhead.jpg shows, and a nudge here is a car driving
        // over painted grass there.
        //
        // The published polyline used to be the sole source, and over 636 m of
        // the lap it cuts diagonally across the infield while the circuit does
        // not — 11.8% of the road was laid on grass and buildings, up to 81 m
        // from the nearest asphalt. See scripts/MADRING-VALIDATION.md.
        //
        // 256 points at 5 samples each, not 64 at 20. What the car drives is the
        // Catmull-Rom spline, not the points, and at 64 control points that
        // spline cut every corner: up to 17.8 m of deviation, further than the
        // road is wide. Samples-per-point 5 lands that finer curve on exactly
        // 1280 waypoints, so everything addressed by waypoint index — AI
        // look-ahead, tunnel spans, the start stagger — keeps the spacing it was
        // tuned for. Re-run scripts/madring-validate.js before touching either.
        //   world 1338 x 2033 px · 1.0274 px/m · lap 5429 m (published 5474 m)
        //   tightest pinch where two legs run side by side: 54.8 m vs a 44.8 m road
        name: 'MADRING', theme: 'madrid',
        seed: 23,
        music: MUSIC.spanish,
        W: 1338, H: 2033,
        rw: 46,
        spp: 5,
        laps: 4,
        cp: [
            {x:855,y:1839},{x:834,y:1840},{x:812,y:1844},{x:791,y:1847},
            {x:769,y:1851},{x:748,y:1856},{x:727,y:1862},{x:706,y:1866},
            {x:684,y:1870},{x:663,y:1874},{x:641,y:1876},{x:625,y:1890},
            {x:614,y:1908},{x:608,y:1929},{x:592,y:1941},{x:570,y:1941},
            {x:548,y:1941},{x:526,y:1939},{x:505,y:1936},{x:484,y:1928},
            {x:467,y:1916},{x:452,y:1899},{x:440,y:1881},{x:428,y:1863},
            {x:416,y:1845},{x:404,y:1826},{x:392,y:1808},{x:380,y:1790},
            {x:368,y:1772},{x:356,y:1753},{x:345,y:1735},{x:333,y:1717},
            {x:321,y:1698},{x:309,y:1680},{x:297,y:1662},{x:285,y:1644},
            {x:274,y:1625},{x:262,y:1607},{x:250,y:1589},{x:238,y:1570},
            {x:227,y:1552},{x:216,y:1533},{x:205,y:1514},{x:195,y:1495},
            {x:187,y:1474},{x:180,y:1454},{x:172,y:1433},{x:167,y:1412},
            {x:161,y:1391},{x:158,y:1369},{x:156,y:1348},{x:154,y:1326},
            {x:154,y:1304},{x:155,y:1282},{x:158,y:1261},{x:162,y:1239},
            {x:167,y:1218},{x:174,y:1197},{x:180,y:1177},{x:188,y:1156},
            {x:196,y:1136},{x:204,y:1116},{x:205,y:1094},{x:207,y:1072},
            {x:204,y:1051},{x:199,y:1029},{x:192,y:1009},{x:185,y:988},
            {x:176,y:968}, {x:166,y:949}, {x:156,y:929}, {x:146,y:910},
            {x:136,y:891}, {x:128,y:870}, {x:122,y:849}, {x:117,y:828},
            {x:112,y:807}, {x:106,y:786}, {x:99,y:765},  {x:100,y:744},
            {x:116,y:729}, {x:127,y:711}, {x:128,y:689}, {x:121,y:668},
            {x:111,y:649}, {x:101,y:630}, {x:93,y:610},  {x:92,y:588},
            {x:91,y:566},  {x:91,y:544},  {x:91,y:522},  {x:91,y:501},
            {x:92,y:479},  {x:92,y:457},  {x:92,y:435},  {x:92,y:413},
            {x:92,y:392},  {x:91,y:370},  {x:91,y:348},  {x:92,y:326},
            {x:92,y:304},  {x:92,y:283},  {x:93,y:261},  {x:93,y:239},
            {x:95,y:217},  {x:97,y:196},  {x:101,y:174}, {x:108,y:153},
            {x:116,y:133}, {x:127,y:114}, {x:140,y:97},  {x:155,y:82},
            {x:173,y:69},  {x:193,y:60},  {x:214,y:54},  {x:235,y:51},
            {x:257,y:52},  {x:279,y:55},  {x:299,y:62},  {x:318,y:73},
            {x:336,y:86},  {x:350,y:102}, {x:362,y:120}, {x:371,y:140},
            {x:376,y:161}, {x:378,y:183}, {x:377,y:205}, {x:374,y:226},
            {x:368,y:247}, {x:360,y:268}, {x:349,y:287}, {x:337,y:304},
            {x:323,y:322}, {x:310,y:339}, {x:296,y:356}, {x:283,y:373},
            {x:269,y:390}, {x:255,y:407}, {x:242,y:424}, {x:229,y:441},
            {x:215,y:458}, {x:202,y:476}, {x:188,y:493}, {x:174,y:509},
            {x:159,y:525}, {x:149,y:544}, {x:148,y:566}, {x:157,y:585},
            {x:173,y:601}, {x:191,y:613}, {x:210,y:623}, {x:229,y:634},
            {x:247,y:646}, {x:265,y:659}, {x:283,y:670}, {x:299,y:685},
            {x:305,y:706}, {x:306,y:727}, {x:303,y:749}, {x:302,y:771},
            {x:303,y:793}, {x:303,y:815}, {x:304,y:836}, {x:306,y:858},
            {x:312,y:879}, {x:322,y:898}, {x:335,y:916}, {x:351,y:931},
            {x:369,y:943}, {x:389,y:952}, {x:410,y:958}, {x:431,y:961},
            {x:453,y:961}, {x:475,y:961}, {x:497,y:961}, {x:519,y:960},
            {x:540,y:960}, {x:562,y:958}, {x:583,y:951}, {x:604,y:945},
            {x:624,y:951}, {x:640,y:966}, {x:649,y:986}, {x:659,y:1005},
            {x:670,y:1024},{x:682,y:1043},{x:693,y:1061},{x:704,y:1080},
            {x:717,y:1098},{x:730,y:1115},{x:748,y:1127},{x:769,y:1132},
            {x:791,y:1129},{x:812,y:1123},{x:833,y:1117},{x:854,y:1113},
            {x:876,y:1113},{x:897,y:1118},{x:917,y:1127},{x:935,y:1139},
            {x:950,y:1154},{x:962,y:1173},{x:970,y:1193},{x:975,y:1214},
            {x:978,y:1236},{x:982,y:1257},{x:986,y:1279},{x:989,y:1300},
            {x:993,y:1322},{x:997,y:1343},{x:1001,y:1365},{x:1005,y:1386},
            {x:1008,y:1408},{x:1012,y:1429},{x:1016,y:1451},{x:1020,y:1472},
            {x:1033,y:1489},{x:1053,y:1486},{x:1070,y:1473},{x:1090,y:1463},
            {x:1111,y:1461},{x:1133,y:1460},{x:1155,y:1459},{x:1177,y:1460},
            {x:1195,y:1471},{x:1202,y:1492},{x:1207,y:1513},{x:1211,y:1534},
            {x:1215,y:1556},{x:1219,y:1577},{x:1223,y:1599},{x:1227,y:1620},
            {x:1231,y:1642},{x:1235,y:1663},{x:1239,y:1684},{x:1243,y:1706},
            {x:1247,y:1727},{x:1249,y:1749},{x:1237,y:1766},{x:1217,y:1775},
            {x:1196,y:1781},{x:1175,y:1780},{x:1153,y:1779},{x:1132,y:1782},
            {x:1110,y:1786},{x:1089,y:1791},{x:1068,y:1795},{x:1046,y:1800},
            {x:1025,y:1804},{x:1003,y:1807},{x:982,y:1811},{x:960,y:1815},
            {x:939,y:1819},{x:917,y:1823},{x:896,y:1827},{x:876,y:1835},
        ],
        mud: [],
        // La Monumental: the banked semicircle at the north end, taken flat out.
        // Banking can't be shown geometrically from above, so it is a terrain
        // type instead. The span is measured, not chosen: the sustained
        // right-hand arc on this centreline turns 170° in 428 m below a 200 m
        // radius, and 210° in 572 m below 400 m — that wider bracket is what is
        // used here, because the real banking runs into the entry and exit
        // sweeps too. Published figure 180° over 550 m.
        bankWp: [0.408, 0.512],
        // Two tunnels, and unlike everything else on this track they used to be
        // invented. They are now where the model puts them: the two places where
        // the circuit's own concrete overpass decks cross the racing line —
        // 25.1% (the chicane under the motorway, published T5/T6) and 71.4%
        // (the Valdebebas/IFEMA crossing before Curva Norte, published T18).
        // Found by scripts/madring-validate.js, which intersects the model's
        // Cement001 and bridge-deck meshes with the waypoints.
        tunnels: [{frac: 0.251, len: 18}, {frac: 0.714, len: 18}],
        // Nitro sits on the two longest flat-out runs — the 428 m blast down the
        // west side and the drag back to the start line — not at random.
        nitroWp: [0.10, 0.15, 0.955],
    },
    {
        name: 'SIDEWINDER',
        seed: 0,
        music: MUSIC.racingSpeed,
        groundDecor: 'ants',
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
        seed: 1,
        music: MUSIC.speedCycling,
        groundDecor: 'spiders',
        cp: [
            {x:350,y:700},{x:620,y:710},{x:850,y:640},{x:920,y:480},
            {x:860,y:320},{x:680,y:240},{x:500,y:320},{x:380,y:240},
            {x:200,y:175},{x:100,y:320},{x:110,y:500},{x:180,y:630},
        ],
        rw: ROAD_W,
        mud: [{x:500,y:320,r:28}],
    },
    {
        name: 'WIPEOUT', theme: 'asian',
        seed: 2,
        music: MUSIC.asian,
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
        seed: 3,
        music: MUSIC.speedAction,
        groundDecor: 'daisies',
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
        seed: 4,
        music: MUSIC.african,
        groundDecor: 'mushrooms',
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
        name: 'CLIFFHANGER', theme: 'soccer',
        seed: 5,
        music: MUSIC.soccer,
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
        seed: 6,
        music: MUSIC.speedRacing,
        groundDecor: 'cigarettes',
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
        name: 'HURRICANE GULCH', theme: 'halloween',
        seed: 7,
        music: MUSIC.halloween,
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
        seed: 8,
        music: MUSIC.african2,
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
        seed: 9,
        music: MUSIC.arabic,
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
        seed: 10,
        music: MUSIC.brazil,
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
        seed: 11,
        music: MUSIC.country,
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
        seed: 12,
        music: MUSIC.christmas,
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
        seed: 13,
        music: MUSIC.indian,
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
        seed: 14,
        music: MUSIC.italian,
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
        seed: 15,
        music: MUSIC.casino,
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
        seed: 16,
        music: MUSIC.irish,
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
        seed: 17,
        music: MUSIC.mexican,
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
        seed: 18,
        music: MUSIC.reggae,
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
        seed: 19,
        music: MUSIC.spanish,
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
        seed: 20,
        music: MUSIC.jungle,
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
        seed: 21,
        synth: true,
        music: MUSIC.speedAction,   // shares BLASTER's driving theme — closest to synthwave
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
        seed: 22,
        desk: true,
        music: MUSIC.racingSpeed,   // no desk-flavoured track in the library; keeps what it played before
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

/**
 * How many of the tracks above are actually shipped, counted from the top —
 * so 1 means the MADRING and nothing else.
 *
 * The rest are the inherited procedural circuits. They still build and play;
 * they are held back so the game is about the one real, measured circuit
 * rather than a menu of twenty-four. Raise this number (or delete the two
 * lines) to bring them back — nothing else refers to a track by index, and
 * every place that picks one already goes through `% TRACKS.length`.
 *
 * Truncating rather than filtering at the menu also means BootScene never
 * generates the hidden tracks' geometry or their full-screen theme
 * backdrops, which is most of the loading time on a phone.
 */
const SHIPPED_TRACKS = 1;
TRACKS.length = SHIPPED_TRACKS;

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

    // "KM 0" road-marker sticker on the laptop lid — the milestone that all
    // Spanish radial roads are measured from, and this project's namesake.
    (function drawKmZeroSticker() {
        const ox = d.laptop.x + d.laptop.w * 0.22, oy = d.laptop.y - d.laptop.h * 0.15;
        const R = 180;
        // sticker backing (round, off-white)
        vx.fillStyle = '#f4f1e8';
        vx.beginPath(); vx.arc(ox, oy, R + 14, 0, Math.PI * 2); vx.fill();
        vx.strokeStyle = 'rgba(0,0,0,0.2)'; vx.lineWidth = 3;
        vx.beginPath(); vx.arc(ox, oy, R + 14, 0, Math.PI * 2); vx.stroke();
        // stone slab
        vx.fillStyle = '#3a3f47';
        vx.fillRect(ox - R * 0.78, oy - R * 0.78, R * 1.56, R * 1.56);
        vx.strokeStyle = '#c8a34a'; vx.lineWidth = 8;
        vx.strokeRect(ox - R * 0.64, oy - R * 0.64, R * 1.28, R * 1.28);
        // six radial roads fanning out from the centre point
        vx.strokeStyle = '#c8a34a'; vx.lineWidth = 6; vx.lineCap = 'round';
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
            vx.beginPath();
            vx.moveTo(ox + Math.cos(a) * R * 0.16, oy + Math.sin(a) * R * 0.16);
            vx.lineTo(ox + Math.cos(a) * R * 0.56, oy + Math.sin(a) * R * 0.56);
            vx.stroke();
        }
        // centre disc
        vx.fillStyle = '#c8a34a';
        vx.beginPath(); vx.arc(ox, oy, R * 0.2, 0, Math.PI * 2); vx.fill();
        vx.fillStyle = '#3a3f47';
        vx.font = 'bold 40px monospace'; vx.textAlign = 'center'; vx.textBaseline = 'middle';
        vx.fillText('0', ox, oy + 2);
        // sticker caption
        vx.fillStyle = '#3a3f47';
        vx.font = 'bold 30px monospace'; vx.textAlign = 'center'; vx.textBaseline = 'middle';
        vx.fillText('KM 0', ox, oy + R + 40);
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
        // Launched (not started), so it runs in parallel and outlives every
        // scene transition after this — one button, alive for the whole
        // session, rather than re-adding it to every one of the 8 scenes.
        this.scene.launch('HudOverlayScene');

        this._createLoadingUI();

        this.load.on('progress', (value) => this._updateBar(value * 0.4));
        this.load.on('fileprogress', (file) => this._setStatus(`Loading ${file.key}…`));
        this.load.on('loaderror', (file) => {
            console.warn('Asset load failed:', file.key, file.src || 'unknown source');
        });

        // The four car sprites are top-down renders of the same formula car
        // the 3D mode drives (madring-3d/public/models/f1car-2026.glb, APEX
        // FORMULA 2026, Apache-2.0 — see NOTICE), baked per driver colour by
        // scripts/bake-car-sprites.js. If any file fails to load, genDrivers()
        // notices the missing texture and draws its procedural car instead —
        // same policy as the MADRING ground below: a missing file costs art,
        // not a playable game. The portrait avatars are still procedural.
        CAR_SPRITES.forEach((key, i) => this.load.image(key, CAR_SPRITE_FILES[i]));

        // The MADRING's ground: a real overhead view of the circuit, baked
        // from a 3D model of it by scripts/madring-bake-overhead.js. See
        // TRACKS[0] and NOTICE. If it fails to load the track falls back to
        // drawing its own scenery.
        this.load.image(MADRING_BG_KEY, MADRING_BG_SRC);
    }

    create() {
        this.genDrivers();
        this.genTrucks();
        this.genPickups();
        this.genFxSprites();
        this._updateBar(0.4);
        this._setStatus('Building tracks…');
        this._genTracksAsync(() => {
            this._updateBar(1.0);
            this._setStatus('Ready!');
            // Warm browser cache for first 2 race tracks' music in background (non-blocking).
            // fetch() shares the HTTP cache with Phaser's XHR audio loader so the
            // downloads start now rather than blocking the first race transition.
            TRACKS.slice(0, 2).forEach(t => t.music && fetch(t.music).catch(() => {}));
            this.time.delayedCall(300, () => this.scene.start('MainMenuScene'));
        });
    }

    // ── DRIVERS (original art, generated from simple shapes) ─────────────
    // Builds the four portrait avatars (avatar_*), and a car sprite (car_*)
    // for any driver whose baked render (images/car-*.png, from the 3D
    // mode's own formula car — see preload) did not load. Cars are drawn
    // nose-up because syncSprite() adds +90° to any texture whose key starts
    // with "car_".
    genDrivers() {
        const roundRect = (ctx, x, y, w, h, r) => {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y,     x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x,     y + h, r);
            ctx.arcTo(x,     y + h, x,     y,     r);
            ctx.arcTo(x,     y,     x + w, y,     r);
            ctx.closePath();
        };
        const shade = (col, f) => {
            const r = Math.min(255, ((col >> 16) & 0xff) * f) | 0;
            const g = Math.min(255, ((col >> 8) & 0xff) * f) | 0;
            const b = Math.min(255, (col & 0xff) * f) | 0;
            return `rgb(${r},${g},${b})`;
        };

        // ── car sprites: 104×152, nose pointing up ──
        //
        // Sized 4x TRUCK_W × TRUCK_H, which is both bigger than the old 72×132
        // (so the downscale does the antialiasing) and — unlike 72×132 — the
        // SAME 26:38 aspect ratio the sprite is displayed at, so the car is no
        // longer stretched 26% wider than it was drawn.
        //
        // Every decision here is about reading at 26×38 px on the MADRING's
        // baked aerial, which is far darker and busier than the flat green the
        // old sprite was drawn against:
        //   · a soft black halo under the whole car, so it never sits flush
        //     against a dark background. It is radially symmetric on purpose —
        //     the sprite rotates with the car, and a directional drop shadow
        //     would swing round with it.
        //   · a hard black outline and then a white rim light, so the
        //     silhouette survives even where the asphalt is nearly the same
        //     value as the paint.
        //   · a car-shaped car: pointed nose, flared wheel arches over four
        //     tyres that poke out at the corners, front splitter and rear wing.
        //     Closed-wheel rather than open-wheel deliberately — an F1 shape
        //     spends most of a 26 px width on black tyre, and the driver's
        //     colour is the thing that has to survive.
        //   · a driver in the cockpit: white helmet, dark visor. At this size
        //     the helmet is the brightest thing on the car and is what tells
        //     you which way it is pointing.
        //   · one livery per driver rather than one livery in four colours, so
        //     they are told apart by pattern as well as by hue.
        const CAR_W = TRUCK_W * 4, CAR_H = TRUCK_H * 4;   // 104 × 152

        // Half-width of the bodywork at a series of stations down the car,
        // nose first. Kept as a table because the shape was tuned by looking at
        // it at 26 px, and a table is what you can actually tune.
        const HULL = [
            [8, 13], [18, 22], [30, 29], [42, 36], [56, 36], [66, 29],
            [84, 29], [96, 32], [108, 38], [128, 38], [140, 32], [147, 26],
        ];
        // Smooth closed outline through the table and its mirror image.
        // `g` grows the shape evenly, for the shadow pass and the rim light.
        const bodyPath = (ctx, g = 0) => {
            const pts = HULL.map(([y, w]) => [52 + w + g, y])
                .concat(HULL.map(([y, w]) => [52 - w - g, y]).reverse());
            ctx.beginPath();
            const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            ctx.moveTo(...mid(pts[pts.length - 1], pts[0]));
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i], b = pts[(i + 1) % pts.length];
                ctx.quadraticCurveTo(a[0], a[1], ...mid(a, b));
            }
            ctx.closePath();
        };

        // Per-driver livery, painted on top of the body. Four different
        // patterns rather than one pattern in four colours: at 26 px across, a
        // stripe and a chequer are easier to tell apart in the mirror than
        // orange and red are.
        //
        // All of them stay off the nose — above y≈30 the body is narrower than
        // the marking, so anything drawn up there turns the whole front white
        // and eats the driver's colour — and none covers more than about a
        // quarter of the bodywork, because the colour is the identity.
        const WHITE = 'rgba(246,248,255,0.94)';
        const liveries = [
            // OSO — single spine stripe
            (ctx, col) => {
                ctx.fillStyle = shade(col, 0.45);
                ctx.fillRect(41, 34, 22, 106);
                ctx.fillStyle = WHITE;
                ctx.fillRect(44, 34, 16, 106);
            },
            // GATA — twin racing stripes
            (ctx) => {
                ctx.fillStyle = WHITE;
                ctx.fillRect(36, 34, 8, 106);
                ctx.fillRect(60, 34, 8, 106);
            },
            // CIBELES — white nose flash and tail band
            (ctx, col) => {
                ctx.fillStyle = WHITE;
                ctx.beginPath();
                ctx.moveTo(52, 12); ctx.quadraticCurveTo(64, 20, 68, 42);
                ctx.lineTo(36, 42); ctx.quadraticCurveTo(40, 20, 52, 12);
                ctx.closePath(); ctx.fill();
                ctx.fillRect(24, 124, 56, 11);
                ctx.fillStyle = shade(col, 1.45);
                ctx.fillRect(24, 114, 56, 10);
            },
            // MADROÑO — chequered band around the middle
            (ctx) => {
                ctx.fillStyle = WHITE;
                for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++)
                    if ((r + c) % 2 === 0) ctx.fillRect(18 + c * 8.5, 96 + r * 10, 8.5, 10);
            },
        ];

        CHAR_COLORS.forEach((col, i) => {
            // The baked render of the 3D mode's formula car loaded in
            // preload() wins when it is present; everything below is the
            // fallback for a missing/failed file, kept so the game never
            // boots without four distinguishable cars.
            if (this.textures.exists(CAR_SPRITES[i])) return;

            const cv = document.createElement('canvas');
            cv.width = CAR_W; cv.height = CAR_H;
            const ctx = cv.getContext('2d');

            const TYRES = [[6, 30, 19, 32, 7], [79, 30, 19, 32, 7],
                           [4, 100, 21, 40, 8], [79, 100, 21, 40, 8]];

            // ── contact shadow ──
            // Two passes of a blurred black silhouette, so the car never sits
            // flush against a dark background. Symmetric, so it stays put as
            // the sprite rotates, and wide enough to survive the 4x downscale
            // as roughly a 1 px dark rim.
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.85)';
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            for (const blur of [16, 8]) {
                ctx.shadowBlur = blur;
                bodyPath(ctx, 2); ctx.fill();
                TYRES.forEach(([x, y, w, h, r]) => { roundRect(ctx, x, y, w, h, r); ctx.fill(); });
            }
            ctx.restore();

            // ── tyres: poking out at the four corners, with a tread highlight ──
            TYRES.forEach(([wx, wy, ww, wh, r]) => {
                ctx.fillStyle = '#131318';
                roundRect(ctx, wx, wy, ww, wh, r); ctx.fill();
                ctx.fillStyle = 'rgba(160,166,182,0.32)';
                ctx.fillRect(wx + 3, wy + wh * 0.26, ww - 6, 3);
                ctx.fillRect(wx + 3, wy + wh * 0.64, ww - 6, 3);
            });

            // ── front splitter and rear wing, under the body ──
            ctx.fillStyle = shade(col, 0.55);
            roundRect(ctx, 16, 4, 72, 12, 4); ctx.fill();
            roundRect(ctx, 8, 132, 88, 15, 4); ctx.fill();
            ctx.fillStyle = '#15151a';                       // endplates
            roundRect(ctx, 8, 132, 11, 15, 4); ctx.fill();
            roundRect(ctx, 85, 132, 11, 15, 4); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.35)';              // wing shadow line
            ctx.fillRect(19, 138, 66, 3);

            // ── body ──
            ctx.fillStyle = shade(col, 1.05);
            bodyPath(ctx); ctx.fill();

            liveries[i](ctx, col);

            // wheel-arch flares: a darker lip of bodywork over each tyre, which
            // is what makes the shape read as a car and not a lozenge
            ctx.fillStyle = shade(col, 0.62);
            roundRect(ctx, 15, 32, 13, 28, 6); ctx.fill();
            roundRect(ctx, 76, 32, 13, 28, 6); ctx.fill();
            roundRect(ctx, 13, 102, 15, 36, 7); ctx.fill();
            roundRect(ctx, 76, 102, 15, 36, 7); ctx.fill();

            // ── cockpit and driver ──
            ctx.fillStyle = '#15161c';
            ctx.beginPath(); ctx.ellipse(52, 76, 16, 23, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#f2f4f8';                       // helmet
            ctx.beginPath(); ctx.arc(52, 72, 11, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = shade(col, 1.35);                // helmet band
            ctx.fillRect(41, 66, 22, 5);
            ctx.fillStyle = '#1b1d26';                       // visor, facing forward
            ctx.beginPath(); ctx.ellipse(52, 66, 8, 4.5, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#2a2c36';                       // roll hoop behind the head
            roundRect(ctx, 42, 88, 20, 12, 5); ctx.fill();

            // ── lights: white forward, red back — the fastest orientation cue ──
            ctx.fillStyle = '#fffbe4';
            roundRect(ctx, 30, 22, 13, 8, 3); ctx.fill();
            roundRect(ctx, 61, 22, 13, 8, 3); ctx.fill();
            ctx.fillStyle = '#f04a30';
            roundRect(ctx, 24, 122, 15, 8, 3); ctx.fill();
            roundRect(ctx, 65, 122, 15, 8, 3); ctx.fill();

            // ── outline, then rim light ──
            ctx.lineJoin = 'round';
            ctx.strokeStyle = 'rgba(0,0,0,0.92)'; ctx.lineWidth = 5;
            bodyPath(ctx); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = 2.5;
            bodyPath(ctx, -2.5); ctx.stroke();

            this.textures.addCanvas(CAR_SPRITES[i], cv);
        });

        // ── portrait avatars: 128×128 badge + emblem ──
        const emblems = [
            // OSO — the bear of Madrid's coat of arms
            (ctx) => {
                ctx.fillStyle = '#7a4f22';
                ctx.beginPath(); ctx.arc(46, 44, 15, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(82, 44, 15, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#9c6a31';
                ctx.beginPath(); ctx.arc(64, 68, 34, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#d3a76b';
                ctx.beginPath(); ctx.ellipse(64, 82, 18, 13, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#2a1a0c';
                ctx.beginPath(); ctx.arc(53, 62, 4.5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(75, 62, 4.5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(64, 76, 6, 4.5, 0, 0, Math.PI * 2); ctx.fill();
            },
            // GATA — the Madrid native, as a cat
            (ctx) => {
                ctx.fillStyle = '#6f7a88';
                [[-1, 0], [1, 0]].forEach(([s]) => {
                    ctx.beginPath();
                    ctx.moveTo(64 + s * 34, 44); ctx.lineTo(64 + s * 20, 16); ctx.lineTo(64 + s * 12, 46);
                    ctx.closePath(); ctx.fill();
                });
                ctx.fillStyle = '#8d99a8';
                ctx.beginPath(); ctx.arc(64, 66, 36, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#2b3340';
                ctx.beginPath(); ctx.ellipse(51, 60, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(77, 60, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#e07a9c';
                ctx.beginPath();
                ctx.moveTo(58, 76); ctx.lineTo(70, 76); ctx.lineTo(64, 83);
                ctx.closePath(); ctx.fill();
                ctx.strokeStyle = '#2b3340'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
                [-1, 1].forEach(s => {
                    [[-6, 0], [0, 5], [6, 10]].forEach(([dy, dy2]) => {
                        ctx.beginPath();
                        ctx.moveTo(64 + s * 12, 80 + dy);
                        ctx.lineTo(64 + s * 40, 76 + dy2);
                        ctx.stroke();
                    });
                });
            },
            // CIBELES — the fountain: stepped basin, plinth, crowned figure
            (ctx) => {
                // water jets arcing out of the plinth, behind everything
                ctx.strokeStyle = 'rgba(226,252,247,0.85)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
                [-1, 1].forEach(s => {
                    ctx.beginPath();
                    ctx.moveTo(64 + s * 14, 66);
                    ctx.quadraticCurveTo(64 + s * 44, 62, 64 + s * 40, 92);
                    ctx.stroke();
                });
                // two-tier basin
                ctx.fillStyle = '#2f8877';
                ctx.beginPath(); ctx.ellipse(64, 106, 48, 15, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#6fd8bd';
                ctx.beginPath(); ctx.ellipse(64, 102, 48, 13, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#2f8877';
                ctx.beginPath(); ctx.ellipse(64, 94, 30, 10, 0, 0, Math.PI * 2); ctx.fill();
                // plinth
                ctx.fillStyle = '#e8f6f1';
                ctx.fillRect(50, 66, 28, 30);
                ctx.fillStyle = '#b9d8d0';
                ctx.fillRect(50, 66, 8, 30);
                // seated figure: torso + head
                ctx.fillStyle = '#f4fbf8';
                ctx.beginPath();
                ctx.moveTo(52, 66); ctx.lineTo(76, 66); ctx.lineTo(70, 44); ctx.lineTo(58, 44);
                ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.arc(64, 38, 12, 0, Math.PI * 2); ctx.fill();
                // three-point crown
                ctx.fillStyle = '#f2c14e';
                [-11, 0, 11].forEach((dx, i) => {
                    const h = i === 1 ? 18 : 12;
                    ctx.beginPath();
                    ctx.moveTo(64 + dx - 5, 30); ctx.lineTo(64 + dx, 30 - h); ctx.lineTo(64 + dx + 5, 30);
                    ctx.closePath(); ctx.fill();
                });
                ctx.fillStyle = '#f2c14e';
                ctx.fillRect(50, 28, 28, 5);
            },
            // MADROÑO — the strawberry tree of the coat of arms
            (ctx) => {
                ctx.fillStyle = '#6b4626';
                ctx.fillRect(58, 74, 12, 34);
                ctx.beginPath();
                ctx.moveTo(58, 86); ctx.lineTo(40, 70); ctx.lineTo(58, 78); ctx.closePath(); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(70, 86); ctx.lineTo(88, 70); ctx.lineTo(70, 78); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#3f7a33';
                [[64, 42, 30], [40, 60, 20], [88, 60, 20]].forEach(([x, y, r]) => {
                    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
                });
                ctx.fillStyle = '#54994a';
                ctx.beginPath(); ctx.arc(58, 38, 16, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#d8452f';
                [[46, 52], [72, 34], [84, 58], [60, 62], [34, 64]].forEach(([x, y]) => {
                    ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
                });
            },
        ];

        emblems.forEach((draw, i) => {
            const cv = document.createElement('canvas');
            cv.width = cv.height = 128;
            const ctx = cv.getContext('2d');
            const col = CHAR_COLORS[i];

            // badge: vertical gradient in the driver's colour
            const g = ctx.createLinearGradient(0, 0, 0, 128);
            g.addColorStop(0, shade(col, 1.15));
            g.addColorStop(1, shade(col, 0.55));
            ctx.fillStyle = g;
            roundRect(ctx, 2, 2, 124, 124, 22); ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 4;
            roundRect(ctx, 2, 2, 124, 124, 22); ctx.stroke();

            draw(ctx);

            this.textures.addCanvas(PLAYER_IMGS[i], cv);
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

    // ── car gloss + the MADRING's TV helicopter ──────────────────────────
    // Four small generated textures, shared by every car and every race, so
    // the shine costs two extra quads per car and nothing else.
    genFxSprites() {
        // Contact shadow. The baked car PNGs carry a soft halo that is
        // radially symmetric — it has to be, the sprite rotates — so nothing
        // in them says which way the light comes from and the cars read as
        // stickers lying on the photo. This one is offset in WORLD space
        // (see SUN_A in RaceScene), which is what makes them sit on the road:
        // the shadow stays south-east of the car whichever way it is pointing.
        let cv = document.createElement('canvas'); cv.width = 64; cv.height = 80;
        let ctx = cv.getContext('2d');
        let g = ctx.createRadialGradient(32, 40, 2, 32, 40, 30);
        g.addColorStop(0, 'rgba(0,0,0,0.62)');
        g.addColorStop(0.55, 'rgba(0,0,0,0.36)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.save(); ctx.translate(32, 40); ctx.scale(0.78, 1);
        ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        this.textures.addCanvas('fx_carshadow', cv);

        // Specular streak: the long soft highlight a curved painted surface
        // throws back at a low sun. Drawn as a vertical lozenge because the
        // sprite is rotated onto the car's own axis, and additively blended,
        // so it brightens the paint instead of fogging it.
        cv = document.createElement('canvas'); cv.width = 32; cv.height = 96;
        ctx = cv.getContext('2d');
        g = ctx.createLinearGradient(0, 0, 0, 96);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.3, 'rgba(255,252,240,0.75)');
        g.addColorStop(0.55, 'rgba(255,255,255,0.95)');
        g.addColorStop(0.8, 'rgba(240,246,255,0.6)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(16, 48, 6, 44, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'destination-in';   // feather the sides
        g = ctx.createLinearGradient(0, 0, 32, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 96);
        this.textures.addCanvas('fx_glint', cv);

        // TV helicopter, seen from directly above. Drawn at roughly 34 world px
        // nose to tail — about 2.5 car lengths, so it reads at 1:1 on a phone
        // without pretending to be to scale with a 1 px/m ground.
        cv = document.createElement('canvas'); cv.width = 40; cv.height = 40;
        ctx = cv.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath(); ctx.ellipse(20, 18, 8, 13, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#232833';
        ctx.beginPath(); ctx.ellipse(20, 15, 6.5, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(18, 21, 4, 15);                          // tail boom
        ctx.fillStyle = '#aebbcd';                            // canopy
        ctx.beginPath(); ctx.ellipse(20, 11, 3.4, 4.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c8202a';                            // livery flash
        ctx.fillRect(15, 18, 10, 3);
        ctx.fillStyle = '#232833';
        ctx.fillRect(14, 34, 12, 2.5);                        // tailplane
        ctx.fillRect(20, 30, 2.5, 7);                         // fin
        this.textures.addCanvas('fx_heli', cv);

        // Rotor disc: the blur the blades sweep, plus two blades inside it so
        // the eye is given something to see turning.
        cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
        ctx = cv.getContext('2d');
        // Every blade is drawn twice — a dark stroke with a pale core — because
        // this thing flies over black asphalt and over a bone-white coach park
        // in the same orbit, and a single-value rotor disappears over one or
        // the other. The first attempt was pale-only and was invisible for
        // half the lap.
        const rg = ctx.createRadialGradient(32, 32, 6, 32, 32, 30);
        rg.addColorStop(0, 'rgba(28,32,40,0.06)');
        rg.addColorStop(0.75, 'rgba(28,32,40,0.20)');
        rg.addColorStop(1, 'rgba(28,32,40,0)');
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
        ctx.lineCap = 'round';
        for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = pass ? 'rgba(214,222,234,0.5)' : 'rgba(20,24,32,0.72)';
            ctx.lineWidth = pass ? 1.4 : 3.4;
            for (let k = 0; k < 3; k++) {
                const a = k * Math.PI * 2 / 3;
                ctx.beginPath();
                ctx.moveTo(32 + Math.cos(a) * 4, 32 + Math.sin(a) * 4);
                ctx.lineTo(32 + Math.cos(a) * 29, 32 + Math.sin(a) * 29);
                ctx.stroke();
            }
        }
        ctx.fillStyle = '#2b303a';                            // rotor head
        ctx.beginPath(); ctx.arc(32, 32, 3, 0, Math.PI * 2); ctx.fill();
        this.textures.addCanvas('fx_rotor', cv);
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

    // ── MADRING circuit dressing ─────────────────────────────────────────
    // Painted once, on top of images/madring-overhead.jpg, into the track
    // texture — so all of it is free per frame. It touches neither the
    // collision map (still stroked from the spline further down) nor the
    // track's seeded `srand`, whose stream the pickup positions depend on:
    // the scatter below runs its own generator so pickups land exactly where
    // they landed before this function existed.
    //
    // WHY. The bake composites two roads: the game's ribbon, stroked at rw=46
    // along this spline, and the 3D model's own tarmac drawn back over it so
    // the circuit's real kerbs and markings survive. The two do not agree
    // everywhere. Stroking the ribbon's boundary over the bake and looking at
    // it (scratch diagnostic, corner at world ~1020,1470 among others) shows
    // the ribbon is smooth — it is the disc-sweep of a 1280-point spline, it
    // cannot kink — while the model's road mesh is low-poly, so around corners
    // it leaves chunky straight-edged spurs of dark tarmac hanging outside the
    // ribbon. Those spurs are what reads as a "rough" corner, and no control
    // point can fix them: every cp is measured and lands on the model's own
    // asphalt. What fixes them is telling the eye where the track ends —
    // a track-limit line, kerbs on the corners only (a real circuit has no
    // kerb down a straight), and a barrier line past which everything is
    // scenery rather than a second, worse-drawn road.
    drawMadringDressing(vx, t, wp, TW, TH, cs) {
        const n = wp.length, half = t.rw / 2;
        // Deterministic scatter that is NOT the track's srand — see above.
        let ds = 0x4d41;
        const rnd = () => { ds = (ds * 1103515245 + 12345) & 0x7fffffff; return ds / 0x7fffffff; };

        // Signed turn rate, measured over ±6 waypoints (±26 px, about half a
        // road width). Between neighbours 4.2 px apart the angle is mostly
        // spline-sampling noise; over half a road width it describes the corner.
        const KW = 6, curv = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const a = wp[(i - KW + n) % n], b = wp[i], c = wp[(i + KW) % n];
            let d = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
            if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
            curv[i] = d;
        }
        // +perp is the RIGHT of the racing direction (screen y grows downward,
        // so a heading of 0 — due east — has its right hand at +y, south).
        const at = (i) => wp[((i % n) + n) % n];
        const perpOf = (i) => {
            const p = at(i - 4), q = at(i + 4);
            return Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
        };
        const off = (i, d) => {
            const p = at(i), pa = perpOf(i);
            return { x: p.x + Math.cos(pa) * d, y: p.y + Math.sin(pa) * d };
        };

        // Corner = turning more than 0.10 rad across that window, i.e. a radius
        // under ~520 px (≈500 m). Runs less than 24 waypoints apart are merged
        // so a chicane gets one continuous kerb instead of two stubs.
        const corners = [];
        for (let i = 0; i < n; i++) {
            if (Math.abs(curv[i]) < 0.10) continue;
            const last = corners[corners.length - 1];
            if (last && i - last[1] <= 24) last[1] = i; else corners.push([i, i]);
        }
        if (corners.length > 1 && corners[0][0] + n - corners[corners.length - 1][1] <= 24) {
            corners[corners.length - 1][1] = corners[0][1] + n;   // closes across index 0
            corners.shift();
        }
        corners.forEach(c => { c[0] -= 6; c[1] += 6; });
        // The complement — the straights — as [end of corner k, start of k+1].
        const straights = corners.length
            ? corners.map((c, k) => [c[1], corners[(k + 1) % corners.length][0] + (k === corners.length - 1 ? n : 0)])
            : [[0, n]];

        const spansPath = (ctx, spans) => {
            ctx.beginPath();
            spans.forEach(([i0, i1]) => {
                for (let i = i0; i <= i1; i++) {
                    const p = at(i);
                    if (i === i0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
                }
            });
        };

        // A ring of constant width around the ribbon cannot be had by
        // offsetting the centreline: on the inside of a hairpin the offset
        // curve folds through itself and paints a bow-tie. What is wanted is
        // the boundary of the ribbon *as a region*, so it is built that way —
        // stroke the wide sweep, punch the narrow sweep back out of it. That
        // is self-intersection-proof by construction and has exactly the
        // rounded joins the collision mask already uses, so the line always
        // lands on the real edge of the drivable surface.
        const bc = document.createElement('canvas');
        bc.width = Math.round(TW / cs); bc.height = Math.round(TH / cs);
        const bx = bc.getContext('2d');
        const band = (outer, inner, alpha, paint, spans) => {
            bx.setTransform(1, 0, 0, 1, 0, 0);
            bx.clearRect(0, 0, bc.width, bc.height);
            if (cs !== 1) bx.scale(1 / cs, 1 / cs);
            bx.globalCompositeOperation = 'source-over';
            bx.lineCap = 'round'; bx.lineJoin = 'round';
            bx.setLineDash([]); bx.lineDashOffset = 0;
            paint(bx, outer);
            bx.setLineDash([]); bx.lineDashOffset = 0;
            bx.globalCompositeOperation = 'destination-out';
            bx.strokeStyle = '#000'; bx.lineWidth = inner;
            drawPath(bx, wp); bx.stroke();
            if (spans) {
                // One path, one stroke: two consecutive destination-in passes
                // would intersect rather than union, leaving nothing behind.
                bx.globalCompositeOperation = 'destination-in';
                bx.strokeStyle = '#000'; bx.lineWidth = outer + 10;
                spansPath(bx, spans); bx.stroke();
            }
            vx.save();
            vx.globalAlpha = alpha;
            vx.drawImage(bc, 0, 0, TW, TH);
            vx.restore();
        };

        vx.save();
        vx.lineCap = 'round'; vx.lineJoin = 'round'; vx.setLineDash([]);

        // ── rubbered-in racing line ──
        // Four laps of a race weekend do not do this; four seasons of the
        // circuit's own traffic do. It is a tint on the bake's asphalt rather
        // than a stripe, and it is what makes a flat grey ribbon read as a
        // surface that gets used.
        vx.strokeStyle = 'rgba(16,16,20,0.15)'; vx.lineWidth = t.rw * 0.60;
        drawPath(vx, wp); vx.stroke();
        vx.strokeStyle = 'rgba(16,16,20,0.10)'; vx.lineWidth = t.rw * 0.32;
        drawPath(vx, wp); vx.stroke();

        // ── marbles ──
        // The pellets of scrubbed rubber and dust that collect off the racing
        // line, always on the OUTSIDE of a corner, which is where they get
        // flung. Cheap, and they make the corner's direction readable from
        // above before you are in it.
        corners.forEach(([i0, i1]) => {
            const dir = Math.sign(curv[((Math.round((i0 + i1) / 2) % n) + n) % n]) || 1;
            for (let i = i0; i <= i1; i += 2) {
                for (let k = 0; k < 2; k++) {
                    const p = off(i, -dir * (half * 0.50 + rnd() * half * 0.44));
                    vx.fillStyle = `rgba(${168 + (rnd() * 40 | 0)},${156 + (rnd() * 36 | 0)},130,${0.16 + rnd() * 0.20})`;
                    vx.beginPath();
                    vx.arc(p.x + (rnd() - 0.5) * 3, p.y + (rnd() - 0.5) * 3, 0.7 + rnd() * 1.1, 0, Math.PI * 2);
                    vx.fill();
                }
            }
        });
        vx.restore();

        // ── track limits: a continuous white line at the real edge ──
        band(t.rw - 2, t.rw - 8, 0.45, (b, w) => {
            b.strokeStyle = '#f4f6f8'; b.lineWidth = w; drawPath(b, wp); b.stroke();
        });

        // ── kerbs, on the corners only ──
        // The bake lays a 16/16 red-white dash round the ENTIRE lap, which no
        // circuit does and which is most of why the corners looked like they
        // had been drawn with a marker. These are wider blocks over the same
        // band, and the straights get the white line below instead.
        band(t.rw + 18, t.rw + 1, 0.9, (b, w) => {
            b.strokeStyle = '#c8202a'; b.lineWidth = w; drawPath(b, wp); b.stroke();
            b.strokeStyle = '#f4f4f0'; b.setLineDash([15, 15]);
            drawPath(b, wp); b.stroke();
        }, corners);

        // ── straights: solid white edge, replacing the bake's dashes ──
        band(t.rw + 12, t.rw, 0.62, (b, w) => {
            b.strokeStyle = '#eef1f4'; b.lineWidth = w; drawPath(b, wp); b.stroke();
        }, straights);

        // ── barrier ──
        // The single most useful line on the whole track: past it, everything
        // the model left lying around is unmistakably scenery. Drawn as steel
        // with reflective posts, which is what a temporary street circuit uses.
        band(t.rw + 30, t.rw + 23, 0.55, (b, w) => {
            b.strokeStyle = '#3a3f4a'; b.lineWidth = w; drawPath(b, wp); b.stroke();
            b.strokeStyle = 'rgba(232,238,246,0.65)'; b.setLineDash([3, 17]);
            drawPath(b, wp); b.stroke();
        });

        // ── spectator banks ──
        // Fractions of the lap plus which side they stand on: +1 the right of
        // the racing direction, -1 the left, 0 = "outside of the corner",
        // resolved from the local turn sign. All four sit on ground the bake
        // shows as open — the IFEMA coach park down the main straight, the car
        // parks at the first-corner braking zone, the scrub outside La
        // Monumental — which is exactly where a temporary circuit puts them.
        const BANKS = [[0.945, 1.030, -1], [0.035, 0.078, 0], [0.415, 0.505, 0], [0.745, 0.800, 0]];
        const IN = half + 17, OUT = half + 41;
        t.crowdSpecks = [];
        BANKS.forEach(([f0, f1, s]) => {
            const i0 = Math.round(f0 * n), i1 = Math.round(f1 * n);
            let side = s;
            if (!side) {
                let c = 0;
                for (let i = i0; i <= i1; i += 3) c += curv[((i % n) + n) % n];
                side = -Math.sign(c) || 1;
            }
            // Deck. Its depth tapers over the last 16 waypoints at each end:
            // a stand that stops dead in a straight line across the tarmac
            // looks like a rectangle someone pasted on, and a raked end looks
            // like scaffolding, which is what it is.
            const taper = (i) => Math.min(1, Math.min(i - i0, i1 - i) / 16);
            vx.save();
            vx.beginPath();
            for (let i = i0; i <= i1; i++) { const p = off(i, side * IN); if (i === i0) vx.moveTo(p.x, p.y); else vx.lineTo(p.x, p.y); }
            for (let i = i1; i >= i0; i--) { const p = off(i, side * (IN + (OUT - IN) * taper(i))); vx.lineTo(p.x, p.y); }
            vx.closePath();
            vx.fillStyle = 'rgba(40,42,50,0.74)'; vx.fill();
            vx.strokeStyle = 'rgba(18,19,24,0.6)'; vx.lineWidth = 1.5; vx.stroke();
            // tiers, parallel to the road
            vx.lineWidth = 1;
            for (let k = 1; k < 5; k++) {
                vx.strokeStyle = 'rgba(150,156,170,0.20)';
                vx.beginPath();
                let started = false;
                for (let i = i0; i <= i1; i++) {
                    if (taper(i) < k / 5) { started = false; continue; }
                    const p = off(i, side * (IN + (OUT - IN) * k / 5));
                    if (!started) { vx.moveTo(p.x, p.y); started = true; } else vx.lineTo(p.x, p.y);
                }
                vx.stroke();
            }
            // front railing, the bright line that separates crowd from track
            vx.strokeStyle = 'rgba(226,232,242,0.55)'; vx.lineWidth = 1.6;
            vx.beginPath();
            for (let i = i0; i <= i1; i++) { const p = off(i, side * (IN - 1.5)); if (i === i0) vx.moveTo(p.x, p.y); else vx.lineTo(p.x, p.y); }
            vx.stroke();
            // The crowd itself. Dense and mostly desaturated: at 1 world px per
            // screen px a head is one pixel, and a scatter of saturated dots at
            // this size reads as confetti, not as people. Every other waypoint
            // hands one head to the live layer to shimmer (see RaceScene).
            for (let i = i0; i <= i1; i++) {
                const tp = taper(i);
                for (let k = 0; k < 9; k++) {
                    if (rnd() > tp) continue;
                    const p = off(i, side * (IN + 2 + rnd() * Math.max(0, (OUT - IN) * tp - 4)));
                    p.x += (rnd() - 0.5) * 3.2; p.y += (rnd() - 0.5) * 3.2;
                    const h = rnd();
                    vx.fillStyle = h < 0.58 ? `rgba(${176 + (rnd() * 60 | 0)},${156 + (rnd() * 56 | 0)},${140 + (rnd() * 56 | 0)},0.72)`
                        : h < 0.72 ? 'rgba(172,54,58,0.58)' : h < 0.83 ? 'rgba(198,176,84,0.58)'
                        : h < 0.93 ? 'rgba(74,96,150,0.58)' : 'rgba(228,232,238,0.66)';
                    vx.beginPath(); vx.arc(p.x, p.y, 0.55 + rnd() * 0.6, 0, Math.PI * 2); vx.fill();
                    if (k === 0 && (i % 2) === 0) t.crowdSpecks.push({ x: p.x, y: p.y, ph: rnd() * 6.283 });
                }
            }
            vx.restore();
        });

        // ── marshal posts ──
        // One at the entry of each of the first eight corners, on the outside,
        // just behind the barrier. The baked part is the platform; the live
        // layer waves the flag.
        t.marshalPosts = [];
        corners.slice(0, 8).forEach(([i0, i1]) => {
            const i = i0 + 4;
            const dir = Math.sign(curv[((Math.round((i0 + i1) / 2) % n) + n) % n]) || 1;
            const p = off(i, -dir * (half + 30));
            const a = perpOf(i) - Math.PI / 2;
            vx.save();
            vx.fillStyle = 'rgba(228,232,238,0.85)';
            vx.beginPath(); vx.arc(p.x, p.y, 3.6, 0, Math.PI * 2); vx.fill();
            vx.strokeStyle = 'rgba(30,32,38,0.75)'; vx.lineWidth = 1; vx.stroke();
            vx.fillStyle = 'rgba(232,142,32,0.95)';                 // the marshal
            vx.beginPath(); vx.arc(p.x, p.y, 1.5, 0, Math.PI * 2); vx.fill();
            vx.restore();
            t.marshalPosts.push({ x: p.x, y: p.y, a, ph: t.marshalPosts.length * 1.7 });
        });
    }

    genTracks() {
        TRACKS.forEach((t, idx) => this._genSingleTrack(t, idx));
    }

    _genSingleTrack(t, idx) {
        // Scenery scatter and pickup placement come out of this seed. It lives on
        // the track, not on its index, so adding a track leaves every other one
        // pixel-for-pixel as it was.
        let seed = (t.seed !== undefined ? t.seed : idx) * 7919 + 42;
        function srand() { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646; }
            // Procedural tracks: build cp fresh each session
            if (t.procedural && !t.cp.length) generateDeskCp(t);
            // per-track world dimensions (default to screen size)
            t.W = t.W || GW;
            t.H = t.H || GH;
            const TW = t.W, TH = t.H;
            // Samples per control point. 20 everywhere except MADRING, whose
            // control points are 4x denser — see the note on that track.
            const wp = spline(t.cp, t.spp || 20);
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

            // Banked section: a span of waypoints becomes a chain of 'banking'
            // circles. Laying them on the centreline with r <= rw/2 guarantees
            // every circle stays inside the road — a speed bonus that spilled
            // onto the grass would be an invitation to cut the corner.
            if (t.bankWp) {
                const bi0 = Math.round(t.bankWp[0] * wp.length);
                const bi1 = Math.round(t.bankWp[1] * wp.length);
                const br = Math.floor(t.rw / 2) - 1;
                t.banking = [];
                for (let i = bi0; i <= bi1; i += 4) {
                    const p = wp[i % wp.length];
                    t.banking.push({ x: p.x, y: p.y, r: br });
                }
            }

            // Everything here keys off per-track properties, never off idx —
            // inserting a track must not repaint the ones after it.
            const theme     = t.theme || '';
            const halloween = theme === 'halloween';
            const soccer    = theme === 'soccer';
            const asian     = theme === 'asian';
            const synth     = !!t.synth;
            const desk      = !!t.desk;

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

            } else if (theme === 'madrid') {
                // ── MADRING: the real circuit, seen from directly above ──
                // Nothing here is invented. The ground is a single baked image
                // — an orthographic render, looking straight down, of a 3D
                // model of the circuit ("Circuito de Madring 2026 layout" by
                // Dave Love, CC-BY-4.0; see NOTICE) — so the halls, the pit
                // complex, the grandstands, the start gantry, the trees and the
                // surrounding Valdebebas are the real ones in their real
                // places. scripts/madring-bake-overhead.js fits the model to
                // this track's centreline and renders at one image pixel per
                // world pixel, so drawing it at 0,0 at native size is the whole
                // alignment story. It already carries the road, painted at
                // TRACKS[0].rw along this same spline, because the game's cars
                // need a wider ribbon than the real 15 m circuit offers.
                //
                // The collision map further down is NOT derived from this
                // image. It is still stroked from the spline, exactly as every
                // other track's is. The picture is scenery; the spline is truth.
                const span = (i0, i1) => {           // sub-path along the lap
                    vx.beginPath();
                    for (let i = i0; i <= i1; i++) {
                        const p = wp[i % wp.length];
                        if (i === i0) vx.moveTo(p.x, p.y); else vx.lineTo(p.x, p.y);
                    }
                };
                const bank0 = Math.round((t.bankWp ? t.bankWp[0] : 0) * wp.length);
                const bank1 = Math.round((t.bankWp ? t.bankWp[1] : 0) * wp.length);

                const bakedTex = this.textures.exists(MADRING_BG_KEY)
                    ? this.textures.get(MADRING_BG_KEY).getSourceImage() : null;
                if (bakedTex && bakedTex.width) {
                    vx.drawImage(bakedTex, 0, 0, TW, TH);
                } else {
                    // Fallback for when the bake is missing — over file://, say,
                    // or before anyone has run the script. Deliberately plain,
                    // and deliberately free of srand() so pickups land in the
                    // same places either way: a track you can still race, not a
                    // second set of invented scenery to keep in step.
                    console.warn('MADRING: ' + MADRING_BG_SRC + ' unavailable — drawing plain road');
                    vx.fillStyle = '#b9a878'; vx.fillRect(0, 0, TW, TH);
                    vx.lineCap = 'round'; vx.lineJoin = 'round'; vx.setLineDash([]);
                    vx.strokeStyle = '#cc2222'; vx.lineWidth = t.rw + 12;
                    vx.setLineDash([16, 16]); drawPath(vx, wp); vx.stroke();
                    vx.strokeStyle = '#f0f0f0'; vx.lineDashOffset = 16;
                    drawPath(vx, wp); vx.stroke();
                    vx.setLineDash([]); vx.lineDashOffset = 0;
                    vx.strokeStyle = '#3c3c42'; vx.lineWidth = t.rw; drawPath(vx, wp); vx.stroke();
                    vx.strokeStyle = '#45454c'; vx.lineWidth = t.rw - 14; drawPath(vx, wp); vx.stroke();
                }
                vx.lineCap = 'round'; vx.lineJoin = 'round'; vx.setLineDash([]);
                t.mud.forEach(m => {                     // gravel dragged onto the surface
                    const g = vx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r);
                    g.addColorStop(0, 'rgba(120,100,60,0.9)'); g.addColorStop(1, 'rgba(120,100,60,0.15)');
                    vx.fillStyle = g; vx.beginPath(); vx.arc(m.x, m.y, m.r, 0, Math.PI * 2); vx.fill();
                });
                // ── banked surface (same span the 'banking' circles cover in the mask) ──
                if (t.bankWp) {
                    vx.strokeStyle = '#565660'; vx.lineWidth = t.rw; span(bank0, bank1); vx.stroke();
                    vx.strokeStyle = 'rgba(255,255,255,0.10)'; vx.lineWidth = t.rw - 16;
                    span(bank0, bank1); vx.stroke();                    // sheen off the camber
                    // radial slab seams across the camber — how a banked bowl
                    // reads from above, and a cue that this surface is special
                    vx.lineCap = 'butt';
                    for (let i = bank0 + 3; i < bank1 - 3; i += 5) {
                        const p = wp[i % wp.length], q = wp[(i + 2) % wp.length];
                        const a = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
                        const hw = t.rw / 2 - 2;
                        vx.strokeStyle = 'rgba(230,230,240,0.22)'; vx.lineWidth = 1.5;
                        vx.beginPath();
                        vx.moveTo(p.x - Math.cos(a) * hw, p.y - Math.sin(a) * hw);
                        vx.lineTo(p.x + Math.cos(a) * hw, p.y + Math.sin(a) * hw);
                        vx.stroke();
                    }
                    // yellow centre line — the flat road's white dashes stop here
                    vx.strokeStyle = 'rgba(240,196,80,0.8)'; vx.lineWidth = 2;
                    vx.setLineDash([12, 12]); span(bank0, bank1); vx.stroke();
                    vx.setLineDash([]); vx.lineCap = 'round';
                    const lp = wp[bank1 % wp.length];
                    vx.fillStyle = 'rgba(25,25,30,0.7)'; vx.font = 'bold 15px monospace';
                    vx.textAlign = 'left'; vx.fillText('LA MONUMENTAL', lp.x + 34, lp.y + 30);
                }

                // Circuit dressing on top of the bake: kerbs, track limits,
                // barriers, rubber, and the spectator banks the live layer
                // animates. See drawMadringDressing().
                this.drawMadringDressing(vx, t, wp, TW, TH, cs);

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
                // per-track ground critters / props (drawn before road so the road covers them),
                // chosen by the track's own groundDecor property rather than its index
                const gd = t.groundDecor;
                if (gd === 'ants') {
                    for (let i = 0; i < 32; i++) drawAnt(srand() * GW, srand() * GH, srand() * Math.PI * 2, 2.4 + srand() * 1.6);
                } else if (gd === 'spiders') {
                    for (let i = 0; i < 18; i++) drawSpider(srand() * GW, srand() * GH, srand() * Math.PI * 2, 2.4 + srand() * 1.6);
                } else if (gd === 'daisies') {
                    for (let i = 0; i < 36; i++) drawDaisy(srand() * GW, srand() * GH, 2.2 + srand() * 1.6);
                } else if (gd === 'mushrooms') {
                    for (let i = 0; i < 24; i++) drawMushroom(srand() * GW, srand() * GH, 2.2 + srand() * 1.6);
                } else if (gd === 'cigarettes') {
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
            (t.banking || []).forEach(b => {
                cx.fillStyle = '#ff0000'; cx.beginPath(); cx.arc(b.x, b.y, b.r, 0, Math.PI * 2); cx.fill();
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
            // Nitro: seeded-random by default, but a track can pin it to chosen
            // waypoints (values < 1 are read as a fraction of the lap) so boosts
            // land where they are worth taking — e.g. the head of a long straight.
            const nitroAt = t.nitroWp
                ? t.nitroWp.map(v => Math.round(v < 1 ? v * wp.length : v) % wp.length)
                : null;
            for (let p = 0; p < (nitroAt ? nitroAt.length : 3); p++) {
                const wi = nitroAt ? nitroAt[p] : Math.floor(srand() * wp.length);
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
        this.add.text(cx, cy - 100, 'KILÓMETRO CERO', {
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

// ── HUD OVERLAY SCENE (persistent, launched once by BootScene) ──
// A single fullscreen toggle button, alive for the whole session and drawn
// on top of whatever scene is currently active — simpler than re-adding a
// button to every one of the 8 scenes, and it means the toggle is available
// on the menus too, not just mid-race.
class HudOverlayScene extends Phaser.Scene {
    constructor() { super('HudOverlayScene'); }

    create() {
        // Phaser wraps the Fullscreen API itself (config's `fullscreenTarget:
        // 'parent'` already points it at #game-container). iOS Safari on
        // iPhone has no Fullscreen API at all — `available` is false there —
        // so the button just doesn't get drawn rather than sitting dead.
        if (!this.sys.game.device.fullscreen.available) return;

        const cx = GW / 2, r = 22;
        const cy = GH - 40;
        const circle = this.add.circle(cx, cy, r, 0x08090f, 0.55)
            .setStrokeStyle(2, 0xffffff, 0.35)
            .setScrollFactor(0).setDepth(1000)
            .setInteractive({ useHandCursor: true });
        const label = this.add.text(cx, cy, '⛶', {
            fontSize: '20px', fontFamily: 'monospace', color: '#e8e6e1',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);

        const sync = () => label.setText(this.scale.isFullscreen ? '✕' : '⛶');
        circle.on('pointerdown', () => {
            if (this.scale.isFullscreen) this.scale.stopFullscreen();
            else this.scale.startFullscreen();
        });
        this.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, sync);
        this.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, sync);
        this.events.once('shutdown', () => {
            this.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, sync);
            this.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, sync);
        });
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
        this.add.text(GW / 2, 120, 'KILÓMETRO CERO', {
            fontSize: '60px', fontFamily: 'monospace', color: '#FFD700',
            fontStyle: 'bold', stroke: '#6B3410', strokeThickness: 8,
        }).setOrigin(0.5);

        this.add.text(GW / 2, 200, 'Carreras cenitales · Madrid', {
            fontSize: '22px', fontFamily: 'monospace', color: '#bbb',
        }).setOrigin(0.5);

        // Menu items
        const ITEMS = ['PLAY', 'OPTIONS', 'ABOUT', 'CREDITS', 'CONTROLS'];
        this.menuSel = 0;
        this.currentPanel = null;

        const menuStartY = 305;
        const menuSpacing = 60;
        this.menuTexts = ITEMS.map((label, i) => {
            const t = this.add.text(GW / 2, menuStartY + i * menuSpacing, label, {
                fontSize: '34px', fontFamily: 'monospace',
                color: i === 0 ? '#FFD700' : '#888', fontStyle: 'bold',
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            // A tap both selects and confirms in one action — there is no
            // hover state to preview a choice on a touchscreen, so unlike
            // the keyboard's UP/DOWN + ENTER, a tap here is already a
            // decision (same "one tap, one action" rule TrackSelectScene's
            // zones already use).
            t.on('pointerdown', () => { this.menuSel = i; this._select(); });
            return t;
        });

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

        // Rows already have their own tap zone (adjust), so "back" needs its
        // own separate tappable element rather than overloading a row tap.
        // Off-center on x: the persistent fullscreen button (HudOverlayScene)
        // sits at (GW/2, GH-40) and, being the topmost scene, wins a center
        // tap outright — a back control at the same x is unreachable by touch.
        addTxt(GW / 2 - 180, GH - 20, '◀  BACK', { fontSize: '15px', color: '#555', fontStyle: 'bold' })
            .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this._showMain());

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
            'A top-down arcade racer whose headline',
            'circuit is a layout inspired by the',
            'IFEMA-Valdebebas street course in Madrid.',
            '',
            'Derivative work of the open-source game',
            'micro-machines by Lee Reilly (MIT).',
        ];
        let bodyY = 305;
        lines.forEach(line => {
            if (!line) { bodyY += 22; return; }
            addTxt(GW / 2, bodyY, line, { fontSize: '21px', color: '#ccc' }).setOrigin(0.5);
            bodyY += 44;
        });

        // Off-center on x: the persistent fullscreen button (HudOverlayScene)
        // sits at (GW/2, GH-40) and, being the topmost scene, wins a center
        // tap outright — a back control at the same x is unreachable by touch.
        addTxt(GW / 2 - 180, GH - 46, 'ESC  ·  BACK', { fontSize: '16px', color: '#555' })
            .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this._showMain());
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
                header: 'ORIGINAL ENGINE — MIT',
                entries: [
                    { text: 'Lee Reilly — micro-machines',      color: '#fff' },
                    { text: 'github.com/leereilly/micro-machines', color: '#888', small: true },
                ],
            },
            {
                // CC-BY-4.0 makes this credit mandatory, not courteous: the
                // MADRING's overhead view is baked from this model, and so is
                // the centreline the car drives — both are adaptations of it.
                header: 'CIRCUIT MODEL — CC BY 4.0',
                entries: [
                    { text: 'Dave Love — Circuito de Madring 2026', color: '#fff' },
                    { text: 'sketchfab.com/Tyler_Dave',             color: '#888', small: true },
                ],
            },
            {
                // The car sprites are baked renders of this model; Apache-2.0
                // asks for the licence notice (carried in NOTICE), the credit
                // here is courtesy and consistency with the 3D mode.
                header: 'CAR MODEL — APACHE 2.0',
                entries: [
                    { text: 'APEX FORMULA 2026 — Avi Hacker, J.D.',    color: '#fff' },
                    { text: 'github.com/ahacker-1/apex-formula-2026',  color: '#888', small: true },
                ],
            },
            {
                header: 'GAME ASSETS — CC0',
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

        let y = 232;
        sections.forEach(sec => {
            addTxt(GW / 2, y, sec.header, {
                fontSize: '14px', color: '#666', fontStyle: 'italic',
            }).setOrigin(0.5);
            y += 26;
            sec.entries.forEach(e => {
                addTxt(GW / 2, y, e.text, {
                    fontSize: e.small ? '15px' : '20px', color: e.color, fontStyle: 'bold',
                }).setOrigin(0.5);
                y += e.small ? 23 : 32;
            });
            y += 16;
        });

        // Off-center on x: the persistent fullscreen button (HudOverlayScene)
        // sits at (GW/2, GH-40) and, being the topmost scene, wins a center
        // tap outright — a back control at the same x is unreachable by touch.
        addTxt(GW / 2 - 180, GH - 46, 'ESC  ·  BACK', { fontSize: '16px', color: '#555' })
            .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this._showMain());
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

        // Off-center on x: the persistent fullscreen button (HudOverlayScene)
        // sits at (GW/2, GH-40) and, being the topmost scene, wins a center
        // tap outright — a back control at the same x is unreachable by touch.
        addTxt(GW / 2 - 180, GH - 46, 'ESC  ·  BACK', { fontSize: '16px', color: '#555' })
            .setOrigin(0.5).setInteractive({ useHandCursor: true }).on('pointerdown', () => this._showMain());
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

        this.add.text(GW / 2, 150, 'KILÓMETRO CERO', {
            fontSize: '60px', fontFamily: 'monospace', color: '#FFD700',
            fontStyle: 'bold', stroke: '#6B3410', strokeThickness: 8,
        }).setOrigin(0.5);

        this.add.text(GW / 2, 225, 'Carreras cenitales · Madrid', {
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

            // the car itself, so the livery is not a surprise on the grid
            const car = this.add.image(cx, 452, CAR_SPRITES[i])
                .setDisplaySize(TRUCK_W * 1.8, TRUCK_H * 1.8);

            // name
            const name = this.add.text(cx, yName, NAMES[i], {
                fontSize: '22px', fontFamily: 'monospace', color: '#ccc',
                fontStyle: 'bold',
            }).setOrigin(0.5);

            this.cards.push({ bg, img, car, name, x: cx });

            // Tap a card to pick that driver and confirm in one action —
            // same "no hover to preview, so a tap is already a decision"
            // rule as TrackSelectScene's zones and the main menu's items.
            this.add.zone(cx, 400, 150, 240)
                .setInteractive({ useHandCursor: true })
                .on('pointerdown', () => { this.sel = i; this.confirm(); });
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
            c.car.setAlpha(active ? 1.0 : 0.45);
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

// Is this a phone/tablet? Menus already work via Phaser's pointer events
// (fired for mouse AND touch alike), but actual driving is keyboard-only —
// this gates the on-screen control overlay so desktop players never see it.
//
// `(pointer: coarse) and (hover: none)` asks about the PRIMARY pointer, not
// just whether touch events exist: a touchscreen laptop's primary pointer is
// its trackpad (fine, hover-capable) even though the screen also reports
// touch, so plain `maxTouchPoints > 0` was showing the overlay to mouse
// users on that hardware. A phone/tablet has no such fallback pointer.
function isTouchDevice() {
    if (window.matchMedia) return window.matchMedia('(pointer: coarse) and (hover: none)').matches;
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
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
        // cache key is the file path, so tracks that share a file share one download
        const musicKey = this.td.music ? 'music_' + this.td.music : null;
        const playCurrentMusic = () => {
            if (musicKey && this.cache.audio.exists(musicKey)) {
                this.sound.play(musicKey, { loop: true, volume: 0.5 });
            }
            this.prefetchNextMusic();
        };
        if (!musicKey || this.cache.audio.exists(musicKey)) {
            playCurrentMusic();
        } else {
            this.load.audio(musicKey, this.td.music);
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
                // Handling model (2026 grip pass — player and AI share it):
                //   acc   px/frame² of throttle. 0.085 reaches 95% of top
                //         speed in 0.68 s where the old 0.06 took 0.95 s.
                //   hand  base steering rate in rad/frame; drivePlayer and
                //         driveAI both scale it (by speed and skill
                //         respectively). 0.048 turns a full-speed circle of
                //         60 px radius vs the old 72.
                //   stab  lateral-velocity retention per frame — LOWER is
                //         grippier. 0.66 kills the old ice-drift (see
                //         physics()); the SHOCKS upgrade now subtracts, i.e.
                //         buys grip, where it used to add (which made the car
                //         more slippery — almost certainly not what anyone
                //         paying $60k a level expected).
                maxSpd: isP ? 3.0 + gs.topSpeed * 0.25 : 3.0 + Math.min(gs.raceNum * 0.06, 2.0),
                acc:    isP ? 0.085 + gs.acceleration * 0.008 : 0.085 + Math.min(gs.raceNum * 0.003, 0.04),
                hand:   isP ? 0.048 + gs.tires * 0.003 : 0.048 + Math.min(gs.raceNum * 0.001, 0.015),
                stab:   isP ? 0.66 - gs.shocks * 0.012 : 0.66 - Math.min(gs.raceNum * 0.004, 0.08),
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
            // ── gloss ──
            // A contact shadow beneath and a specular streak on top, both
            // fixed to SUN_A in world space. Two extra quads per car; the
            // shadow sits under every car (depth 8) and every glint above
            // every car (13.6, still under the tunnel roofs at 15) so cars
            // overlapping at a corner never punch holes in each other.
            if (this.textures.exists('fx_carshadow')) {
                t.shadow = this.add.image(sp.x, sp.y, 'fx_carshadow')
                    .setDepth(8).setDisplaySize(TRUCK_W * 1.55, TRUCK_H * 1.3);
                t.glint = this.add.image(sp.x, sp.y, 'fx_glint')
                    .setDepth(13.6).setBlendMode(Phaser.BlendModes.ADD)
                    .setDisplaySize(TRUCK_W * 0.62, TRUCK_H * 0.86);
            }
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

        // MADRING: crowd, marshals, TV helicopter, start gantry
        this.initTrackLife();

        // HUD
        this.buildHUD();

        // on-screen touch controls (phones/tablets only — desktop sees nothing new)
        this.touchUI = isTouchDevice();
        if (this.touchUI) this.buildTouchControls();

        // Reset any stuck key state left over from a previous race (real
        // key or touch button) so a fresh race never starts mid-throttle.
        this.events.once('shutdown', () => {
            this.cur.left.isDown = false;
            this.cur.right.isDown = false;
            this.cur.up.isDown = false;
            this.cur.down.isDown = false;
            this.spc.isDown = false;
        });

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
            this.drawStartLights(2);
            this.time.delayedCall(1000, () => {
                this.cdTxt.setText('1'); SFX.countdownBeep(false);
                this.drawStartLights(3);
                this.time.delayedCall(1000, () => {
                    this.cdTxt.setText('GO!').setColor('#00ff00');
                    SFX.countdownBeep(true);
                    SFX.engineStart();
                    this.started = true;
                    this.drawStartLights(0);       // lights out — go racing
                    // …and then get the gantry off the road: a dark bar lying
                    // across the racing line for four laps is scenery nobody
                    // asked for.
                    if (this.startLights) {
                        this.tweens.add({ targets: this.startLights, alpha: 0, duration: 1200, delay: 400 });
                    }
                    this.time.delayedCall(600, () => this.cdTxt.destroy());
                });
            });
        });
        this.drawStartLights(1);
    }

    // ── MADRING live layer ───────────────────────────────────────────────
    // Everything that moves on this track and is not a car. Deliberately
    // small: two Graphics objects and three sprites for the whole circuit, no
    // per-frame allocation, and the crowd — much the biggest of it — is culled
    // against the camera before a single rectangle is queued, because on a
    // phone the camera sees about a fifteenth of a 1338x2033 world.
    initTrackLife() {
        // Cleared first, every time: Phaser reuses the RaceScene instance from
        // race to race and destroys its display list, so a stale Graphics left
        // over from the last MADRING race would be a dead object the next
        // track's countdown happily called clear() on.
        this.life = null;
        this.startLights = null;
        this.slAnchor = null;
        if (this.td.theme !== 'madrid' || !this.td.crowdSpecks) return;

        const wp = this.td.wp;
        // Crowd: the baked bank already has ~2,700 heads painted into the track
        // texture. These are the few hundred that catch the light — one head
        // in twenty, oscillating out of phase — plus the phone cameras.
        const specks = this.td.crowdSpecks.map(s => ({
            x: s.x, y: s.y, ph: s.ph, sp: 0.9 + (s.ph % 1) * 2.2,
        }));
        const flashes = [];
        for (let i = 0; i < 7; i++) flashes.push({ x: 0, y: 0, life: 0 });

        // Marshal posts: the flag is a line that sweeps through about 100°,
        // each post out of step with the others so they never wave in unison.
        const marshals = (this.td.marshalPosts || []).map(m => ({ ...m }));

        const gfx = this.add.graphics().setDepth(6);

        // TV helicopter. It shadows the player rather than wandering the map:
        // a helicopter you can never see is a helicopter that costs three
        // sprites for nothing. It orbits a point that lags the leader, so it
        // drifts in and out of shot the way a real one does.
        const heli = {
            cx: this.trucks[0].x, cy: this.trucks[0].y, ang: 0, r: 210,
            shadow: this.add.image(0, 0, 'fx_carshadow').setDepth(7)
                .setDisplaySize(30, 30).setAlpha(0.65),
            body: this.add.image(0, 0, 'fx_heli').setDepth(30),
            rotor: this.add.image(0, 0, 'fx_rotor').setDepth(31),
        };

        // Start gantry lights, across the road at the start line.
        this.startLights = this.add.graphics().setDepth(16);
        const s0 = wp[0], s1 = wp[1];
        const sa = Math.atan2(s1.y - s0.y, s1.x - s0.x);
        // 18 px PAST the line, not behind it: the grid sits behind wp[0] (see
        // t.starts), so a gantry drawn on the near side lands on top of the
        // cars it is supposed to be releasing.
        this.slAnchor = {
            x: s0.x + Math.cos(sa) * 18, y: s0.y + Math.sin(sa) * 18,
            pa: sa + Math.PI / 2,
        };

        this.life = { gfx, specks, flashes, marshals, heli, t: 0 };
    }

    // `lit` counts how many of the five reds are on; 0 means lights out.
    drawStartLights(lit) {
        const g = this.startLights, a = this.slAnchor;
        if (!g || !a) return;
        g.clear();
        const c = Math.cos(a.pa), s = Math.sin(a.pa);
        const halfW = this.td.rw / 2 - 3;
        g.lineStyle(2.5, 0x15181e, 0.85);
        g.beginPath();
        g.moveTo(a.x - c * halfW, a.y - s * halfW);
        g.lineTo(a.x + c * halfW, a.y + s * halfW);
        g.strokePath();
        for (let i = 0; i < 5; i++) {
            const f = (i - 2) / 2.4;
            const x = a.x + c * halfW * f, y = a.y + s * halfW * f;
            const on = i < lit;
            g.fillStyle(on ? 0xff2418 : 0x1c1418, 1);
            g.fillCircle(x, y, 2.4);
            if (on) { g.fillStyle(0xff5a3c, 0.3); g.fillCircle(x, y, 5.4); }
        }
    }

    updateTrackLife(delta) {
        const L = this.life;
        L.t += delta;
        const tt = L.t / 1000;
        const cam = this.cameras.main.worldView;
        const x0 = cam.x - 8, y0 = cam.y - 8, x1 = cam.right + 8, y1 = cam.bottom + 8;
        const g = L.gfx;
        g.clear();

        // crowd shimmer — one fillRect per visible head, nothing at all for
        // the ~80% of them that are off camera
        for (let i = 0; i < L.specks.length; i++) {
            const p = L.specks[i];
            if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
            const w = 0.5 + 0.5 * Math.sin(tt * p.sp + p.ph);
            g.fillStyle(0xffffff, 0.12 + w * 0.5);
            g.fillRect(p.x - 0.7, p.y - 0.7, 1.6, 1.6);
        }

        // phone cameras. One new flash roughly every 130 ms, only ever inside
        // the camera, so they are always seen and never wasted.
        for (let i = 0; i < L.flashes.length; i++) {
            const f = L.flashes[i];
            if (f.life > 0) {
                f.life -= delta;
                const k = Math.max(0, f.life / 150);
                g.fillStyle(0xffffff, k);
                g.fillCircle(f.x, f.y, 1 + k * 2.6);
            } else if (Math.random() < 0.06) {
                // pick a head that is actually on screen; give up if none is
                for (let tries = 0; tries < 6; tries++) {
                    const p = L.specks[(Math.random() * L.specks.length) | 0];
                    if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
                    f.x = p.x; f.y = p.y; f.life = 150; break;
                }
            }
        }

        // marshals waving
        for (let i = 0; i < L.marshals.length; i++) {
            const m = L.marshals[i];
            if (m.x < x0 || m.x > x1 || m.y < y0 || m.y > y1) continue;
            const sw = Math.sin(tt * 4.2 + m.ph) * 0.9;
            const a = m.a + Math.PI / 2 + sw;
            const ex = m.x + Math.cos(a) * 9, ey = m.y + Math.sin(a) * 9;
            g.lineStyle(1.4, 0x1a1c22, 0.7);
            g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(ex, ey); g.strokePath();
            g.fillStyle(0xf5d020, 0.95);
            g.fillCircle(ex, ey, 2.8);
            g.fillStyle(0xfff0a0, 0.8);
            g.fillCircle(ex, ey, 1.3);
        }

        // helicopter: orbit a point easing toward the leader
        const h = L.heli, lead = this.trucks[0];
        h.cx += (lead.x - h.cx) * 0.006;
        h.cy += (lead.y - h.cy) * 0.006;
        h.ang += delta * 0.00022;
        const hx = h.cx + Math.cos(h.ang) * h.r;
        const hy = h.cy + Math.sin(h.ang) * h.r * 0.72;
        h.body.setPosition(hx, hy);
        h.body.setRotation(h.ang + Math.PI / 2);
        h.rotor.setPosition(hx, hy);
        h.rotor.rotation += delta * 0.02;
        // The shadow is thrown along SUN_A like everything else, but a long
        // way out — that offset is the only cue that says the thing is flying.
        h.shadow.setPosition(hx - Math.cos(SUN_A) * 26, hy - Math.sin(SUN_A) * 26);
    }

    buildHUD() {
        const bar = this.add.rectangle(GW / 2, 22, GW, 44, 0x111111, 0.88).setDepth(50).setScrollFactor(0);
        const s = { fontSize: '15px', fontFamily: 'monospace', color: '#fff' };
        // Fractions of GW, not the pixel columns this used to hardcode: the
        // design box is 720 wide in portrait (see GW/GH up top) and the old
        // SPD column at x=780 simply fell off the right-hand edge there.
        // These fractions reproduce the original 1024-wide spacing exactly.
        const col = (f) => Math.round(f * GW);
        this.hPos = this.add.text(col(0.0156), 8, 'POS: 1st', s).setDepth(51).setScrollFactor(0);
        this.hLap = this.add.text(col(0.1465), 8, 'LAP: 1/1', s).setDepth(51).setScrollFactor(0);
        this.hMon = this.add.text(col(0.293), 8, '$200,000', { ...s, color: '#FFD700' }).setDepth(51).setScrollFactor(0);
        this.hNit = this.add.text(col(0.469), 8, 'NITRO: 3', { ...s, color: '#ff6600' }).setDepth(51).setScrollFactor(0);
        this.hRce = this.add.text(col(0.625), 8, `RACE ${gs.raceNum + 1}`, { ...s, color: '#aaa' }).setDepth(51).setScrollFactor(0);
        // speed meter bar
        this.hSpdLbl = this.add.text(col(0.762), 8, 'SPD', s).setDepth(51).setScrollFactor(0);
        const spdX = col(0.801), spdW = col(0.088);
        this.hSpdBg = this.add.rectangle(spdX, 18, spdW, 10, 0x222222, 0.8).setOrigin(0, 0.5).setDepth(50).setScrollFactor(0);
        this.hSpdFill = this.add.rectangle(spdX, 18, 0, 8, 0x00ff88, 1).setOrigin(0, 0.5).setDepth(51).setScrollFactor(0);
        this._spdW = spdW;
        this.hBoard = [];
        // The 300x188 board is 29% of a 1024-wide screen but 42% of a 720-wide
        // portrait one, where it swallowed the top-right quarter of the track.
        // Scaled down there rather than left to dominate the view.
        const pad = 10;
        const imgSz = IS_PORTRAIT ? 22 : 30;
        const rowH = IS_PORTRAIT ? 30 : 42;
        const fontSize = IS_PORTRAIT ? '19px' : '28px';
        const bw = IS_PORTRAIT ? 228 : 300, bh = pad + 4 * rowH + pad, bx = GW - bw - pad, by = 46;
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
            // Bottom-right on desktop. In portrait that corner belongs to the
            // thumb — it is exactly where the accelerate button has to sit —
            // so the map moves under the top bar on the left instead, which is
            // dead space there and leaves the whole bottom band for controls.
            const mx = IS_PORTRAIT ? 12 : GW - mw - 12;
            const my = IS_PORTRAIT ? 56 : GH - mh - 12;
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

    // ── Touch controls (mobile) ──────────────────────────────
    // Each on-screen zone drives the *same* Phaser Key objects drivePlayer()
    // already reads (this.cur.left/right/up/down.isDown, this.spc). Nothing
    // downstream — drivePlayer, physics, the AI — needs to know touch exists.
    //
    // Key.isDown is a plain property the keyboard plugin only ever writes in
    // response to a real hardware keydown/keyup event, so setting it directly
    // from a touch handler is safe and is the standard way Phaser mobile
    // ports fake keyboard input. The one wrinkle is nitro: drivePlayer checks
    // Phaser.Input.Keyboard.JustDown(this.spc), which reads the Key's private
    // `_justDown` latch rather than `isDown` — that latch is normally only
    // set by the real keydown handler, so a touch press has to set it too.
    //
    // A real key and a touch button can race each other (e.g. releasing the
    // touch button while the hardware arrow key is still physically held
    // will incorrectly clear isDown). This is an arcade racer, not a fighting
    // game — that's an acceptable, deliberately-unfixed edge case rather than
    // tracking a separate held-state layer above isDown for two input
    // sources that in practice are never used together by the same player.
    buildTouchControls() {
        this.touchZones = [];

        // Multi-touch: a player must be able to hold accelerate + steer +
        // nitro at once. The Phaser game config already raises
        // input.activePointers so simultaneous touches are all tracked.

        // In portrait the mini-map has already been moved to the top-left
        // (see buildHUD), so the bottom band is free and the cluster can just
        // sit at a fixed thumb-height above the bottom edge. In landscape the
        // map is still bottom-right, and its height depends on the track's
        // aspect ratio, so the cluster has to be lifted clear of its top edge
        // rather than assuming a fixed size.
        const clusterR = IS_PORTRAIT ? 62 : 82;
        let rightY = GH - (IS_PORTRAIT ? 112 : 90);
        if (!IS_PORTRAIT && this.isBig && this.miniY != null) {
            rightY = Math.min(rightY, this.miniY - clusterR - 16);
        }

        const zone = (cx, cy, r, color, label, onDown, onUp, fontSize) => {
            const circle = this.add.circle(cx, cy, r, color, 0.30)
                .setStrokeStyle(2, 0xffffff, 0.4)
                .setDepth(200).setScrollFactor(0)
                .setInteractive({ useHandCursor: false });
            const txt = this.add.text(cx, cy, label, {
                fontSize: fontSize || '13px', fontFamily: 'monospace', fontStyle: 'bold', color: '#fff',
            }).setOrigin(0.5).setDepth(201).setScrollFactor(0).setAlpha(0.6);
            const press = () => { circle.setFillStyle(color, 0.65).setScale(1.08); txt.setAlpha(0.95); onDown(); };
            const release = () => { circle.setFillStyle(color, 0.30).setScale(1.0); txt.setAlpha(0.6); onUp(); };
            circle.on('pointerdown', press);
            circle.on('pointerup', release);
            circle.on('pointerout', release);
            circle.on('pointerupoutside', release);
            this.touchZones.push(circle, txt);
        };

        // Steering — bottom-left, under the left thumb. Plain ASCII "<"/">"
        // rather than Unicode arrow glyphs, which some mobile browsers'
        // monospace fallback renders as blank tofu boxes.
        const steerR = IS_PORTRAIT ? 58 : 64;
        const steerY = GH - (IS_PORTRAIT ? 112 : 90);
        const steerX = IS_PORTRAIT ? 78 : 100;
        const steerGap = IS_PORTRAIT ? 132 : 144;
        zone(steerX, steerY, steerR, 0x2a6dff, '<',
            () => { this.cur.left.isDown = true; },
            () => { this.cur.left.isDown = false; }, IS_PORTRAIT ? '32px' : '36px');
        zone(steerX + steerGap, steerY, steerR, 0x2a6dff, '>',
            () => { this.cur.right.isDown = true; },
            () => { this.cur.right.isDown = false; }, IS_PORTRAIT ? '32px' : '36px');

        // accelerate / brake / nitro — one row bottom-right (rather than
        // stacking nitro above accelerate) so the cluster only ever needs
        // ONE clearance check against the mini-map, not two against both
        // the mini-map and the top HUD/leaderboard.

        // accelerate — dominant zone, held most of the time
        zone(GW - (IS_PORTRAIT ? 74 : 100), rightY, clusterR, 0x00ff88, 'GAS',
            () => { this.cur.up.isDown = true; },
            () => { this.cur.up.isDown = false; });

        // brake / reverse — smaller, to the left of accelerate
        zone(GW - (IS_PORTRAIT ? 192 : 260), rightY, IS_PORTRAIT ? 44 : 50, 0xff4444, 'BRK',
            () => { this.cur.down.isDown = true; },
            () => { this.cur.down.isDown = false; });

        // Nitro — echoes the HUD's "NITRO: n" orange accent. In portrait it
        // goes ABOVE the accelerate button rather than further left: there is
        // no width left for a third column beside the steering pair, but
        // plenty of height, and stacking keeps it under the same thumb.
        if (IS_PORTRAIT) {
            zone(GW - 74, rightY - clusterR - 52, 44, 0xff6600, 'NITRO',
                () => { this.spc.isDown = true; this.spc._justDown = true; },
                () => { this.spc.isDown = false; }, '11px');
        } else {
            zone(GW - 384, rightY, 52, 0xff6600, 'NITRO',
                () => { this.spc.isDown = true; this.spc._justDown = true; },
                () => { this.spc.isDown = false; });
        }

        // The "rotate your device" nudge that used to live here is gone: the
        // canvas is now laid out portrait-first on a portrait phone (see
        // GW/GH), so upright is a supported way to play rather than a
        // degraded one to apologise for.
    }

    update(time, delta) {
        // Before the early-out: the crowd, the marshals and the helicopter
        // carry on through the countdown and through the finish, which is
        // most of the point of having them.
        if (this.life) this.updateTrackLife(Math.min(delta, 50));
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
        // Speed-scaled steering: plenty of yaw authority at low speed (nosing
        // out of a hairpin, recovering from a wall) tapering as speed builds so
        // the car stays planted on the straights. Measured against the old
        // (0.55 + 0.55·sf) curve this turns a 2.5 px/f 90° corner in 0.57 s
        // instead of 0.72 s — see the handling notes in physics() below.
        // Drift mode keeps its original arc: its coefficients are scaled by
        // 0.038/0.048 to cancel the `hand` base raise, so that mode is
        // untouched by the grip pass.
        const steer = t.hand * dt * (opts.drift ? (0.59 + 0.59 * sf) : (1.35 - 0.30 * sf));
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
                // braking — strong enough to matter before a corner:
                // 3 px/f to walking pace in 0.27 s / 15 px
                t.vx *= Math.pow(0.85, dt);
                t.vy *= Math.pow(0.85, dt);
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

        // Drift mode: lower skid threshold — constant spectacular tire marks.
        // Normal mode: the grip pass (stab 0.85 → 0.66) keeps lateral velocity
        // small, so the threshold sits just under the new grip limit — skids
        // still appear when a corner is genuinely overdriven.
        const skidLat = opts.drift ? 0.25 : 0.55;
        const skidSpd = opts.drift ? 0.35 : 1.2;
        if (t.isP && Math.abs(lat) > skidLat && Math.hypot(t.vx, t.vy) > skidSpd) {
            this.spawnSkid(t);
        }

        // Lateral grip. This is the classic top-down arcade recipe: each frame
        // the component of velocity perpendicular to the heading is multiplied
        // by stab^dt, pulling the velocity vector onto the nose. The old
        // stab of 0.85 let the car travel 21 px sideways in a lift-off test —
        // the "driving on ice" feel; at 0.66 that is 7 px, and the peak drift
        // angle in a 90° corner drops from 12.9° to 5.4°. Drift mode instead
        // uses a fixed weak 0.93 — velocity lags the heading = natural slide.
        const latFric = opts.drift ? Math.pow(0.93, dt) : Math.pow(t.stab, dt);
        // Slightly more rolling drag than the old 0.994, so lifting off is a
        // real input into a corner rather than a coast.
        const fwdFric = Math.pow(0.991, dt);
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
            // Banking is the inverse of mud: a top-down stand-in for a banked
            // corner, where the camber lets the car carry speed through instead
            // of scrubbing it off. Player and AI both scale by tMult, so it is
            // the same gift to everyone.
            case 'banking': t.tMult = 1.22; break;
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
        if (px[i] > 200 && px[i + 1] < 100 && px[i + 2] < 100) return 'banking';
        return 'offroad';
    }

    syncSprite(t) {
        t.spr.x = t.x; t.spr.y = t.y;
        if (t.spr.texture && (t.spr.texture.key.startsWith('kenney_car_') || t.spr.texture.key.startsWith('car_'))) {
            // Kenney cars face up by default; gameplay heading angle 0 points right.
            t.spr.setRotation(t.a + Math.PI / 2);
        } else {
            let deg = Phaser.Math.RadToDeg(t.a);
            deg = ((deg % 360) + 360) % 360;
            t.spr.setFrame(Math.round(deg / (360 / ROT_FRAMES)) % ROT_FRAMES);
        }
        if (t.shadow) this.syncCarShine(t);
    }

    // Both cues live at SUN_A in WORLD space and rotate with the car only in
    // the sense that the streak lies along its bodywork — turn the car and the
    // highlight walks around it, which is the whole trick: a top-down sprite
    // with a highlight painted into it looks like a decal, and one with a
    // highlight that stays put under a fixed sun looks like a lacquered object.
    syncCarShine(t) {
        // Hidden while the car is falling down a hole: the sprite is being
        // tweened to nothing there and a full-size shadow left behind it would
        // give the trick away.
        const vis = t.spr.visible && !t.falling;
        t.shadow.setVisible(vis);
        t.glint.setVisible(vis);
        if (!vis) return;
        t.shadow.x = t.x + SHADOW_DX; t.shadow.y = t.y + SHADOW_DY;
        t.shadow.rotation = t.a + Math.PI / 2;
        // The streak sits on the sun-facing flank, a third of a body-width out,
        // and is brightest when that flank is turned across the light — which
        // is why it sweeps as you go through a corner rather than sitting there.
        t.glint.x = t.x + Math.cos(SUN_A) * 4.2;
        t.glint.y = t.y + Math.sin(SUN_A) * 4.2;
        t.glint.rotation = t.a + Math.PI / 2;
        const across = Math.abs(Math.sin(t.a - SUN_A));
        t.glint.alpha = 0.13 + 0.21 * across + (t.nAct ? 0.20 : 0);
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
        this.hSpdFill.width = this._spdW * ratio;
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
        const next = TRACKS[(gs.raceNum + 1) % TRACKS.length].music;
        if (!next) return;
        const nextKey = 'music_' + next;
        if (!this.cache.audio.exists(nextKey)) {
            this.load.audio(nextKey, next);
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
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        this.tweens.add({ targets: ct, alpha: 0.2, duration: 500, yoyo: true, repeat: -1 });

        const advance = () => this.scene.start('ShopScene');
        this.input.keyboard.on('keydown-ENTER', advance);
        this.input.keyboard.on('keydown-SPACE', advance);
        ct.on('pointerdown', advance);
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

        // The three columns (name / level+bar / buy) were pixel columns for a
        // 1024-wide box; portrait is 720 (see GW/GH up top), which put the buy
        // button past the right edge. Scaling x by the box width keeps desktop
        // pixel-identical (hx = 1) and keeps the columns from colliding when
        // it isn't — the segment pitch has to scale too, or a 12-segment bar
        // grows into the buy column.
        const hx = GW / 1024;
        UPGRADES.forEach((u, i) => {
            const y = 160 + i * 85;
            this.add.text(180 * hx, y, u.name, {
                fontSize: '22px', fontFamily: 'monospace', color: '#fff', fontStyle: 'bold',
            });
            this.add.text(180 * hx, y + 28, '$' + u.cost.toLocaleString(), {
                fontSize: '14px', fontFamily: 'monospace', color: '#888',
            });

            const cur = gs[u.key];
            const lt = this.add.text(480 * hx, y, `${cur}/${u.max}`, {
                fontSize: '18px', fontFamily: 'monospace', color: '#0af',
            });
            this.lvlTxts.push(lt);

            // bar segments
            const barGroup = [];
            for (let b = 0; b < u.max && b < 12; b++) {
                const filled = b < cur;
                const seg = this.add.rectangle(480 * hx + b * 20 * hx, y + 30, 16 * hx, 10,
                    filled ? 0x00aaff : 0x222244).setOrigin(0, 0);
                barGroup.push(seg);
            }
            this.bars.push(barGroup);

            // buy button
            const btn = this.add.text(780 * hx, y + 4, '[ BUY ]', {
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

        // Every track is raceable from the start — no progression gate.
        this.sel = gs.raceNum % numTracks;
        this.boxes = [];

        for (let i = 0; i < numTracks; i++) {
            const col = i % COLS;
            const row = Math.floor(i / COLS);
            const cx = startX + col * CELL_W + BOX_W / 2;
            const cy = startY + row * CELL_H + BOX_H / 2;

            const g = this.add.graphics();
            g.fillStyle(0x111111, 1);
            g.fillRect(cx - BOX_W / 2, cy - BOX_H / 2, BOX_W, BOX_H);
            g.lineStyle(2, 0xffffff, 1);
            g.strokeRect(cx - BOX_W / 2, cy - BOX_H / 2, BOX_W, BOX_H);

            this.add.text(cx, cy, String(i + 1), {
                fontSize: '26px', fontFamily: 'monospace',
                color: '#ffffff', fontStyle: 'bold',
            }).setOrigin(0.5);

            const zone = this.add.zone(cx, cy, BOX_W, BOX_H).setInteractive({ useHandCursor: true });
            zone.on('pointerover', () => { this.sel = i; this.updateHighlight(); this.updateTrackName(); });
            zone.on('pointerdown', () => { this.sel = i; this.confirm(); });

            this.boxes.push({ cx, cy });
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
        this.sel = Phaser.Math.Clamp(this.sel + delta, 0, TRACKS.length - 1);
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
    input: {
        // Default is 1 active pointer. On-screen touch controls need a
        // player to hold accelerate + steer + nitro simultaneously with
        // separate fingers — each needs its own tracked pointer.
        activePointers: 4,
    },
    // HudOverlayScene last: Phaser renders scenes in this array's order, so
    // being registered after every gameplay scene is what keeps its button
    // drawn on top of whichever one is currently active, regardless of when
    // each was started/stopped (only the FIRST entry auto-starts; this one
    // is launched explicitly from BootScene instead).
    scene: [BootScene, MainMenuScene, TitleScene, PlayerSelectScene, TrackSelectScene, RaceScene, ResultsScene, ShopScene, HudOverlayScene],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        fullscreenTarget: 'parent',
    },
    pixelArt: true,
};

new Phaser.Game(config);
