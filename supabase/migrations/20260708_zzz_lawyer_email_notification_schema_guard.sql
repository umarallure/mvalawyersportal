-- Production guard for older lawyer_email_notifications schemas.
--
-- Some production databases already had lawyer_email_notifications before the
-- notification_type column was introduced. The assignment email guard functions
-- rely on that column, so normalize existing schemas before the next lead save.

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

NOTIFY pgrst, 'reload schema';
