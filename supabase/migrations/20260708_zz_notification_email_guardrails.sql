-- Guardrails for assignment email delivery contexts.
--
-- This migration is intentionally small and repeatable after the delivery-key
-- migration. It hardens already-migrated databases without relying on edits to
-- earlier migration files.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.broker_retainer_email_notification_rules
    WHERE template_key = 'belief_broker_retainer_assignment'
      AND enabled = true
    GROUP BY template_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Only one broker_retainer_email_notification_rules row may be enabled for belief_broker_retainer_assignment. Disable test rows before applying this guardrail.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_retainer_email_rules_one_enabled_belief
  ON public.broker_retainer_email_notification_rules(template_key)
  WHERE enabled = true
    AND template_key = 'belief_broker_retainer_assignment';

DROP FUNCTION IF EXISTS public.claim_pending_notification_email_deliveries(integer, text);

CREATE FUNCTION public.claim_pending_notification_email_deliveries(
  p_limit integer DEFAULT 10,
  p_worker_id text DEFAULT NULL
)
RETURNS TABLE (
  delivery_id uuid,
  notification_id uuid,
  recipient_id uuid,
  to_address text,
  attempt_count integer,
  max_attempts integer,
  template_key text,
  payload jsonb,
  delivery_key text,
  delivery_created_at timestamptz,
  title text,
  description text,
  redirect_url text,
  lead_id uuid,
  lead_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT nd.id
    FROM public.notification_deliveries nd
    WHERE nd.channel = 'email'
      AND nd.to_address IS NOT NULL
      AND nd.attempt_count < nd.max_attempts
      AND (
        (nd.status IN ('pending', 'retry') AND nd.next_attempt_at <= now())
        OR (nd.status = 'processing' AND nd.locked_at < now() - interval '15 minutes')
      )
    ORDER BY nd.next_attempt_at ASC, nd.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT least(greatest(coalesce(p_limit, 10), 1), 50)
  ),
  claimed AS (
    UPDATE public.notification_deliveries nd
    SET
      status = 'processing',
      locked_at = now(),
      locked_by = coalesce(nullif(btrim(p_worker_id), ''), 'notification-email-worker'),
      attempt_count = nd.attempt_count + 1
    FROM candidates
    WHERE nd.id = candidates.id
    RETURNING
      nd.id,
      nd.notification_id,
      nd.recipient_id,
      nd.to_address,
      nd.attempt_count,
      nd.max_attempts,
      nd.template_key,
      nd.payload,
      nd.delivery_key,
      nd.created_at
  )
  SELECT
    claimed.id,
    claimed.notification_id,
    claimed.recipient_id,
    claimed.to_address,
    claimed.attempt_count,
    claimed.max_attempts,
    claimed.template_key,
    claimed.payload,
    claimed.delivery_key,
    claimed.created_at,
    n.title::text,
    n.description,
    n.redirect_url::text,
    n.lead_id,
    n.lead_name,
    n.created_at
  FROM claimed
  JOIN public.notifications n ON n.id = claimed.notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_notification_email_deliveries(integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_pending_notification_email_deliveries(integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_notification_email_deliveries(integer, text) TO service_role;

NOTIFY pgrst, 'reload schema';
