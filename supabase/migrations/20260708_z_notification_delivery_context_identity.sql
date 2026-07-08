-- Centralized email delivery identity for assignment notifications.
--
-- A notification row is a portal/in-app artifact. Email delivery needs its own
-- purpose key so a lawyer assignment email and a broker-retainer assignment
-- email cannot reuse each other's template, recipient, or retry state.

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS template_key text NOT NULL DEFAULT 'standard_notification_email',
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_key text NOT NULL DEFAULT 'standard_notification_email';

UPDATE public.notification_deliveries
SET
  template_key = coalesce(nullif(btrim(template_key), ''), 'standard_notification_email'),
  payload = coalesce(payload, '{}'::jsonb),
  delivery_key = coalesce(nullif(btrim(delivery_key), ''), coalesce(nullif(btrim(template_key), ''), 'standard_notification_email'))
WHERE template_key IS NULL
   OR btrim(template_key) = ''
   OR payload IS NULL
   OR delivery_key IS NULL
   OR btrim(delivery_key) = '';

ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_template_key_not_blank;

ALTER TABLE public.notification_deliveries
  ADD CONSTRAINT notification_deliveries_template_key_not_blank
  CHECK (btrim(template_key) <> '');

ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_delivery_key_not_blank;

ALTER TABLE public.notification_deliveries
  ADD CONSTRAINT notification_deliveries_delivery_key_not_blank
  CHECK (btrim(delivery_key) <> '');

ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_notification_channel_key;

ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_notification_channel_delivery_key_key;

