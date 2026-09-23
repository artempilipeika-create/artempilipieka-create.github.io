"""Explicit once-only fake staging consumer. It never starts BAZIS or production."""
import argparse,base64,json,os,time,urllib.request,urllib.parse,xml.etree.ElementTree as ET
from datetime import datetime,timezone
from pathlib import Path
from uuid import uuid4
from .protocol import initialize,Ledger,validate_manifest,digest,canonical,atomic_write

ORIGIN='https://martin-forest-v2-staging-production.up.railway.app'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): raise ValueError('Agent redirects refused')

class Transport:
    def __init__(self,credential,origin=ORIGIN):
        if origin!=ORIGIN: raise ValueError('Pinned staging origin required')
        if not credential.startswith('MF_STAGING_AGENT_'): raise ValueError('Staging credential required')
        self.credential=credential;self.origin=origin;self.opener=urllib.request.build_opener(NoRedirect)

    def request(self,method,path,body=None,lease=None):
        if not path.startswith('/api/v2/agent/') or '..' in path or '?' in path: raise ValueError('Job-scoped agent path required')
        headers={'Authorization':'Bearer '+self.credential,'X-MF-Request-ID':str(uuid4()),'X-MF-Timestamp':str(int(time.time()))}
        if lease: headers.update({'X-MF-Lease':lease['lease_token'],'X-MF-Fencing':str(lease['fencing'])})
        data=canonical(body).encode() if body is not None else None
        if data is not None: headers['Content-Type']='application/json'
        with self.opener.open(urllib.request.Request(self.origin+path,data=data,headers=headers,method=method),timeout=30) as response:
            result=response.read(5*1024*1024+1)
            if len(result)>5*1024*1024: raise ValueError('Agent response limit')
            return result


def run_once(transport,root,capabilities,namespace):
    if 'executor:fake' not in capabilities or 'purpose:produce' in capabilities: raise ValueError('This consumer is calculate/fake only')
    root=initialize(root);ledger=Ledger(root)
    transport.request('POST','/api/v2/agent/heartbeat',{'capabilities':capabilities})
    claim=json.loads(transport.request('POST','/api/v2/agent/jobs/pull',{'capabilities':capabilities,'purpose':'calculate'}))['jobs']
    if not claim: return {'claimed':False}
    lease=claim[0];prefix='/api/v2/agent/jobs/'+lease['job_id'];data=transport.request('GET',lease['manifest_url'],lease=lease)
    manifest=validate_manifest(data,lease,capabilities,namespace)
    if not ledger.claim(manifest,lease): return {'claimed':True,'duplicate_local_run':True,'run_id':lease['run_id']}
    work=root/'work'/lease['run_id'];work.mkdir(mode=0o700);atomic_write(work/'manifest.json',data)
    started=datetime.now(timezone.utc).isoformat()
    def event(kind):
        payload={'type':kind,'progress_percent':None,'code':None}
        return transport.request('POST',prefix+'/events',{'event_id':str(uuid4()),'run_id':lease['run_id'],
            'occurred_at':datetime.now(timezone.utc).isoformat(),'payload_hash':digest(canonical(payload).encode()),**payload},lease)
    try:
        ledger.mark(lease['run_id'],'started');event('started')
        inputs=[]
        for f in manifest['files']:
            blob=transport.request('GET',prefix+'/artifacts/'+f['file_id'],lease=lease)
            if len(blob)!=f['size_bytes'] or digest(blob)!=f['sha256']: raise ValueError('Input file hash mismatch')
            if b'<!DOCTYPE' in blob.upper() or b'<!ENTITY' in blob.upper(): raise ValueError('Unsafe XML')
            parsed=ET.fromstring(blob)
            if parsed.tag!='Root': raise ValueError('Unexpected XML structure')
            atomic_write(work/(f['file_id']+'.oblx'),blob);inputs.append(f['sha256'])
        # Structural parsing is deliberately labelled fake/unverified in every result.
        summary=canonical({'execution':'fake','native_verified':False,'job_id':lease['job_id'],'run_id':lease['run_id'],
            'input_hashes':inputs,'message':'XML parser only; no BAZIS process or physical execution'}).encode()
        body={k:lease[k] for k in ('job_id','run_id','order_id','revision_id','calculation_id')}
        body.update(result_id=str(uuid4()),input_manifest_hash=lease['manifest_sha256'],bazis_version='NOT_EXECUTED',started_at=started,
            completed_at=datetime.now(timezone.utc).isoformat(),status='succeeded',execution='fake',native_signature=None,
            artifacts=[{'artifact_id':str(uuid4()),'kind':'result_summary','sha256':digest(summary),'size_bytes':len(summary),'content_base64':base64.b64encode(summary).decode()}])
        out=root/'outbox'/(lease['run_id']+'.json');atomic_write(out,canonical(body).encode())
        response=json.loads(transport.request('POST',prefix+'/results',body,lease));assert response['verified'] is False
        ledger.mark(lease['run_id'],'completed')
        atomic_write(root/'archive'/(lease['run_id']+'.json'),canonical({'lease':{k:v for k,v in lease.items() if k!='lease_token'},'result':response}).encode())
        return {'claimed':True,'job_id':lease['job_id'],'run_id':lease['run_id'],**response,'native':'NOT VERIFIED'}
    except Exception:
        ledger.mark(lease['run_id'],'uncertain')
        atomic_write(root/'failed'/(lease['run_id']+'.json'),canonical({'job_id':lease['job_id'],'run_id':lease['run_id'],'state':'uncertain'}).encode())
        raise


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--root',required=True);parser.add_argument('--namespace',required=True)
    args=parser.parse_args()
    caps=['protocol:mf-v2','purpose:calculate','export:mf-server-oblx-v1','profile:mf-oblx-preview-v1','result:mf-native-result-v1','executor:fake']
    result=run_once(Transport(os.environ['MF_STAGING_AGENT_CREDENTIAL']),Path(args.root),caps,args.namespace)
    print(json.dumps(result))
