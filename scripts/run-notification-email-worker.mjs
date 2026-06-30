import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { buildNotificationEmailContent } from '../server/email/notification-email-template.mjs'

const DEFAULT_ENV_FILE = '.env'

const loadEnvFile = (filePath) => {
  const resolved = resolve(process.cwd(), filePath)
  if (!existsSync(resolved)) {
    throw new Error(`Env file not found: ${resolved}`)
  }

  const lines = readFileSync(resolved, 'utf8').split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line
    const separator = normalized.indexOf('=')
    if (separator === -1) continue

    const key = normalized.slice(0, separator).trim()
    let value = normalized.slice(separator + 1)

    if (!key || process.env[key] !== undefined) continue

    const trimmed = value.trim()
    const isQuoted =
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))

    if (isQuoted) {
      value = trimmed.slice(1, -1)
      if (trimmed.startsWith('"')) {
        value = value.replace(/\\n/g, '\n').replace(/\\"/g, '"')
      }
    } else {
      const commentIndex = value.search(/\s+#/)
      value = commentIndex >= 0 ? value.slice(0, commentIndex).trim() : value.trim()
    }

    process.env[key] = value
  }
}

const getArg = (name, fallback = null) => {
  const prefix = `--${name}=`
  const arg = process.argv.find(value => value.startsWith(prefix))
  return arg ? arg.slice(prefix.length) : fallback
}

const getEnv = (key, fallbackKeys = []) => {
  const value = process.env[key] || fallbackKeys.map(fallbackKey => process.env[fallbackKey]).find(Boolean)
  if (!value) throw new Error(`Missing ${key}`)
  return value
}

const getOptionalEnv = (key) => {
  const value = process.env[key]?.trim()
  return value || null
}

const parseLimit = (raw) => {
  const parsed = Number(raw ?? 10)
  if (!Number.isFinite(parsed)) return 10
  return Math.max(1, Math.min(50, Math.floor(parsed)))
}

const parseBooleanEnv = (key, fallback) => {
  const value = getOptionalEnv(key)
  if (!value) return fallback
  if (['1', 'true', 'yes', 'on'].includes(value.toLowerCase())) return true
  if (['0', 'false', 'no', 'off'].includes(value.toLowerCase())) return false
  return fallback
}

const createTransporter = () => {
  const host = getEnv('SMTP_HOST')
  const port = Number(getOptionalEnv('SMTP_PORT') ?? 587)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('SMTP_PORT must be a valid port number')
  }

  const user = getOptionalEnv('SMTP_USER')
  const pass = getOptionalEnv('SMTP_PASS')
  if ((user && !pass) || (!user && pass)) {
    throw new Error('SMTP_USER and SMTP_PASS must be provided together')
  }

  const secure = parseBooleanEnv('SMTP_SECURE', port === 465)
  const requireTLS = parseBooleanEnv('SMTP_REQUIRE_TLS', !secure)

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000
  })
}

const getFromAddress = () => {
  const fromAddress = getOptionalEnv('SMTP_FROM_EMAIL') || getOptionalEnv('SMTP_USER')
  if (!fromAddress) throw new Error('Missing SMTP_FROM_EMAIL')
  return fromAddress
}

const sendSmtpMessage = async (transporter, delivery) => {
  const { subject, text, html } = buildNotificationEmailContent(delivery, {
    appBaseUrl: getOptionalEnv('APP_BASE_URL') || 'http://localhost:5173',
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

const nextAttemptAt = (attemptCount) => {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attemptCount - 1))
  return new Date(Date.now() + delayMinutes * 60_000).toISOString()
}

const isRetryableError = (error) => {
  if (!error || typeof error !== 'object') return true

  const responseCode = Number(error.responseCode)
  if (Number.isInteger(responseCode)) {
    return responseCode >= 400 && responseCode < 500
  }

  return ['ECONNECTION', 'ECONNRESET', 'EDNS', 'ESOCKET', 'ETIMEDOUT', 'ETLS']
    .includes(error.code ?? '')
}

const processPendingDeliveries = async () => {
  const limit = parseLimit(getArg('limit', '10'))
  const supabaseAdmin = createClient(
    getEnv('SUPABASE_URL', ['VITE_SUPABASE_URL']),
    getEnv('SUPABASE_SERVICE_ROLE_KEY')
  )
  const transporter = createTransporter()
  const workerId = ['local-notification-email-worker', process.pid, Date.now()].join(':')

  const { data, error } = await supabaseAdmin.rpc('claim_pending_notification_email_deliveries', {
    p_limit: limit,
    p_worker_id: workerId
  })

  if (error) throw new Error(error.message)

  const deliveries = data ?? []
  const results = []

  for (const delivery of deliveries) {
    try {
      const providerMessageId = await sendSmtpMessage(transporter, delivery)

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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown email delivery error'
      const shouldRetry = isRetryableError(error) && delivery.attempt_count < delivery.max_attempts
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

  return { ok: true, claimed: deliveries.length, results }
}

try {
  loadEnvFile(getArg('env', DEFAULT_ENV_FILE))
  const result = await processPendingDeliveries()
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.results.some(item => item.status === 'failed') ? 1 : 0
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
