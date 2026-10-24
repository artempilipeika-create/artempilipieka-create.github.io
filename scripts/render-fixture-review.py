"""Offline placement review, rendered from actual mesh-factory geometry.
Usage: node scripts/export-fixture-review.mjs /tmp/fixtures.json
       python scripts/render-fixture-review.py /tmp/fixtures.json
Requires pyrender, trimesh, Pillow, numpy and PyOpenGL 3.1.7 (EGL).
Lighting is a review setup, not a browser screenshot.
"""
import os
os.environ['PYOPENGL_PLATFORM']='egl'
from pathlib import Path
import json,sys,numpy as np,trimesh,pyrender
from PIL import Image,ImageDraw,ImageFont
np.infty=np.inf
repo=Path(__file__).resolve().parents[1];assets=repo/'backend/v2/cabinet_assets/planner/appliance-assets'
scene=pyrender.Scene(bg_color=[.92,.94,.92,1],ambient_light=[.42,.42,.42])
for data in json.loads(Path(sys.argv[1]).read_text()):
 v=np.array(data['position']).reshape(-1,3);f=np.array(data['index']).reshape(-1,3) if data['index'] else np.arange(len(v)).reshape(-1,3)
 mesh=trimesh.Trimesh(v,f,process=False)
 if data['normal']:mesh.vertex_normals=np.array(data['normal']).reshape(-1,3)
 material=pyrender.MetallicRoughnessMaterial(baseColorFactor=[*(data['color'] or [1,1,1]),1],metallicFactor=data['metalness'],roughnessFactor=data['roughness'],doubleSided=True)
 if kind:=data.get('asset'):
  uv=np.array(data['uv']).reshape(-1,2);uv[:,1]=1-uv[:,1];mesh.visual=trimesh.visual.TextureVisuals(uv=uv)
  material=pyrender.MetallicRoughnessMaterial(baseColorTexture=Image.open(assets/(kind+'-tripo-color.webp')),metallicFactor=.45,roughnessFactor=.3,doubleSided=True)
 mesh.apply_transform(np.array(data['matrix']).reshape(4,4).T)
 scene.add(pyrender.Mesh.from_trimesh(mesh,material=material,smooth=False))
for dims,pos,color in [([4,.04,3],[0,-.025,.5],[.55,.57,.54,1]),([4,2.7,.04],[0,1.35,-.34],[.84,.86,.83,1])]:
 m=trimesh.creation.box(dims);m.apply_translation(pos);scene.add(pyrender.Mesh.from_trimesh(m,material=pyrender.MetallicRoughnessMaterial(baseColorFactor=color,roughnessFactor=.95)))
eye=np.array([2.25,2.8,4]);target=np.array([0,1.05,0]);z=eye-target;z/=np.linalg.norm(z);x=np.cross([0,1,0],z);x/=np.linalg.norm(x);y=np.cross(z,x);pose=np.eye(4);pose[:3,:3]=np.column_stack([x,y,z]);pose[:3,3]=eye
scene.add(pyrender.OrthographicCamera(xmag=1.77,ymag=1.30),pose=pose)
scene.add(pyrender.DirectionalLight(color=[1,.98,.94],intensity=3),pose=pose)
r=pyrender.OffscreenRenderer(1600,1176);color,depth=r.render(scene,flags=pyrender.RenderFlags.SHADOWS_DIRECTIONAL);r.delete()
im=Image.fromarray(color);draw=ImageDraw.Draw(im)
fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font=ImageFont.truetype(fontpath,24);small=ImageFont.truetype(fontpath,18)
draw.rectangle([0,0,1600,94],fill='#173d30');draw.text((35,22),'MARTIN FOREST',font=font,fill='white');draw.text((35,56),'Мойка, смеситель и вытяжка — проверка моделей в сцене',font=small,fill='#cce0d2')
out=repo/'docs/fixture-assets-20261024';out.mkdir(exist_ok=True);im.save(out/'fixture-review.png')
print(out/'fixture-review.png')
