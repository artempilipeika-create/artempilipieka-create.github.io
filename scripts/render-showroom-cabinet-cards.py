"""Blender product shoot of the exact kitchen meshes exported by export-showroom-cabinet-cards.mjs.

blender -b -t 5 -P scripts/render-showroom-cabinet-cards.py -- /tmp/mf-cabinet-shoot /tmp/mf-cabinet-proofs
Optional remaining arguments are filename stems for individual proofs. A distribution build without
Cycles denoising can set MF_OIDN_MODULES to an installed oidn==0.2.1 package directory; its external
python3 also needs NumPy and Pillow. All generated files are presentation assets.
"""

import collections
import json
import math
import os
from pathlib import Path
import shutil
import sys
import subprocess
from tempfile import TemporaryDirectory
import numpy as np

# A separate process isolates distribution Blender and Intel OIDN builds of TBB.
if sys.argv[1:2] == ["--denoise"]:
    sys.path.insert(0, os.environ["MF_OIDN_MODULES"])
    from PIL import Image
    import oidn

    device = oidn.NewDevice()
    oidn.CommitDevice(device)
    im = np.asarray(Image.open(sys.argv[2]).convert("RGB"), np.float32) / 255
    pixels = np.ascontiguousarray(np.where(im <= 0.04045, im / 12.92, ((im + 0.055) / 1.055) ** 2.4))
    result = np.empty_like(pixels)
    filt = oidn.NewFilter(device, "RT")
    for label, arr in [("color", pixels), ("output", result)]:
        oidn.SetSharedFilterImage(filt, label, arr, oidn.FORMAT_FLOAT3, arr.shape[1], arr.shape[0])
    oidn.CommitFilter(filt)
    oidn.ExecuteFilter(filt)
    if oidn.GetDeviceError(device):
        raise RuntimeError("Intel OIDN could not process the render")
    oidn.ReleaseFilter(filt)
    oidn.ReleaseDevice(device)
    result = np.clip(result, 0, 1)
    encoded = np.where(result < 0.0031308, 12.92 * result, 1.055 * result ** (1 / 2.4) - 0.055)
    Image.fromarray(np.uint8(np.round(255 * encoded))).save(sys.argv[3], quality=92, method=5)
    sys.exit(0)

import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1 :]
source, target = map(Path, args[:2])
input_data = json.loads((source / "catalogue.json").read_text())
model_root = Path(__file__).resolve().parents[1] / "backend/v2/cabinet_assets/planner"
wanted = set(args[2:])
groups = collections.defaultdict(list)
for filename, shot_id in input_data["cards"].items():
    if not wanted or Path(filename).stem in wanted:
        groups[shot_id].append(filename)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 12
# Some distribution builds omit Cycles' bundled OIDN. Use the same Intel RT filter externally there.
external_denoise = bool(os.environ.get("MF_OIDN_MODULES"))
frame_directory = TemporaryDirectory(prefix="mf-cabinet-render-") if external_denoise else None
scene.cycles.use_denoising = not external_denoise
scene.cycles.max_bounces = 5
scene.cycles.diffuse_bounces = 2
scene.cycles.glossy_bounces = 2
scene.cycles.transparent_max_bounces = 10
scene.render.resolution_x = scene.render.resolution_y = 620
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG" if external_denoise else "WEBP"
scene.render.image_settings.quality = 91
scene.view_settings.view_transform = "AgX"
scene.view_settings.exposure = 0.0
# Blender's -t command-line setting controls CPU tenancy in either mode.
scene.world = bpy.data.worlds.new("Daylight studio")
scene.world.use_nodes = True
world_nodes = scene.world.node_tree.nodes
background = world_nodes.get("Background")
background.inputs["Color"].default_value = (0.88, 0.90, 0.94, 1)
background.inputs["Strength"].default_value = 0.33


def linear(code):
    def channel(i):
        v = int(code[i : i + 2], 16) / 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4

    return [channel(i) for i in (0, 2, 4)] + [1.0]


def point(obj, xyz):
    obj.rotation_euler = (Vector(xyz) - obj.location).to_track_quat("-Z", "Y").to_euler()


def studio_light(name, energy, color, size):
    light = bpy.data.lights.new(name, "AREA")
    light.energy, light.color, light.shape, light.size = energy, color, "DISK", size
    obj = bpy.data.objects.new(name, light)
    scene.collection.objects.link(obj)
    return obj


