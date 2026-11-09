-- Owner-only maintenance: transfer the single admin role to an existing account.
-- psql -v ON_ERROR_STOP=1 -v target_email=you@example.com -f transfer_admin.sql
-- This first updates historical-reference guards; it never changes old signatures/messages.
\set ON_ERROR_STOP on
\if :{?target_email}
\else
  \echo 'Missing target_email. Pass -v target_email=you@example.com.'
  \quit 1
\endif
\ir ../07_admin_history.sql

BEGIN;
SET LOCAL search_path=smartrent,public;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='30s';
SELECT set_config('smartrent.transfer_admin_email', :'target_email', true);

DO $$
DECLARE target users; previous_admin uuid;
BEGIN
 -- Runtime smartrent_app cannot change roles or disable triggers. Only the DB owner can.
 IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='smartrent.users'::regclass))
    AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
  RAISE EXCEPTION 'database_owner_required';
 END IF;
 -- Prevent concurrent login/account writes while the protected role fields are changed.
 LOCK TABLE smartrent.users IN ACCESS EXCLUSIVE MODE;
 SELECT * INTO STRICT target FROM users
  WHERE lower(email)=lower(btrim(current_setting('smartrent.transfer_admin_email')));
 IF target.role='admin' THEN
  RAISE NOTICE 'This account is already the administrator; no account changes made.';
  RETURN;
 END IF;
 IF NOT target.is_active OR NOT target.login_enabled OR target.password_hash IS NULL THEN
  RAISE EXCEPTION 'target_must_have_active_login_and_password';
 END IF;
 -- Promoting a tenant would make customer-only contracts/requests invalid on their next update.
 -- Use a separate owner account instead; never rewrite rental ownership to bypass this check.
 IF EXISTS(SELECT 1 FROM contracts WHERE user_id=target.id)
    OR EXISTS(SELECT 1 FROM contracts c,jsonb_array_elements(c.occupants) x WHERE x->>'userId'=target.id::text)
    OR EXISTS(SELECT 1 FROM bookings WHERE user_id=target.id)
    OR EXISTS(SELECT 1 FROM payments WHERE user_id=target.id) THEN
  RAISE EXCEPTION 'target_has_customer_business_records_use_separate_owner_account';
 END IF;
 SELECT id INTO previous_admin FROM users WHERE role='admin';

 -- DDL is transactional: any error rolls back both the roles and the trigger state.
 -- Keep the one-admin unique index enabled; demote first, then promote in one transaction.
 ALTER TABLE smartrent.users DISABLE TRIGGER protect_user;
 UPDATE users SET role='user',security_stamp=gen_random_uuid(),updated_at=now()
  WHERE id=previous_admin;
 UPDATE users SET role='admin',security_stamp=gen_random_uuid(),updated_at=now(),
  failed_login_count=0,locked_until=NULL WHERE id=target.id;
 ALTER TABLE smartrent.users ENABLE TRIGGER protect_user;

 -- Prevent an existing customer session from gaining administrator access automatically.
 -- Also revoke outstanding reset/invitation links for both accounts.
 UPDATE auth_tokens SET revoked_at=coalesce(revoked_at,now())
  WHERE user_id=target.id OR user_id=previous_admin;
 PERFORM set_config('smartrent.user_id',target.id::text,true);
 PERFORM set_config('smartrent.ticket_action','assign',true);
 PERFORM set_config('smartrent.ticket_reason','Administrator ownership transferred',true);
 -- Move current work to the new owner, preserving original signedBy and message authors.
 UPDATE tickets SET assigned_to=target.id
  WHERE assigned_to=previous_admin AND status NOT IN ('resolved','closed');
 UPDATE bookings b SET appointments=(
   SELECT jsonb_agg(CASE WHEN x->>'status'='scheduled' AND x->>'hostId'=previous_admin::text
     THEN jsonb_set(x,'{hostId}',to_jsonb(target.id::text)) ELSE x END ORDER BY n)
   FROM jsonb_array_elements(b.appointments) WITH ORDINALITY a(x,n))
  WHERE kind='viewing' AND EXISTS(SELECT 1 FROM jsonb_array_elements(b.appointments) x
    WHERE x->>'status'='scheduled' AND x->>'hostId'=previous_admin::text);
 IF (SELECT count(*) FROM users WHERE role='admin')<>1 THEN
  RAISE EXCEPTION 'expected_exactly_one_admin';
 END IF;
 RAISE NOTICE 'Administrator transferred. Sign in again with the target account existing password.';
END $$;
COMMIT;

SELECT email,display_name,role,is_active,login_enabled FROM smartrent.users WHERE role='admin';
