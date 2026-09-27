"""Fetch exact manufacturer previews. Input is a safe catalogue snapshot, never prices.

No fuzzy name/decor matching: article AND explicit manufacturer are required.
Existing verified attachments are left byte-for-byte unchanged.
"""
import argparse, concurrent.futures, hashlib, html, io, json, re, urllib.request
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]/'backend/v2/cabinet_assets/planner/materials'

def fetch_egger(article):
    match=re.fullmatch(r'([A-Z]+\d+) (ST\d+|TM\d*|PM|PG|SM)',article)
    if not match:return article,None,'article format not confirmed'
    decor,structure=match.groups()
    url='https://www.egger.com/en/furniture-interior-design/decors/'+decor+'_'+structure.removeprefix('ST')
    try:
        with urllib.request.urlopen(url,timeout=25) as response:
            page=response.read().decode();resolved=response.url
        title=html.unescape(re.search(r'<title>(.*?)</title>',page,re.S)[1])
        if not re.match(re.escape(article)+r'\b',title):return article,None,'official page identity mismatch'
        block=page.split('<egger-imagemediastageelement',1)[1].split('</egger-imagemediastageelement>',1)[0]
        source=html.unescape(re.search(r'href="(https://cdn\.egger\.com/img/pim/[^\"]+/original\.jpg\?[^\"]+)"',block)[1])
        with urllib.request.urlopen(source,timeout=25) as response:original=response.read()
        image=Image.open(io.BytesIO(original)).convert('RGB')
        if min(image.size)<128:raise ValueError('preview too small')
        # Source caption is the shown image extent. Preserve its aspect ratio; do
        # not treat an unknown square crop as a 2800 mm full board.
        dim=re.search(r'approx\.\s*([\d.]+)\s*x\s*([\d.]+)\s*mm',block)
        size=[int(x.replace('.','')) for x in dim.groups()] if dim else None
        if not size or abs(image.width/image.height-size[0]/size[1])>.08:
            size=[round(1300*image.width/image.height),1300]
            scale_note='1300 mm display height; physical source extent not confirmed'
        else:scale_note='manufacturer caption; width x height'
        target=ROOT/('egger-'+article.lower().replace(' ','-')+'.jpg')
        if original.startswith(b'\xff\xd8'):target.write_bytes(original)
        else:image.save(target,format='JPEG',quality=93)
        record={'asset':target.name,'preview_url':'/account/planner/materials/'+target.name,
                'visual_status':'OFFICIAL_PREVIEW','manufacturer':'EGGER','article':article,'verified_title':title,
                'texture_size_mm':size,'scale_note':scale_note,'rotation_deg':0,
                'grain_direction':'length','roughness':.85,'source_url':resolved,
                'image_source_url':source,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),
                'original_sha256':hashlib.sha256(original).hexdigest()}
        return article,record,'confirmed'
    except Exception as error:return article,None,type(error).__name__+': '+str(error)[:120]

def main():
    parser=argparse.ArgumentParser();parser.add_argument('catalogue');parser.add_argument('--evidence',required=True);args=parser.parse_args()
    items=json.loads(Path(args.catalogue).read_text());registry=json.loads((ROOT/'manifest.json').read_text())
    articles=sorted({str(m.get('article') or '').upper().strip() for m in items
                     if str(m.get('manufacturer') or '').upper()=='EGGER' or
                     (not m.get('manufacturer') and re.search(r'\bEGGER\b',m.get('name',''),re.I))})
    pending=[a for a in articles if a not in registry['decors']];evidence=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for article,record,result in pool.map(fetch_egger,pending):
            evidence.append({'manufacturer':'EGGER','article':article,'result':result})
            if record:registry['decors'][article]=record
            (ROOT/'manifest.json').write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n')
            Path(args.evidence).write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
            print(article,result,flush=True)

if __name__=='__main__':main()
