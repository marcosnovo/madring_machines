# Kilómetro Cero — 3D circuit mode

A second game mode for this repository: a 3D racing game set on the
IFEMA-Valdebebas street course in Madrid — a 3D model of the circuit, with the
road the car drives on measured off that model rather than invented.

The root of this repository is a top-down Phaser game. This directory is a
separate, self-contained Vite + TypeScript app and does not share code with it —
only the circuit data in `../scripts/madring-centreline.js`.

![the main straight](docs/straight.png)

## What it is derived from

This is a derivative of **[colyseus/react-racing-game][fork]**, itself a fork of
**[@pmndrs/racing-game][pmndrs]** — React Three Fiber, `@react-three/cannon`
(cannon-es), zustand, Vite. Both are MIT. The vehicle physics, cameras, effects
and HUD are theirs; the circuit is a CC-BY-4.0 model by Dave Love plus the code
that aligns it, measures a road out of it and makes it drivable.

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

The circuit model is committed pre-compressed, so none of this needs the 135 MB
source. To rebuild it from that source (see *The circuit* below):

```sh
npm run build:fit     # align the model, measure the road  -> src/circuit/road.ts
npm run build:model   # compress it                        -> public/models/
npm run build:assets  # both
```

No server, no account, no network. Everything the page needs is served from
`public/`, including the Draco decoder that upstream fetched from a Google CDN.

Drive with the arrow keys or WASD. `Space` drifts, `Shift` boosts, `R` puts you
back on the circuit, `C` cycles chase / first-person / bird's-eye, `M` toggles
the minimap, `I` shows the full key list.

## The circuit

The circuit is a 3D model:

> This work is based on **["Circuito de Madring 2026 layout"][model]** by
> **[Dave Love SketchFab][author]**, licensed
> **[CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/)**.

[model]: https://sketchfab.com/3d-models/circuito-de-madring-2026-layout-5bbaf6e5048643858a498bc8a4ef4c05
[author]: https://sketchfab.com/Tyler_Dave

That credit is a licence condition, not a courtesy. It is reproduced in
[NOTICE](NOTICE), at the top of `src/models/track/Circuit.tsx`, and on the
game's intro screen. Do not remove it while the model is in use.

It supplies everything the procedural circuit did not: asphalt, kerbs, painted
lines, tyre marks, concrete walls, catch fencing, the pit building and pit lane,
the grandstands, the start gantry with its LED boards, floodlights, trackside
signage, parked vehicles, trees, and the city around it. There is no crowd in
it — the stands are modelled empty, seats and railings and distance boards, and
no amount of rendering will put people in them.

### Shipping it

The model as distributed is 134.65 MB — a 98 MB `.bin`, 37 MB of PNG (of which
35 MB is one 4096² backdrop) and a 164 KB `.gltf`. `npm run build:model` turns
that into **8.82 MB**, a 15.3× reduction, by

1. baking in the alignment transform (below) so the runtime needs no magic
   numbers;
2. dropping `TANGENT` and `TEXCOORD_1` — three derives the tangent frame in the
   fragment shader, and nothing reads the second UV set;
3. welding duplicate vertices;
4. cutting every mesh that spans more than 320 m into 256 m tiles (see
   *Performance*);
5. re-encoding the textures as WebP, capped at 1024² (only the backdrop is
   affected — everything else is 256² or smaller);
6. Draco, 14-bit positions quantised per mesh, which over a 256 m tile is 1.6 cm.

What that costs: the backdrop panorama loses half its resolution each way, WebP
at quality 82 is lossy, and 14-bit positions are not exact. No geometry is
removed and nothing is simplified — the triangle count out is the triangle count
in, 1,689,008.

The source stays in `assets/madring-sketchfab/` and is **not** committed (135 MB,
and this repository does not redistribute it). Download it from the link above to
rebuild; `npm run build:assets` runs the fit and the compression together.

### Aligning it to the geodata

`npm run build:fit` (`scripts/fit-circuit.mjs`) fits the model to the projected
centreline in `src/circuit/centreline.ts` — 116 published lat/lon points from
[bacinger/f1-circuits][f1c], projected to a local metric plane.

[f1c]: https://github.com/bacinger/f1-circuits

