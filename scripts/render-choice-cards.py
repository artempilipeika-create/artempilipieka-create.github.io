"""Render exact catalogue geometry. No model generation and no project changes."""
import os
os.environ['PYOPENGL_PLATFORM']='egl'
from pathlib import Path
import json,sys,numpy as np,trimesh,pyrender
from PIL import Image
np.infty=np.inf
root=Path(__file__).resolve().parents[1];src=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
assets=root/'backend/v2/cabinet_assets/planner/appliance-assets'
width,height=960,720
renderer=pyrender.OffscreenRenderer(width,height)
def pose_for(eye,target):
 z=np.array(eye,dtype=float)-target;z/=np.linalg.norm(z);x=np.cross([0,1,0],z);x/=np.linalg.norm(x);y=np.cross(z,x);pose=np.eye(4);pose[:3,:3]=np.column_stack([x,y,z]);pose[:3,3]=eye;return pose
for rec in json.loads((src/'manifest.json').read_text())['records']:
 data=json.loads((src/(rec['file']+'.json')).read_text());scene=pyrender.Scene(bg_color=[.955,.949,.928,1],ambient_light=[.55,.55,.55]);bounds=[]
 for a in data['meshes']:
  v=np.array(a['position']).reshape(-1,3);f=np.array(a['index']).reshape(-1,3);mesh=trimesh.Trimesh(v,f,process=False)
  if a['normal']:mesh.vertex_normals=np.array(a['normal']).reshape(-1,3)
  mat=pyrender.MetallicRoughnessMaterial(baseColorFactor=[*a['color'],a['opacity']],metallicFactor=a['metalness'],roughnessFactor=max(.25,a['roughness']),doubleSided=True,alphaMode='BLEND' if a['opacity']<1 else 'OPAQUE')
  if a.get('asset'):
   uv=np.array(a['uv']).reshape(-1,2);uv[:,1]=1-uv[:,1];mesh.visual=trimesh.visual.TextureVisuals(uv=uv)
   mat=pyrender.MetallicRoughnessMaterial(baseColorTexture=Image.open(assets/(a['asset']+'-tripo-color.webp')),metallicFactor=.25,roughnessFactor=.4,doubleSided=True)
  mesh.apply_transform(np.array(a['matrix']).reshape(4,4).T);bounds.extend(mesh.bounds);scene.add(pyrender.Mesh.from_trimesh(mesh,material=mat,smooth=False))
 lo=np.min(bounds,axis=0);hi=np.max(bounds,axis=0);target=np.array(data.get('target',(lo+hi)/2),dtype=float);size=hi-lo
 direction=np.array(data.get('camera',[.8,.4,1.5]));direction/=np.linalg.norm(direction);pose=pose_for(target+direction*5,target);x,y=pose[:3,0],pose[:3,1]
 corners=np.array([[a,b,c] for a in [lo[0],hi[0]] for b in [lo[1],hi[1]] for c in [lo[2],hi[2]]])-target
 half=data.get('half',max(np.max(np.abs(corners@y))*1.16,np.max(np.abs(corners@x))*height/width*1.16))
 scene.add(pyrender.OrthographicCamera(xmag=half*width/height,ymag=half,znear=.01,zfar=20),pose=pose)
 floor_y=data.get('floor',lo[1]-.002);floor=trimesh.creation.box([20,.02,20]);floor.apply_translation([0,floor_y-.01,0]);scene.add(pyrender.Mesh.from_trimesh(floor,material=pyrender.MetallicRoughnessMaterial(baseColorFactor=[.97,.965,.95,1],roughnessFactor=1)))
 for direction,intensity,color in [([-3,5,7],2.0,[1,.97,.91]),([4,3,2],.6,[.92,.96,1]),([0,4,-3],.45,[1,1,1])]:
  scene.add(pyrender.DirectionalLight(color=color,intensity=intensity),pose=pose_for(target+np.array(direction),target))
 color,_=renderer.render(scene,flags=pyrender.RenderFlags.SHADOWS_DIRECTIONAL);Image.fromarray(color).resize((640,480),Image.Resampling.LANCZOS).save(out/(rec['file']+'.webp'),quality=94)
 print(rec['file'],flush=True)
renderer.delete()
