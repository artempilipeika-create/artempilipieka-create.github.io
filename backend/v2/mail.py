"""Durable encrypted email intent + explicit local fake collector; no SMTP/Agent dispatcher."""
from datetime import timedelta
import json
import secrets
from uuid import uuid4
from cryptography.fernet import Fernet
from .db import transaction
from .events import record_event
from .security import digest, error, rate_limit
from .storage import VolumeStore, new_key, sha256


def queue_verification(conn, settings, policy, user, network):
    # All callers lock mf_users first. This serializes resend/change/confirm for an account.
    if user['email_verified_at']:
        return None
    rows = conn.execute('''SELECT created_at, now() AS current_time FROM mf_email_verifications
        WHERE user_id=%s AND created_at>now()-interval '1 day' ORDER BY created_at DESC''',(user['user_id'],)).fetchall()
    if rows:
        now = rows[0]['current_time']
        if ((now-rows[0]['created_at']).total_seconds() < policy.resend_seconds
            or len(rows) >= policy.emails_per_day
            or sum((now-r['created_at']).total_seconds()<3600 for r in rows) >= policy.emails_per_hour):
            error(429,'RATE_LIMITED')
    rate_limit(conn,'email:'+network,maximum=policy.network_emails_per_hour,seconds=3600)
    conn.execute('UPDATE mf_email_verifications SET revoked_at=now() WHERE user_id=%s AND consumed_at IS NULL AND revoked_at IS NULL',
                 (user['user_id'],))
    token = secrets.token_urlsafe(32)
    verification_id, delivery_id = uuid4(), uuid4()
    conn.execute('''INSERT INTO mf_email_verifications
        (verification_id,user_id,email,email_version,token_hash,expires_at)
        VALUES (%s,%s,%s,%s,%s,now()+%s)''',
        (verification_id,user['user_id'],user['email'],user['email_version'],digest(token),timedelta(hours=policy.verification_hours)))
    event_id = record_event(conn,settings,actor=user['user_id'],action='email.verification.queued',object_type='verification',
                            object_id=verification_id,reason='Local fake provider only')
    message = {'to':user['email'],'url':policy.origin+'/verify-email#token='+token,'purpose':'verify_email'}
    sealed = Fernet(policy.email_seal_key).encrypt(json.dumps(message).encode()).decode()
    conn.execute('''INSERT INTO mf_email_deliveries(delivery_id,verification_id,event_id,sealed_message)
        VALUES (%s,%s,%s,%s)''',(delivery_id,verification_id,event_id,sealed))
    return delivery_id


def confirm(conn, settings, token):
    match = conn.execute('SELECT user_id FROM mf_email_verifications WHERE token_hash=%s',(digest(token),)).fetchone()
    if not match:
        error(400,'TOKEN_INVALID')
    user = conn.execute('SELECT * FROM mf_users WHERE user_id=%s FOR UPDATE',(match['user_id'],)).fetchone()
    row = conn.execute('''UPDATE mf_email_verifications SET consumed_at=now()
        WHERE token_hash=%s AND user_id=%s AND email=%s AND email_version=%s AND purpose='verify_email'
        AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>now() RETURNING verification_id''',
        (digest(token),user['user_id'],user['email'],user['email_version'])).fetchone()
    if not row or user['account_status'] != 'active':
        error(400,'TOKEN_INVALID')
    conn.execute("UPDATE mf_users SET email_verified_at=now(),verification_migration_state='verified',updated_at=now() WHERE user_id=%s",(user['user_id'],))
    conn.execute('''UPDATE mf_email_verifications SET revoked_at=now() WHERE user_id=%s
        AND consumed_at IS NULL AND revoked_at IS NULL''',(user['user_id'],))
    record_event(conn,settings,actor=user['user_id'],action='email.verified',object_type='user',
                 object_id=user['user_id'],reason='One-time token confirmed')


class FakeCollector:
    """Operator/test interface only. No HTTP route, provider selection, polling or external network."""
    def collect(self, settings, policy, delivery_id):
        with transaction(settings) as conn:
            row = conn.execute('''SELECT d.*,v.user_id,v.email,v.email_version,v.revoked_at,v.consumed_at,
                v.expires_at>now() AS valid FROM mf_email_deliveries d JOIN mf_email_verifications v USING(verification_id)
                WHERE delivery_id=%s FOR UPDATE OF d''',(delivery_id,)).fetchone()
            if not row:
                raise ValueError('Unknown delivery')
            if row['status'] == 'collected':
                return row['sink_file_id']
            if row['status'] != 'queued' or not row['valid'] or row['revoked_at'] or row['consumed_at']:
                conn.execute("UPDATE mf_email_deliveries SET status='cancelled' WHERE delivery_id=%s",(delivery_id,))
                return None
            plaintext = Fernet(policy.email_seal_key).decrypt(row['sealed_message'].encode())
            file_id, key = uuid4(), new_key()
            # A rollback can leave unreferenced private bytes, never a publicly readable file.
            VolumeStore(settings.storage_root).put(key,plaintext)
            conn.execute('''INSERT INTO mf_files(file_id,kind,classification,original_name,storage_key,
                sha256,size_bytes,mime_type,created_by,status) VALUES (%s,'internal','internal','fake-email.json',
                %s,%s,%s,'application/json',%s,'ready')''',(file_id,key,sha256(plaintext),len(plaintext),row['user_id']))
            conn.execute("UPDATE mf_email_deliveries SET status='collected',sink_file_id=%s,collected_at=now() WHERE delivery_id=%s",(file_id,delivery_id))
            record_event(conn,settings,actor=row['user_id'],action='email.fake_collected',object_type='delivery',
                         object_id=delivery_id,reason='Private local sink; no external mail sent')
            # mf_outbox remains paused. This is not the production publisher.
            return file_id
