#!/usr/bin/env python3
"""Offline integrity/completeness review. Never imports app, calls API or approves native."""
import argparse
from datetime import datetime
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path, PurePosixPath
import uuid

KIT = Path(__file__).resolve().parent
MAX_FILE = 256 * 1024 * 1024
STATES = ('READY_FOR_HUMAN_NATIVE_REVIEW','INCOMPLETE_EVIDENCE','HASH_MISMATCH')

class Missing(Exception): pass
class Mismatch(Exception): pass

def require(condition, message):
    if not condition: raise Missing(message)

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):
    require(path.stat().st_size <= 4*1024*1024, 'JSON too large')
    def unique(pairs):
        d={}
        for k,v in pairs:
            if k in d: raise Missing('Duplicate JSON key')
            d[k]=v
        return d
    return json.loads(path.read_text(encoding='utf-8-sig'), object_pairs_hook=unique)

def safe(root, relative):
    require(isinstance(relative,str) and '\\' not in relative and ':' not in relative, 'Unsafe relative path')
    p=PurePosixPath(relative)
    require(not p.is_absolute() and all(x not in ('..','.') for x in p.parts) and bool(p.parts), 'Path traversal')
    f=root
    for component in p.parts:
        f=f/component
        require(not f.is_symlink(), 'Symlink forbidden')
    require(f.is_file() and f.stat().st_size<=MAX_FILE, 'Missing/oversize file: '+relative)
    require(f.resolve().is_relative_to(root.resolve()), 'Outside package')
    return f

def stamp(value):
    t=datetime.fromisoformat(value.replace('Z','+00:00'))
    require(t.tzinfo is not None,'Timestamp needs timezone')
    return t

def text(value): return isinstance(value,str) and bool(value.strip()) and value not in ('NOT VERIFIED','TODO','UNKNOWN')
def same_number(a,b):
    try: return not isinstance(a,bool) and Decimal(str(a))==Decimal(str(b))
    except (InvalidOperation, ValueError): return False