Both are already at true metric scale, so the fit is **rigid**: a yaw and a
translation, nothing else. Every vertex of the model's `TarmacDark` mesh is
pushed to its nearest point on the Catmull-Rom centreline and a *trimmed* RMS is
minimised — the worst 20% of residuals are dropped, so the pit lane, the run-off
aprons and the stretches where the geodata and the artist genuinely disagree
cannot drag the whole circuit sideways. 360 starting yaws are tried, mirrored
and not; Nelder-Mead refines the winner.

The result, on top of the glTF's own Z-up → Y-up rotation:

| | |
|---|---|
| yaw about +Y | **−0.3863°** |
| translation | **(+84.00, 0, +3.33) m** |
| scale | **1** (not fitted) |
| mirrored | no |

![the fit, in plan](docs/fit-plan.png)

*The model's asphalt in grey, shaded by height; the 64 projected geodata control
points in blue; the measured centreline in red; the lines the walls stand on in
green. Written by `npm run build:fit` — if the red does not follow the grey, the
fit is wrong.*

and the model's tarmac then sits a **mean of 10.74 m / median 6.99 m** from the
projected centreline (p95 35.77 m, max 88.69 m). Those residuals are not fit
error. They are the two sources disagreeing: same circuit, same scale, same
place, different curve.

### Reading the road back out

A rigid fit is not enough to drive on. If the model's walls are 7 m from where
the game thinks the road is, they cross it. So the model wins outright: the
aligned tarmac is rasterised to a 1 m occupancy/height grid, and the road is
**measured** off it. At each of 1024 samples the script scans sideways, splits
the scan into runs of asphalt, takes the nearest road-shaped one, and records

* the middle of the paved corridor,
* how far the asphalt runs to the left and to the right,
* the surface height,
* the cross-slope.

Two details make that work. Runs wider than 36 m are rejected as not
road-shaped, which keeps the centreline out of the run-off lay-by on the outside
of the north loop; and a sample that finds no asphalt at all is interpolated
between the samples either side rather than left where it was, because on that
same loop the geodata is 60 m off the model and no scan we dare make would reach.
The passes go wide (34 m) then narrow (20 m).

That is written to `src/circuit/road.ts`, and *everything* the game does with the
circuit is driven from it — lap timing, the minimap, respawns, the grid slot, the
walls — so all of it lands on asphalt the player can see. The start/finish index
is the sample nearest the model's own start gantry, which lands 1.8 m from the
measured centreline.

Measured off the model:

| | |
|---|---|
| lap | **5428.9 m** (published 5474 m, −0.8%) |
| paved corridor | 24.2 – 51.6 m edge to edge |
| elevation | −7.2 → +16.9 m, a 24.1 m range |
| cross-slope | up to 2.8° |
| coverage | 99.69% of the 30,924 m² between the walls is asphalt |

The old procedural ribbon is gone — `src/circuit/geometry.ts` and everything it
swept. Keeping it as a physics surface under the model was possible but pointless:
the model's own tarmac is the better surface *and* it is guaranteed to be where
the model is drawn, which a parallel ribbon never is.

### Collision

Two things collide.

**The asphalt.** The model's `TarmacDark` meshes go to cannon as static
`Trimesh` bodies — 25 of them (one per tile the build script cut), 62,032
triangles. The wheels ride on exactly the surface the player sees: every camber,
crest, dip and kerb-height step in the model is felt.

![the run down to the north loop](docs/backstraight.png)

**The walls.** `src/circuit/walls.ts` puts a 0.8 × 3 × 21 m static box every
21 m down each side, standing 0.8 m outside the measured asphalt edge, grouped
into 24 compound bodies so no body has an AABB the size of the circuit. They are
invisible. You may use the full width of the asphalt, run-off aprons included,
and you cannot leave it.

