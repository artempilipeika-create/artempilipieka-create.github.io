-- Require verified email before client login and allow real SMTP verification delivery.
ALTER TABLE mf_email_deliveries DROP CONSTRAINT IF EXISTS mf_email_deliveries_provider_check;
ALTER TABLE mf_email_deliveries DROP CONSTRAINT IF EXISTS mf_email_deliveries_status_check;

ALTER TABLE mf_email_deliveries
    ADD CONSTRAINT mf_email_deliveries_provider_check CHECK (provider IN ('fake','smtp','resend')),
    ADD CONSTRAINT mf_email_deliveries_status_check CHECK (status IN ('queued','collected','cancelled','sent','failed'));

ALTER TABLE mf_email_deliveries ADD COLUMN sent_at timestamptz;
ALTER TABLE mf_email_deliveries ADD COLUMN failed_at timestamptz;

-- Old staging sessions created before verification became mandatory must not bypass the new login gate.
UPDATE mf_sessions s
SET revoked_at = now()
FROM mf_users u
WHERE s.user_id = u.user_id
  AND s.revoked_at IS NULL
  AND u.email_verified_at IS NULL
  AND EXISTS (
      SELECT 1 FROM mf_user_roles r
      WHERE r.user_id = u.user_id AND r.role = 'client'
  )
  AND NOT EXISTS (
      SELECT 1 FROM mf_user_roles r
      WHERE r.user_id = u.user_id AND r.role <> 'client'
  );
