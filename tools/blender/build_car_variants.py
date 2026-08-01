"""
Procedural formula-car generator for Kilómetro Cero.

    blender --background --python tools/blender/build_car_variants.py -- --out madring-3d/public/models/cars

Produces one .glb per variant. It prints each file's face count as it goes, so
a variant that has silently exploded in complexity is visible from the log
without opening Blender.

WHY THIS EXISTS, AND WHY IT IS PROCEDURAL
-----------------------------------------
The car both games currently use is `f1car-2026.glb` from APEX FORMULA 2026
(Apache-2.0). It is a good model and it stays. This script is for *variants* —
different bodywork, wings and liveries — and it builds them from scratch rather
than editing that file for two reasons:

  1. Licence hygiene. Geometry generated here is this project's own work with no
     inherited obligations, so variants can be re-licensed, redistributed or
     modified without dragging Apache-2.0 notices around per-file. (Using APEX
     is fine too — it just means carrying its NOTICE, which is already done for
     the one model we do use.)
  2. Variants want parameters, not vertices. "Longer wheelbase, taller rear
     wing, narrower nose" is one number each here; in a static mesh it is an
     afternoon of box-modelling per car.

Nothing here claims to be a real car from a real team. The shapes are generic
open-wheel racing shapes and the liveries are invented colour pairs — no real
team's name, logo, number or colour scheme. That is deliberate: see the
trademark note in the repo's NOTICE.

GEOMETRY APPROACH
-----------------
The body is lofted: a handful of cross-sections ("stations") are defined along
the car's length, each a closed ring of points, and consecutive rings are
bridged into quads. Lofting rather than box-modelling because it is what makes
the parameters meaningful — widen the cockpit station and the whole midsection
swells smoothly instead of one face moving.

Everything is low-poly on purpose. The 3D game draws these at 60 fps on phones
and the 2D game only ever sees a 104x152 orthographic bake of one, so a car
that costs 2 k triangles is 2 k triangles wasted.

UNITS
-----
Metres, +X forward (nose), +Z up, origin on the ground between the front axle
and rear axle. glTF's own convention is +Y up / -Z forward, and the exporter
handles that conversion, so do not pre-rotate anything here.

BLENDER VERSION
---------------
Written against Blender 4.x. The Principled BSDF socket for clearcoat was
renamed from "Clearcoat" to "Coat Weight" in 4.0, so `set_input()` below tries
both names rather than assuming — that rename is the single most likely thing
to break this script on a different Blender.
"""

import argparse
import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector


# ── parameters ───────────────────────────────────────────────────────────────

class CarSpec:
    """One car. Every dimension in metres.

    Defaults are roughly current-formula proportions: ~5.6 m long, ~2.0 m wide,
    ~0.95 m tall at the airbox. They are not any particular car's numbers.
    """

    def __init__(self, name, **kw):
        self.name = name
        # overall
        self.length          = 5.60
        self.width           = 2.00
        self.wheelbase       = 3.60
        # monocoque / body
        self.nose_width      = 0.28
        self.nose_height     = 0.22
        self.nose_droop      = 0.06   # how far the nose tip sits below the tub
        self.cockpit_width   = 0.90
        self.cockpit_height  = 0.62
        self.sidepod_width   = 1.30
        self.sidepod_height  = 0.58
        self.tail_width      = 0.45
        self.tail_height     = 0.42
        self.airbox_height   = 0.95
        # wings
        self.front_wing_span = 1.90
        self.front_wing_chord= 0.55
        self.rear_wing_span  = 1.05
        self.rear_wing_chord = 0.42
        self.rear_wing_height= 0.92
        self.rear_wing_stack = 2      # number of stacked planes
        # wheels
        self.tyre_radius_f   = 0.34
        self.tyre_radius_r   = 0.36
        self.tyre_width_f    = 0.30
        self.tyre_width_r    = 0.40
        # livery
        self.paint           = (0.85, 0.12, 0.10)   # linear RGB
        self.accent          = (1.00, 0.85, 0.10)
        self.stripe          = 'spear'              # 'spear' | 'dual' | 'none'
        self.has_halo        = True

        for k, v in kw.items():
            if not hasattr(self, k):
                raise KeyError('CarSpec has no parameter %r' % k)
            setattr(self, k, v)


