"""Render questionnaire cabinets and surface details from the constructor's geometry.

node scripts/export-kitchen-questionnaire-art.mjs /tmp/mf-kitchen-geometry
blender -b -t 3 --python-exit-code 1 -P scripts/render-kitchen-questionnaire-art.py -- /tmp/mf-kitchen-geometry /tmp/mf-cards
Use MF_OIDN_MODULES for Blender distributions without the built-in Intel denoiser.
"""
import base64
import json
import os
import shutil
import subprocess
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

geometry_dir, output_dir, *selection = sys.argv[sys.argv.index('--') + 1:]
geometry_dir, output_dir = Path(geometry_dir), Path(output_dir)
output_dir.mkdir(parents=True, exist_ok=True)
assets = Path(__file__).resolve().parents[1] / 'backend/v2/cabinet_assets/planner'
materials = assets / 'materials'
appliances = assets / 'appliance-assets'
source = json.loads((assets / 'countertop-variants.json').read_text())
basis = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
common_angle = Vector((.48, -1.35, .41))
external_denoise = bool(os.environ.get('MF_OIDN_MODULES'))


def linear(hex_value):
    rgb = bytes.fromhex(hex_value.lstrip('#'))
    return tuple((x/255/12.92 if x <= 10 else ((x/255+.055)/1.055)**2.4) for x in rgb) + (1.,)


def coating(label, color, rough=.48, metal=0):
    material = bpy.data.materials.new(label)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = linear(color) if isinstance(color, str) else (*color, 1.)
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Metallic'].default_value = metal
    return material


def shader_of(material):
    return material.node_tree.nodes.get('Principled BSDF')


def map_image(material, file, output, projection='UV', scale=(1, 1, 1), origin=(0, 0, 0), grayscale=False):
    tree = material.node_tree
    texture = tree.nodes.new('ShaderNodeTexImage')
    texture.image = bpy.data.images.load(str(file), check_existing=True)
    if grayscale:
        texture.image.colorspace_settings.name = 'Non-Color'
    if projection == 'BOX':
        geometry = tree.nodes.new('ShaderNodeNewGeometry')
        mapping = tree.nodes.new('ShaderNodeMapping')
        mapping.inputs['Location'].default_value = origin
        mapping.inputs['Scale'].default_value = scale
        tree.links.new(geometry.outputs['Position'], mapping.inputs['Vector'])
        tree.links.new(mapping.outputs['Vector'], texture.inputs['Vector'])
        texture.projection = 'BOX'
        texture.projection_blend = .06
    if output:
        tree.links.new(texture.outputs['Color'], shader_of(material).inputs[output])
    return texture


def apply_matte(material):
    sample = materials / 'studio-matte.webp'
    if sample.exists():
        tex = map_image(material, sample, None, 'BOX', (25,25,25), grayscale=True)
        tree = material.node_tree
        levels = tree.nodes.new('ShaderNodeMapRange')
        levels.inputs['To Min'].default_value = .46
        levels.inputs['To Max'].default_value = .64
        tree.links.new(tex.outputs['Color'], levels.inputs['Value'])
        tree.links.new(levels.outputs['Result'], shader_of(material).inputs['Roughness'])


def board_sample(material):
    # This generic board option shows a real horizontal EGGER oak sheet; cabinet fronts use 890 PO.
    tree = material.node_tree
    axes = tree.nodes.new('ShaderNodeSeparateXYZ')
    tree.links.new(tree.nodes.new('ShaderNodeNewGeometry').outputs['Position'], axes.inputs[0])
    uv = tree.nodes.new('ShaderNodeCombineXYZ')
    tree.links.new(axes.outputs['Z'], uv.inputs['X'])
    tree.links.new(axes.outputs['X'], uv.inputs['Y'])
    mapping = tree.nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (1/1.3, 1/2.8, 1)
    mapping.inputs['Location'].default_value = (.22, .50, 0)
    tree.links.new(uv.outputs[0], mapping.inputs['Vector'])
    tex = map_image(material,materials/'egger-h1180-st37.jpg','Base Color')
    tree.links.new(mapping.outputs['Vector'], tex.inputs['Vector'])


def reflected_window():
    # A studio reflection card reveals the polish of the glossy panel and transparent glass.
    window = coating('Рассеиватель', '#ffffff')
    shader_of(window).inputs['Emission Color'].default_value = (1.,.98,.94,1)
    shader_of(window).inputs['Emission Strength'].default_value = 2.4
    for i in range(3):
        obj = slab('Оконный блик', (-1.04+i*.29,-1.32,.61), (.265,.008,.84), window,0)
        obj.visible_camera = obj.visible_diffuse = obj.visible_shadow = obj.visible_transmission = False


