"""Review exact GLB inputs before any paid Tripo processing."""
import os
os.environ['PYOPENGL_PLATFORM']='egl'
import json,sys
from pathlib import Path
import numpy as np
np.infty=np.inf
import trimesh,pyrender
from PIL import Image,ImageDraw,ImageFont

root=Path(sys.argv[1]);data=json.loads((root/'input/manifest.json').read_text())
out=root/'before';out.mkdir(exist_ok=True)
cellw,cellh=320,355
sheet=Image.new('RGB',(cellw*5,cellh*5+125),'#f2f0eb')
d=ImageDraw.Draw(sheet)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
head=ImageFont.truetype(font,28);small=ImageFont.truetype(font,15)
d.text((25,20),'MARTIN FOREST · Новые модули',font=head,fill='#173d30')
d.text((25,65),'Исходные модели ДО Tripo · 25 исполнений · точная геометрия корпуса',font=small,fill='#435449')
renderer=pyrender.OffscreenRenderer(320,285)
for idx,e in enumerate(data['entries']):
    model=trimesh.load(root/'input'/e['file'],force='scene',process=False)
    scene=pyrender.Scene.from_trimesh_scene(model,bg_color=[.94,.93,.90,1],ambient_light=[.38,.38,.38])
    lo,hi=model.bounds;target=(lo+hi)/2;size=hi-lo
    z=np.array([.8,.38,1.5]);z/=np.linalg.norm(z);x=np.cross([0,1,0],z);x/=np.linalg.norm(x);y=np.cross(z,x)
    corners=np.array([[a,b,c] for a in [lo[0],hi[0]] for b in [lo[1],hi[1]] for c in [lo[2],hi[2]]])-target
    half=max(np.max(np.abs(corners@y))*1.15,np.max(np.abs(corners@x))*285/320*1.15)
    pose=np.eye(4);pose[:3,:3]=np.column_stack([x,y,z]);pose[:3,3]=target+z*5
    scene.add(pyrender.OrthographicCamera(xmag=half*320/285,ymag=half,znear=.01,zfar=20),pose=pose)
    scene.add(pyrender.DirectionalLight(color=[1,.98,.95],intensity=2.3),pose=pose)
    color,_=renderer.render(scene)
    im=Image.fromarray(color);im.save(out/(Path(e['file']).stem+'.png'))
    ox=idx%5*cellw;oy=125+idx//5*cellh;sheet.paste(im,(ox,oy))
    if e['family']=='open-tall':
        title='Открытый пенал';v=e['light_system'];detail='Без подсветки' if v=='none' else ('AQ 4×8' if v=='aq-4x8' else 'LIRA 17,5×6,5')+' · '+{'left':'слева','right':'справа','both':'две стороны'}[e['lighting']]
    else:
        title=('Карго' if e['family']=='cargo' else 'Сушка')+' · '+e['brand'].upper().replace('_',' ')
        detail=('Gola' if e['execution']=='gola' else 'С ручкой')+((' · '+e['system']) if e.get('system') else '')
    d.text((ox+14,oy+287),f'{idx+1:02d}  {title}',font=small,fill='#173d30')
    d.text((ox+14,oy+312),detail,font=small,fill='#526356')
renderer.delete();sheet.save(root/'input-review.jpg',quality=92)
print(root/'input-review.jpg')