key = studio_light("Large softbox to the left", 350, (1.0, 0.944, 0.865), 3.7)
fill = studio_light("Window fill", 115, (0.88, 0.94, 1.0), 3.1)
rim = studio_light("Top edge", 110, (1.0, 0.974, 0.92), 2.4)
camera = bpy.data.objects.new("Product camera", bpy.data.cameras.new("Orthographic"))
scene.collection.objects.link(camera)
camera.data.type = "ORTHO"
scene.camera = camera
geometry_cache = {}
material_cache = {}


def material(definition):
    role, code = definition["role"], definition["color"]
    stock = {
        "front": "e1d7cb",
        "plinth": "e1d7cb",
        "body": "ffffff",
        "shelf": "ffffff",
        "drawer": "f5f4f0",
        "back": "f9f9f6",
        "counter": "605449",
        "handle": "292b2a",
        "leg": "292a28",
        "applianceMetal": "9ba0a0",
        "applianceDark": "424947",
        "rackSteel": "899497",
        "glass": "eaf4ef",
        "showroom-wall": "e8e5df",
        "showroom-floor": "e6e3dc",
    }
    code = stock.get(role, code)
    signature = (
        role,
        code,
        definition.get("asset"),
        round(definition.get("roughness", 0.55), 2),
        round(definition.get("metalness", 0), 2),
    )
    if signature in material_cache:
        return material_cache[signature]
    m = bpy.data.materials.new(role or code)
    material_cache[signature] = m
    m.use_nodes = True
    n, link = m.node_tree.nodes, m.node_tree.links.new
    shader = n.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = linear(code)
    shader.inputs["Roughness"].default_value = definition.get("roughness", 0.6)
    shader.inputs["Metallic"].default_value = definition.get("metalness", 0)
    if role in ("body", "shelf", "drawer", "back", "plinth", "front", "counter"):
        shader.inputs["Roughness"].default_value = 0.61 if role != "counter" else 0.68
        tex = n.new("ShaderNodeTexCoord")
        mapping = n.new("ShaderNodeVectorMath")
        mapping.operation = "SCALE"
        link(
            tex.outputs["Generated"]
            if role == "counter"
            else n.new("ShaderNodeNewGeometry").outputs["Position"],
            mapping.inputs[0],
        )
        mapping.inputs["Scale"].default_value = 1.0 if role == "counter" else 18.0
        if role == "counter":
            image = n.new("ShaderNodeTexImage")
            image.image = bpy.data.images.load(
                str(model_root / "materials/egger-f187-st9.jpg"), check_existing=True
            )
            image.projection = "BOX"
            image.projection_blend = 0.08
            link(mapping.outputs[0], image.inputs[0])
            # Calibrate the physical swatch to the studio key light and AgX display transform.
            gain = n.new("ShaderNodeVectorMath")
            gain.operation = "SCALE"
            gain.inputs["Scale"].default_value = 0.45
            link(image.outputs["Color"], gain.inputs[0])
            link(gain.outputs[0], shader.inputs["Base Color"])
            shader.inputs["Specular IOR Level"].default_value = 0.13
        micro = model_root / "materials/studio-matte.webp"
        if micro.exists() and role != "counter":
            texture = n.new("ShaderNodeTexImage")
            texture.image = bpy.data.images.load(str(micro), check_existing=True)
            texture.image.colorspace_settings.name = "Non-Color"
            texture.projection = "BOX"
            texture.projection_blend = 0.1
            link(mapping.outputs[0], texture.inputs[0])
            height = texture.outputs["Color"]
        else:
            texture = n.new("ShaderNodeTexNoise")
            texture.inputs["Scale"].default_value = 360.0 if role == "counter" else 33.0
            texture.inputs["Detail"].default_value = 1.5
            link(mapping.outputs[0], texture.inputs[0])
            height = texture.outputs["Fac"]
        bump = n.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.13
        bump.inputs["Distance"].default_value = 0.00013
        link(height, bump.inputs["Height"])
        link(bump.outputs["Normal"], shader.inputs["Normal"])
    if role in ("applianceMetal", "rackSteel"):
        shader.inputs["Metallic"].default_value = 0.78
        shader.inputs["Roughness"].default_value = 0.34
    if role in ("glass", "glassShelf"):
        transparent = n.new("ShaderNodeBsdfTransparent")
        transparent.inputs["Color"].default_value = (0.986, 0.998, 0.995, 1)
        # Thin glazing has two close interfaces. Keep the transmitted room visible,
        # with a polished green edge only on the thickness of the glass shelf.
        shader.inputs["Base Color"].default_value = linear("a1b8b1")
        shader.inputs["Roughness"].default_value = 0.09
        shader.inputs["Metallic"].default_value = 0.68
        mix = n.new("ShaderNodeMixShader")
        mix.inputs[0].default_value = 0.045
        if role == "glassShelf":
            normal = n.new("ShaderNodeSeparateXYZ")
            absolute = n.new("ShaderNodeMath")
            absolute.operation = "ABSOLUTE"
            strength = n.new("ShaderNodeMapRange")
            strength.inputs["To Min"].default_value = 0.59
            strength.inputs["To Max"].default_value = 0.025
            link(n.new("ShaderNodeNewGeometry").outputs["Normal"], normal.inputs[0])
            link(normal.outputs["Z"], absolute.inputs[0])
            link(absolute.outputs[0], strength.inputs["Value"])
            link(strength.outputs["Result"], mix.inputs[0])
        link(transparent.outputs[0], mix.inputs[1])
        link(shader.outputs[0], mix.inputs[2])
        link(mix.outputs[0], n.get("Material Output").inputs["Surface"])
    if role == "led":
        shader.inputs["Emission Color"].default_value = (1.0, 0.80, 0.53, 1)
        shader.inputs["Emission Strength"].default_value = 18
    if definition.get("asset"):
        image = n.new("ShaderNodeTexImage")
        image.image = bpy.data.images.load(
            str(model_root / "appliance-assets" / (definition["asset"] + "-tripo-color.webp")),
            check_existing=True,
        )
        link(image.outputs["Color"], shader.inputs["Base Color"])
    return m


