# Kilómetro Cero — 3D circuit mode

A second game mode for this repository: a 3D racing game whose circuit is
generated at load time from the real centreline of the IFEMA-Valdebebas street
course in Madrid.

The root of this repository is a top-down Phaser game. This directory is a
separate, self-contained Vite + TypeScript app and does not share code with it —
only the circuit data in `../scripts/madring-centreline.js`.

![the main straight](docs/straight.png)

## What it is derived from

This is a derivative of **[colyseus/react-racing-game][fork]**, itself a fork of
**[@pmndrs/racing-game][pmndrs]** — React Three Fiber, `@react-three/cannon`
(cannon-es), zustand, Vite. Both are MIT. The vehicle physics, cameras, effects
and HUD are theirs; the circuit is ours.

The desert map they ship has been removed entirely, along with the Colyseus
multiplayer server and the hosted Supabase leaderboard. Read **[NOTICE](NOTICE)**
for the full accounting — what was inherited, what was deleted and why, and
which third-party attributions still apply.

[fork]: https://github.com/colyseus/react-racing-game
[pmndrs]: https://github.com/pmndrs/racing-game

## Run it

```sh
cd madring-3d
npm install
npm run dev      # vite, http://localhost:3000
```

```sh
npm run build    # tsc && vite build  ->  dist/
npm run serve    # preview the production build
```

No server, no account, no network. Everything the page needs is served from
`public/`, including the Draco decoder that upstream fetched from a Google CDN.

Drive with the arrow keys or WASD. `Space` drifts, `Shift` boosts, `R` puts you
back on the circuit, `C` cycles chase / first-person / bird's-eye, `M` toggles
the minimap, `I` shows the full key list.

## The circuit

`../scripts/madring-centreline.js` exports 64 control points in world pixels
plus `{ W, H, scale, lapM }`. Those coordinates are derived from
[bacinger/f1-circuits][f1c] (MIT) — 116 lat/lon points of the published
centreline, projected to a local metric plane and resampled at even arc length.
`src/circuit/centreline.ts` is a verbatim TypeScript copy of that data.

[f1c]: https://github.com/bacinger/f1-circuits

### Scale

**True scale.** Pixels are divided by `scale` (1.024386 px/m) and re-centred on
the origin, so one world unit is one metre and the layout is ~1130 m × 1810 m.
The lap comes out at **5274 m** against a published 5474 m — the shortfall is
Catmull-Rom corner-cutting, 3.7%.

Nothing was compressed for playability. The upstream vehicle is already tuned in
metres — 4.7 m long, `maxSpeed` 88, i.e. ~316 km/h — so a real-size circuit gives
roughly real lap times. Shrinking the track would only have made a car that is
the right size for the world feel wrong in it.

### How the road is built

`src/circuit/layout.ts` builds one description of the road and everything else
is generated from it, so the shape is never restyled by hand:

1. A closed `CatmullRomCurve3` through the 64 control points, `centripetal`
   parameterisation (uniform Catmull-Rom cusps on the tight hairpins).
2. 1024 samples at even arc length, ~5.15 m apart.
3. Signed curvature per sample from finite differences, smoothed over ±6 samples.
4. Elevation, banking and width applied as functions of arc length and curvature.
5. A road frame per sample — tangent, "driver's right", road normal — rolled
   about the tangent by the banking angle. A road frame, not a Frenet frame: the
   road only rolls where we bank it.

`src/circuit/geometry.ts` then sweeps cross-sections along those frames. Asphalt,
kerbs, run-off, barriers, tunnels and the collision mesh are all the same sweep
with a different cross-section.

### Collision

The car drives on a cannon **`Trimesh`** swept from the same frames as the visual
road: 512 rings × 7 columns, 6144 triangles. Upstream drove on a `Heightfield`
baked from a greyscale PNG, which does not survive the move to this circuit — a
1024-square heightfield over a 1.8 km world gives ~2 m cells, coarser than the
kerbs, and it would turn 24% banking into a staircase.

