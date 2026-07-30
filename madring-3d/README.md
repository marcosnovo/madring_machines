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
no amount of rendering will put people in them. So the people are generated;
see *The crowd*, which places them off the model's own grandstand geometry.

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

**The walls.** `src/circuit/walls.ts` runs a continuous chain of 1,024 static
boxes down each side of the measured asphalt, 0.8 m outside the edge, grouped
into 48 compound bodies so no body has an AABB the size of the circuit. They are
invisible. You may use the full width of the asphalt, run-off aprons included,
and you cannot leave it.

They did not use to work. The first version put one 0.8 × 3 × 21 m box *centred
on* every 21st metre of centreline, square to the road at that sample, and you
could drive straight through it. Two separate reasons, both found by rebuilding
the collision world headless in cannon-es and firing the chassis at the wall
from 366 points around the lap:

1. **A row of chords is not a wall.** Each box sat at its own sample's edge
   distance, and that distance steps by up to 4.6 m from one box to the next, so
   consecutive boxes met end-cap to end-cap with a lateral jog. An end cap's
   normal points *along* the road, so a car arriving at a joint got pushed
   forwards rather than sideways and slid past.
2. **0.8 m is thinner than one physics step.** cannon has no continuous
   collision detection. At 1/60 s the car covers 0.5 m at 30 m/s and 1.5 m at
   the top speed, and once the centre of the chassis is past the middle of a
   thin box, box-vs-box narrowphase reports the *far* face as the axis of least
   penetration — so the contact helpfully pushes the car out through the back.

Now each box spans *between* consecutive edge points, so the chain is continuous
and every face the car can reach points at the road; and they are 8 m thick and
9 m tall, which is far more than a single step's penetration, so the axis of
least penetration stays lateral. Thickness grows outwards only — the inner face
is exactly where it always was. There is room for that: the tightest gap
anywhere on the lap between a wall line and another part of the paved corridor
is 16.8 m.

Fired at the wall at 30, 60 and 90 m/s from 366 places around the lap, per
angle of incidence:

| got through | 90° | 60° | 45° | 30° | 20° |
|---|---|---|---|---|---|
| old walls | 4.9% | 14.5% | 19.4% | 27.9% | 30.9% |
| these walls | **0.0%** | **0.0%** | 2.2% | 5.7% | 7.9% |

Confirmed in a real browser: at 288 km/h the car now stops 1.4 m short of the
wall face and is thrown back at 45 km/h. It used to sail through at 144.

What is left is all shallow-angle, and all at the handful of samples where the
measured corridor changes width abruptly and the wall line has a sharp convex
kink. A box fired in a straight line finds those; a car that steers does not.

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
meaningful is what the renderer is asked to do. Teleporting the car around the
lap and reading `WebGLRenderer.info`:

| | min | median | max |
|---|---|---|---|
| draw calls / frame | 216 | 730 | 1036 |
| triangles / frame | 288 k | 889 k | 1.52 M |

against 1,481 meshes and 1,689,008 triangles in the file.

That is up from 142 / 466 / 839 and 124 k / 651 k / 1.27 M, and almost all of
the increase is the field of view: the chase camera now runs at 62–84° instead
of a fixed 50°, so a good deal more of the circuit is inside the frustum. The
crowd is 2 draw calls and 24 k triangles of that. It is a deliberate trade —
see *Making it arcade*.

Two corrections to how this is measured. Those numbers **exclude the shadow
pass**: three.js calls `info.reset()` again *after* rendering shadow maps, so
`info.render` only ever describes the beam pass. And the figure has to be taken
from the heaviest `render()` call of the frame, not from a frame callback — the
minimap takes over the render loop with a priority-1 `useFrame` and draws its
own two-sprite overlay scene last, so reading `gl.info` naively reports "2 draw
calls, 4 triangles" for the whole game. `window.__render` now wraps
`WebGLRenderer.render` and keeps the largest pass.

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
the sun follows the car — its shadow frustum used to sit at a fixed world
position, which on a circuit this size meant nothing near the player was ever
shadowed. See *Lighting* for why that frustum is only 170 m across.

The crowd is 6,078 spectators in **two draw calls**: two `InstancedMesh`es of
two triangles each. See *The crowd*.

### La Monumental

The signature banked loop is still **found, not placed**, and now from the
model's own geometry. Prefix sums over the signed curvature of the measured road
locate the 550 m window whose *signed* mean curvature is largest in magnitude —
by construction the section that turns hardest and never changes direction.

![La Monumental](docs/monumental.png)

Measured off the model, the corner found this way is 551 m long, turns through
207°, has a 153 m radius and a paved corridor 27.7 m wide, and its cross-slope
runs 1.5–2.8°.

The real corner is said to be banked at **24%** — 13.5°. The model is not, and
**this has been left alone deliberately.** The reasoning, since it is the one
place where the project's "the model wins" rule visibly costs something:

* There is no code path that can bank it. The car drives on the model's own
  `TarmacDark` trimesh, not on a generated ribbon; the `bank` figure in
  `road.ts` only orients the road *frame*, which places the walls, the grid slot
  and respawns. Changing that number would move the walls and leave the surface
  under the wheels exactly as flat as before.