def validate(package):
    require(package.is_dir() and not package.is_symlink(),'Package directory required')
    registry=read(KIT/'manifest.json'); m=read(safe(package,'manifest.json'))
    require(m.get('schema_version')==1 and m.get('kit_version')==registry['kit_version'],'Schema/kit version')
    require(m.get('native_pass') is False and m.get('status')=='UNREVIEWED','Package must not claim native PASS')
    matches=[f for f in registry['fixtures'] if f['id']==m.get('fixture_id')]
    require(len(matches)==1,'Unknown fixture'); expected=matches[0]
    require(str(uuid.UUID(m['run_id']))==m['run_id'],'Run UUID')
    inventory=m['files']; require(isinstance(inventory,list) and 0<len(inventory)<=500,'Inventory limit')
    paths={}; total=0
    for row in inventory:
        name=row['path']; require(name.casefold() not in paths,'Duplicate case-insensitive path')
        f=safe(package,name); total+=f.stat().st_size
        if digest(f)!=row['sha256'] or f.stat().st_size!=row['size']: raise Mismatch(name)
        stamp(row['source_mtime_utc']); paths[name.casefold()]=name
    require(total<=1024**3,'Package too large')
    actual=[]
    # Do not follow symlink directories or files.
    import os
    for directory, dirs, files in os.walk(package,followlinks=False):
        require(all(not (Path(directory)/d).is_symlink() for d in dirs),'Symlink directory')
        for n in files:
            f=Path(directory)/n; require(not f.is_symlink(),'Symlink file')
            if f!=package/'manifest.json': actual.append(f.relative_to(package).as_posix())
    require(set(actual)==set(paths.values()),'Unlisted/missing artifacts')
    required=['input/fixture.oblx','input/expected.json','preflight.json','isolation-review.json','input-check.json','observations.json','local-mapping.json']
    require(all(n in paths.values() for n in required),'Required document missing')
    f=safe(package,'input/fixture.oblx'); s=safe(package,'input/expected.json')
    if digest(f)!=expected['sha256'] or f.stat().st_size!=expected['size'] or digest(s)!=expected['sidecar_sha256'] or m['input_sha256']!=expected['sha256']: raise Mismatch('Pinned input/sidecar identity')
    check=read(safe(package,'input-check.json'))
    require(check['fixture_id']==m['fixture_id'] and check['sha256']==expected['sha256'] and check['status']=='INPUT_INTEGRITY_ONLY','Pre-import input check')
    pre=read(safe(package,'preflight.json')); obs=read(safe(package,'observations.json')); mapping=read(safe(package,'local-mapping.json'))
    require(pre['status']=='PRECHECK CLEAR FOR MANUAL REVIEW' and not pre['failures'],'Preflight failed')
    iso=read(safe(package,'isolation-review.json'))
    if digest(safe(package,'isolation-review.json'))!=pre['isolation_review_sha256']: raise Mismatch('Isolation review')
    require(iso['test_root']==pre['test_root'] and text(iso['reviewer_id']),'Root review binding')
    for key in ('dedicated_test_root','no_production_data','no_production_agent','no_machine_connection','no_sync_or_watcher_access','reviewed_process_service_task_inventory'):
        require(iso.get(key) is True,'Isolation flag '+key)
    require(text(pre['machine_id']) and text(pre['bazis']['file_version']) and text(pre['bazis']['product_version']) and len(pre['bazis']['sha256'])==64,'Runner/version/hash')
    require(m['bazis']==pre['bazis'] and obs['bazis_file_version']==pre['bazis']['file_version'],'BAZIS version binding')
    require(obs['fixture_id']==m['fixture_id'] and obs['run_id']==m['run_id'] and obs['native_execution']=='manual','Run binding')
    for key in ('order_id','revision_id','job_id','calculation_id'):
        require(str(uuid.UUID(obs[key]))==obs[key],'Offline correlation UUID '+key)
    require(obs['identity_scope']=='offline-calibration-only; not server job IDs','No fake server identity')
    require(text(obs['operator_id']) and text(obs['attestor_id']) and m['operator_id']==obs['operator_id'] and m['attestor_id']==obs['attestor_id'],'Operator identity')
    require(stamp(pre['checked_at'])<=stamp(check['checked_at'])<=stamp(obs['started_at'])<=stamp(obs['completed_at'])<=stamp(m['collected_at']),'Run time ordering')
    require(not obs['fatal_errors'] and isinstance(obs['warnings'],list) and m['warnings']==obs['warnings'],'Fatal errors/warnings')
    require(text(mapping['mapping_version']) and mapping['mapping_version']==m['mapping_version']==obs['mapping_version'],'Mapping version')
    def refs(values, prefix=None):
        require(isinstance(values,list) and bool(values),'Evidence references absent')
        require(all(v in paths.values() and v.startswith(('screenshots/','outputs/')) and (not prefix or v.startswith(prefix)) for v in values),'Evidence reference missing')
    require(any(n.startswith('outputs/') and safe(package,n).stat().st_size>0 for n in paths.values()),'Native output missing')
    shots=[n for n in paths.values() if n.startswith('screenshots/') and Path(n).suffix.lower() in ('.png','.jpg','.jpeg')]
    require(len(shots)>=3,'At least three native screenshots required')
    for n in shots:
        b=safe(package,n).read_bytes()
        require(b.startswith(b'\x89PNG\r\n\x1a\n') or b.startswith(b'\xff\xd8\xff'),'Invalid screenshot format')
    for key in ('material','thickness','qty','finished_L','finished_W','blank_L','blank_W','grain','rotation_allowed','Orient','Rotation','X','Y','L_W_correspondence','WithoutBut','Allowance','Overhung','L1','L2','W1','W2','child_final_link','stages_layers','finished_qty','material_consumption','L_plus_W_stage'):
        v=obs['observed'][key]
        require(v['status'] in ('observed','not_exposed_review') and v['value'] is not None and text(v['ui_label']),'Observation incomplete: '+key)
        refs(v['evidence'])
    for key in ('material','qty','L_W_correspondence','grain','rotation_allowed','L1','L2','W1','W2'):
        refs(obs['observed'][key]['evidence'],'screenshots/')
    side=read(s)
    if m['fixture_id']=='reference-69':
        r=obs['reference_comparison']
        require(all(r[k]==side[k] for k in ('materials','positions','parts')),'Reference totals mismatch')
        refs(r['exact_codes_edges_review'])
        needed=None
    else:
        part=side['manufacturing']['parts'][0]; c=obs['expected_comparison']; blank=part['blank']
        for key,want in {'blank_length':blank['length'],'blank_width':blank['width'],'blank_qty':blank['qty'],'finished_length':part['finished_length'],'finished_width':part['finished_width'],'finished_qty':part['finished_qty']}.items():
            require(same_number(c[key],want),'Expected geometry/quantity mismatch: '+key)
        for key, want in {'blank_L':blank['length'],'blank_W':blank['width'],'qty':blank['qty'],'finished_L':part['finished_length'],'finished_W':part['finished_width'],'finished_qty':part['finished_qty']}.items():
            v=obs['observed'][key]
            if v['status']=='observed': require(same_number(v['value'],want),'Observed geometry mismatch: '+key)
        require(c['material_identity']==part['material']['variant_id'] and c['grain']==part['grain'] and c['rotation_allowed'] is part['rotation_allowed'],'Material/grain/rotation mismatch')
        for side_name,v in blank['edges'].items():
            want=v['edge']['article'] if v['edge'] else None
            require(c['edges'][side_name]==want,'Edge mismatch '+side_name)
            observed=obs['observed'][side_name]
            if observed['status']=='observed': require(observed['value']==(want if want is not None else 'none'),'Observed edge mismatch '+side_name)
        for key,want in {'grain':part['grain'],'rotation_allowed':part['rotation_allowed'],'material':part['material']['variant_id']}.items():
            observed=obs['observed'][key]
            if observed['status']=='observed': require(observed['value']==want,'Observed property mismatch '+key)
        needed={part['material']['variant_id']:part['material']['identity_sha256']}
        for v in part['finished_edges'].values():
            if v['edge']: needed[v['edge']['edge_id']]=v['edge']['identity_sha256']
    materials=mapping['materials']; require(isinstance(materials,list) and materials,'Mapping missing')
    require(len({x['cloud_identity'] for x in materials})==len(materials),'Duplicate mapping')
    for row in materials:
        for key in ('cloud_identity','local_bazis_identity','local_name_code','mapping_source','verified_by','manufacturer','article_code'):
            require(text(row.get(key)),'needs_material_mapping: '+key)
        require(row['status']=='verified_for_test' and row.get('thickness') is not None and row.get('format') is not None,'needs_material_mapping')
        stamp(row['verified_at']); refs(row['evidence'])
    if needed:
        actual={r['cloud_identity']:r.get('identity_sha256') for r in materials}
        require(all(actual.get(k)==v for k,v in needed.items()),'Exact mapping identity missing')
    return {'status':STATES[0],'issues':[],'native_pass':False,'note':'Integrity and declared observations only. Human native review/signature/profile activation are separate. not_exposed_review remains an unresolved invariant.'}

def main():
    p=argparse.ArgumentParser(); p.add_argument('package',type=Path); args=p.parse_args()
    try: result=validate(args.package)
    except Mismatch as e: result={'status':STATES[2],'issues':[str(e)],'native_pass':False}
    except (Missing, OSError, ValueError, KeyError, TypeError, AttributeError) as e: result={'status':STATES[1],'issues':[str(e)],'native_pass':False}
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 0 if result['status']==STATES[0] else 1
if __name__=='__main__': raise SystemExit(main())
