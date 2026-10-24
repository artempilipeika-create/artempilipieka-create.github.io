"""Render catalogue previews from the optimized Tripo resources, without generation."""
import os
os.environ['PYOPENGL_PLATFORM']='egl'
from pathlib import Path
import json,numpy as np,trimesh,pyrender
from PIL import Image
np.infty=np.inf
repo=Path(__file__).resolve().parents[1]
assets=repo/'backend/v2/cabinet_assets/planner/appliance-assets'
kinds={'gas_cooker':[.6,.85,.6],'radiator':[1,.6,.1],'gas_boiler':[.42,.72,.32],'water_heater':[.45,.85,.45]}
review=Image.new('RGB',(1200,900),'white')
for i,(kind,size) in enumerate(kinds.items()):
    meta=json.loads((assets/(kind+'-tripo.json')).read_text());data=(assets/meta['buffer']).read_bytes()
    def values(key):
        a=meta['attributes'][key];return np.frombuffer(data,dtype='<u4' if key=='index' else '<f4',count=a['count']*a['size'],offset=a['offset']).reshape(-1,a['size'])
    mesh=trimesh.Trimesh(vertices=values('position').copy(),faces=values('index').reshape(-1,3),process=False)
    mesh.vertex_normals=values('normal').copy();uv=values('uv').copy();uv[:,1]=1-uv[:,1]
    mesh.visual=trimesh.visual.TextureVisuals(uv=uv);mesh.apply_scale(size)
    material=pyrender.MetallicRoughnessMaterial(baseColorTexture=Image.open(assets/meta['textures']['color']),metallicRoughnessTexture=Image.open(assets/meta['textures']['rm']),roughnessFactor=1,metallicFactor=1,doubleSided=True)
    scene=pyrender.Scene(bg_color=[.937,.929,.902,1],ambient_light=[.6,.6,.6]);scene.add(pyrender.Mesh.from_trimesh(mesh,material=material,smooth=False))
    eye=np.array([1,.55,2.2]);z=eye/np.linalg.norm(eye);x=np.cross([0,1,0],z);x/=np.linalg.norm(x);y=np.cross(z,x);pose=np.eye(4);pose[:3,:3]=np.column_stack([x,y,z]);pose[:3,3]=eye
    span=max(size[0],size[1]*1.25,size[2])*1.32
    scene.add(pyrender.OrthographicCamera(xmag=span/2,ymag=span*.375),pose=pose)
    scene.add(pyrender.DirectionalLight(color=[1,.98,.95],intensity=2.4),pose=pose)
    renderer=pyrender.OffscreenRenderer(600,450);color,_=renderer.render(scene);renderer.delete()
    im=Image.fromarray(color);im.save(assets/(kind+'-tripo-preview.webp'),quality=88,method=6);review.paste(im,((i%2)*600,(i//2)*450))
out=repo/'docs/room-equipment-20261024/equipment-models.jpg';review.save(out,quality=90);print(out)
