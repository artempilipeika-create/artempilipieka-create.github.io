"""Fail closed: this entrypoint is valid only for isolated Stage 0–1 staging."""
from dataclasses import dataclass
from pathlib import Path
import os
import re

from psycopg.conninfo import conninfo_to_dict

PRODUCTION_PROJECT = '7f59bf67-56db-4f6c-b213-c9c7b9342932'
PREVIEW_ENVIRONMENT = 'ee625678-c15e-452d-9761-cda99274839f'


@dataclass(frozen=True, repr=False)
class Settings:
    database_url: str
    database_host: str
    database_name: str
    storage_root: Path
    namespace: str
    instance_id: str

    @classmethod
    def from_env(cls):
        if os.environ.get('MF_ENVIRONMENT') != 'staging':
            raise ValueError('MF_ENVIRONMENT must be staging')
        for name in ('DATABASE_URL', 'AGENT_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
                     'PRODUCTION_DATABASE_URL', 'PRODUCTION_AGENT_API_KEY'):
            if os.environ.get(name):
                raise ValueError(f'Forbidden staging variable: {name}')
        if os.environ.get('MF_AGENT_TRANSPORT', 'disabled') != 'disabled':
            raise ValueError('Agent transport must remain disabled in Stage 1')
        if os.environ.get('MF_OUTBOX_DISPATCH', 'disabled') != 'disabled':
            raise ValueError('Outbox dispatch must remain disabled in Stage 1')
        project = os.environ.get('RAILWAY_PROJECT_ID')
        if project:
            expected = os.environ.get('MF_EXPECTED_RAILWAY_PROJECT_ID')
            if project == PRODUCTION_PROJECT or not expected or project != expected:
                raise ValueError('Staging project identity mismatch')
            if os.environ.get('RAILWAY_ENVIRONMENT_ID') == PREVIEW_ENVIRONMENT:
                raise ValueError('Existing preview environment is forbidden')
            if os.environ.get('RAILWAY_ENVIRONMENT_ID') != os.environ.get('MF_EXPECTED_RAILWAY_ENVIRONMENT_ID'):
                raise ValueError('Staging environment identity mismatch')
        dsn = os.environ.get('MF_DATABASE_URL', '')
        if not dsn.startswith(('postgresql://', 'postgres://')):
            raise ValueError('Dedicated Postgres URL is required; no SQLite fallback')
        try:
            db = conninfo_to_dict(dsn)
        except Exception:
            raise ValueError('Invalid staging database configuration') from None
        host = os.environ.get('MF_DATABASE_HOST', '')
        name = os.environ.get('MF_DATABASE_NAME', '')
        if not host or db.get('host') != host or ',' in host or db.get('hostaddr') or db.get('service'):
            raise ValueError('Database host does not match dedicated staging host')
        if db.get('dbname') != name or not re.fullmatch(r'mf_staging(?:_[a-z0-9]+)*', name):
            raise ValueError('Database name must identify staging')
        if not db.get('user', '').startswith('mf_staging'):
            raise ValueError('Dedicated staging database user required')
        namespace = os.environ.get('MF_JOB_NAMESPACE', '')
        if not re.fullmatch(r'mf\.staging\.[a-z0-9_-]+', namespace):
            raise ValueError('Dedicated staging job namespace required')
        raw_root = os.environ.get('MF_PRIVATE_STORAGE_ROOT', '')
        root = Path(raw_root)
        if not raw_root or not root.is_absolute() or {'public', 'static'} & set(root.parts):
            raise ValueError('Private absolute storage path required')
        if project:
            volume = os.environ.get('RAILWAY_VOLUME_MOUNT_PATH')
            if not volume or not root.resolve().is_relative_to(Path(volume).resolve()):
                raise ValueError('Private storage must be inside the mounted persistent volume')
        return cls(dsn, host, name, root.resolve(), namespace, os.environ.get('RAILWAY_DEPLOYMENT_ID', 'local'))