The trade-off is that **cannon-es implements only sphere-trimesh and
plane-trimesh narrowphase** — there is no convex/box-vs-trimesh. So the chassis
box does not collide with the road mesh; only the wheel raycasts do, and
`Ray` does support trimesh (via the mesh's octree). That is enough, because a
`RaycastVehicle` is held up entirely by its wheel rays. What it is *not* enough
for is walls, so the outside of the run-off is lined with ~410 static boxes,
grouped into 24 per-sector compound bodies so each keeps a small AABB. A ground
plane sits below everything, and a single trigger plane at y = −60 puts you back
on the circuit if you clear the lot.

### La Monumental

The signature banked loop is **found, not placed**. Prefix sums over the signed
curvature locate the 550 m window whose *signed* mean curvature is largest in
magnitude — by construction the section that turns hardest and never changes
direction. On this layout that is the teardrop at the north end, and it comes out
at:

| | |
|---|---|
| arc length | 2179 m → 2730 m |
| radius | 133 m |
| heading change | 238° |
| banking | 24%, ramped in and out over 130 m |

![La Monumental](docs/monumental.png)

Every other corner gets a mild curvature-proportional bank, capped at 5%.

Note that 24% (13.5°) of banking is nowhere near enough to hold 300 km/h through
a 133 m radius on its own — that needs ~5.3 g of lateral load, and the real thing
would rely on aerodynamic downforce this arcade car does not have. Take it at
whatever speed sticks.

## Derived vs. approximated

**Derived from the real circuit data**

- The plan-view shape, at true metric scale, from `f1-circuits` via the root
  `scripts/`. Not restyled, not smoothed beyond the Catmull-Rom fit.
- The location, radius and length of La Monumental, found by curvature analysis
  of that centreline.
- Which section is the main straight — the longest low-curvature run — and the
  fact that the start/finish line sits on it.

**Approximated, and why**

- **Road width: 14 m, widening to 15 m on the main straight.** The real circuit
  is 12 m and 15 m. 12 m is unpleasant with an arcade vehicle that has no
  steering assist; 14 m is drivable and still narrow enough to read as a street
  circuit.
- **Elevation: 10 m of change**, matching the published figure, but the *profile*
  is invented — two harmonics of the lap, so it is smooth and closes on itself.
  The real per-corner elevations are not in the source data.
- **Banking away from La Monumental** is invented: proportional to curvature,
  capped at 5%. Only the 24% figure is real.
- **Corners: 19 detected** at |R| < 200 m against a published 22. The centreline
  is resampled at ~5 m and smoothed, which merges the tightest pairs.
- **Tunnels: 2, 130 m each, cosmetic.** The circuit has two tunnels; their real
  positions are not in the source data, so they are centred on the two longest
  straights that do not carry the start/finish line. They are concrete arches
  with no collision — you cannot hit the roof.
- **Run-off, kerbs, barriers and the ground** are all invented. Kerbs are 1 m and
  12 cm high; run-off is 9 m of verge each side; barriers are 3 m.
- **Everything else on a street circuit** — buildings, grandstands, pit lane,
  bridges, trackside furniture — is absent.

## Known limitations

- **Single player.** The opponent-car plumbing was removed with the Colyseus
  server; the minimap and rank UI that depended on it are gone or simplified.
- **The leaderboard is local.** Completed laps go to `localStorage` and are
  listed under `L`. Nothing is uploaded.
- **The chassis passes through the road mesh** if it is ever separated from its
  wheels (see *Collision*). In normal driving the suspension keeps it clear.
- **`import.meta.env.DEV` exposes `window.__game`** (`getState`, `mutation`,
  `getLayout`) so a headless browser can inspect the car and the layout. It is
  stripped from production builds.

### Changes to upstream behaviour

Four upstream bugs surfaced immediately on a circuit this size and are fixed
here, each with a comment at the site:

- `BoundingBox` built a cage of six trigger planes. cannon treats a plane as a
  solid half-space, so all six were in permanent contact with anything inside
  the cage: the car fired `reset()` on its first physics step, which silently
  overwrote its spawn heading. Replaced by `Killzone`, one plane facing up from
  below.
- `reset()` (the `R` key) only zeroed rotation and velocity. On a 5 km circuit
  that leaves you stranded wherever you went off; it now respawns you on the
  centreline nearest to where you ended up, facing the right way.
- Camera sway and engine-audio playback rate are smoothed with
  `lerp(a, b, delta * k)` for k up to 20. Above ~20 fps that is a lerp; below it
  the term extrapolates and diverges within a few frames — a camera pointed at
  the sky, and a stream of non-finite-value errors out of Web Audio. `src/frame.ts`
  clamps the step; sway is assigned rather than accumulated.
- The minimap's orthographic camera had a hard-coded `near={20} far={500}` and a
  non-square frustum, which clipped this circuit away entirely and squashed it.
  Both are now derived from the level bounds.
