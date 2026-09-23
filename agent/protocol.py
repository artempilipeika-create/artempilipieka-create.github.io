"""Standalone Agent contract validation, durable ledger and isolated native boundary."""
import hashlib,json,os,re,sqlite3
from pathlib import Path,PureWindowsPath
from uuid import UUID

def canonical(value): return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def digest(data): return hashlib.sha256(data).hexdigest()


def initialize(root):
    raw=str(root)
    if '\\' in raw or re.match(r'^[a-zA-Z]:',raw):
        p=PureWindowsPath(raw)
        if p.drive.upper()!='D:' or len(p.parts)<2 or p.parts[1].casefold()!='martinforest_staging':
            raise ValueError('Dedicated D:\\MartinForest_Staging root required')
    root=Path(root).absolute()
    if 'pgm' in {p.casefold() for p in root.parts} or not any('staging' in p.casefold() for p in root.parts):
        raise ValueError('Explicit isolated staging root required')
    for p in (root,*root.parents):
        if p.is_symlink(): raise ValueError('Symlink root refused')
    root.mkdir(parents=True,exist_ok=True,mode=0o700)
    marker=root/'.mf-staging-agent-v2'
    if not marker.exists() and any(root.iterdir()): raise ValueError('Initialization requires an empty staging directory')
    if marker.exists() and marker.read_text()!='mf-staging-v2': raise ValueError('Wrong staging root identity')
    marker.write_text('mf-staging-v2');marker.chmod(0o600)
    for name in ('inbox','work','outbox','failed','archive','logs'):
        target=root/name
        if target.is_symlink(): raise ValueError('Symlink subdirectory refused')
        target.mkdir(exist_ok=True,mode=0o700)
    return root


def validate_manifest(data,lease,capabilities,namespace):
    if len(data)>2*1024*1024 or digest(data)!=lease['manifest_sha256']: raise ValueError('Manifest hash mismatch')
    m=json.loads(data)
    if m.get('schema_version')!=2 or m.get('environment')!='staging' or m.get('namespace')!=namespace or not namespace.startswith('mf.staging.'):
        raise ValueError('Manifest namespace/schema mismatch')
    for key in ('job_id','run_id','order_id','revision_id','calculation_id','purpose'):
        if m.get(key)!=lease[key]: raise ValueError('Manifest identity mismatch')
    for key in ('job_id','run_id','revision_id','calculation_id'): UUID(m[key])
    if not set(m['required_capabilities'])<=set(capabilities): raise ValueError('Unsupported capability')
    if digest(canonical(m['manufacturing']).encode())!=m['input_hash']: raise ValueError('Manufacturing input hash mismatch')
    if m['purpose']=='produce' and m['native_calibration']!='verified': raise ValueError('Produce calibration required')
    if not 1<=len(m['files'])<=16: raise ValueError('File count limit')
    seen=set()
    for f in m['files']:
        if f['file_id'] in seen or f.get('classification')!='internal' or f.get('kind')!='oblx': raise ValueError('Unexpected input artifact')
        seen.add(f['file_id'])
        if not re.fullmatch(r'[a-f0-9-]{36}',f['file_id']) or not re.fullmatch(r'[a-f0-9]{64}',f['sha256']) or not 0<f['size_bytes']<=4*1024*1024:
            raise ValueError('Input artifact metadata invalid')
    return m


class Ledger:
    def __init__(self,root):
        self.conn=sqlite3.connect(root/'ledger.sqlite3')
        self.conn.execute('PRAGMA journal_mode=WAL');self.conn.execute('PRAGMA synchronous=FULL')
        self.conn.execute('CREATE TABLE IF NOT EXISTS runs(job_id TEXT,run_id TEXT PRIMARY KEY,input_hash TEXT,manifest_hash TEXT,fencing INTEGER,state TEXT)')
        self.conn.commit()

    def claim(self,manifest,lease):
        with self.conn:
            old=self.conn.execute('SELECT input_hash,manifest_hash,fencing,state FROM runs WHERE run_id=?',(lease['run_id'],)).fetchone()
            if old:
                if old[:3]!=(manifest['input_hash'],lease['manifest_sha256'],lease['fencing']): raise ValueError('Conflicting repeat run')
                return False
            history=self.conn.execute('SELECT input_hash,fencing,state FROM runs WHERE job_id=?',(lease['job_id'],)).fetchall()
            if any(h[0]!=manifest['input_hash'] or h[1]>=lease['fencing'] for h in history): raise ValueError('Job hash/fence conflict')
            if manifest['purpose']=='produce' and history: raise ValueError('Produce requires operator reconciliation')
            self.conn.execute('INSERT INTO runs VALUES(?,?,?,?,?,?)',(lease['job_id'],lease['run_id'],manifest['input_hash'],lease['manifest_sha256'],lease['fencing'],'claimed'))
        return True

    def mark(self,run_id,state):
        if state not in ('started','physical_intent','completed','uncertain','failed'): raise ValueError('Invalid ledger state')
        with self.conn: self.conn.execute('UPDATE runs SET state=? WHERE run_id=?',(state,run_id))


def atomic_write(path,data):
    if path.is_symlink(): raise ValueError('Symlink artifact refused')
    tmp=path.with_suffix(path.suffix+'.partial')
    with open(tmp,'xb') as f:
        os.chmod(tmp,0o600);f.write(data);f.flush();os.fsync(f.fileno())
    os.replace(tmp,path)


def native_boundary(manifest,ledger):
    # No assumed BAZIS CLI, UI automation, Resilio watcher or production path.
    if manifest['native_calibration']!='verified': raise RuntimeError('BAZIS_CALIBRATION_REQUIRED')
    raise RuntimeError('NATIVE_ADAPTER_NOT_INSTALLED: isolated calibrated BAZIS runner required')
