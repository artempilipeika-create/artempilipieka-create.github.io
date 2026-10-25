"""Export reviewed Tripo comparison quadrants as same-origin option pictures."""
import json
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'docs/tripo-executions-20261026'
target=ROOT/'backend/v2/cabinet_assets/planner/execution-card-images'
target.mkdir(exist_ok=True)
jobs=json.loads((source/'jobs.json').read_text())
count=0
for job in jobs:
 if job.get('status')!='accepted':continue
 original=source/'output'/(job['name']+'.png')
 archive=source/'output'/(job['name']+'.webp')
 image=Image.open(original if original.exists() else archive).convert('RGB')
 width,height=image.size
 assert width==height and width>=1024,(job['name'],image.size)
 for index,cell in enumerate(job['cells']):
  if cell.get('skip'):continue
  x=(index%2)*width//2;y=(index//2)*height//2
  image.crop((x,y,x+width//2,y+height//2)).save(target/cell['file'].replace('.png','.webp'),quality=94,method=6)
  count+=1
print(json.dumps({'exported':count,'reviewed_sheets':sum(j.get('status')=='accepted' for j in jobs)}))
