import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import {
  buildBeliefBrokerRetainerEmailContent,
  buildNotificationEmailContent
} from '../server/email/notification-email-template.mjs'

const DEFAULT_ENV_FILE = '.env'
const DEFAULT_TEMPLATE_KEY = 'standard_notification_email'
const BELIEF_BROKER_TEMPLATE_KEY = 'belief_broker_retainer_assignment'
const DEFAULT_LEAD_DOCUMENTS_BUCKET = 'lead-documents'

class RetryableDeliveryError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'RetryableDeliveryError'
    this.code = code
  }
}

class SkippedDeliveryError extends Error {
  constructor(message, code = 'ESTALE_DELIVERY') {
    super(message)
    this.name = 'SkippedDeliveryError'
    this.code = code
  }
}

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

const getAppBaseUrl = () => getOptionalEnv('APP_BASE_URL') || 'http://localhost:5173'

const getTemplateKey = (delivery) =>
  delivery.template_key?.trim() || DEFAULT_TEMPLATE_KEY

const getPayloadString = (delivery, key) => {
  const value = delivery.payload?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const getMaybeSingle = async (query, missingMessage) => {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  if (!data) throw new Error(missingMessage)
  return data
}

const hasNewerAssignmentEmailDelivery = async (
  supabaseAdmin,
  delivery,
  leadId,
  { templateKey, deliveryKeyPrefix }
) => {
  const referenceCreatedAt = delivery.delivery_created_at || delivery.created_at
  if (!referenceCreatedAt || Number.isNaN(new Date(referenceCreatedAt).getTime())) {
    return false
  }

  const { data: notificationRows, error: notificationError } = await supabaseAdmin
    .from('notifications')
    .select('id')
    .eq('lead_id', leadId)

  if (notificationError) throw new Error(notificationError.message)

  const notificationIds = (notificationRows ?? [])
    .map(row => (typeof row.id === 'string' ? row.id : null))
    .filter(Boolean)

  if (!notificationIds.length) return false

  let query = supabaseAdmin
    .from('notification_deliveries')
    .select('id')
    .in('notification_id', notificationIds)
    .eq('channel', 'email')
    .eq('template_key', templateKey)
    .in('status', ['pending', 'processing', 'retry', 'sent'])
    .gt('created_at', referenceCreatedAt)
    .neq('id', delivery.delivery_id)
    .limit(1)

  if (deliveryKeyPrefix) {
    query = query.like('delivery_key', `${deliveryKeyPrefix}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return Boolean(data?.length)
}

const fetchBeliefBrokerRetainerMessage = async (supabaseAdmin, delivery) => {
  const leadId = delivery.lead_id || getPayloadString(delivery, 'lead_id')
  if (!leadId) throw new Error('Missing lead_id for Belief broker retainer email')

  const lead = await getMaybeSingle(
    supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .maybeSingle(),
    `Lead not found for Belief broker retainer email: ${leadId}`
  )

  const brokerAttorneyId = getPayloadString(delivery, 'broker_attorney_id') || lead.assigned_broker_attorney_id
  if (!brokerAttorneyId) {
    throw new Error(`Missing assigned_broker_attorney_id for lead ${leadId}`)
  }

  if (
    lead.assigned_broker_attorney_id !== brokerAttorneyId ||
    lead.status !== 'attorney_review' ||
    lead.is_active !== true
  ) {
    throw new SkippedDeliveryError(
      `Skipped stale Belief broker retainer email for lead ${leadId}: assignment context changed`
    )
  }

  const attorney = await getMaybeSingle(
    supabaseAdmin
      .from('broker_attorneys')
      .select('*')
      .eq('id', brokerAttorneyId)
      .maybeSingle(),
    `Broker attorney not found for Belief broker retainer email: ${brokerAttorneyId}`
  )

  const brokerId = getPayloadString(delivery, 'broker_id') || attorney.broker_id
  if (attorney.broker_id !== brokerId) {
    throw new SkippedDeliveryError(
      `Skipped stale Belief broker retainer email for lead ${leadId}: broker attorney no longer belongs to queued broker`
    )
  }

  if (
    await hasNewerAssignmentEmailDelivery(supabaseAdmin, delivery, leadId, {
      templateKey: DEFAULT_TEMPLATE_KEY,
      deliveryKeyPrefix: 'lawyer_case_assignment:'
    })
  ) {
    throw new SkippedDeliveryError(
      `Skipped stale Belief broker retainer email for lead ${leadId}: a newer lawyer assignment email exists`
    )
  }

  const broker = await getMaybeSingle(
    supabaseAdmin
      .from('broker_profiles')
      .select('*')
      .eq('user_id', brokerId)
      .maybeSingle(),
    `Broker profile not found for Belief broker retainer email: ${brokerId}`
  )

  if (!lead.submission_id) {
    throw new RetryableDeliveryError(
      `Lead ${leadId} has no submission_id for retainer document lookup`,
      'EMISSING_RETAINER_DOCUMENT'
    )
  }

  const { data: documentRows, error: documentError } = await supabaseAdmin
    .from('lead_documents')
    .select('id,submission_id,category,file_name,file_size,file_type,storage_path,bucket_name,uploaded_at,status')
    .eq('submission_id', lead.submission_id)
    .eq('category', 'retainer_document')
    .in('status', ['uploaded', 'verified'])
    .order('uploaded_at', { ascending: false })
    .limit(1)

  if (documentError) throw new Error(documentError.message)

  const document = documentRows?.[0] ?? null
  if (!document) {
    throw new RetryableDeliveryError(
      `Missing retainer document attachment for lead ${leadId}`,
      'EMISSING_RETAINER_DOCUMENT'
    )
  }

  const bucketName = document.bucket_name || DEFAULT_LEAD_DOCUMENTS_BUCKET
  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from(bucketName)
    .download(document.storage_path)

  if (downloadError || !fileData) {
    throw new RetryableDeliveryError(
      `Failed to download retainer document attachment: ${downloadError?.message ?? 'No file data returned'}`,
      'EATTACHMENT_DOWNLOAD'
    )
  }

  const fileBuffer = Buffer.from(await fileData.arrayBuffer())
  const content = buildBeliefBrokerRetainerEmailContent(
    {
      delivery,
      lead,
      broker,
      attorney,
      document
    },
    {
      appBaseUrl: getAppBaseUrl(),
      brokerAppBaseUrl: getOptionalEnv('BROKER_APP_BASE_URL') ?? undefined,
      logoUrl: getOptionalEnv('SMTP_LOGO_URL') ?? undefined,
      backgroundUrl: getOptionalEnv('SMTP_EMAIL_BACKGROUND_URL') ?? undefined
    }
  )

  return {
    ...content,
    attachments: [
      {
        filename: document.file_name || 'signed-retainer-document',
        content: fileBuffer,
        contentType: document.file_type || undefined
      }
    ]
  }
}

const fetchStandardNotificationMessage = async (supabaseAdmin, delivery) => {
  const notificationType = getPayloadString(delivery, 'notification_type')
  const assignedAttorneyId = getPayloadString(delivery, 'assigned_attorney_id')
  const leadId = delivery.lead_id || getPayloadString(delivery, 'lead_id')

  if (notificationType === 'case_assignment' && assignedAttorneyId && leadId) {
    const lead = await getMaybeSingle(
      supabaseAdmin
        .from('leads')
        .select('id,submission_id,assigned_attorney_id,assigned_broker_attorney_id,status,is_active')
        .eq('id', leadId)
        .maybeSingle(),
      `Lead not found for lawyer assignment email: ${leadId}`
    )

    if (lead.assigned_attorney_id !== assignedAttorneyId || lead.is_active === false) {
      throw new SkippedDeliveryError(
        `Skipped stale lawyer assignment email for lead ${leadId}: assignment context changed`
      )
    }

    if (
      await hasNewerAssignmentEmailDelivery(supabaseAdmin, delivery, leadId, {
        templateKey: BELIEF_BROKER_TEMPLATE_KEY
      })
    ) {
      throw new SkippedDeliveryError(
        `Skipped stale lawyer assignment email for lead ${leadId}: a newer broker retainer email exists`
      )
    }
  }

  return {
    ...buildNotificationEmailContent(delivery, {
      appBaseUrl: getAppBaseUrl(),
      logoUrl: getOptionalEnv('SMTP_LOGO_URL') ?? undefined,
      backgroundUrl: getOptionalEnv('SMTP_EMAIL_BACKGROUND_URL') ?? undefined
    }),
    attachments: []
  }
}

const buildMessageForDelivery = async (supabaseAdmin, delivery) => {
  if (getTemplateKey(delivery) === BELIEF_BROKER_TEMPLATE_KEY) {
    return fetchBeliefBrokerRetainerMessage(supabaseAdmin, delivery)
  }

  return fetchStandardNotificationMessage(supabaseAdmin, delivery)
}

const sendSmtpMessage = async (transporter, supabaseAdmin, delivery) => {
  const { subject, text, html, attachments } = await buildMessageForDelivery(supabaseAdmin, delivery)
  const fromAddress = getFromAddress()
  const fromName = getOptionalEnv('SMTP_FROM_NAME') || 'MVA Lawyers Portal'
  const replyTo = getOptionalEnv('SMTP_REPLY_TO')

  const result = await transporter.sendMail({
    from: { name: fromName, address: fromAddress },
    to: delivery.to_address,
    replyTo: replyTo ?? undefined,
    subject,
    text,
    html,
    attachments
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
    .includes(error.code ?? '') ||
    ['EMISSING_RETAINER_DOCUMENT', 'EATTACHMENT_DOWNLOAD'].includes(error.code ?? '')
}

const isSkippedError = (error) =>
  Boolean(error && typeof error === 'object' && error.code === 'ESTALE_DELIVERY')

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
      const providerMessageId = await sendSmtpMessage(transporter, supabaseAdmin, delivery)

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
      const shouldSkip = isSkippedError(error)
      const shouldRetry = !shouldSkip && isRetryableError(error) && delivery.attempt_count < delivery.max_attempts
      const status = shouldSkip ? 'skipped' : shouldRetry ? 'retry' : 'failed'

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