def glass_material():
    mat = coating('Стекло', '#f5fcf9', .055)
    bsdf = shader_of(mat)
    bsdf.inputs['Transmission Weight'].default_value = 1.
    bsdf.inputs['IOR'].default_value = 1.48
    # Keep the green cast on the long optical path at a polished glass edge.
    absorption = mat.node_tree.nodes.new('ShaderNodeVolumeAbsorption')
    absorption.inputs['Color'].default_value = (.55, .88, .78, 1)
    absorption.inputs['Density'].default_value = 1.2
    mat.node_tree.links.new(absorption.outputs['Volume'], mat.node_tree.nodes.get('Material Output').inputs['Volume'])
    return mat


def make_materials():
    palette = {
        'body': coating('BYSPAN 605 PO', '#ffffff', .56),
        'front': coating('BYSPAN 890 PO', '#e1d7cb', .54),
        'glass': glass_material(),
        'frame': coating('Z1', '#252824', .35, .69),
        'floor': coating('Студийный фон', '#dbd8d1', .89),
        'wall': coating('Матовая стена', '#e6e3db', .87),
        'skinali': coating('Глянцевая стеновая панель', '#b6a58f', .24),
        'ldsp': coating('ЛДСП', '#c5b99f', .61),
        'tile': coating('Глазурь', '#e4e1d7', .27),
        'grout': coating('Шов', '#a29e94', .93),
        'seam': coating('Стык', '#393631', .84),
    }
    palette['plinth'] = palette['front']
    apply_matte(palette['body'])
    apply_matte(palette['front'])
    for key in ['skinali', 'tile']:
        shader_of(palette[key]).inputs['Coat Weight'].default_value = .28
    for i, offset in enumerate(((.45,.23,0), (.6,.81,0))):
        stone = coating('EGGER F187 ST9', '#605448', .63)
        scan = map_image(stone, materials/'egger-f187-st9.jpg', None, 'BOX', (1/1.3,1/.603,.8), offset)
        # Match the catalogue softbox and AgX calibration used for the other cabinet cards.
        gain = stone.node_tree.nodes.new('ShaderNodeVectorMath')
        gain.operation = 'SCALE'
        gain.inputs['Scale'].default_value = .45
        stone.node_tree.links.new(scan.outputs['Color'], gain.inputs[0])
        stone.node_tree.links.new(gain.outputs[0], shader_of(stone).inputs['Base Color'])
        shader_of(stone).inputs['Specular IOR Level'].default_value = .13
        palette['counter' if i == 0 else 'return'] = stone
    return palette


def slab(name, centre, size, material, bevel=.0007):
    bpy.ops.mesh.primitive_cube_add(size=1, location=centre)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('Радиус кромки', 'BEVEL')
        modifier.width = min(bevel, min(size)/3)
        modifier.segments = 3
        obj.modifiers.new('Нормали', 'WEIGHTED_NORMAL')
    return obj


def studio():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 26
    scene.cycles.use_denoising = not external_denoise
    scene.cycles.max_bounces = 10
    scene.cycles.transmission_bounces = 8
    scene.render.resolution_x, scene.render.resolution_y = 768,576
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG' if external_denoise else 'WEBP'
    scene.render.image_settings.quality = 92
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new('Рассеянный дневной свет')
    scene.world.use_nodes = True
    env = scene.world.node_tree.nodes['Background']
    env.inputs[0].default_value = (.83,.85,.89,1)
    env.inputs[1].default_value = .45
    def light(name, where, target, power, sx, sy, tint):
        lamp = bpy.data.lights.new(name, 'AREA')
        lamp.shape, lamp.size, lamp.size_y = 'RECTANGLE', sx, sy
        lamp.energy, lamp.color = power,tint
        obj = bpy.data.objects.new(name, lamp)
        scene.collection.objects.link(obj)
        obj.location = where
        obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    light('Левое окно', (-2.3,-2.1,3.1),(0,0,.5),200,2.2,2.8,(1,.966,.92))
    light('Заполнение', (2.6,-.9,2.2),(0,0,.4),64,1.5,2.0,(.91,.95,1))
    light('Верхний свет', (.55,1.35,3.4),(0,0,.3),100,1.9,1.4,(1,.99,.95))
    return scene, make_materials()


