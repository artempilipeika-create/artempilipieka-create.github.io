"""Explicit live acceptance runner. Hard-pinned staging URL; no production or Agent calls.
Usage: python -m tests.stage03.live_acceptance ingest|verify MASTER_PATH CREDENTIALS_PATH
Credentials file contains a freshly provisioned synthetic operator and is never printed.
"""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from urllib.parse import urlencode
from .support import parts,part,template

ORIGIN='https://martin-forest-v2-staging-production.up.railway.app'
EVIDENCE=Path('docs/stage03/live-evidence.json')

def run(mode,master_path,credential_path):
    credentials=json.loads(Path(credential_path).read_text())
    if not credentials['email'].endswith('@example.invalid'): raise ValueError('Synthetic operator required')
    with tempfile.TemporaryDirectory(prefix='mf-stage03-http-') as directory:
        root=Path(directory);jar=root/'cookies';jar.touch(mode=0o600)
        def request(method,path,body=None,version=None,expected=200,raw=False):
            args=['curl','-sS','--max-time','90','-X',method,'-H','Origin: '+ORIGIN,
                  '-H','Content-Type: application/json','-b',str(jar),'-c',str(jar)]
            if version is not None: args+=['-H','If-Match: '+str(version)]
            if body is not None:
                payload=root/'request.json';payload.write_text(json.dumps(body));payload.chmod(0o600)
                args+=['--data-binary','@'+str(payload)]
            result=subprocess.run(args+['-w','\n%{http_code}',ORIGIN+path],capture_output=True,check=True)
            content,status=result.stdout.rsplit(b'\n',1)
            if int(status)!=expected: raise RuntimeError(f'{method} {path}: HTTP {status.decode()} (expected {expected})')
            return content if raw else json.loads(content)
        def post(path,body,**kw): return request('POST','/api/v2'+path,body,**kw)
        def get(path,**kw): return request('GET','/api/v2'+path,**kw)
        assert request('GET','/health')['stage']=='3'
        post('/auth/login',credentials)
        master=Path(master_path).read_bytes();sha=hashlib.sha256(master).hexdigest()
        assert sha=='54c6f737f0bafecc3dc5df4ed14b573b7e2f5ab0c83e626e5e79fc296c641f4a'
        if mode=='verify':
            evidence=json.loads(EVIDENCE.read_text())
            rows=get('/orders/'+evidence['draft_order_id']+'/draft/rows')['rows']
            assert rows[0]['snapshot']['values']['qty']==0
            assert rows[0]['snapshot']['edges']['L1']['mode']=='manual_override'
            assert rows[0]['snapshot']['edges']['L1']['edge_id'] is None
            assert get('/catalogue/releases')['active_release']==evidence['active_release']
            cache=get('/catalogue/releases/'+evidence['active_release']+'/data.js',raw=True)
            assert hashlib.sha256(cache).hexdigest()==evidence['cache_sha256']
            evidence['after_redeploy']={'draft_qty_zero':True,'manual_none':True,'active_release':True,'cache_identical':True}
            EVIDENCE.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
            print(json.dumps({'redeploy_verified':True,'draft_qty':0,'catalogue_items':evidence['published_items']}))
            return
        if mode!='ingest': raise ValueError('Unknown mode')
        if EVIDENCE.exists(): raise ValueError('Evidence exists; inspect instead of repeating live writes')
        encoded=base64.b64encode(master).decode()
        payload={'filename':Path(master_path).name,'content_base64':encoded,'source_namespace':'master.u2'}
        first=post('/catalogue/imports',payload,expected=201);iid=first['import_id']
        report=get('/catalogue/imports/'+iid);counts=report['report']['dispositions']
        assert sum(counts.values())==22139 and counts['error']==0
        assert report['sha256']==sha
        r1=post('/catalogue/imports/'+iid+'/publish',{'reason':'Stage 3 master validated; mixed classes and unapproved units remain in review',
                'accept_review_exclusion':True,'expected_active_release':None})['release_id']
        expected=json.loads(Path('docs/stage03/master-evidence.json').read_text())
        assert counts=={**{'published':0,'review':0,'excluded':0,'error':0,'duplicate':0},**expected['dispositions']}
        searches={}
        for q in ['ЛХДФ','ХДФ','HDF','U708/U5034']:
            result=get('/catalogue/materials?'+urlencode({'q':q}))
            assert result['kind']=='candidates' and result['total']==(1 if q=='U708/U5034' else 5)
            searches[q]=result['items']
        expected_ids={h['variant_id'] for h in expected['hdf']}
        assert {h['variant_id'] for h in searches['HDF']}==expected_ids
        for h in searches['HDF']:
            assert get('/catalogue/materials/'+h['variant_id'])['variant_id']==h['variant_id']
        negative=get('/catalogue/imports/'+iid+'?offset=10747&limit=5')['rows']
        assert [r['row_number'] for r in negative]==list(range(10749,10754))
        assert all(r['disposition']=='excluded' and r['variant_id'] is None for r in negative)
        request('GET','/api/v2/files/'+report['file_id']+'/download',expected=403)
        request('GET','/static/'+report['file_id'],expected=404)
        cache=get('/catalogue/releases/'+r1+'/data.js',raw=True)
        assert cache==get('/catalogue/releases/'+r1+'/data.js',raw=True)
        for forbidden in (b'raw_value',b'storage_key',b'price_entry',b'source_namespace',b'identity_signature'): assert forbidden not in cache
        order=post('/orders',{'business_name':'STAGE 3 SYNTHETIC ACCEPTANCE — NOT PRODUCTION'},expected=201)
        tpl=post('/import-templates',{'name':'Stage3 synthetic validation','definition':template()},expected=201)
        xlsx=parts([part(qty=0,article='621 PO',material='UNKNOWN 621 PO')])
        preview=post('/imports/preview',{'filename':'stage03-synthetic.xlsx','content_base64':base64.b64encode(xlsx).decode(),
                     'order_id':order['order_id'],'template_revision_id':tpl['template_revision_id'],'selected_sheets':['Parts']},expected=201)
        assert preview['rows'][1]['original']['values']['qty']==0
        applied=post('/imports/'+preview['import_id']+'/confirm',{'mode':'add'},version=1)
        assert post('/imports/'+preview['import_id']+'/confirm',{'mode':'add'},version=1)==applied
        row=get('/orders/'+order['order_id']+'/draft/rows')['rows'][0];path='/orders/'+order['order_id']+'/draft/rows/'+row['draft_row_id']
        chosen=next(h for h in searches['HDF'] if h['article'] is None)
        result=post(path+'/material',{'variant_id':chosen['variant_id'],'reason':'Explicit selection of articleless exact variant'},version=applied['optimistic_lock_version'])
        result=post(path+'/edges',{'side':'L1','action':'manual','edge_id':None,'reason':'Explicit manual NONE'},version=result['optimistic_lock_version'])
        result=post(path+'/auto',{'reason':'Verify manual NONE survives AUTO'},version=result['optimistic_lock_version'])
        assert result['snapshot']['edges']['L1']['mode']=='manual_override' and result['snapshot']['edges']['L1']['edge_id'] is None
        assert result['snapshot']['resolution']['selected']['variant_id']==chosen['variant_id']
        assert result['snapshot']['values']['qty']==0
        pinned=result['snapshot']
        second=post('/catalogue/imports',payload,expected=201)
        assert not second['report']['added'] and not second['report']['inactive'] and not second['report']['price_changes']
        r2=post('/catalogue/imports/'+second['import_id']+'/publish',{'reason':'Staging identical master release to verify pointer rollback',
            'accept_review_exclusion':True,'expected_active_release':r1})['release_id']
        assert get('/orders/'+order['order_id']+'/draft/rows')['rows'][0]['snapshot']==pinned
        post('/catalogue/releases/'+r1+'/activate',{'reason':'Acceptance rollback to first Stage 3 release'})
        assert get('/orders/'+order['order_id']+'/draft/rows')['rows'][0]['snapshot']==pinned
        evidence={'runtime_commit':'267ed0cf8ac4439f82543dec1a79bad67fd4de63','source_sha256':sha,'source_filename':Path(master_path).name,
             'import_id':iid,'repeat_import_id':second['import_id'],'raw_source_file_id':report['file_id'],
             'active_release':r1,'rollback_from_release':r2,'source_rows':22139,'dispositions':counts,
             'published_items':counts['published'],'search':searches,'negative_hdf':negative,'cache_sha256':hashlib.sha256(cache).hexdigest(),
             'private_source_http_status':403,'static_source_http_status':404,
             'draft_order_id':order['order_id'],'draft_row_id':row['draft_row_id'],'qty_zero_confirm_reload':True,
             'manual_none_auto_reload':True,'manual_material_auto_unchanged':True,'release_rollback_draft_unchanged':True,
             'idempotent_confirm':True,'stage4_actions':False}
        EVIDENCE.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({'master_imported':True,'source_rows':22139,'dispositions':counts,'hdf_count':5,'draft_qty_zero':True,'rollback':True}))
if __name__=='__main__': run(*sys.argv[1:])