def plane(role):
    bpy.ops.mesh.primitive_plane_add(size=200)
    obj = bpy.context.object
    obj.name = role
    obj.data.materials.append(material({"role": role, "color": "e6e4df", "roughness": 0.88}))
    return obj


floor = plane("showroom-floor")
wall = plane("showroom-wall")
wall.rotation_euler.x = math.pi / 2
basis = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
placeholder = bpy.data.materials.new("Instance material")


def load_mesh(gid):
    if gid in geometry_cache:
        return geometry_cache[gid]
    data = (source / "geometry" / (gid + ".mesh")).read_bytes()
    nv, ni, has_normal, has_uv = (int(i) for i in np.frombuffer(data, "<u4", 4))
    offset = 16

    def take(dtype, count):
        nonlocal offset
        arr = np.frombuffer(data, dtype, count, offset)
        offset += arr.nbytes
        return arr

    vertices = take("<f4", 3 * nv).reshape(-1, 3)
    normals = take("<f4", 3 * nv).reshape(-1, 3) if has_normal else None
    uv = take("<f4", 2 * nv).reshape(-1, 2) if has_uv else None
    indices = take("<u4", ni)
    # Subsets of faces of an appliance can share the original source vertex attributes.
    used, rev = np.unique(indices, return_inverse=True)
    fi = rev.astype(np.int32)
    mesh = bpy.data.meshes.new(gid)
    mesh.vertices.add(len(used))
    mesh.vertices.foreach_set("co", np.ascontiguousarray(vertices[used]).ravel())
    mesh.loops.add(ni)
    mesh.loops.foreach_set("vertex_index", fi)
    mesh.polygons.add(ni // 3)
    mesh.polygons.foreach_set("loop_start", np.arange(0, ni, 3, dtype=np.int32))
    mesh.update(calc_edges=True)
    if normals is not None:
        mesh.polygons.foreach_set("use_smooth", np.ones(ni // 3, dtype=bool))
        mesh.normals_split_custom_set_from_vertices(normals[used].tolist())
    if uv is not None:
        layer = mesh.uv_layers.new(name="Native UV")
        coords = uv[indices].copy()
        coords[:, 1] = 1 - coords[:, 1]
        layer.data.foreach_set("uv", coords.ravel())
    mesh.materials.append(placeholder)
    bounds = np.array([vertices[used].min(axis=0), vertices[used].max(axis=0)])
    corners = np.array([[x, y, z, 1.0] for x in bounds[:, 0] for y in bounds[:, 1] for z in bounds[:, 2]])
    geometry_cache[gid] = mesh, corners
    return mesh, corners


for num, (shot_id, files) in enumerate(groups.items(), 1):
    shot = input_data["scenes"][shot_id]
    objects = []
    bounds = []
    illuminated_sides = set()
    for instance in shot["entries"]:
        mesh, corners = load_mesh(instance["geometry"])
        obj = bpy.data.objects.new(instance["material"]["role"] or "Fitting", mesh)
        scene.collection.objects.link(obj)
        transform = np.array(instance["matrix"]).reshape(4, 4).T
        obj.matrix_world = basis @ Matrix(transform)
        obj.material_slots[0].link = "OBJECT"
        obj.material_slots[0].material = material(instance["material"])
        world_corners = corners @ np.asarray(obj.matrix_world).T
        bounds.extend(world_corners)
        objects.append(obj)
        if instance["material"]["role"] == "led":
            # A sampled line source follows each actual tape segment. The soft wash on
            # the back panel remains visible even when the edge-on diffuser is subpixel.
            center_led = Vector((world_corners[:, :3].min(axis=0) + world_corners[:, :3].max(axis=0)) / 2)
            length = np.ptp(world_corners[:, 2])
            side = 1 if (instance.get("lightSide") == "left" or center_led.x < 0) else -1
            illuminated_sides.add(side)
            strip = studio_light("Native LED segment", 4.6 * length, (1.0, 0.82, 0.66), 0.01)
            strip.data.shape = "RECTANGLE"
            strip.data.size = 0.008
            strip.data.size_y = length
            strip.location = center_led + Vector((side * 0.002, 0, 0))
            point(strip, strip.location + Vector((side * 0.43, 0.86, 0)))
            objects.append(strip)
    points = np.asarray(bounds)[:, :3]
    lower, upper = points.min(axis=0), points.max(axis=0)
    paired_light = len(illuminated_sides) == 2
    direction = Vector(
        (0, -1, 0.12) if paired_light else (shot["camera"][0], -shot["camera"][2], shot["camera"][1])
    ).normalized()
    right = direction.cross(Vector((0, 0, 1))).normalized()
    up = right.cross(direction).normalized()
    across = points @ np.array(right)
    rise = points @ np.array(up)
    depth = points @ np.array(direction)
    center = (
        right * ((across.max() + across.min()) / 2)
        + up * ((rise.max() + rise.min()) / 2)
        + direction * ((depth.max() + depth.min()) / 2)
    )
    extent = max(np.ptp(across), np.ptp(rise))
    camera.data.ortho_scale = extent * 1.19
    camera.data.type = "PERSP" if paired_light else "ORTHO"
    camera.data.lens = 50
    # A centered perspective is the only single view that sees the inside face of
    # both opposite LED channels. All other variants retain the same catalog angle.
    distance = extent * 1.34 / (2 * math.tan(camera.data.angle / 2)) if paired_light else 6
    camera.location = center + direction * distance
    point(camera, center)
    floor.location.z = lower[2] - (extent * 0.29 if shot["wall"] else 0.0006)
    wall.location.y = upper[1] + (0.016 if shot["wall"] else 0.13)
    scale = max(0.85, extent * 0.93)
    for obj, xyz, energy in [
        (key, (-2.0, -2.5, 3.25), 470),
        (fill, (2.5, -1.55, 2.35), 145),
        (rim, (-0.2, -0.07, 3.15), 110),
    ]:
        obj.location = center + Vector(xyz) * scale
        obj.data.energy = energy * scale**2
        point(obj, center)
    output_file = (target / files[0]).resolve()
    scene.render.filepath = str(Path(frame_directory.name, "view.png") if external_denoise else output_file)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    if external_denoise:
        subprocess.run(
            [shutil.which("python3"), __file__, "--denoise", scene.render.filepath, str(output_file)],
            check=True,
        )
        Path(scene.render.filepath).unlink()
    for name in files[1:]:
        path = target / name
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(output_file, path)
    print("Finished visual %d/%d  %s" % (num, len(groups), ", ".join(files)), flush=True)
    for obj in objects:
        data = obj.data if obj.type == "LIGHT" else None
        bpy.data.objects.remove(obj, do_unlink=True)
        if data is not None:
            bpy.data.lights.remove(data)