def view(scene, target, direction, width):
    data = bpy.data.cameras.new('Каталожная камера')
    cam = bpy.data.objects.new(data.name,data)
    scene.collection.objects.link(cam)
    vec = Vector(direction).normalized()
    cam.location = Vector(target)+vec*5
    cam.rotation_euler = (-vec).to_track_quat('-Z','Y').to_euler()
    data.type, data.ortho_scale = 'ORTHO',width
    data.clip_end = 80
    scene.camera = cam


def array(data, dtype, columns):
    return np.frombuffer(base64.b64decode(data),dtype).reshape((-1,columns))


def actual_material(record, palette):
    role=record['role']
    if role in palette:
        return palette[role]
    mat = coating(role, record['color'], record['roughness'], record['metalness'])
    shader=shader_of(mat)
    if role in ('led', 'liraScreen'):
        shader.inputs['Emission Color'].default_value = linear('#ffe8b5')
        shader.inputs['Emission Strength'].default_value = 2.2
    if role in ('sink','faucet'):
        map_image(mat,appliances/(role+'-tripo-color.webp'),'Base Color')
        shader.inputs['Metallic'].default_value = .76
        shader.inputs['Roughness'].default_value = .26 if role=='sink' else .17
    palette[role]=mat
    return mat


def native_module(scene, palette, file):
    data=json.loads((geometry_dir/(file+'.json')).read_text())
    instances={}
    corners=[]
    for record in data['objects']:
        geo_id=record['geometry']
        key=(geo_id,record['role'])
        if key not in instances:
            geo=data['geometries'][geo_id]
            vertices=array(geo['vertex'],'<f4',3)
            triangles=array(geo['index'],'<u4',3)
            mesh=bpy.data.meshes.new(record['role'])
            mesh.from_pydata(vertices.tolist(),[],triangles.tolist())
            mesh.update()
            if geo.get('normal'):
                normals=array(geo['normal'],'<f4',3)
                for polygon in mesh.polygons:
                    polygon.use_smooth=True
                mesh.normals_split_custom_set_from_vertices(normals.tolist())
            if record['role'] in ('sink','faucet') and geo.get('uv'):
                uv=mesh.uv_layers.new(name='UVMap')
                coords=array(geo['uv'],'<f4',2).copy()
                coords[:,1]=1-coords[:,1]
                uv.data.foreach_set('uv',coords[triangles.reshape(-1)].reshape(-1))
            mesh.materials.append(actual_material(record,palette))
            instances[key]=mesh
        obj=bpy.data.objects.new(record['role'],instances[key])
        scene.collection.objects.link(obj)
        obj.matrix_world=basis@Matrix(np.array(record['matrix']).reshape((4,4)).T)
        if record['role']=='counter':
            # Align the imported Y-up box normals with the world-space texture projection.
            obj.data.transform(obj.matrix_world)
            obj.matrix_world = Matrix.Identity(4)
            obj.data.update()
        corners.extend(obj.matrix_world@Vector(point) for point in obj.bound_box)
    wall=data['wall']
    if wall:
        back=max(c.y for c in corners)
        slab('Стена',(0,back+.102,1),(40,.2,22),palette['wall'],0)
    slab('Пол',(0,0,-1.55 if wall else -.05),(50,50,.1),palette['floor'],0)
    direction=common_angle.normalized()
    if file=='ai-base-sink':
        direction=Vector((.50,-1.35,.64)).normalized()
    rotation=(-direction).to_track_quat('-Z','Y')
    horizontal=rotation@Vector((1,0,0))
    vertical=rotation@Vector((0,1,0))
    lo=[min(p.dot(axis) for p in corners) for axis in (horizontal,vertical,direction)]
    hi=[max(p.dot(axis) for p in corners) for axis in (horizontal,vertical,direction)]
    center=sum((axis*((a+b)/2) for axis,a,b in zip((horizontal,vertical,direction),lo,hi)),Vector())
    width=max(hi[0]-lo[0],(hi[1]-lo[1])*4/3)*1.16
    if file=='plinth':
        # Show the recessed strip across the run and the depth of the toe space at the right end.
        view(scene,(.37,-.20,.31),(.75,-1.30,.31),1.68)
    else:
        view(scene,center,direction,width)


def backdrop(palette):
    slab('Пол',(0,0,-.05),(50,50,.1),palette['floor'],0)


