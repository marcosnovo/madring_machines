// GENERATED — do not edit by hand.
// Regenerate: node scripts/madring-road-centre.js
//
// The MADRING centreline the game races: the middle of the real circuit's
// asphalt, measured off "Circuito de Madring 2026 layout" by Dave Love
// (CC-BY-4.0 — see NOTICE, attribution is a condition of the licence), with
// the lap's identity — start/finish line, direction, corner order — taken from
// the published geodata in scripts/madring-geodata-centreline.js
// (bacinger/f1-circuits, MIT).
//
// The two sources agree over most of the lap — 88.2% of the published
// polyline lands on the model's asphalt — and disagree over 636 m of it, where
// the polyline cuts across the infield and the circuit does not. The model
// wins there, because images/madring-overhead.jpg is a render of the model and
// the player would otherwise watch the car drive over painted grass.
// Index 0 sits on the model's own start/finish gantry.
//
// Why 256 points and not 64: game.js drives the Catmull-Rom spline through
// these points, not the points themselves, and at 64 control points that
// spline cut every corner — up to 17.8 m of deviation, wider than the road.
// game.js pairs this with spp: 5 so the finer curve still lands on 1280
// waypoints, which is what everything addressed by waypoint index expects.
//
//   world      : 1338 x 2033 px
//   scale      : 1.027384 px/m, measured by scripts/madring-model-fit.js
//   lap        : 5578 px = 5429 m as splined at 5 samples/point
//                (published 5474 m; madring-3d measures the same asphalt at 5429 m)
//   on tarmac  : 100.0% of the 1280 waypoints

const MADRING_WORLD = { W: 1338, H: 2033, scale: 1.027384, lapM: 5429.3 };
const MADRING_CP = [
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
];

if (typeof module !== "undefined") module.exports = { MADRING_CP, MADRING_WORLD };