**Nothing else collides.** Grandstands, the pit building, the city, floodlights,
signage, trees, the parked vans, the fences: decoration. The honest
reason is that **cannon-es implements only sphere-trimesh and plane-trimesh
narrowphase** — there is no convex/box-vs-trimesh — so a trimesh can be driven
*on* (the wheel raycasts hit it; `Ray` supports trimesh via the mesh's octree)
but never driven *into*. The chassis box passes straight through one. Giving
1.6 M triangles of scenery collision would buy nothing but a slower broadphase.
The design reason is that a street circuit is defined by its walls: get those
right and nothing else needs to be solid.

What that costs: you can drive through the pit-lane fence and the tyre stacks.
You have to climb a wall to reach them.

### Performance

Measured, not guessed — this sandbox renders through SwiftShader at a fraction
of a frame per second, so frame rates from it would be meaningless. What is
meaningful is what the renderer is asked to do. Teleporting the car to 16 points
around the lap and reading `WebGLRenderer.info` (shadow pass included):

| | min | median | max |
|---|---|---|---|
| draw calls / frame | 142 | 466 | 839 |
| triangles / frame | 124 k | 651 k | 1.27 M |

against 1,481 meshes and 1,689,008 triangles in the file.

That spread is the whole point of tiling. The source is one merged mesh per
material, each stretching across the entire 1.9 km circuit, so frustum culling
could never reject a single one of them: 86 draw calls, and all 1.69 M triangles
submitted every frame from every camera angle. Cut into 256 m tiles, culling
throws away 43–90% of the geometry. The trade is roughly 5× the draw calls for
roughly 2.6× fewer triangles at the median, and **which side of that wins on real
hardware has not been measured** — only that the tiled version submits far less
geometry.

There is no instancing and no LOD. Instancing has nothing to work with: the
Sketchfab export already merged every repeated grandstand, tree and lamp post
into one mesh per material, so the repetition the source had is gone before the
file arrives. LOD would need decimated copies of 60 materials' worth of geometry
and roughly doubles the download; tiling plus culling was the cheaper win.
The road surface does not cast shadows (it would only shadow-acne itself), and
the sun now follows the car — its 240 m shadow frustum used to sit at a fixed
world position, which on a circuit this size meant nothing near the player was
ever shadowed.

### La Monumental

The signature banked loop is still **found, not placed**, and now from the
model's own geometry. Prefix sums over the signed curvature of the measured road
locate the 550 m window whose *signed* mean curvature is largest in magnitude —
by construction the section that turns hardest and never changes direction.

![La Monumental](docs/monumental.png)

Note that the model does not bank it anything like the 24% the real circuit is
said to carry: the measured cross-slope peaks at 2.8° over the whole lap. That
is the model's reading of the circuit, and it is now the game's.

## Derived vs. approximated

**From the real circuit data**

- The plan-view shape, at true metric scale, from [f1-circuits][f1c] via the
  root `scripts/`. Used to *place* the model, not to shape it.

**From the model** — which is one artist's reading of the circuit, not a survey

- The road itself: where it runs, how wide the asphalt is, its elevation and its
  cross-slope, all measured off `TarmacDark` and written to `src/circuit/road.ts`.
- Everything visible: kerbs, lines, walls, fences, pit lane, grandstands, the
  gantry, floodlights, signage, trees, the city.
- The position of the start/finish line, taken from the model's own gantry.

**Ours, and still approximate**

- The invisible walls. They stand on the measured asphalt edge because that is
  the only closed line we can measure; a real circuit's barriers are further out
  in the run-off and closer in the corners.
- Which section is La Monumental, from curvature analysis. The model does not
  label its corners.
- No collision on anything but the asphalt and those walls.

## Known limitations

- **Single player.** The opponent-car plumbing was removed with the Colyseus
  server; the minimap and rank UI that depended on it are gone or simplified.
- **The leaderboard is local.** Completed laps go to `localStorage` and are
  listed under `L`. Nothing is uploaded.
- **The chassis passes through the road mesh** if it is ever separated from its
  wheels (see *Collision*). In normal driving the suspension keeps it clear.
- **The scenery is not solid** — see *Collision*. Fences, tyre stacks and the
  pit wall are decoration.
- **0.31% of the area between the walls is not asphalt**: raster-quantisation
  slivers at the edges, mostly. If the car finds one it drops through and the
  killzone at y = −40 respawns it.
- **The 24% banking of La Monumental is not in the model**, and is no longer
  invented either. Cross-slope comes off the model and peaks at 2.8°.
- **The grandstands are empty.** They are large, detailed and entirely
  unpopulated: the asset has no crowd texture, so this is not something the
  renderer can fix. Adding one means adding geometry the model does not have.
- **Nothing in the model moves or makes a noise**: the LED boards do not play,
  the marshals' flags do not wave, and there is no crowd noise. Foliage and
  fence materials were `BLEND` in the source and are re-declared alpha-tested
  here — several hundred thousand blended triangles would need depth sorting
  the scene cannot afford — which crisps up their edges.
- **`import.meta.env.DEV` exposes `window.__game`** (`getState`, `mutation`,
  `getLayout`), `window.__render` (draw calls and triangles for the last frame),
  `window.__circuit` and `window.__physics`, so a headless browser can inspect
  the car, the layout and the renderer. All stripped from production builds.

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