# The shipped variants. Keep these few and visibly different from each other —
# four cars that read as the same car with a different sticker is not a roster.
VARIANTS = [
    CarSpec('oso',
            paint=(0.80, 0.42, 0.06), accent=(0.15, 0.10, 0.08),
            stripe='spear',
            # stubbier and wider: reads as the heavy, planted one
            length=5.35, wheelbase=3.40, sidepod_width=1.42,
            rear_wing_height=0.88, rear_wing_span=1.12),

    CarSpec('gata',
            paint=(0.10, 0.35, 0.85), accent=(0.85, 0.92, 1.00),
            stripe='dual',
            # long and narrow: the low-drag one
            length=5.85, wheelbase=3.75, sidepod_width=1.18,
            nose_width=0.22, rear_wing_span=0.95, rear_wing_stack=1),

    CarSpec('cibeles',
            paint=(0.05, 0.62, 0.52), accent=(0.98, 0.98, 0.98),
            stripe='spear',
            rear_wing_stack=3, rear_wing_height=1.00,
            airbox_height=1.02),

    CarSpec('madrono',
            paint=(0.72, 0.08, 0.16), accent=(0.10, 0.12, 0.16),
            stripe='none',
            sidepod_height=0.52, cockpit_height=0.58,
            tyre_radius_r=0.38, tyre_width_r=0.44),
]


# ── small helpers ────────────────────────────────────────────────────────────

def reset_scene():
    """Blender starts with a cube, a camera and a light. Nuke everything so the
    export contains only what this script made — otherwise the default cube
    ships inside every car."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def set_input(node, names, value):
    """Set the first socket that exists out of `names`.

    Blender 4.0 renamed several Principled BSDF sockets ("Clearcoat" ->
    "Coat Weight", "Specular" -> "Specular IOR Level", "Emission" ->
    "Emission Color"). Rather than branching on bpy.app.version and getting it
    wrong on the next release, try the names we know and skip silently if none
    are present — a missing clearcoat costs gloss, not a crash.
    """
    for n in names:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return True
    return False


def make_paint_material(name, rgb, metallic=0.35, roughness=0.28, coat=1.0):
    """Automotive paint: a coloured metallic base under a smooth clear coat.

    Same recipe the rest of the project uses (three.js `webgl_materials_car`,
    MIT) so a car baked here and a car rendered in the 3D game look related.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf is None:
        return mat
    bsdf.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    set_input(bsdf, ['Coat Weight', 'Clearcoat'], coat)
    set_input(bsdf, ['Coat Roughness', 'Clearcoat Roughness'], 0.03)
    return mat


def make_matte_material(name, rgb, roughness=0.75):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf is not None:
        bsdf.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        bsdf.inputs['Metallic'].default_value = 0.0
        bsdf.inputs['Roughness'].default_value = roughness
    return mat


def mesh_from_bmesh(bm, name, material, collection):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    if material is not None:
        ob.data.materials.append(material)
    collection.objects.link(ob)
    return ob


def ring(bm, y_half, z_lo, z_hi, x, chamfer=0.35):
    """One lofting station: a rounded rectangle in the YZ plane at position x.

    Chamfered rather than square because a hard-edged box lit from above reads
    as a brick at any size; clipping the corners is the cheapest thing that
    makes it read as bodywork. Returns the verts in consistent winding order so
    consecutive rings can be bridged without twisting.
    """
    c = chamfer * min(y_half, (z_hi - z_lo) * 0.5)
    pts = [
        (0.0,       -y_half,     z_lo + c),
        (0.0,       -y_half + c, z_lo),
        (0.0,        y_half - c, z_lo),
        (0.0,        y_half,     z_lo + c),
        (0.0,        y_half,     z_hi - c),
        (0.0,        y_half - c, z_hi),
        (0.0,       -y_half + c, z_hi),
        (0.0,       -y_half,     z_hi - c),
    ]
    return [bm.verts.new((x, p[1], p[2])) for p in pts]


def bridge(bm, a, b):
    """Bridge two equal-length vertex rings with quads."""
    n = len(a)
    for i in range(n):
        j = (i + 1) % n
        try:
            bm.faces.new((a[i], a[j], b[j], b[i]))
        except ValueError:
            pass          # duplicate face where two stations coincide; harmless


def cap(bm, verts, reverse=False):
    try:
        bm.faces.new(tuple(reversed(verts)) if reverse else tuple(verts))
    except ValueError:
        pass


# ── body ─────────────────────────────────────────────────────────────────────