def backsplash(scene,palette,kind):
    backdrop(palette)
    panel=palette['skinali']
    if kind in ('straight','left','right','u'):
        # The FR3D donor has 6 mm stock and a 400 mm corner; here the main span is 1200 mm.
        length, height, run, t=1.2,.50,.4,.006
        slab('Прямой участок', (0,0,height/2), (length,t,height), panel)
        for name,sign in [('left',-1),('right',1)]:
            if kind in (name,'u'):
                slab('Возврат', (sign*(length-t)/2,-run/2,height/2),(t,run-t,height),panel)
        side=-1 if kind=='right' else 1
        # Look into the opening. Both returns remain clear in the U-shaped sample.
        direction=(side*(.43 if kind=='u' else .66),-1.3,.55)
        view(scene,(0,-.08,.25),direction,1.56)
        return
    length,height=1.2,.60
    z=.858
    slab('Совмещённые корпуса',(0,-.22,z-.44),(length-.008,.47,.804),palette['body'])
    for x in [-.45,-.15,.15,.45]:
        slab('Фасад',(x,-.458,z-.30),(.297,.018,.49),palette['front'])
    slab('Столешница 38 мм',(0,-.257,z-.019),(length,.52,.038),palette['counter'],.0022)
    if kind in ('panel','glass'):
        reflected_window()
    elif kind=='ldsp':
        board_sample(palette['ldsp'])
    if kind=='tile':
        slab('Затирка',(0,0,z+height/2),(length,.009,height),palette['grout'])
        for i in range(4):
            for j in range(3):
                slab('Плитка',(-.45+i*.30,-.005,z+.10+j*.20),(.2975,.002,.1975),palette['tile'],.0008)
    elif kind=='glass':
        slab('Штукатурка за стеклом',(0,.032,z+height/2),(length,.036,height),palette['wall'])
        slab('Прозрачная скиналь',(0,-.012,z+height/2),(length,.006,height),palette['glass'],.001)
    else:
        t=.006 if kind=='panel' else .018
        slab('Панель',(0,0,z+height/2),(length,t,height),panel if kind=='panel' else palette['ldsp'])
    view(scene,(.10,-.095,1.08),(.65,-1.40,.42),1.48)


def prism(name,points,material):
    # The x/z drawing coordinates are converted to Blender x/-y here. Orient normals outwards.
    coords=[(x/1000,-z/1000) for x,z in points]
    signed=sum(x*coords[(i+1)%len(coords)][1]-coords[(i+1)%len(coords)][0]*y for i,(x,y) in enumerate(coords))
    if signed<0:
        coords.reverse()
    n=len(coords)
    vertices=[(x,y,z) for z in (0,.038) for x,y in coords]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces.extend((i,(i+1)%n,n+(i+1)%n,n+i) for i in range(n))
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    item=bpy.data.objects.new(name,mesh)
    bpy.context.scene.collection.objects.link(item)
    mesh.materials.append(material)
    bevel=item.modifiers.new('Скругление кромки','BEVEL')
    bevel.width,bevel.segments=.0007,3
    item.modifiers.new('Нормали','WEIGHTED_NORMAL')


def joint(scene,palette,kind):
    parts=next(v for v in source if v['shape']=='left' and v['joint']==kind)['panels']
    for i, part in enumerate(parts):
        prism(part['role'],part['points'],palette['return' if i else 'counter'])
    # The two cabinet faces below the inside corner make the joint orientation readable.
    slab('Фасад главного плеча',(1.18,-.565,-.37),(1.16,.018,.736),palette['front'])
    slab('Фасад левого плеча',(.565,-.9,-.37),(.018,.60,.736),palette['front'])
    slab('Пол',(0,0,-.91),(50,50,.1),palette['floor'],0)
    view(scene,(.544,-.597,.032),(.39,-1.01,1.72),.365)


jobs=[f.stem for f in sorted(geometry_dir.glob('ai-*.json'))]
jobs+=['backsplash-'+k for k in ['panel','ldsp','tile','glass','straight','left','right','u']]
jobs+=['countertop-standard','countertop-euro','plinth']
for name in selection or jobs:
    scene, palette=studio()
    if name.startswith('ai-') or name=='plinth':
        native_module(scene,palette,name)
    elif name.startswith('backsplash-'):
        backsplash(scene,palette,name.removeprefix('backsplash-'))
    elif name.startswith('countertop-'):
        joint(scene,palette,name.removeprefix('countertop-'))
    else:
        raise ValueError(name)
    target = output_dir.resolve()/(name+'.webp')
    raw = geometry_dir.resolve()/(name+'.png') if external_denoise else target
    scene.render.filepath=str(raw)
    bpy.ops.render.render(write_still=True)
    if external_denoise:
        filter_script = Path(__file__).with_name('render-showroom-cabinet-cards.py')
        subprocess.run([shutil.which('python3'), str(filter_script), '--denoise', str(raw), str(target)], check=True)
        raw.unlink()
