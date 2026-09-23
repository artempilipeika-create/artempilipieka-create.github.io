"""Software-only adversarial evidence tests. Fabricated temporary bytes; NO BAZIS proof."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import uuid

ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('validator',ROOT/'validate-evidence.py')
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
T='2026-09-23T12:00:00+00:00'

class ValidatorTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.p=Path(self.tmp.name)/'run';self.p.mkdir()
  e=json.loads((ROOT/'manifest.json').read_text())['fixtures'][0];self.e=e
  for folder in ('input','screenshots','outputs'): (self.p/folder).mkdir()
  shutil.copyfile(ROOT/e['input'],self.p/'input/fixture.oblx');shutil.copyfile(ROOT/e['sidecar'],self.p/'input/expected.json')
  for n in ('version','part','edges'): (self.p/f'screenshots/{n}.png').write_bytes(b'\x89PNG\r\n\x1a\nSOFTWARE TEST ONLY')
  (self.p/'outputs/native.txt').write_text('FABRICATED VALIDATOR TEST, NEVER NATIVE EVIDENCE')
  iso=json.loads((ROOT/'templates/isolation-review.json').read_text())
  for k in iso:
   if isinstance(iso[k],bool): iso[k]=True
  iso.update(test_root='C:\\IsolatedTest',reviewer_id='TEST',reviewed_at=T)
  self.write('isolation-review.json',iso)
  bazis={'file_version':'TEST','product_version':'TEST','sha256':'0'*64,'executable':'C:\\TEST.exe'}
  self.write('preflight.json',{'status':'PRECHECK CLEAR FOR MANUAL REVIEW','failures':[],'test_root':iso['test_root'],'isolation_review_sha256':v.digest(self.p/'isolation-review.json'),'machine_id':'SOFTWARE-TEST','bazis':bazis,'checked_at':T})
  self.write('input-check.json',{'fixture_id':e['id'],'sha256':e['sha256'],'status':'INPUT_INTEGRITY_ONLY','checked_at':T})
  obs=json.loads((ROOT/'templates/observations.json').read_text());obs.update(fixture_id=e['id'],run_id=str(uuid.uuid4()),operator_id='TEST',attestor_id='TEST',started_at=T,completed_at=T,bazis_file_version='TEST',mapping_version='TEST')
  for k in ('job_id','order_id','revision_id','calculation_id'):obs[k]=str(uuid.uuid4())
  for x in obs['observed'].values():x.update(value='not exposed in SOFTWARE TEST',ui_label='TEST',status='not_exposed_review',evidence=['screenshots/part.png'])
  part=json.loads((ROOT/e['sidecar']).read_text())['manufacturing']['parts'][0]
  obs['expected_comparison']={'blank_length':part['blank']['length'],'blank_width':part['blank']['width'],'blank_qty':part['blank']['qty'],'finished_length':part['finished_length'],'finished_width':part['finished_width'],'finished_qty':part['finished_qty'],'material_identity':part['material']['variant_id'],'grain':part['grain'],'rotation_allowed':part['rotation_allowed'],'edges':{k:x['edge']['article'] if x['edge'] else None for k,x in part['blank']['edges'].items()}}
  self.write('observations.json',obs)
  mapping=json.loads((ROOT/'templates/local-mapping.json').read_text());mapping['mapping_version']='TEST'
  for r in mapping['materials']:r.update(local_bazis_identity=r['cloud_identity'],local_name_code='TEST',mapping_source='TEST',verified_by='TEST',verified_at=T,status='verified_for_test',evidence=['screenshots/edges.png'])
  self.write('local-mapping.json',mapping)
  self.m={'schema_version':1,'kit_version':'mf-native-kit-1','status':'UNREVIEWED','native_pass':False,'fixture_id':e['id'],'run_id':obs['run_id'],'input_sha256':e['sha256'],'mapping_version':'TEST','collected_at':T,'bazis':bazis,'operator_id':'TEST','attestor_id':'TEST','warnings':[]}
  self.seal()
 def tearDown(self):self.tmp.cleanup()
 def write(self,n,x): (self.p/n).write_text(json.dumps(x))
 def edit(self,n,fn):
  x=json.loads((self.p/n).read_text());fn(x);self.write(n,x);self.seal()
 def seal(self):
  self.m['files']=[{'path':p.relative_to(self.p).as_posix(),'size':p.stat().st_size,'sha256':v.digest(p),'source_mtime_utc':T} for p in sorted(self.p.rglob('*')) if p.is_file() and p.name!='manifest.json']
  self.write('manifest.json',self.m)
 def missing(self):
  with self.assertRaises(v.Missing):v.validate(self.p)
 def test_complete_is_only_human_review(self):
  r=v.validate(self.p);self.assertEqual(r['status'],'READY_FOR_HUMAN_NATIVE_REVIEW');self.assertFalse(r['native_pass'])
 def test_modified_bytes(self):
  (self.p/'outputs/native.txt').write_text('tampered')
  with self.assertRaises(v.Mismatch):v.validate(self.p)
 def test_rehashed_wrong_input(self):
  (self.p/'input/fixture.oblx').write_text('wrong');self.seal()
  with self.assertRaises(v.Mismatch):v.validate(self.p)
 def test_rehashed_wrong_sidecar(self):
  (self.p/'input/expected.json').write_text('{}');self.seal()
  with self.assertRaises(v.Mismatch):v.validate(self.p)
 def test_wrong_quantity(self):
  self.edit('observations.json',lambda x:x['expected_comparison'].update(blank_qty=99));self.missing()
 def test_wrong_edge(self):
  self.edit('observations.json',lambda x:x['expected_comparison']['edges'].update(L1='SKU-W2'));self.missing()
 def test_wrong_grain(self):
  self.edit('observations.json',lambda x:x['expected_comparison'].update(grain='unrelated'));self.missing()
 def test_observed_geometry_mismatch(self):
  self.edit('observations.json',lambda x:x['observed']['blank_L'].update(status='observed',value=1));self.missing()
 def test_missing_screenshot(self):
  (self.p/'screenshots/part.png').unlink();self.seal();self.missing()
 def test_unverified_mapping(self):
  self.edit('local-mapping.json',lambda x:x['materials'][0].update(status='needs_material_mapping'));self.missing()
 def test_mapping_version(self):
  self.edit('local-mapping.json',lambda x:x.update(mapping_version='WRONG'));self.missing()
 def test_reference_missing_original(self):
  self.m['fixture_id']='reference-69';self.seal()
  with self.assertRaises(v.Mismatch):v.validate(self.p)
 def test_preflight_fail(self):
  self.edit('preflight.json',lambda x:x.update(status='PRECHECK FAIL'));self.missing()
 def test_fatal_error(self):
  self.edit('observations.json',lambda x:x.update(fatal_errors=['fatal']));self.missing()
 def test_traversal(self):
  self.m['files'][0]['path']='../outside';self.write('manifest.json',self.m);self.missing()
 def test_unlisted_file(self):
  (self.p/'unlisted.txt').write_text('secret');self.missing()
 def test_duplicate_inventory(self):
  self.m['files'].append(copy.deepcopy(self.m['files'][0]));self.write('manifest.json',self.m);self.missing()
 def test_no_self_awarded_pass(self):
  self.m['native_pass']=True;self.write('manifest.json',self.m);self.missing()
 def test_symlink(self):
  (self.p/'outputs/link').symlink_to(self.p/'outputs/native.txt');self.missing()
 def test_version_binding(self):
  self.edit('observations.json',lambda x:x.update(bazis_file_version='DIFFERENT'));self.missing()
 def test_fixture_pins(self):
  for e in json.loads((ROOT/'manifest.json').read_text())['fixtures']:
   if e['id']=='reference-69':continue
   self.assertEqual(v.digest(ROOT/e['input']),e['sha256'])
   self.assertEqual(v.digest(ROOT/e['sidecar']),e['sidecar_sha256'])

if __name__=='__main__':unittest.main(verbosity=2)