def build_body(spec, material, collection):
    """Loft the monocoque from nose tip to tail.

    Station positions are fractions of the car's length measured from the nose,
    so every variant keeps the same proportional layout however long it is.
    """
    bm = bmesh.new()
    L = spec.length
    x_nose = L * 0.5

    # (x fraction from nose, half-width, z bottom, z top)
    stations = [
        (0.00, spec.nose_width * 0.30, 0.10 - spec.nose_droop, 0.10 - spec.nose_droop + spec.nose_height * 0.55),
        (0.09, spec.nose_width * 0.75, 0.12 - spec.nose_droop * 0.5, 0.12 + spec.nose_height * 0.85),
        (0.22, spec.nose_width * 1.25, 0.13, 0.15 + spec.nose_height * 1.35),
        (0.34, spec.cockpit_width * 0.72, 0.12, 0.14 + spec.cockpit_height * 0.80),
        (0.44, spec.cockpit_width,       0.11, 0.14 + spec.cockpit_height),
        (0.53, spec.sidepod_width * 0.86, 0.10, 0.13 + spec.sidepod_height * 1.05),
        (0.63, spec.sidepod_width,        0.10, 0.13 + spec.sidepod_height),
        (0.74, spec.sidepod_width * 0.78, 0.11, 0.14 + spec.sidepod_height * 0.88),
        (0.86, spec.tail_width * 1.35,    0.13, 0.16 + spec.tail_height * 1.05),
        (1.00, spec.tail_width,           0.15, 0.17 + spec.tail_height * 0.80),
    ]

    rings = []
    for frac, hw, z0, z1 in stations:
        x = x_nose - frac * L
        rings.append(ring(bm, max(hw, 0.02), z0, z1, x))

    for a, b in zip(rings, rings[1:]):
        bridge(bm, a, b)
    cap(bm, rings[0], reverse=True)
    cap(bm, rings[-1])

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bmesh(bm, 'body', material, collection)


def build_airbox(spec, material, collection):
    """The intake hump behind the driver's head. Small, but it is most of what
    makes a top-down silhouette read as a formula car rather than a wedge."""
    bm = bmesh.new()
    L = spec.length
    x0 = L * 0.5 - L * 0.50
    x1 = L * 0.5 - L * 0.74
    lo = 0.14 + spec.cockpit_height * 0.92
    a = ring(bm, 0.16, lo, spec.airbox_height, x0, chamfer=0.5)
    b = ring(bm, 0.22, lo, spec.airbox_height * 0.86, x1, chamfer=0.5)
    bridge(bm, a, b)
    cap(bm, a, reverse=True)
    cap(bm, b)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bmesh(bm, 'airbox', material, collection)


