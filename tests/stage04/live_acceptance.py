"""Explicit live Stage 4 HTTP checks on the one hard-pinned staging origin.
No master republish, no production calls. Synthetic credentials are read from a private file.
"""
import base64,hashlib,json,subprocess,sys,tempfile
from pathlib import Path
from urllib.parse import urlencode
from uuid import uuid4
from tests.stage03.support import parts,part,template

ORIGIN='https://martin-forest-v2-staging-production.up.railway.app'
EVIDENCE=Path('docs/stage04/live-evidence.json')

def run(credential_path):
    if EVIDENCE.exists(): raise ValueError('Evidence exists; inspect instead of repeating live writes')
    credentials=json.loads(Path(credential_path).read_text())
    if not credentials['email'].endswith('@example.invalid'): raise ValueError('Synthetic operator required')
    with tempfile.TemporaryDirectory(prefix='mf-stage04-http-') as directory:
        root=Path(directory);jar=root/'cookies';jar.touch(mode=0o600)
        def request(method,path,body=None,version=None,key=None,expected=200,raw=False):
            args=['curl','-sS','--max-time','90','-X',method,'-H','Origin: '+ORIGIN,'-H','Content-Type: application/json','-b',str(jar),'-c',str(jar)]
            if version is not None: args+=['-H','If-Match: '+str(version)]
            if key: args+=['-H','Idempotency-Key: '+key]
            if body is not None:
                payload=root/'request.json';payload.write_text(json.dumps(body));payload.chmod(0o600);args+=['--data-binary','@'+str(payload)]
            response=subprocess.run(args+['-w','\n%{http_code}',ORIGIN+path],capture_output=True,check=True)
            content,status=response.stdout.rsplit(b'\n',1)
            if int(status)!=expected:
                code=''
                try: code=json.loads(content).get('detail',{}).get('code','')
                except Exception: pass
                raise RuntimeError(f'{method} {path}: HTTP {status.decode()}, {code}, expected {expected}')
            return content if raw else json.loads(content)
        def post(path,body,**kw): return request('POST','/api/v2'+path,body,**kw)
        def get(path,**kw): return request('GET','/api/v2'+path,**kw)
        assert request('GET','/health')['stage']=='4';post('/auth/login',credentials)
        active=get('/catalogue/releases')['active_release'];assert active=='e6db8155-91a6-4f15-9b89-ce2194b43373'
        candidates=get('/catalogue/materials?'+urlencode({'q':'621 PO','release':active}))['items']
        material=next(m for m in candidates if m['article']=='621 PO' and m['thickness']=='18' and m['length']=='2800' and m['width']=='2070')
        def detail(**extra): return {'detail_id':'finished-1','length':'600','width':'400','qty':3,'variant_id':material['variant_id'],'rotation':False,'grain':'none','route':'glued_18_18','packaging':True,'edges':{},**extra}
        raw_order=post('/orders',{'business_name':'STAGE4 SYNTHETIC master-price-incomplete fixture','preparation_mode':'self_prepared'},expected=201)
        raw_revision=post('/orders/'+raw_order['order_id']+'/revisions',{'catalogue_release_id':active,'reason':'Actual master provenance remains unapproved','details':[detail(route='solid',qty=1)]},version=1,expected=201)
        incomplete=post('/orders/'+raw_order['order_id']+'/calculations',{'revision_id':raw_revision['revision_id']},expected=201)
        assert incomplete['completeness']=='incomplete' and incomplete['total'] is None
        assert any(r['code']=='NC-05_APPROVED_MATERIAL_PRICE_REQUIRED' for r in incomplete['reasons'])
        submit_body={'revision_id':raw_revision['revision_id'],'preliminary_calculation_id':incomplete['calculation_id']};key=uuid4().hex
        submitted=post('/orders/'+raw_order['order_id']+'/submit',submit_body,version=2,key=key)
        assert post('/orders/'+raw_order['order_id']+'/submit',submit_body,version=2,key=key)==submitted
        post('/orders/'+raw_order['order_id']+'/submit',{**submit_body,'comment':'Different idempotent body'},version=2,key=key,expected=409)
        defaults=get('/financial/defaults');base=get('/financial/versions/production/'+defaults['production_profile_id'])
        meta={'source':'EXPLICIT SYNTHETIC STAGE4 ACCEPTANCE ONLY','source_date':'2026-09-23','reason':'Synthetic mechanism test, not a real sale policy','synthetic':True}
        profile=post('/financial/production-profiles',{**meta,'settings':base['settings'],'policies':{'edge_consumption':{'basis':'net'},
            'cutting_18':{'basis':'estimated_plan_excluding_trim','families':['board'],'include_glue_blanks':True},'glue_area':'finished_area','edge_classification':None}},expected=201)
        discounts=post('/financial/discount-profiles',{**meta,'materials':'10','edge_material':'20','services':'5'},expected=201)
        prices=post('/financial/price-books',{**meta,'release_id':active,'currency':'BYN','tax_convention':'Synthetic fixture; no real VAT assertion',
            'effective_from':'2026-09-23T00:00:00Z','entries':[{'item_id':material['variant_id'],'kind':'material','amount':'100','unit':'sheet'}]},expected=201)
        synthetic=post('/orders',{'business_name':'STAGE4 SYNTHETIC glue-and-discount fixture','preparation_mode':'self_prepared'},expected=201)
        post('/orders/'+synthetic['order_id']+'/financial-context',{'production_profile_id':profile['id'],'tariff_book_id':defaults['tariff_book_id'],
             'price_book_id':prices['id'],'discount_profile_id':discounts['id'],'reason':'Explicit synthetic order context only'},version=1,expected=201)
        rev=post('/orders/'+synthetic['order_id']+'/revisions',{'catalogue_release_id':active,'reason':'Synthetic explicit 18+18 route','details':[detail()]},version=1,expected=201)
        calculation=post('/orders/'+synthetic['order_id']+'/calculations',{'revision_id':rev['revision_id']},expected=201)
        assert calculation['completeness']=='complete' and calculation['synthetic'] and calculation['total'] is not None
        recipe=calculation['manufacturing_recipes'][0];assert (recipe['blank_length'],recipe['blank_width'],recipe['child_qty'])==('620','420',6)
        operations={l['operation']:l for l in calculation['lines']}
        assert operations['packaging']['quantity']=='0.72' and operations['glued_finish_cut']['quantity']=='3'
        before=get('/calculations/'+calculation['calculation_id'],raw=True)
        for field in ('preliminaryTotal','material_price','edge_price','discounts','tariff'):
            post('/orders/'+synthetic['order_id']+'/calculations',{'revision_id':rev['revision_id'],field:'0'},expected=422)
        assert get('/calculations/'+calculation['calculation_id'],raw=True)==before
        gate=post('/calculations/'+calculation['calculation_id']+'/fix',{'reason':'Verify gate without any production run'},expected=409)
        assert gate['detail']['code']=='BAZIS_RUN_REQUIRED'
        get('/calculations/'+calculation['calculation_id']+'/pdf',expected=404)
        submitted2=post('/orders/'+synthetic['order_id']+'/submit',{'revision_id':rev['revision_id'],'preliminary_calculation_id':calculation['calculation_id']},version=2,key=uuid4().hex)
        child=post('/orders/'+synthetic['order_id']+'/revisions',{'parent_revision_id':rev['revision_id'],'catalogue_release_id':active,
            'reason':'Manager changes finished dimensions in child revision','details':[detail(length='610')]},version=submitted2['optimistic_lock_version'],expected=201)
        assert child['parent_revision_id']==rev['revision_id'] and get('/calculations/'+calculation['calculation_id'],raw=True)==before
        # A genuinely saved problematic workbook follows manager-assisted submission, without calculation.
        assisted=post('/orders',{'business_name':'STAGE4 SYNTHETIC problematic source handoff','preparation_mode':'manager_assisted'},expected=201)
        tpl=post('/import-templates',{'name':'Stage4 synthetic problematic fixture','definition':template()},expected=201)
        source=parts([part(qty=0,article='UNKNOWN-STAGE04')])
        preview=post('/imports/preview',{'filename':'stage04-synthetic-problematic.xlsx','content_base64':base64.b64encode(source).decode(),
           'order_id':assisted['order_id'],'template_revision_id':tpl['template_revision_id'],'selected_sheets':['Parts']},expected=201)
        applied=post('/imports/'+preview['import_id']+'/confirm',{'mode':'add'},version=1)
        handoff=post('/orders/'+assisted['order_id']+'/submit',{'comment':'Please review unresolved material and zero quantity in saved source'},version=applied['optimistic_lock_version'],key=uuid4().hex)
        assert handoff['calculation_state']=='calculation_not_available'
        assert get('/orders/'+assisted['order_id']+'/calculations')['items']==[]
        assert get('/financial/defaults')==defaults and get('/catalogue/releases')['active_release']==active
        evidence={'active_release':active,'material_variant':material,'actual_master_incomplete':incomplete,'synthetic_calculation':calculation,
            'synthetic_financial_dto_sha256':hashlib.sha256(before).hexdigest(),'old_financial_dto_unchanged':True,'child_revision':child,
            'manager_assisted':handoff,'manager_assisted_raw_qty':preview['rows'][1]['original']['values']['qty'],
            'manager_assisted_source_sha256':hashlib.sha256(source).hexdigest(),'idempotent_submit':True,'changed_idempotency_body_http':409,
            'financial_injection_http':422,'final_gate':gate,'pdf_http':404,'global_defaults_unchanged':True,'no_production_calls':True}
        EVIDENCE.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({'live_stage4_http_pass':True,'actual_master_total':None,'synthetic_total':calculation['total'],
          'estimated_sheets':calculation['sheet_estimates'][0]['estimated_sheet_count'],'final_gate':'BAZIS_RUN_REQUIRED','manager_assisted_raw_qty':0}))

if __name__=='__main__': run(sys.argv[1])