* Banking it for real means deforming the model's vertices. That much is
  possible without desynchronising anything — the drawn mesh and the collision
  trimesh come from the same `scene`, so rolling one rolls the other. What
  cannot be kept in sync is *the rest of the corner*. 24% across a 27.7 m
  corridor is a 6.6 m edge-to-edge height difference; the model has 1.2 m. The
  outer edge of the asphalt would rise about 2.7 m above where it is drawn now,
  for 551 m, while the concrete barrier beside it, the kerbs, the run-off, the
  catch fencing and the grandstands behind them stay where the artist put them.
  You would be driving up a wall of tarmac that had torn away from its own
  scenery.

So the cost is recorded rather than papered over: at 2.8° and a friction
coefficient of 1.6 the 153 m radius is worth about 186 km/h; at the real 13.5°
it would be worth 241 km/h. La Monumental is a fast corner here, but not the
corner it is supposed to be.

## Making it arcade

The complaint was *se siente lento, no responde directamente* — it feels slow
and it does not answer directly. Both were true, and neither was mainly about
the car.

Everything below was moved against a measurement rather than a feeling. A
headless cannon-es rig (`RaycastVehicle`, the real `vehicleConfig`, the same
on-off keys the player has, a flat plane for vehicle dynamics and the measured
circuit for lap work) reports acceleration, braking, steady-state cornering
radius and how far a scripted driver gets in 150 seconds. It runs a lap in about
a second, which is the only reason any of this could be tuned at all in a
sandbox that renders at well under 1 fps.

### The car

|  | before | after |
|---|---|---|
| 0–100 km/h | 3.97 s | **2.73 s** |
| 0–200 km/h | 8.05 s | **5.52 s** |
| 0–300 km/h | 12.33 s | **8.38 s** |
| 200–0 km/h | 4.13 s / 119 m | **2.93 s / 95 m** |
| full-lock radius @ 120 km/h | 39 m | **22 m** |
| … @ 200 km/h | 116 m | **62 m** |
| … @ 280 km/h | 229 m | **118 m** |
| scripted driver, 150 s | 5,974 m @ 143 km/h | **7,516 m @ 180 km/h** |

Four passes, in this order:

1. **Power.** Engine force 1800 → 2600 N per driven wheel. That is the whole of
   the acceleration change; nothing else touches it.
2. **Grip.** `frictionSlip` 1.5 → 2.6 and `sideAcceleration` 3 → 4. This is what
   "no responde" actually was: the car had so little lateral grip that at
   200 km/h full lock bought a 116 m radius.
3. **Suspension.** `suspensionStiffness` 30 → 45, explicit damping (8
   compression / 12 relaxation) and `maxSuspensionTravel` 0.35. Less wallow into
   the next corner — and, unexpectedly, 24 m off the 200–0 braking distance,
   because a car that is not pitching keeps its wheels loaded.
4. **Steering.** Lock 0.30 → 0.36 rad, and new: `steerSpeedFalloff`, which
   bleeds half of it away by top speed. That reads backwards and is not — at
   280 km/h the *reduced* lock turns harder (118 m against 168 m at full lock),
   because full lock simply saturated the front tyres and the car ploughed on.
   The steering also reaches its target faster (lerp rate 20 → 26).

Boost now does something: 1.7× engine force instead of 1.5×, and it lifts the
speed ceiling by 12% rather than leaving you stuck against the same wall.

### The camera

This was the larger half of "feels slow". A racing game sells speed with the
camera, and this one was doing the opposite of everything it needed to:

* it ran at drei's default **50° field of view**, which at 300 km/h is a
  telephoto lens. It is now 62° at rest, opening to 84° at top speed and 93°
  under boost, eased over about a quarter of a second;
* it **backed away** as the car got faster (`-5 - speed / 15`: 5 m behind at
  rest, 11 m flat out). Retreating from the action is how you make something
  look slower. It now closes up instead, 5.2 m to 8.3 m;
* it eased towards its target with `lerp(v, delta)` — a lerp factor of one
  frame-time, which is a **time constant of about a second**. You steered, and
  the camera arrived after the corner. Now `delta * 7`, about 0.14 s.

The bird's-eye camera was also fixed: the camera-sway code wrote `rotation.x`
unconditionally, which threw away the −90° pitch the overhead camera is declared
with and pointed it at the horizon. Pressing `C` twice used to give you a
screenful of sky.

### The speedometer

It read `mutation.speed` — metres per second, because the world is at true
metric scale — and labelled it **mph**. A car doing 300 km/h displayed "83". It
is km/h now, and correct.

## The crowd

`src/models/track/Crowd.tsx`. 6,078 spectators, in **two draw calls**.

They are placed off the model, not typed in. At load the four grandstand
materials are pulled out of the parsed glTF and their upward-facing triangles
collected in world space; three filters turn "every horizontal surface in a
grandstand" into "seating":

* only the solid `gstand` / `gstand2` materials. The `-alpha` pair are
  single-sided cut-out cards for railings — 0.2% of their area is horizontal, so
  there is nothing to stand on;