def build_plate(name, cx, cy, cz, span, chord, thick, material, collection,
                tilt=0.0):
    """A flat aerofoil-ish slab: wings, endplates, floor. Tilt is degrees about
    the span axis, which is enough to suggest angle of attack from above."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((chord, span, thick)), verts=bm.verts)
    if tilt:
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
                         matrix=Matrix.Rotation(math.radians(tilt), 3, 'Y'))
    bmesh.ops.translate(bm, vec=Vector((cx, cy, cz)), verts=bm.verts)
    return mesh_from_bmesh(bm, name, material, collection)


def build_wheel(name, cx, cy, radius, width, material, collection, segments=16):
    """A tyre. 16 segments: at the size these are ever seen — a few hundred
    pixels in the 3D chase camera, 30-odd in the 2D bake — 32 is invisible
    detail and 8 is a visible polygon."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=segments,
        radius1=radius, radius2=radius, depth=width,
    )
    # create_cone builds along +Z; a wheel spins about Y
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
                     matrix=Matrix.Rotation(math.radians(90), 3, 'X'))
    bmesh.ops.translate(bm, vec=Vector((cx, cy, radius)), verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bmesh(bm, name, material, collection)


def build_halo(spec, material, collection):
    """The cockpit hoop. Drawn as a thin arc of segments rather than a torus so
    it stays cheap and does not need a boolean against the body."""
    bm = bmesh.new()
    L = spec.length
    x_c = L * 0.5 - L * 0.42
    z0 = 0.16 + spec.cockpit_height * 0.86
    r = 0.42
    prev = None
    for i in range(9):
        t = i / 8.0
        ang = math.pi * (0.10 + 0.80 * t)
        y = math.cos(ang) * r
        z = z0 + math.sin(ang) * r * 0.55
        v = ring(bm, 0.035, z - 0.035, z + 0.035, x_c + y * 0.05, chamfer=0.5)
        for vv in v:
            vv.co.y += y
            vv.co.z = z + (vv.co.z - z)
        if prev is not None:
            bridge(bm, prev, v)
        prev = v
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_from_bmesh(bm, 'halo', material, collection)


def build_livery_stripe(spec, material, collection):
    """A accent-coloured slab sitting a hair proud of the bodywork.

    Proud rather than coplanar because two surfaces at the same depth z-fight,
    and z-fighting on a car that is 30 px wide on a phone looks like the car is
    flickering. 3 mm is under the resolution of every view we have and above
    the depth precision of all of them.
    """
    if spec.stripe == 'none':
        return []
    L = spec.length
    out = []
    if spec.stripe == 'spear':
        out.append(build_plate(
            'livery_spear', L * 0.5 - L * 0.42, 0.0,
            0.16 + spec.cockpit_height * 1.02,
            0.16, L * 0.52, 0.012, material, collection))
    elif spec.stripe == 'dual':
        for side in (-1, 1):
            out.append(build_plate(
                'livery_stripe_%d' % (side > 0), L * 0.5 - L * 0.46,
                side * spec.sidepod_width * 0.42,
                0.14 + spec.sidepod_height * 0.86,
                0.10, L * 0.44, 0.012, material, collection))
    return out


# ── assembly ─────────────────────────────────────────────────────────────────

def build_car(spec, collection):
    paint = make_paint_material('paint_%s' % spec.name, spec.paint)
    accent = make_paint_material('accent_%s' % spec.name, spec.accent,
                                 metallic=0.1, roughness=0.35)
    rubber = make_matte_material('rubber_%s' % spec.name, (0.035, 0.035, 0.04), 0.85)
    carbon = make_matte_material('carbon_%s' % spec.name, (0.05, 0.05, 0.06), 0.42)

    L, W = spec.length, spec.width
    half_wb = spec.wheelbase * 0.5
    parts = [
        build_body(spec, paint, collection),
        build_airbox(spec, paint, collection),
    ]

    # front wing: main plane plus endplates
    fw_x = L * 0.5 - spec.front_wing_chord * 0.45
    parts.append(build_plate('front_wing', fw_x, 0.0, 0.09,
                             spec.front_wing_span, spec.front_wing_chord,
                             0.02, carbon, collection, tilt=-6))
    for side in (-1, 1):
        parts.append(build_plate('front_endplate_%d' % (side > 0),
                                 fw_x, side * spec.front_wing_span * 0.5,
                                 0.17, 0.02, spec.front_wing_chord * 1.1,
                                 0.26, accent, collection))

    # rear wing: stacked planes between two endplates
    rw_x = -L * 0.5 + spec.rear_wing_chord * 0.35
    for i in range(max(1, spec.rear_wing_stack)):
        dz = i * 0.13
        parts.append(build_plate(
            'rear_wing_%d' % i, rw_x, 0.0, spec.rear_wing_height + dz,
            spec.rear_wing_span, spec.rear_wing_chord * (1.0 - 0.18 * i),
            0.02, carbon, collection, tilt=-14))
    for side in (-1, 1):
        parts.append(build_plate(
            'rear_endplate_%d' % (side > 0), rw_x,
            side * spec.rear_wing_span * 0.5,
            spec.rear_wing_height + 0.06,
            0.02, spec.rear_wing_chord * 1.2, 0.46, accent, collection))

    # floor
    parts.append(build_plate('floor', -L * 0.06, 0.0, 0.055,
                             spec.sidepod_width * 0.92, L * 0.62, 0.015,
                             carbon, collection))

    # wheels
    for side in (-1, 1):
        parts.append(build_wheel(
            'wheel_f_%d' % (side > 0), half_wb,
            side * (W * 0.5 - spec.tyre_width_f * 0.5),
            spec.tyre_radius_f, spec.tyre_width_f, rubber, collection))
        parts.append(build_wheel(
            'wheel_r_%d' % (side > 0), -half_wb,
            side * (W * 0.5 - spec.tyre_width_r * 0.5),
            spec.tyre_radius_r, spec.tyre_width_r, rubber, collection))

    if spec.has_halo:
        parts.append(build_halo(spec, carbon, collection))
    parts.extend(build_livery_stripe(spec, accent, collection))

    return parts


def export_glb(parts, out_path):
    for ob in bpy.context.scene.objects:
        ob.select_set(False)
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )


# ── entry point ──────────────────────────────────────────────────────────────

def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='madring-3d/public/models/cars',
                    help='directory to write the .glb files into')
    ap.add_argument('--only', default=None,
                    help='build just this variant by name')
    args = ap.parse_args(argv)

    for spec in VARIANTS:
        if args.only and spec.name != args.only:
            continue
        reset_scene()
        coll = bpy.context.scene.collection
        parts = build_car(spec, coll)
        out = os.path.join(args.out, 'car-%s.glb' % spec.name)
        export_glb(parts, out)
        tris = sum(len(o.data.polygons) for o in parts if o.type == 'MESH')
        print('[build_car_variants] wrote %s  (%d faces)' % (out, tris))


if __name__ == '__main__':
    main()
