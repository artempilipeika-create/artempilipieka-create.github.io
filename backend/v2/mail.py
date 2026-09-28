"""Durable encrypted verification email queue with SMTP delivery and an explicit fake collector for tests."""
from datetime import timedelta
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
import json
import os
import secrets
import smtplib
import ssl
from uuid import uuid4
from cryptography.fernet import Fernet
from .db import transaction
from .events import record_event
from .security import digest, error, rate_limit
from .storage import VolumeStore, new_key, sha256


class MailDeliveryError(RuntimeError):
    pass


def provider_name():
    provider = os.environ.get('MF_EMAIL_PROVIDER', 'fake').strip().lower()
    if provider not in {'fake', 'smtp'}:
        raise RuntimeError('MF_EMAIL_PROVIDER must be fake or smtp')
    return provider


def validate_mail_config():
    provider = provider_name()
    if provider == 'smtp':
        _smtp_config()
    return provider


def _smtp_config():
    host = os.environ.get('MF_SMTP_HOST', '').strip()
    username = os.environ.get('MF_SMTP_USERNAME', '').strip()
    password = os.environ.get('MF_SMTP_PASSWORD', '')
    sender = os.environ.get('MF_SMTP_FROM', '').strip() or username
    sender_name = os.environ.get('MF_SMTP_FROM_NAME', 'Martin Forest').strip() or 'Martin Forest'
    reply_to = os.environ.get('MF_SMTP_REPLY_TO', '').strip()
    security = os.environ.get('MF_SMTP_SECURITY', 'starttls').strip().lower()
    try:
        port = int(os.environ.get('MF_SMTP_PORT', '587'))
    except ValueError:
        raise MailDeliveryError('SMTP_NOT_CONFIGURED') from None
    if not host or not username or not password or not sender or not 1 <= port <= 65535:
        raise MailDeliveryError('SMTP_NOT_CONFIGURED')
    if security not in {'starttls', 'ssl'}:
        raise MailDeliveryError('SMTP_NOT_CONFIGURED')
    return {
        'host': host, 'port': port, 'username': username, 'password': password,
        'sender': sender, 'sender_name': sender_name, 'reply_to': reply_to, 'security': security,
    }


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
    provider = provider_name()
    event_id = record_event(conn,settings,actor=user['user_id'],action='email.verification.queued',object_type='verification',
                            object_id=verification_id,reason='Verification email queued for '+provider)
    message = {'to':user['email'],'url':policy.origin+'/verify-email#token='+token,'purpose':'verify_email'}
    sealed = Fernet(policy.email_seal_key).encrypt(json.dumps(message).encode()).decode()
    conn.execute('''INSERT INTO mf_email_deliveries(delivery_id,verification_id,event_id,sealed_message,provider)
        VALUES (%s,%s,%s,%s,%s)''',(delivery_id,verification_id,event_id,sealed,provider))
    return delivery_id


def _send_smtp(payload):
    cfg = _smtp_config()
    url = payload['url']
    recipient = payload['to']
    msg = EmailMessage()
    msg['Subject'] = 'Подтвердите email — Martin Forest'
    msg['From'] = formataddr((cfg['sender_name'], cfg['sender']))
    msg['To'] = recipient
    if cfg['reply_to']:
        msg['Reply-To'] = cfg['reply_to']
    msg.set_content(
        'Здравствуйте!\n\n'
        'Чтобы завершить регистрацию в Martin Forest, подтвердите email по ссылке:\n'
        f'{url}\n\n'
        'Ссылка действует ограниченное время. Если вы не регистрировались на сайте Martin Forest, '
        'просто проигнорируйте это письмо.\n'
    )
    safe_url = escape(url, quote=True)
    msg.add_alternative(
        '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#173f2e">'
        '<h2>Подтвердите email</h2>'
        '<p>Чтобы завершить регистрацию в Martin Forest, подтвердите адрес электронной почты.</p>'
        f'<p><a href="{safe_url}" style="display:inline-block;padding:12px 18px;background:#173f2e;'
        'color:#fff;text-decoration:none;border-radius:6px">Подтвердить email</a></p>'
        '<p style="color:#5f6f66">Если вы не регистрировались на сайте Martin Forest, '
        'просто проигнорируйте это письмо.</p></body></html>',
        subtype='html'
    )
    context = ssl.create_default_context()
    if cfg['security'] == 'ssl':
        smtp = smtplib.SMTP_SSL(cfg['host'], cfg['port'], timeout=20, context=context)
    else:
        smtp = smtplib.SMTP(cfg['host'], cfg['port'], timeout=20)
    with smtp:
        smtp.ehlo()
        if cfg['security'] == 'starttls':
            smtp.starttls(context=context)
            smtp.ehlo()
        smtp.login(cfg['username'], cfg['password'])
        smtp.send_message(msg)


def deliver_verification(settings, policy, delivery_id):
    if not delivery_id:
        return False
    with transaction(settings) as conn:
        row = conn.execute('''SELECT d.*,v.user_id,v.email,v.email_version,v.revoked_at,v.consumed_at,
            v.expires_at>now() AS valid FROM mf_email_deliveries d JOIN mf_email_verifications v USING(verification_id)
            WHERE delivery_id=%s FOR UPDATE OF d''',(delivery_id,)).fetchone()
        if not row:
            raise MailDeliveryError('DELIVERY_NOT_FOUND')
        if row['provider'] == 'fake':
            return False
        if row['status'] == 'sent':
            return True
        if row['status'] != 'queued' or not row['valid'] or row['revoked_at'] or row['consumed_at']:
            if row['status'] == 'queued':
                conn.execute("UPDATE mf_email_deliveries SET status='cancelled' WHERE delivery_id=%s",(delivery_id,))
            return False
        plaintext = Fernet(policy.email_seal_key).decrypt(row['sealed_message'].encode())
        payload = json.loads(plaintext)
        user_id = row['user_id']
    try:
        _send_smtp(payload)
    except Exception:
        with transaction(settings) as conn:
            conn.execute("UPDATE mf_email_deliveries SET status='failed',failed_at=now() WHERE delivery_id=%s AND status='queued'",
                         (delivery_id,))
            record_event(conn,settings,actor=user_id,action='email.verification.failed',object_type='delivery',
                         object_id=delivery_id,reason='SMTP delivery failed')
        raise MailDeliveryError('SMTP_DELIVERY_FAILED') from None
    with transaction(settings) as conn:
        updated = conn.execute("UPDATE mf_email_deliveries SET status='sent',sent_at=now() WHERE delivery_id=%s AND status='queued' RETURNING delivery_id",
                               (delivery_id,)).fetchone()
        if updated:
            record_event(conn,settings,actor=user_id,action='email.verification.sent',object_type='delivery',
                         object_id=delivery_id,reason='SMTP delivery completed')
    return True


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
    """Operator/test interface only. No HTTP route and no external network."""
    def collect(self, settings, policy, delivery_id):
        with transaction(settings) as conn:
            row = conn.execute('''SELECT d.*,v.user_id,v.email,v.email_version,v.revoked_at,v.consumed_at,
                v.expires_at>now() AS valid FROM mf_email_deliveries d JOIN mf_email_verifications v USING(verification_id)
                WHERE delivery_id=%s FOR UPDATE OF d''',(delivery_id,)).fetchone()
            if not row:
                raise ValueError('Unknown delivery')
            if row['provider'] != 'fake':
                return None
            if row['status'] == 'collected':
                return row['sink_file_id']
            if row['status'] != 'queued' or not row['valid'] or row['revoked_at'] or row['consumed_at']:
                if row['status'] == 'queued':
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
            return file_id
