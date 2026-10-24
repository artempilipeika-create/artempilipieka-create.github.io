"""Build measured presentation assets from the user's original Tripo GLBs.
Usage: python scripts/build-appliance-assets.py KIND source.glb [preview.glb]
Requires numpy, trimesh, Pillow, pymeshlab 2025.7.post1. No paid generation.
Originals are retained in the user's Library; only optimized resources enter the repo.
"""
import hashlib,json,pathlib,sys
import numpy as np
import trimesh,pymeshlab
from PIL import Image
TASKS={'oven':'493c506e-da6b-4ff3-bca2-846002d13cb8','microwave':'d8ea151a-d744-4e31-8ea1-39a4d550d3c6','sink':'b80f60e3-039a-4885-b63e-4cd172188c8a','faucet':'4e6061dd-1dbe-440e-be08-8e94f15ca349','hood':'704b7fea-c514-401d-968c-e19ccb3d49ca'}
TASKS.update({'gas_cooker':'dc893516-a4e3-49ae-94d4-ffa34766a657','radiator':'f2a5a16a-1b01-4903-bd0f-219629975289','gas_boiler':'0532e262-3d47-46ce-a57f-6d92c1729c1b','water_heater':'95753287-6a88-454b-ab8d-eafc7e8e66ee','window':'d6a394c2-f588-409c-9bde-1a0381ca0109'})
kind=sys.argv[1];assert kind in TASKS
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'backend/v2/cabinet_assets/planner/appliance-assets';out.mkdir(exist_ok=True)
source=pathlib.Path(sys.argv[2]);scene=trimesh.load(source,process=False)
assert len(scene.geometry)==1
mesh=next(iter(scene.geometry.values()))
print(kind,'original',len(mesh.vertices),'vertices',len(mesh.faces),'triangles',flush=True)
ms=pymeshlab.MeshSet();ms.load_new_mesh(str(source))
assert np.allclose(ms.current_mesh().vertex_matrix(),mesh.vertices)
original_uv=mesh.visual.uv[mesh.faces].reshape(-1,2);lab_uv=ms.current_mesh().wedge_tex_coord_matrix()
flip_v=bool(np.allclose(lab_uv,original_uv))
if not flip_v:
 original_uv[:,1]=1-original_uv[:,1]
 assert np.allclose(lab_uv,original_uv),'Unexpected UV layout'
ms.apply_filter('meshing_remove_duplicate_vertices')
ms.apply_filter('meshing_decimation_quadric_edge_collapse_with_texture',targetfacenum=24000,qualitythr=.3,extratcoordw=1,preserveboundary=True,preservenormal=True,planarquadric=True)
m=ms.current_mesh();faces=m.face_matrix();verts=m.vertex_matrix();uv=m.wedge_tex_coord_matrix()
rows=np.concatenate([verts[faces.reshape(-1)],uv],axis=1);rows,inverse=np.unique(rows,axis=0,return_inverse=True)
tri_uv=rows[:,3:].copy()
if not flip_v:tri_uv[:,1]=1-tri_uv[:,1]
small=trimesh.Trimesh(vertices=rows[:,:3],faces=inverse.reshape(-1,3),process=False)
small.visual=trimesh.visual.TextureVisuals(uv=tri_uv,material=mesh.visual.material.copy())
cleanup=[]
if kind=='faucet':
 # Align the generated diagonal arch with the basin's forward axis.
 upper=small.vertices[small.vertices[:,1]>.5*small.bounds[1,1]][:,[0,2]]
 direction=np.linalg.eigh(np.cov(upper.T))[1][:,-1]
 if direction[1]<0:direction=-direction
 yaw=np.arctan2(-direction[0],direction[1])
 small.apply_transform(trimesh.transformations.rotation_matrix(yaw,[0,1,0]))
 cleanup.append('Align faucet arch towards +Z, yaw %.6f degrees'%np.degrees(yaw))
if kind=='sink':
 # Studio presents the bowl in the XY plane, opening towards +Z.
 # In the kitchen it opens upwards, with the faucet deck towards the wall (-Z).
 small.apply_transform(trimesh.transformations.rotation_matrix(-np.pi/2,[1,0,0]))
 cleanup.append('Rotate source -90 degrees about X: bowl +Y, rear deck -Z')
