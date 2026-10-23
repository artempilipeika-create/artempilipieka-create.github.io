"""Simplify the user-supplied Tripo socket without a new paid generation.
Usage: python scripts/build-socket-asset.py /absolute/path/to/source.glb [preview.glb]
Requires numpy, trimesh, Pillow, pymeshlab 2025.7.post1. Original stays in Library.
"""
import hashlib,json,pathlib,sys
import numpy as np
import trimesh,pymeshlab
from PIL import Image
root=pathlib.Path(__file__).resolve().parents[1]
out=root/'backend/v2/cabinet_assets/planner/room-assets';out.mkdir(exist_ok=True)
source=pathlib.Path(sys.argv[1]);scene=trimesh.load(source,process=False)
assert len(scene.geometry)==1
mesh=next(iter(scene.geometry.values()))
print('Original:',len(mesh.vertices),'vertices,',len(mesh.faces),'triangles',flush=True)
ms=pymeshlab.MeshSet();ms.load_new_mesh(str(source))
assert np.allclose(ms.current_mesh().vertex_matrix(),mesh.vertices)
original_uv=mesh.visual.uv[mesh.faces].reshape(-1,2)
lab_uv=ms.current_mesh().wedge_tex_coord_matrix()
flip_v=bool(np.allclose(lab_uv,original_uv))
print('MeshLab UV matches Trimesh:',flip_v,flush=True)
if not flip_v:
 original_uv[:,1]=1-original_uv[:,1]
 assert np.allclose(lab_uv,original_uv), 'Unexpected source UV layout'
# Weld duplicated seam vertices while preserving per-corner texture coordinates.
ms.apply_filter('meshing_remove_duplicate_vertices')
print('Welded vertices:',ms.current_mesh().vertex_number(),flush=True)
ms.apply_filter('meshing_decimation_quadric_edge_collapse_with_texture',targetfacenum=20000,qualitythr=.3,extratcoordw=1,preserveboundary=True,preservenormal=True,planarquadric=True)
m=ms.current_mesh();faces=m.face_matrix();verts=m.vertex_matrix();uv=m.wedge_tex_coord_matrix()
# Split only UV seams. Normalize the controlled asset to a centred unit box;
# the editor's measured dimensions are applied independently at placement time.
rows=np.concatenate([verts[faces.reshape(-1)],uv],axis=1)
rows,inverse=np.unique(rows,axis=0,return_inverse=True)
pos=rows[:,:3];bounds=np.array([pos.min(axis=0),pos.max(axis=0)])
pos=(pos-bounds.mean(axis=0))/(bounds[1]-bounds[0])
small=trimesh.Trimesh(vertices=pos,faces=inverse.reshape(-1,3),process=False)
tri_uv=rows[:,3:].copy()
if not flip_v: tri_uv[:,1]=1-tri_uv[:,1]
small.visual=trimesh.visual.TextureVisuals(uv=tri_uv,material=mesh.visual.material.copy())
gltf_uv=tri_uv.copy();gltf_uv[:,1]=1-gltf_uv[:,1]
# Keep the material maps on our own origin, compatible with the existing CSP.
textures={}
for key,field,size in [('color','baseColorTexture',1024),('rm','metallicRoughnessTexture',512),('normal','normalTexture',512)]:
 image=getattr(mesh.visual.material,field).convert('RGB');image.thumbnail((size,size),Image.Resampling.LANCZOS)
 name='socket-tripo-'+key+'.webp';image.save(out/name,quality=88,method=6);textures[key]=name
 setattr(small.visual.material,field,image)
arrays=[('position',small.vertices.astype('<f4'),3),('normal',small.vertex_normals.astype('<f4'),3),('uv',gltf_uv.astype('<f4'),2),('index',small.faces.astype('<u4').reshape(-1),1)]
attributes={};data=bytearray()
for name,array,size in arrays:
 attributes[name]={'offset':len(data),'count':int(array.size//size),'size':size,'type':'uint32' if name=='index' else 'float32'};data.extend(array.tobytes())
(out/'socket-tripo.bin').write_bytes(data)
manifest={'version':1,'generator':'Tripo H3.1','taskId':'092f8fb2-22f5-43e0-be1e-740d633766b3','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sourceBytes':source.stat().st_size,'sourceTriangles':len(mesh.faces),'triangles':len(small.faces),'vertices':len(small.vertices),'sourceBounds':bounds.tolist(),'front':'+Z','up':'+Y','bounds':[[-.5,-.5,-.5],[.5,.5,.5]],'buffer':'socket-tripo.bin','byteLength':len(data),'attributes':attributes,'textures':textures}
(out/'socket-tripo.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Temporary portable model for offline visual verification, not served by the site.
if len(sys.argv)>2: small.export(sys.argv[2])
print(json.dumps(manifest),flush=True)