ALTER TABLE public.notification_deliveries
  ADD CONSTRAINT notification_deliveries_notification_channel_delivery_key_key
  UNIQUE (notification_id, channel, delivery_key);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_template_key
  ON public.notification_deliveries(template_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_delivery_key
  ON public.notification_deliveries(delivery_key, created_at DESC);

CREATE TABLE IF NOT EXISTS public.broker_retainer_email_notification_rules (
  broker_id uuid NOT NULL REFERENCES public.broker_profiles(user_id) ON DELETE CASCADE,
  template_key text NOT NULL DEFAULT 'belief_broker_retainer_assignment',
  enabled boolean NOT NULL DEFAULT true,
  max_attempts integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broker_retainer_email_notification_rules_pkey PRIMARY KEY (broker_id, template_key),
  CONSTRAINT broker_retainer_email_notification_rules_template_key_not_blank CHECK (btrim(template_key) <> ''),
  CONSTRAINT broker_retainer_email_notification_rules_max_attempts_check CHECK (max_attempts >= 1)
);

CREATE INDEX IF NOT EXISTS idx_broker_retainer_email_notification_rules_enabled
  ON public.broker_retainer_email_notification_rules(template_key, enabled)
  WHERE enabled = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_retainer_email_rules_one_enabled_belief
  ON public.broker_retainer_email_notification_rules(template_key)
  WHERE enabled = true
    AND template_key = 'belief_broker_retainer_assignment';

ALTER TABLE public.broker_retainer_email_notification_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'broker_retainer_email_notification_rules'
      AND policyname = 'broker_retainer_email_notification_rules_broker_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY broker_retainer_email_notification_rules_broker_select
        ON public.broker_retainer_email_notification_rules
        FOR SELECT TO authenticated
        USING (broker_id = auth.uid())
    $policy$;
  END IF;
END $$;

INSERT INTO public.broker_retainer_email_notification_rules (
  broker_id,
  template_key,
  enabled,
  max_attempts
)
VALUES (
  '1f66203d-b014-4bc4-9405-74072e32aca7',
  'belief_broker_retainer_assignment',
  true,
  30
)
ON CONFLICT (broker_id, template_key) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  max_attempts = EXCLUDED.max_attempts,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.upsert_notification_email_delivery(
  p_notification_id uuid,
  p_recipient_id uuid,
  p_to_address text,
  p_template_key text DEFAULT 'standard_notification_email',
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_delivery_key text DEFAULT NULL,
  p_max_attempts integer DEFAULT 5,
  p_missing_email_error text DEFAULT 'Missing recipient email'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id uuid;
  v_template_key text := coalesce(nullif(btrim(p_template_key), ''), 'standard_notification_email');
  v_delivery_key text := coalesce(nullif(btrim(p_delivery_key), ''), coalesce(nullif(btrim(p_template_key), ''), 'standard_notification_email'));
  v_to_address text := nullif(lower(btrim(p_to_address)), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_max_attempts integer := greatest(coalesce(p_max_attempts, 5), 1);
BEGIN
  INSERT INTO public.notification_deliveries AS nd (
    notification_id,
    recipient_id,
    channel,
    to_address,
    status,
    max_attempts,
    next_attempt_at,
    last_error,
    template_key,
    payload,
    delivery_key
  )
  VALUES (
    p_notification_id,
    p_recipient_id,
    'email',
    v_to_address,
    CASE WHEN v_to_address IS NULL THEN 'skipped' ELSE 'pending' END,
    v_max_attempts,
    now(),
    CASE WHEN v_to_address IS NULL THEN p_missing_email_error ELSE NULL END,
    v_template_key,
    v_payload,
    v_delivery_key
  )
  ON CONFLICT ON CONSTRAINT notification_deliveries_notification_channel_delivery_key_key DO UPDATE
  SET
    recipient_id = EXCLUDED.recipient_id,
    to_address = EXCLUDED.to_address,
    template_key = EXCLUDED.template_key,
    payload = EXCLUDED.payload,
    max_attempts = greatest(nd.max_attempts, EXCLUDED.max_attempts),
    last_error = CASE
      WHEN EXCLUDED.to_address IS NULL THEN EXCLUDED.last_error
      WHEN nd.status IN ('skipped', 'failed') THEN NULL
      ELSE nd.last_error
    END,
    status = CASE
      WHEN nd.status = 'sent' THEN nd.status
      WHEN EXCLUDED.to_address IS NULL THEN 'skipped'
      WHEN nd.status IN ('skipped', 'failed') THEN 'pending'
      ELSE nd.status
    END,
    next_attempt_at = CASE
      WHEN nd.status = 'sent' THEN nd.next_attempt_at
      WHEN EXCLUDED.to_address IS NOT NULL
       AND nd.status IN ('skipped', 'failed')
      THEN now()
      ELSE nd.next_attempt_at
    END,
    locked_at = CASE
      WHEN nd.status IN ('skipped', 'failed') THEN NULL
      ELSE nd.locked_at
    END,
    locked_by = CASE
      WHEN nd.status IN ('skipped', 'failed') THEN NULL
      ELSE nd.locked_by
    END
  RETURNING id INTO v_delivery_id;

  RETURN v_delivery_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_notification_email_delivery(uuid, uuid, text, text, jsonb, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_notification_email_delivery(uuid, uuid, text, text, jsonb, text, integer, text) FROM authenticated;

ALTER TABLE public.lawyer_email_notifications
  ADD COLUMN IF NOT EXISTS notification_type text;

UPDATE public.lawyer_email_notifications
SET notification_type = 'case_assignment'
WHERE notification_type IS NULL
   OR btrim(notification_type) = '';

ALTER TABLE public.lawyer_email_notifications
  ALTER COLUMN notification_type SET DEFAULT 'case_assignment';

ALTER TABLE public.lawyer_email_notifications
  ALTER COLUMN notification_type SET NOT NULL;

ALTER TABLE public.lawyer_email_notifications
  DROP CONSTRAINT IF EXISTS lawyer_email_notifications_type_not_blank;

ALTER TABLE public.lawyer_email_notifications
  ADD CONSTRAINT lawyer_email_notifications_type_not_blank
  CHECK (btrim(notification_type) <> '');

CREATE OR REPLACE FUNCTION public.skip_stale_assignment_email_deliveries(
  p_lead_id uuid,
  p_keep_delivery_key text DEFAULT NULL,
  p_reason text DEFAULT 'Skipped because the lead assignment context changed'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keep_delivery_key text := nullif(btrim(p_keep_delivery_key), '');
BEGIN
  UPDATE public.notification_deliveries nd
  SET
    status = 'skipped',
    last_error = left(coalesce(nullif(btrim(p_reason), ''), 'Skipped because the lead assignment context changed'), 2000),
    next_attempt_at = now(),
    locked_at = NULL,
    locked_by = NULL
  FROM public.notifications n
  WHERE n.id = nd.notification_id
    AND n.lead_id = p_lead_id
    AND nd.channel = 'email'
    AND nd.status IN ('pending', 'retry', 'processing')
    AND (
      v_keep_delivery_key IS NULL
      OR nd.delivery_key IS DISTINCT FROM v_keep_delivery_key
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.lawyer_email_notifications len
        WHERE len.notification_id = n.id
          AND len.lead_id = p_lead_id
          AND len.notification_type = 'case_assignment'
      )
      OR EXISTS (
        SELECT 1
        FROM public.belief_broker_retainer_email_notifications ben
        WHERE ben.lead_id = p_lead_id
          AND ben.notification_type = 'retainer_assignment'
          AND (
            ben.delivery_id = nd.id
            OR ben.notification_id = n.id
          )
      )
      OR (
        nd.template_key = 'belief_broker_retainer_assignment'
        AND nd.payload ->> 'lead_id' = p_lead_id::text
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.skip_stale_assignment_email_deliveries(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.skip_stale_assignment_email_deliveries(uuid, text, text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.notify_lawyer_case_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_notification_id uuid;
  v_delivery_id uuid;
  v_lead_name text;
  v_to_address text;
  v_delivery_key text;
BEGIN
  IF NEW.assigned_attorney_id IS NULL
    OR (
      TG_OP = 'UPDATE'
      AND OLD.assigned_attorney_id IS NOT DISTINCT FROM NEW.assigned_attorney_id
    )
  THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.app_users au
    WHERE au.user_id = NEW.assigned_attorney_id
      AND au.role = 'lawyer'
      AND (au.account_status IS NULL OR lower(au.account_status) NOT IN ('disabled', 'inactive', 'suspended'))
  ) THEN
    RETURN NEW;
  END IF;

  v_delivery_key := 'lawyer_case_assignment:' || NEW.id::text || ':' || NEW.assigned_attorney_id::text;

  PERFORM public.skip_stale_assignment_email_deliveries(
    NEW.id,
    v_delivery_key,
    'Skipped because the lead was reassigned to a lawyer notification context'
  );

  v_lead_name := nullif(btrim(coalesce(NEW.customer_full_name, NEW.submission_id, '')), '');

  INSERT INTO public.lawyer_email_notifications (
    notification_type,
    event_key,
    lead_id,
    attorney_id
  )
  VALUES (
    'case_assignment',
    NEW.id::text,
    NEW.id,
    NEW.assigned_attorney_id
  )
  ON CONFLICT ON CONSTRAINT lawyer_email_notifications_event_key_key DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    category,
    title,
    description,
    redirect_url,
    lead_id,
    lead_name
  )
  VALUES (
    NEW.assigned_attorney_id,
    auth.uid(),
    'new_lead',
    'New case assigned',
    'A new case for ' || coalesce(v_lead_name, 'Unknown Client') || ' is ready in My Cases.',
    '/retainers/' || NEW.id,
    NEW.id,
    v_lead_name
  )
  RETURNING id INTO v_notification_id;

  UPDATE public.lawyer_email_notifications
  SET notification_id = v_notification_id
  WHERE id = v_event_id;

  SELECT nullif(lower(btrim(primary_email)), '')
  INTO v_to_address
  FROM public.attorney_profiles
  WHERE user_id = NEW.assigned_attorney_id
  LIMIT 1;

  v_delivery_id := public.upsert_notification_email_delivery(
    v_notification_id,
    NEW.assigned_attorney_id,
    v_to_address,
    'standard_notification_email',
    jsonb_build_object(
      'source_portal', 'lawyers',
      'notification_type', 'case_assignment',
      'lead_id', NEW.id,
      'assigned_attorney_id', NEW.assigned_attorney_id
    ),
    v_delivery_key,
    5,
    'Missing attorney primary_email'
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_belief_broker_retainer_assignment_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_broker_id uuid;
  v_broker_attorney_id uuid;
  v_template_key text;
  v_max_attempts integer;
  v_event_id uuid;
  v_notification_id uuid;
  v_delivery_id uuid;
  v_lead_name text;
  v_to_address text;
  v_delivery_key text;
BEGIN
  IF NEW.assigned_broker_attorney_id IS NULL
    OR NEW.status IS DISTINCT FROM 'attorney_review'
    OR NEW.is_active IS DISTINCT FROM true
    OR (
      TG_OP = 'UPDATE'
      AND OLD.assigned_broker_attorney_id IS NOT DISTINCT FROM NEW.assigned_broker_attorney_id
      AND OLD.status IS NOT DISTINCT FROM NEW.status
    )
  THEN
    RETURN NEW;
  END IF;

  SELECT ba.broker_id, ba.id, cfg.template_key, cfg.max_attempts
  INTO v_broker_id, v_broker_attorney_id, v_template_key, v_max_attempts
  FROM public.broker_attorneys ba
  JOIN public.broker_retainer_email_notification_rules cfg
    ON cfg.broker_id = ba.broker_id
   AND cfg.enabled = true
   AND cfg.template_key = 'belief_broker_retainer_assignment'
  WHERE ba.id = NEW.assigned_broker_attorney_id
  LIMIT 1;

  IF v_broker_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_delivery_key := v_template_key || ':' || NEW.id::text || ':' || v_broker_attorney_id::text;

  PERFORM public.skip_stale_assignment_email_deliveries(
    NEW.id,
    v_delivery_key,
    'Skipped because the lead was reassigned to a broker retainer email context'
  );

  SELECT nullif(lower(btrim(bp.primary_email)), '')
  INTO v_to_address
  FROM public.broker_profiles bp
  WHERE bp.user_id = v_broker_id
  LIMIT 1;

  v_lead_name := nullif(btrim(coalesce(NEW.customer_full_name, NEW.submission_id, '')), '');

  INSERT INTO public.belief_broker_retainer_email_notifications (
    notification_type,
    event_key,
    broker_id,
    broker_attorney_id,
    lead_id
  )
  VALUES (
    'retainer_assignment',
    NEW.id::text || ':' || v_broker_attorney_id::text,
    v_broker_id,
    v_broker_attorney_id,
    NEW.id
  )
  ON CONFLICT ON CONSTRAINT belief_broker_retainer_email_notifications_event_key_key DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT n.id
  INTO v_notification_id
  FROM public.notifications n
  WHERE n.recipient_id = v_broker_id
    AND n.category = 'new_lead'
    AND n.lead_id = NEW.id
  ORDER BY n.created_at ASC
  LIMIT 1;

  IF v_notification_id IS NULL THEN
    INSERT INTO public.notifications (
      recipient_id,
      actor_id,
      category,
      title,
      description,
      redirect_url,
      lead_id,
      lead_name
    )
    VALUES (
      v_broker_id,
      auth.uid(),
      'new_lead',
      'New retainer sent',
      'A new retainer for ' || coalesce(v_lead_name, 'Unknown Client') || ' is ready in My Cases.',
      '/retainers/' || NEW.id,
      NEW.id,
      v_lead_name
    )
    RETURNING id INTO v_notification_id;
  END IF;

  UPDATE public.belief_broker_retainer_email_notifications
  SET notification_id = v_notification_id
  WHERE id = v_event_id;

  v_delivery_id := public.upsert_notification_email_delivery(
    v_notification_id,
    v_broker_id,
    v_to_address,
    v_template_key,
    jsonb_build_object(
      'source_portal', 'broker',
      'notification_type', 'retainer_assignment',
      'broker_id', v_broker_id,
      'broker_attorney_id', v_broker_attorney_id,
      'lead_id', NEW.id
    ),
    v_delivery_key,
    v_max_attempts,
    'Missing broker primary_email for broker retainer assignment email'
  );

  UPDATE public.belief_broker_retainer_email_notifications
  SET delivery_id = v_delivery_id
  WHERE id = v_event_id;

  RETURN NEW;
END;
$$;

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
