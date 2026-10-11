"""Optional local SQL/API acceptance using a disposable PGlite socket.

Native CI: MF_TEST_DATABASE_URL=... pytest tests/test_project_safety_api.py.
Embedded fallback: install @electric-sql/pglite-socket in a temporary prefix and
pass its pglite-server executable here. This validates SQL/transactions/ownership,
not native Postgres multi-process locking. No application configuration changes.
"""
import argparse,os,socket,subprocess,sys,tempfile,time
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--pglite-bin',type=Path,required=True);args=parser.parse_args()
with tempfile.TemporaryDirectory(prefix='mf-project-safety-db-') as directory:
    root=Path(directory)
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    test=root/'test_embedded.py'
    test.write_text('''import os,pytest,psycopg
from backend.v2.config import Settings
from backend.v2.migrate import migrate
from tests.test_project_safety_api import (
    test_idempotent_save_conflict_and_minimal_receipts,
    test_checkpoint_restore_is_atomic_idempotent_and_owner_scoped,
    test_foreign_checkpoint_and_archived_project_cannot_be_restored,api,admin_user)
# The embedded engine has one backend. Reuse one socket and disable prepared
# statement caching in this sequential test process. Context managers still
# commit/rollback real SQL transactions; native app settings stay intact.
class EmbeddedConnection(psycopg.Connection):
    def close(self):pass
_connection=None
def embedded_connect(*args,**kwargs):
    global _connection
    if _connection is None:_connection=EmbeddedConnection.connect(*args,**{**kwargs,'prepare_threshold':None})
    _connection.autocommit=kwargs.get('autocommit',False)
    return _connection
psycopg.connect=embedded_connect
@pytest.fixture(scope='module')
def settings(tmp_path_factory):
    root=tmp_path_factory.mktemp('private')
    s=Settings(os.environ['MF_EMBEDDED_TEST_URL'],'127.0.0.1','postgres',root/'source','mf.staging.project_safety_embedded','ci')
    migrate(s)
    return s
''')
    with (root/'server.log').open('w') as log:
        server=subprocess.Popen([str(args.pglite_bin.resolve()),'--host=127.0.0.1','--port='+str(port)],stdout=log,stderr=log)
        try:
            for _ in range(150):
                if server.poll() is not None:raise RuntimeError((root/'server.log').read_text())
                try:
                    with socket.create_connection(('127.0.0.1',port),.2):break
                except OSError:time.sleep(.2)
            else:raise RuntimeError('Embedded test database did not start')
            result=subprocess.run([sys.executable,'-m','pytest','-q',str(test),'--tb=short'],cwd=ROOT,
                env={**os.environ,'PYTHONPATH':str(ROOT),'MF_EMBEDDED_TEST_URL':f'postgresql://postgres@127.0.0.1:{port}/postgres?sslmode=disable'})
        finally:
            server.terminate()
            try:server.wait(timeout=5)
            except subprocess.TimeoutExpired:server.kill();server.wait()
    sys.exit(result.returncode)
