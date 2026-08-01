"""
Procedural trackside props for Kilómetro Cero.

    blender --background --python tools/blender/build_props.py -- --out madring-3d/public/models/props

Writes one .glb per prop: grandstand, fence, pit box, crowd block, marshal post.

WHY THESE ARE SEPARATE FILES AND NOT ONE SCENE
----------------------------------------------
The 3D game places props itself, along the measured centreline, at runtime —
it already does this for the crowd and ambient objects. So what it wants is a
small library of reusable pieces it can instance hundreds of times, not one
big baked scene it would have to cut apart. One .glb per prop, each with its
origin at the point you would naturally position it from (ground level, centred
on the face that points at the track), is what makes `<Instances>` cheap.

WHY THE CROWD IS A SINGLE MESH
------------------------------
A grandstand holds a few thousand people. As individual objects that is a few
thousand draw calls and an instant framerate collapse on a phone. `crowd_block`
is therefore ONE mesh containing a grid of simple capsule-ish bodies with
per-vertex colour variation baked in. The 3D game can then either instance the
block or, better, animate it in a vertex shader — a whole stand shimmering
costs one draw call.

Vertex colours, not textures: a crowd seen from the racing line is a texture of
coloured dots, and generating that as geometry colour avoids shipping and
sampling an image for something that is never seen closer than 20 m.

UNITS
-----
Metres, +Z up, origin on the ground. The exporter converts to glTF's +Y up.

BLENDER VERSION
---------------
Blender 4.x. See build_car_variants.py for the Principled BSDF socket-renaming
caveat, which applies here too.
"""

import argparse
import math
import os
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector


# Deterministic pseudo-random, so re-running the script produces byte-identical
# meshes. Python's `random` would too if seeded, but this keeps the sequence
# independent of anything else that might touch the global RNG.
class Rng:
    def __init__(self, seed=1):
        self.s = seed & 0x7FFFFFFF or 1

    def next(self):
        self.s = (self.s * 48271) % 0x7FFFFFFF
        return self.s / 0x7FFFFFFF

    def range(self, a, b):
        return a + (b - a) * self.next()

    def pick(self, seq):
        return seq[int(self.next() * len(seq)) % len(seq)]


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def set_input(node, names, value):
    for n in names:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return True
    return False


def matte(name, rgb, roughness=0.8):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes.get('Principled BSDF')
    if b is not None:
        b.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        b.inputs['Roughness'].default_value = roughness
        b.inputs['Metallic'].default_value = 0.0
    return mat


def metal(name, rgb, roughness=0.35):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = mat.node_tree.nodes.get('Principled BSDF')
    if b is not None:
        b.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        b.inputs['Roughness'].default_value = roughness
        b.inputs['Metallic'].default_value = 0.85
    return mat


