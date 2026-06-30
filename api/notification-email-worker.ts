import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'
import nodemailer from 'nodemailer'
import { buildNotificationEmailContent } from '../server/email/notification-email-template.mjs'

type ClaimedDelivery = {
  delivery_id: string
  notification_id: string
  recipient_id: string
  to_address: string
  attempt_count: number
  max_attempts: number
  title: string
  description: string | null
  redirect_url: string | null
  lead_id: string | null
  lead_name: string | null
  created_at: string
}

let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null

const getEnv = (key: string) => {
  const val = process.env[key]
  if (!val) throw new Error(`Missing ${key}`)
  return val
}

const getOptionalEnv = (key: string) => {
  const val = process.env[key]?.trim()
  return val || null
}

const json = (res: VercelResponse, status: number, body: unknown) => {
  res.status(status).setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

const safeEqual = (a: string, b: string) => {
  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)
  if (aBuffer.length !== bBuffer.length) return false
  return timingSafeEqual(aBuffer, bBuffer)
}

const getHeaderValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

const isAuthorized = (req: VercelRequest) => {
  const secret = getEnv('CRON_SECRET')
  const authorization = getHeaderValue(req.headers.authorization)
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null
  const headerSecret = getHeaderValue(req.headers['x-cron-secret'])
  const candidate = bearer || headerSecret || ''
  return Boolean(candidate) && safeEqual(candidate, secret)
}

const parseLimit = (raw: unknown) => {
  const value = Array.isArray(raw) ? raw[0] : raw
  const parsed = Number(value ?? 10)
  if (!Number.isFinite(parsed)) return 10
  return Math.max(1, Math.min(50, Math.floor(parsed)))
}

const parseBooleanEnv = (key: string, fallback: boolean) => {
  const value = getOptionalEnv(key)
  if (!value) return fallback
  if (['1', 'true', 'yes', 'on'].includes(value.toLowerCase())) return true
  if (['0', 'false', 'no', 'off'].includes(value.toLowerCase())) return false
  return fallback
}

const getTransporter = () => {
  if (cachedTransporter) return cachedTransporter

  const host = getEnv('SMTP_HOST')
  const port = Number(getOptionalEnv('SMTP_PORT') ?? 587)
  if (!Number.isInteger(port) || port <= 0) throw new Error('SMTP_PORT must be a valid port number')

  const user = getOptionalEnv('SMTP_USER')
  const pass = getOptionalEnv('SMTP_PASS')
  if ((user && !pass) || (!user && pass)) {
    throw new Error('SMTP_USER and SMTP_PASS must be provided together')
  }

  const secure = parseBooleanEnv('SMTP_SECURE', port === 465)
  const requireTLS = parseBooleanEnv('SMTP_REQUIRE_TLS', !secure)

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000
  })

  return cachedTransporter
}

const getFromAddress = () => {
  const fromAddress = getOptionalEnv('SMTP_FROM_EMAIL') || getOptionalEnv('SMTP_USER')
  if (!fromAddress) throw new Error('Missing SMTP_FROM_EMAIL')
  return fromAddress
}

const sendSmtpMessage = async (delivery: ClaimedDelivery) => {
  const transporter = getTransporter()
  const { subject, text, html } = buildNotificationEmailContent(delivery, {
    appBaseUrl: getEnv('APP_BASE_URL'),
    logoUrl: getOptionalEnv('SMTP_LOGO_URL') ?? undefined,
    backgroundUrl: getOptionalEnv('SMTP_EMAIL_BACKGROUND_URL') ?? undefined
  })
  const fromAddress = getFromAddress()
  const fromName = getOptionalEnv('SMTP_FROM_NAME') || 'MVA Lawyers Portal'
  const replyTo = getOptionalEnv('SMTP_REPLY_TO')

  const result = await transporter.sendMail({
    from: { name: fromName, address: fromAddress },
    to: delivery.to_address,
    replyTo: replyTo ?? undefined,
    subject,
    text,
    html
  })

  return result.messageId
}

const nextAttemptAt = (attemptCount: number) => {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attemptCount - 1))
  return new Date(Date.now() + delayMinutes * 60_000).toISOString()
}

const isRetryableError = (error: unknown) => {
  if (!error || typeof error !== 'object') return true

  const smtpError = error as { responseCode?: number; code?: string }
  const responseCode = Number(smtpError.responseCode)
  if (Number.isInteger(responseCode)) {
    return responseCode >= 400 && responseCode < 500
  }

  return ['ECONNECTION', 'ECONNRESET', 'EDNS', 'ESOCKET', 'ETIMEDOUT', 'ETLS'].includes(smtpError.code ?? '')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' })
  }

  try {
    if (!isAuthorized(req)) {
      return json(res, 401, { error: 'Unauthorized' })
    }

    const supabaseAdmin = createClient(
      getEnv('SUPABASE_URL'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY')
    )

    const workerId = [
      'notification-email-worker',
      process.env.VERCEL_REGION || 'local',
      Date.now().toString()
    ].join(':')

    const { data, error } = await supabaseAdmin.rpc('claim_pending_notification_email_deliveries', {
      p_limit: parseLimit(req.query.limit),
      p_worker_id: workerId
    })

    if (error) {
      return json(res, 500, { error: error.message })
    }

    const deliveries = (data ?? []) as ClaimedDelivery[]
    const results: Array<{ delivery_id: string; status: string; error?: string }> = []

    for (const delivery of deliveries) {
      try {
        const providerMessageId = await sendSmtpMessage(delivery)

        const { error: updateError } = await supabaseAdmin
          .from('notification_deliveries')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            provider_message_id: providerMessageId,
            last_error: null,
            locked_at: null,
            locked_by: null
          })
          .eq('id', delivery.delivery_id)

        if (updateError) throw updateError
        results.push({ delivery_id: delivery.delivery_id, status: 'sent' })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown email delivery error'
        const shouldRetry = isRetryableError(err) && delivery.attempt_count < delivery.max_attempts
        const status = shouldRetry ? 'retry' : 'failed'

        await supabaseAdmin
          .from('notification_deliveries')
          .update({
            status,
            last_error: message.slice(0, 2000),
            next_attempt_at: shouldRetry ? nextAttemptAt(delivery.attempt_count) : new Date().toISOString(),
            locked_at: null,
            locked_by: null
          })
          .eq('id', delivery.delivery_id)

        results.push({ delivery_id: delivery.delivery_id, status, error: message })
      }
    }

    return json(res, 200, {
      ok: true,
      claimed: deliveries.length,
      results
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected worker error'
    return json(res, 500, { error: message })
  }
}
