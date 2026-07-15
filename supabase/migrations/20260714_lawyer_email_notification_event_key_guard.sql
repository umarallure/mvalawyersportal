-- Production guard for older lawyer_email_notifications schemas.
--
-- Some live databases created lawyer_email_notifications before the
-- attorney/type/event idempotency key was finalized. The current
-- notify_lawyer_case_assigned() trigger inserts event_key and uses the
-- lawyer_email_notifications_event_key_key constraint; without both, assigning
-- a lead to an attorney fails and rolls back the lead update.

ALTER TABLE public.lawyer_email_notifications
  ADD COLUMN IF NOT EXISTS notification_type text,
  ADD COLUMN IF NOT EXISTS event_key text;

WITH normalized AS (
  SELECT
    id,
    coalesce(nullif(btrim(notification_type), ''), 'case_assignment') AS normalized_type,
    coalesce(
      nullif(btrim(event_key), ''),
      lead_id::text,
      id::text
    ) AS base_event_key
  FROM public.lawyer_email_notifications
),
ranked AS (
  SELECT
    len.id,
    normalized.normalized_type,
    normalized.base_event_key,
    row_number() OVER (
      PARTITION BY len.attorney_id, normalized.normalized_type, normalized.base_event_key
      ORDER BY len.id
    ) AS duplicate_rank
  FROM public.lawyer_email_notifications len
  JOIN normalized ON normalized.id = len.id
)
UPDATE public.lawyer_email_notifications len
SET
  notification_type = ranked.normalized_type,
  event_key = CASE
    WHEN ranked.duplicate_rank = 1 THEN ranked.base_event_key
    ELSE ranked.base_event_key || ':duplicate:' || len.id::text
  END
FROM ranked
WHERE ranked.id = len.id
  AND (
    len.notification_type IS DISTINCT FROM ranked.normalized_type
    OR len.event_key IS DISTINCT FROM CASE
      WHEN ranked.duplicate_rank = 1 THEN ranked.base_event_key
      ELSE ranked.base_event_key || ':duplicate:' || len.id::text
    END
  );

ALTER TABLE public.lawyer_email_notifications
  ALTER COLUMN notification_type SET DEFAULT 'case_assignment';

ALTER TABLE public.lawyer_email_notifications
  ALTER COLUMN notification_type SET NOT NULL;

ALTER TABLE public.lawyer_email_notifications
  ALTER COLUMN event_key SET NOT NULL;

ALTER TABLE public.lawyer_email_notifications
  DROP CONSTRAINT IF EXISTS lawyer_email_notifications_type_not_blank;

ALTER TABLE public.lawyer_email_notifications
  ADD CONSTRAINT lawyer_email_notifications_type_not_blank
  CHECK (btrim(notification_type) <> '');

ALTER TABLE public.lawyer_email_notifications
  DROP CONSTRAINT IF EXISTS lawyer_email_notifications_event_key_not_blank;

ALTER TABLE public.lawyer_email_notifications
  ADD CONSTRAINT lawyer_email_notifications_event_key_not_blank
  CHECK (btrim(event_key) <> '');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lawyer_email_notifications_event_key_key'
      AND conrelid = 'public.lawyer_email_notifications'::regclass
  ) THEN
    ALTER TABLE public.lawyer_email_notifications
      ADD CONSTRAINT lawyer_email_notifications_event_key_key
      UNIQUE (attorney_id, notification_type, event_key);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
