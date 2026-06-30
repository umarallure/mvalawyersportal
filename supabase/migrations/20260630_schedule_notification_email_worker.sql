-- Schedule the notification email worker without using Vercel Cron.
--
-- Vercel Hobby only allows daily cron jobs. This keeps the Vercel API endpoint
-- and moves the every-minute schedule to Supabase pg_cron + pg_net.
--
-- Before running this migration in production, store these two secrets in
-- Supabase Vault:
--   notification_worker_base_url     = https://attorney.accidentpayments.com
--   notification_worker_cron_secret  = the same value as Vercel CRON_SECRET

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.invoke_notification_email_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $$
DECLARE
  v_base_url text;
  v_cron_secret text;
  v_request_id bigint;
BEGIN
  SELECT nullif(btrim(decrypted_secret), '')
  INTO v_base_url
  FROM vault.decrypted_secrets
  WHERE name = 'notification_worker_base_url'
  LIMIT 1;

  SELECT nullif(btrim(decrypted_secret), '')
  INTO v_cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'notification_worker_cron_secret'
  LIMIT 1;

  IF v_base_url IS NULL THEN
    RAISE EXCEPTION 'Missing Supabase Vault secret: notification_worker_base_url';
  END IF;

  IF v_cron_secret IS NULL THEN
    RAISE EXCEPTION 'Missing Supabase Vault secret: notification_worker_cron_secret';
  END IF;

  SELECT net.http_get(
    url := rtrim(v_base_url, '/') || '/api/notification-email-worker',
    params := jsonb_build_object('limit', '10'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_cron_secret,
      'User-Agent', 'supabase-pg-cron-notification-email-worker'
    ),
    timeout_milliseconds := 25000
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_notification_email_worker() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_notification_email_worker() FROM anon;
REVOKE ALL ON FUNCTION public.invoke_notification_email_worker() FROM authenticated;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'notification-email-worker-every-minute'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
END $$;

SELECT cron.schedule(
  'notification-email-worker-every-minute',
  '* * * * *',
  'SELECT public.invoke_notification_email_worker();'
);
