export type NotificationEmailDelivery = {
  redirect_url: string | null
  lead_name: string | null
  description: string | null
  created_at: string
}

export type NotificationEmailOptions = {
  appBaseUrl: string
  logoUrl?: string
  backgroundUrl?: string
}

export function buildNotificationEmailContent(
  delivery: NotificationEmailDelivery,
  options: NotificationEmailOptions
): {
  subject: string
  text: string
  html: string
}
