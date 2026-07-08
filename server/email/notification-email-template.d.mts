export type NotificationEmailDelivery = {
  redirect_url: string | null
  lead_name: string | null
  description: string | null
  created_at: string
  delivery_created_at?: string | null
}

export type BeliefBrokerRetainerEmailContext = {
  delivery: NotificationEmailDelivery
  lead: Record<string, unknown>
  broker: Record<string, unknown>
  attorney: Record<string, unknown>
  document: Record<string, unknown>
}

export type NotificationEmailOptions = {
  appBaseUrl: string
  brokerAppBaseUrl?: string
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

export function buildBeliefBrokerRetainerEmailContent(
  context: BeliefBrokerRetainerEmailContext,
  options: NotificationEmailOptions
): {
  subject: string
  text: string
  html: string
}