def vertex_colour_material(name):
    """Material that reads the mesh's own Color attribute.

    Used by the crowd so one mesh can be thousands of differently-coloured
    people without thousands of materials (Blender's per-object material slot
    limit aside, each slot is a draw call in most engines).
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    if bsdf is None:
        return mat
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Color'
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    return mat


def box(bm, cx, cy, cz, sx, sy, sz):
    """Axis-aligned box, centred at (cx,cy,cz)."""
    tmp = bmesh.new()
    bmesh.ops.create_cube(tmp, size=1.0)
    bmesh.ops.scale(tmp, vec=Vector((sx, sy, sz)), verts=tmp.verts)
    bmesh.ops.translate(tmp, vec=Vector((cx, cy, cz)), verts=tmp.verts)
    tmp.to_mesh(bpy.data.meshes.new('__scratch'))
    # merge into target
    vmap = [bm.verts.new(v.co) for v in tmp.verts]
    bm.verts.ensure_lookup_table()
    for f in tmp.faces:
        try:
            bm.faces.new([vmap[v.index] for v in f.verts])
        except ValueError:
            pass
    tmp.free()


def finish(bm, name, material, collection, smooth=False):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    if material is not None:
        ob.data.materials.append(material)
    collection.objects.link(ob)
    return ob


# ── props ────────────────────────────────────────────────────────────────────

def build_grandstand(coll, bays=8, rows=12, bay_w=3.0, row_depth=0.85,
                     row_rise=0.45):
    """A raked stand. Origin at ground level on the front (track-facing) edge,
    so placing it is "put this on the barrier line and rotate to face the
    track" with no offset maths at the call site.
    """
    steel = metal('stand_steel', (0.55, 0.57, 0.60), 0.4)
    conc = matte('stand_concrete', (0.62, 0.61, 0.58), 0.9)
    bm = bmesh.new()
    width = bays * bay_w

    # terraced seating rows, stepping up and back
    for r in range(rows):
        y = -(r + 0.5) * row_depth
        z = (r + 0.5) * row_rise
        box(bm, 0.0, y, z * 0.5, width, row_depth * 0.98, z)

    stand = finish(bm, 'grandstand_deck', conc, coll)

    # roof on columns — the thing that actually makes it read as a grandstand
    # from above rather than as a staircase
    bm2 = bmesh.new()
    depth = rows * row_depth
    roof_z = rows * row_rise + 3.2
    box(bm2, 0.0, -depth * 0.5, roof_z, width * 1.04, depth * 1.05, 0.25)
    for i in range(bays + 1):
        x = -width * 0.5 + i * bay_w
        box(bm2, x, -depth + 0.4, roof_z * 0.5, 0.22, 0.22, roof_z)
    roof = finish(bm2, 'grandstand_roof', steel, coll)
    return [stand, roof]


def build_crowd_block(coll, bays=8, rows=12, bay_w=3.0, row_depth=0.85,
                      row_rise=0.45, per_bay=4, seed=7):
    """The people. ONE mesh — see the module docstring.

    Bodies are 5-sided prisms rather than cylinders: from the racing line a
    spectator is four pixels tall, and the difference between a 5-gon and a
    16-gon there is nothing, while the vertex count is three times smaller
    across a few thousand of them.
    """
    rng = Rng(seed)
    shirt_palette = [
        (0.85, 0.16, 0.14), (0.12, 0.30, 0.78), (0.96, 0.80, 0.12),
        (0.94, 0.94, 0.96), (0.10, 0.62, 0.35), (0.90, 0.45, 0.10),
        (0.55, 0.20, 0.70), (0.20, 0.22, 0.26),
    ]
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new('Color')
    width = bays * bay_w

    for r in range(rows):
        y = -(r + 0.5) * row_depth
        z = (r + 1.0) * row_rise
        for b in range(bays * per_bay):
            # jitter so rows do not read as a printed grid
            x = -width * 0.5 + (b + 0.5) * (width / (bays * per_bay))
            x += rng.range(-0.18, 0.18)
            if rng.next() < 0.12:
                continue                       # empty seats; a full house is fake
            h = rng.range(0.62, 0.80)
            rad = rng.range(0.15, 0.20)
            shirt = rng.pick(shirt_palette)

            ring_lo, ring_hi = [], []
            for k in range(5):
                a = (k / 5.0) * math.tau
                dx, dy = math.cos(a) * rad, math.sin(a) * rad
                ring_lo.append(bm.verts.new((x + dx, y + dy, z)))
                ring_hi.append(bm.verts.new((x + dx, y + dy, z + h)))
            for k in range(5):
                j = (k + 1) % 5
                try:
                    f = bm.faces.new((ring_lo[k], ring_lo[j], ring_hi[j], ring_hi[k]))
                    for loop in f.loops:
                        loop[col_layer] = (shirt[0], shirt[1], shirt[2], 1.0)
                except ValueError:
                    pass
            try:
                f = bm.faces.new(tuple(ring_hi))
                # heads read as a lighter cap; cheaper than modelling one
                for loop in f.loops:
                    loop[col_layer] = (0.76, 0.60, 0.50, 1.0)
            except ValueError:
                pass

    return [finish(bm, 'crowd_block', vertex_colour_material('crowd'), coll)]


def build_fence(coll, length=12.0, height=2.6, post_every=3.0):
    """Debris fence: posts plus a thin mesh panel. Origin centred, running
    along +X, so a run of them is just translate-by-length."""
    steel = metal('fence_steel', (0.42, 0.45, 0.47), 0.5)
    bm = bmesh.new()
    n = max(2, int(round(length / post_every)) + 1)
    for i in range(n):
        x = -length * 0.5 + i * (length / (n - 1))
        box(bm, x, 0.0, height * 0.5, 0.10, 0.10, height)
    # rails top and bottom
    box(bm, 0.0, 0.0, height - 0.08, length, 0.06, 0.08)
    box(bm, 0.0, 0.0, 0.30, length, 0.06, 0.06)
    # the mesh itself, as one thin slab — real chain-link geometry would be
    # thousands of triangles for something that is visually a grey haze
    box(bm, 0.0, 0.0, height * 0.55, length, 0.015, height * 0.86)
    return [finish(bm, 'fence', steel, coll)]


def build_pit_box(coll, width=6.0, depth=8.0, height=3.4):
    """A garage bay: back wall, side walls, flat roof, open to the pit lane.
    Origin at ground level in the middle of the OPEN face."""
    wall = matte('pit_wall', (0.90, 0.90, 0.92), 0.7)
    trim = matte('pit_trim', (0.12, 0.13, 0.16), 0.6)
    bm = bmesh.new()
    box(bm, 0.0, -depth, height * 0.5, width, 0.20, height)          # back
    box(bm, -width * 0.5, -depth * 0.5, height * 0.5, 0.20, depth, height)
    box(bm,  width * 0.5, -depth * 0.5, height * 0.5, 0.20, depth, height)
    shell = finish(bm, 'pit_box', wall, coll)

    bm2 = bmesh.new()
    box(bm2, 0.0, -depth * 0.5, height + 0.10, width + 0.3, depth + 0.3, 0.20)
    box(bm2, 0.0, 0.0, height - 0.35, width, 0.25, 0.70)              # header band
    return [shell, finish(bm2, 'pit_box_roof', trim, coll)]


def build_marshal_post(coll):
    """A marshal's platform with a flag panel. Small, but placed every few
    hundred metres it is what makes a circuit look staffed rather than empty."""
    steel = metal('post_steel', (0.5, 0.52, 0.55), 0.45)
    flag = matte('post_flag', (0.95, 0.78, 0.05), 0.85)
    bm = bmesh.new()
    for sx in (-0.5, 0.5):
        for sy in (-0.5, 0.5):
            box(bm, sx, sy, 0.9, 0.09, 0.09, 1.8)
    box(bm, 0.0, 0.0, 1.85, 1.3, 1.3, 0.10)
    box(bm, 0.0, 0.0, 2.35, 1.3, 0.06, 0.90)
    plat = finish(bm, 'marshal_post', steel, coll)

    bm2 = bmesh.new()
    box(bm2, 0.62, 0.0, 2.75, 0.55, 0.02, 0.38)
    return [plat, finish(bm2, 'marshal_flag', flag, coll)]


PROPS = {
    'grandstand':  build_grandstand,
    'crowd_block': build_crowd_block,
    'fence':       build_fence,
    'pit_box':     build_pit_box,
    'marshal_post': build_marshal_post,
}


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


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='madring-3d/public/models/props')
    ap.add_argument('--only', default=None, help='build just this prop by name')
    args = ap.parse_args(argv)

    for name, fn in PROPS.items():
        if args.only and name != args.only:
            continue
        reset_scene()
        parts = fn(bpy.context.scene.collection)
        out = os.path.join(args.out, '%s.glb' % name)
        export_glb(parts, out)
        faces = sum(len(o.data.polygons) for o in parts if o.type == 'MESH')
        print('[build_props] wrote %s  (%d faces)' % (out, faces))


if __name__ == '__main__':
    main()
