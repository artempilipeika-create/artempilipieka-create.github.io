"""Photograph wardrobe and dresser questionnaire parts from export-wardrobe-layout-art.mjs.

node scripts/export-wardrobe-layout-art.mjs /tmp/mf-wardrobe-geometry
blender -b -t 3 --python-exit-code 1 -P scripts/render-wardrobe-layout-art.py -- /tmp/mf-wardrobe-geometry /tmp/mf-images
Optional arguments after the output directory are image stems. Set MF_OIDN_MODULES when
Blender lacks native OIDN. Set MF_TRIPO_PHOTOS to the Tripo Studio PNG directory to
rebuild approved photographs. An existing approved frame is preserved when its sources
are unavailable; the native modelling reference is also saved in the geometry directory.
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


def studio_portrait(source, bounds):
    from PIL import Image, ImageOps
    import numpy as np
    portrait = Image.open(source).convert('RGB')
    if bounds is None:
        return ImageOps.fit(portrait, (680, 510), Image.Resampling.LANCZOS)
    # Fit the photographed object's measured top and floor contact to the common
    # catalogue camera. Reflect only the empty studio margins at the sides.
    top, bottom = bounds
    scale = 441 / (bottom-top)
    width, height = round(portrait.width*scale), round(portrait.height*scale)
    portrait = portrait.resize((width, height), Image.Resampling.LANCZOS)
    left, y = (680-width)//2, 34-round(top*scale)
    extended = np.pad(np.asarray(portrait),
                      ((max(0, y), max(0, 510-y-height)), (left, 680-width-left), (0, 0)), mode='reflect')
    start = max(0, -y)
    return Image.fromarray(extended[start:start+510])


# Bounds refer to the original 1024px Tripo photographs.
approved_portraits = {
    'dresser-media-wall-closed': ('MF01.png', None),
    'hall': ('MF26.png', (47, 898)), 'couple': ('MF27.png', (60, 842)),
    'business': ('MF28.png', (40, 881)), 'utility': ('MF29.png', (92, 844)),
}


def finish(directory, destination, name):
    from PIL import Image, ImageDraw

    def load(shot):
        source = directory / (shot + '.png')
        if os.environ.get('MF_OIDN_MODULES'):
            result = directory / (shot + '-denoised.png')
            helper = Path(__file__).with_name('render-showroom-cabinet-cards.py')
            subprocess.run([sys.executable, str(helper), '--denoise', str(source), str(result)], check=True)
            source = result
        return Image.open(source).convert('RGB')

    image = load(name)
    if json.loads((directory / (name + '.json')).read_text())['detail']:
        detail = load(name + '-detail')
        # Place the full narrow enclosure alongside a larger view of the same hardware.
        width, height = image.size
        offset = 94
        sheet = Image.new('RGB', image.size)
        sheet.paste(image.crop((offset, 0, width, height)), (0, 0))
        sheet.paste(image.crop((width - 2, 0, width, height)).resize((offset, height)), (width - offset, 0))
        x, y, w, h = 380, 143, 267, 211
        draw = ImageDraw.Draw(sheet)
        for pad, color in ((3, (165, 160, 151)), (2, (247, 244, 238))):
            draw.rounded_rectangle((x-pad, y-pad, x+w+pad, y+h+pad), radius=pad+3, fill=color)
        scale = max(w/detail.width, h/detail.height)
        detail = detail.resize((round(detail.width*scale), round(detail.height*scale)), Image.Resampling.LANCZOS)
        left, top = (detail.width-w)//2, (detail.height-h)//2
        mask = Image.new('L', (w, h))
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, w-1, h-1), radius=3, fill=255)
        sheet.paste(detail.crop((left, top, left+w, top+h)), (x, y), mask)
        image = sheet
    target = destination / (name + '.webp')
    if name in approved_portraits:
        image.save(directory / (name + '-native-reference.png'))
        source_dir = os.environ.get('MF_TRIPO_PHOTOS')
        if source_dir:
            filename, bounds = approved_portraits[name]
            photo = studio_portrait(Path(source_dir) / filename, bounds)
            photo.save(target, quality=94, method=6)
            return
        if target.is_file():
            return
    image.save(target, quality=91, method=6)


if sys.argv[1:2] == ['--finish']:
    finish(Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4])
    sys.exit(0)

import base64
import bpy
import numpy as np
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--')+1:]
source, output = map(Path, args[:2])
assets = Path(__file__).resolve().parents[1] / 'backend/v2/cabinet_assets/planner'
output.mkdir(parents=True, exist_ok=True)
convert = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def vector(three):
    return Vector((three[0], -three[2], three[1]))


def decode(data, dtype):
    return np.frombuffer(base64.b64decode(data), dtype=dtype)


def point(obj, target):
    obj.rotation_euler = (target-obj.location).to_track_quat('-Z', 'Y').to_euler()


def coating(name, color, rough=.55, metallic=0, opacity=1, board=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    shader = tree.nodes.get('Principled BSDF')
    if board:
        color = [v*.82 for v in color]
    if name == 'chromeFoot':
        color, metallic, rough = (.37, .39, .42), .9, .22
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Metallic'].default_value = metallic
    if opacity < .6:
        shader.inputs['Transmission Weight'].default_value = .88
        shader.inputs['IOR'].default_value = 1.48
    if board:
        tex = tree.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(str(assets / 'materials/studio-matte.webp'), check_existing=True)
        tex.image.colorspace_settings.name = 'Non-Color'
        tex.projection, tex.projection_blend = 'BOX', .1
        coordinates = tree.nodes.new('ShaderNodeTexCoord')
        mapping = tree.nodes.new('ShaderNodeVectorMath')
        mapping.operation = 'SCALE'
        mapping.inputs['Scale'].default_value = 5
        tree.links.new(coordinates.outputs['Object'], mapping.inputs[0])
        tree.links.new(mapping.outputs[0], tex.inputs['Vector'])
        bump = tree.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value, bump.inputs['Distance'].default_value = .07, .00009
        tree.links.new(tex.outputs['Color'], bump.inputs['Height'])
        tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    return mat


def add_meshes(data):
    materials = [coating(m['role'], m['c'], m['rough'], m['metal'], m['opacity'],
                         m['role'] in ('body', 'front', 'shelf', 'plinth', 'back')) for m in data['mats']]
    parts = {}
    for g, m, transform in data['instances']:
        if (g, m) not in parts:
            buf = data['geometries'][g]
            points = decode(buf['p'], '<f4').reshape(-1, 3)
            ids = (decode(buf['idx'], '<u4') if buf['idx'] else np.arange(len(points))).reshape(-1, 3)
            mesh = bpy.data.meshes.new('Native component')
            mesh.vertices.add(len(points))
            mesh.vertices.foreach_set('co', points.ravel())
            mesh.loops.add(ids.size)
            mesh.loops.foreach_set('vertex_index', ids.ravel().astype(np.int32))
            mesh.polygons.add(len(ids))
            mesh.polygons.foreach_set('loop_start', np.arange(0, ids.size, 3, dtype=np.int32))
            mesh.update(calc_edges=True)
            if buf['n']:
                mesh.polygons.foreach_set('use_smooth', np.ones(len(ids), dtype=bool))
                mesh.normals_split_custom_set_from_vertices(decode(buf['n'], '<f4').reshape(-1, 3).tolist())
            mesh.materials.append(materials[m])
            parts[g, m] = mesh
        obj = bpy.data.objects.new(data['mats'][m]['role'], parts[g, m])
        bpy.context.collection.objects.link(obj)
        obj.matrix_world = convert @ Matrix(np.array(transform).reshape(4, 4).T.tolist())


def light(name, location, target, size, energy, color):
    lamp = bpy.data.lights.new(name, 'AREA')
    lamp.energy, lamp.shape, lamp.size, lamp.color = energy, 'DISK', size, color
    obj = bpy.data.objects.new(name, lamp)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    point(obj, target)


def shoot(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    data = json.loads((source / (name+'.json')).read_text())
    add_meshes(data)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 20
    scene.cycles.use_denoising = not bool(os.environ.get('MF_OIDN_MODULES'))
    scene.cycles.max_bounces, scene.cycles.diffuse_bounces, scene.cycles.glossy_bounces = 3, 2, 3
    scene.world = bpy.data.worlds.new('Daylight')
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get('Background')
    background.inputs[0].default_value, background.inputs[1].default_value = (.85, .87, .9, 1), .24
    scene.view_settings.view_transform, scene.view_settings.look = 'AgX', 'AgX - Medium High Contrast'
    scene.view_settings.exposure = .05
    bpy.ops.mesh.primitive_plane_add(size=220, location=(0, 0, -.001))
    bpy.context.object.data.materials.append(coating('Studio floor', (.70, .66, .59), .68))
    wall_gap = .005 if data.get('suspended') else .13
    bpy.ops.mesh.primitive_plane_add(size=120, location=(0, data['size'][2]/2000+wall_gap, 0), rotation=(np.pi/2, 0, 0))
    bpy.context.object.data.materials.append(coating('Warm plaster', (.83, .80, .75), .94))
    centre, span = vector(data['centre']), max(max(data['size'])/1000, .6)
    for label, pos, size, power, color in (
            ('Left window', (-1.7, -2, 2.4), 2.15, 185, (1, .94, .85)),
            ('Fill', (2.35, -1.4, 1.15), 2.6, 50, (.88, .94, 1)),
            ('Top soft box', (.1, 1.35, 2.2), 1.85, 78, (1, .99, .96))):
        light(label, centre+Vector(pos)*span, centre, size*span, power*span**2, color)
    lens = bpy.data.cameras.new('Orthographic')
    camera = bpy.data.objects.new('Product camera', lens)
    bpy.context.collection.objects.link(camera)
    camera.location = vector(data['camera'])
    point(camera, centre)
    lens.type, lens.ortho_scale, scene.camera = 'ORTHO', 2*data['half']*4/3, camera
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 680, 510, 100
    scene.render.filepath = str((source/(name+'.png')).resolve())
    bpy.ops.render.render(write_still=True)
    if data['detail']:
        focus = data['detail']
        wx, hy, dz = focus['size']
        centre = vector(focus['centre'])
        camera.location = centre+Vector((.38, -1, .18)).normalized()*3
        point(camera, centre)
        lens.ortho_scale = max(wx+dz*.48, hy*4/3+dz*.20, .28)*1.38
        scene.render.resolution_x, scene.render.resolution_y = 440, 330
        scene.render.filepath = str((source/(name+'-detail.png')).resolve())
        bpy.ops.render.render(write_still=True)
    subprocess.run([shutil.which('python3'), __file__, '--finish', str(source), str(output), name], check=True)


for name in args[2:] or json.loads((source/'manifest.json').read_text()):
    shoot(name)