* a triangle-area cap of 10 m². Seat treads are narrow strips: 81% of the
  upward-facing grandstand area is in triangles under 10 m², and what is above
  that is roof slabs and concourse floors, single triangles of up to 490 m²;
* a headroom test. A sample is dropped if another grandstand surface sits
  between 0.4 m and 2.2 m directly above it. Of the plan cells the stands cover,
  2,212 hold one surface and 4,119 hold two or more — the second is the roof,
  and the people belong under it.

That finds **31,238 m²** of seating across 28,152 triangles, scattered at 0.22
spectators per square metre from a seeded PRNG so the crowd is the same crowd on
every load.

Each spectator is a body quad and a head quad — four triangles — in two
`InstancedMesh`es, coloured per instance from ten shirts and five skin tones.
They are not billboarded per frame: they are turned once, at build time, to face
the nearest point of the measured racing line, which is the only place the
player ever is. The idle sway is a vertex shader with a per-instance phase, so
it costs nothing on the CPU. They neither cast nor receive shadows.

Total: **2 draw calls, 24,312 triangles**, against 1.69 M in the circuit.

## Lighting

Key, fill, hemisphere.

The scene used to be one white directional light at intensity 1 and a 0.5
ambient, which is why it read as a diagram. Now the **key** is warm (#fff2dd,
intensity 1.45) and 36° above the horizon rather than 53° — at 53° the shadows
were stubs directly under things and read as ambient occlusion. `<Sky>` is given
the same direction, so the bright part of the sky and the direction the shadows
fall finally agree; they did not before. A cool, shadowless **fill** from the
opposite quarter keeps the shaded sides of the pit building and the grandstands
readable, and a **hemisphere light** (sky above, asphalt grey below) does most
of what the flat ambient was doing, for about the same price.

The shadow budget is one number: **the sun's shadow camera is 170 m across**,
and it follows the car. A frustum that covered the circuit would spread 2048²
texels over 3.6 km² — half a texel per metre, which is not a shadow, it is a
smear. At 170 m it is 12 texels per metre, which resolves the car, the barriers,
the gantry and the near grandstands. Nothing further away is shadowed at all.

The environment map is still "Dikhololo Night", the only HDR shipped, and it is
the wrong time of day for this scene. `Circuit.tsx` already holds every
material's `envMapIntensity` down to 0.5, so it contributes the shape of a
reflection rather than its colour. Replacing it would mean shipping another
1 MB HDR.

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
- **The crowd.** The model has none. Where the people stand is measured off the
  model's grandstand meshes; that they exist at all is ours.
- The car. Nothing about how it accelerates, steers, brakes or is filmed comes
  from anywhere but taste plus a measuring rig — see *Making it arcade*.

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
- **The 24% banking of La Monumental is not in the model**, and is not invented
  either. Cross-slope comes off the model and peaks at 2.8°; *La Monumental*
  above sets out what banking it would cost.
- **The invisible walls still leak at shallow angles.** 0% of perpendicular and
  60° impacts get through, but 2–8% of 20–45° ones do, all at the few places
  where the measured corridor changes width abruptly. See *Collision*.
- **The crowd is quads.** Two-triangle bodies and heads, turned to face the
  racing line. From the track they read as a crowd; from the wrong angle they
  read as what they are. There are no animations beyond a shader sway, and the
  stands are populated evenly rather than by where people would actually sit.
- **Nothing in the model moves or makes a noise**: the LED boards do not play,
  the marshals' flags do not wave, and there is no crowd noise. Foliage and
  fence materials were `BLEND` in the source and are re-declared alpha-tested
  here — several hundred thousand blended triangles would need depth sorting
  the scene cannot afford — which crisps up their edges.
- **`import.meta.env.DEV` exposes `window.__game`** (`getState`, `mutation`,
  `getLayout`), `window.__render` (draw calls and triangles for the heaviest
  render pass of the frame), `window.__circuit`, `window.__crowd` and
  `window.__physics`, so a headless browser can inspect the car, the layout, the
  crowd and the renderer. All stripped from production builds.

### Changes to upstream behaviour

Seven upstream bugs surfaced on a circuit this size and are fixed here, each
with a comment at the site:

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
- `useToggle` is called in a render body and returned a **brand new function
  component every time**. React compares element types by identity, so every
  re-render of `App` was a different component type and the entire subtree was
  unmounted and remounted — under `<Physics>` that tore down and rebuilt all
  83 cannon bodies *and the raycast vehicle*, silently teleporting the car back
  to the grid mid-lap. Measured in a headless browser: five App renders in 40 s,
  each removing and re-adding every body. The wrappers are cached now, and the
  same measurement shows zero body churn.
- The camera-sway block wrote `rotation.x` on whichever camera was current,
  including the bird's-eye one, discarding the −90° pitch it is declared with.
  The overhead view was a screen of sky.
- The intro screen's attribution footer sat *above* the "Click to start" link in
  the stacking order, and in a short window its (transparent) text box covered
  the middle of the screen and swallowed the click. The licence credit has to
  stay; it must not be a shield.