if kind=='oven':
 # Body below the generated flange spans X=-.334..+.3685. Trim only the
 # projecting strip; clipping interpolates UVs and preserves the source material.
 for normal,origin in [([1,0,0],[-.335,0,0]),([-1,0,0],[.369,0,0])]:
  v,f,uv=trimesh.intersections.slice_faces_plane(small.vertices,small.faces,normal,origin,uv=small.visual.uv)
  visual=trimesh.visual.TextureVisuals(uv=uv,material=small.visual.material.copy())
  small=trimesh.Trimesh(vertices=v,faces=f,visual=visual,process=False)
 cleanup=['Trim generated top flange to source X [-0.335, 0.369]']
small.remove_unreferenced_vertices();bounds=small.bounds.copy()
small.vertices=(small.vertices-bounds.mean(axis=0))/(bounds[1]-bounds[0])
mount_anchor=None
if kind=='faucet':
 foot=small.vertices[small.vertices[:,1]<-.47]
 mount_anchor=((foot.min(axis=0)+foot.max(axis=0))/2).tolist();mount_anchor[1]=-.5
# Texture-space UV remains unchanged; dimensions are applied at placement time.
gltf_uv=small.visual.uv.copy();gltf_uv[:,1]=1-gltf_uv[:,1]
textures={}
for key,field,size in [('color','baseColorTexture',2048),('rm','metallicRoughnessTexture',1024),('normal','normalTexture',1024)]:
 image=getattr(mesh.visual.material,field).convert('RGB');image.thumbnail((size,size),Image.Resampling.LANCZOS)
 name=kind+'-tripo-'+key+'.webp';image.save(out/name,quality=88,method=6)
 with Image.open(out/name) as check:check.load();assert check.size==image.size
 textures[key]=name
 setattr(small.visual.material,field,image)
# Smooth normals across UV seams; otherwise UV islands create visible faceting.
unique,inverse=np.unique(np.round(small.vertices,8),axis=0,return_inverse=True)
welded=trimesh.Trimesh(vertices=unique,faces=inverse[small.faces],process=False)
normals=welded.vertex_normals[inverse].copy()
# Coincident opposing faces can cancel at a few vertices; use an incident face.
for vertex in np.flatnonzero(np.linalg.norm(normals,axis=1)<1e-8):
 incident=np.flatnonzero(np.any(small.faces==vertex,axis=1));normals[vertex]=small.face_normals[incident[0]]
normals/=np.linalg.norm(normals,axis=1)[:,None]
small.vertex_normals=normals
arrays=[('position',small.vertices.astype('<f4'),3),('normal',small.vertex_normals.astype('<f4'),3),('uv',gltf_uv.astype('<f4'),2),('index',small.faces.astype('<u4').reshape(-1),1)]
attributes={};data=bytearray()
for name,array,size in arrays:
 attributes[name]={'offset':len(data),'count':int(array.size//size),'size':size,'type':'uint32' if name=='index' else 'float32'};data.extend(array.tobytes())
(out/(kind+'-tripo.bin')).write_bytes(data)
manifest={'version':1,'kind':kind,'generator':'Tripo H3.1','taskId':TASKS[kind],'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sourceBytes':source.stat().st_size,'sourceTriangles':len(mesh.faces),'triangles':len(small.faces),'vertices':len(small.vertices),'sourceBounds':mesh.bounds.tolist(),'cleanBounds':bounds.tolist(),'cleanup':cleanup,'front':'+Z','up':'+Y','bounds':[[-.5,-.5,-.5],[.5,.5,.5]],'buffer':kind+'-tripo.bin','byteLength':len(data),'attributes':attributes,'textures':textures}
if mount_anchor:
 manifest['mountAnchor']=mount_anchor
 manifest['nominalSize']=((bounds[1]-bounds[0])*330/(bounds[1,1]-bounds[0,1])).tolist()
(out/(kind+'-tripo.json')).write_text(json.dumps(manifest,indent=2)+'\n')
if len(sys.argv)>3:small.export(sys.argv[3])
print(json.dumps(manifest),flush=True)
