import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'
import nodemailer from 'nodemailer'
import {
  buildBeliefBrokerRetainerEmailContent,
  buildNotificationEmailContent
} from '../server/email/notification-email-template.mjs'

const DEFAULT_TEMPLATE_KEY = 'standard_notification_email'
const BELIEF_BROKER_TEMPLATE_KEY = 'belief_broker_retainer_assignment'
const DEFAULT_LEAD_DOCUMENTS_BUCKET = 'lead-documents'

type ClaimedDelivery = {
  delivery_id: string
  notification_id: string
  recipient_id: string
  to_address: string
  attempt_count: number
  max_attempts: number
  template_key: string | null
  payload: Record<string, unknown> | null
  delivery_key?: string | null
  delivery_created_at?: string | null
  title: string
  description: string | null
  redirect_url: string | null
  lead_id: string | null
  lead_name: string | null
  created_at: string
}

type LeadRow = Record<string, unknown> & {
  id: string
  submission_id: string | null
  assigned_attorney_id: string | null
  assigned_broker_attorney_id: string | null
  status: string | null
  is_active: boolean | null
}

type BrokerProfileRow = Record<string, unknown> & {
  user_id: string
  full_name: string | null
  company_name: string | null
  primary_email: string | null
}

type BrokerAttorneyRow = Record<string, unknown> & {
  id: string
  broker_id: string
  attorney_name: string | null
  firm_name: string | null
}

type LeadDocumentRow = Record<string, unknown> & {
  id: string
  file_name: string
  file_type: string | null
  storage_path: string
  bucket_name: string | null
}

type SupabaseAdminClient = SupabaseClient<any, any, any, any, any>

class RetryableDeliveryError extends Error {
  code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'RetryableDeliveryError'
    this.code = code
  }
}

class SkippedDeliveryError extends Error {
  code: string

  constructor(message: string, code = 'ESTALE_DELIVERY') {
    super(message)
    this.name = 'SkippedDeliveryError'
    this.code = code
  }
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

const getTemplateKey = (delivery: ClaimedDelivery) =>
  delivery.template_key?.trim() || DEFAULT_TEMPLATE_KEY

const getPayloadString = (delivery: ClaimedDelivery, key: string) => {
  const value = delivery.payload?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const getMaybeSingle = async <T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  missingMessage: string
) => {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  if (!data) throw new Error(missingMessage)
  return data
}

const hasNewerAssignmentEmailDelivery = async (
  supabaseAdmin: SupabaseAdminClient,
  delivery: ClaimedDelivery,
  leadId: string,
  options: {
    templateKey: string
    deliveryKeyPrefix?: string
  }
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
    .map((row: { id?: unknown }) => (typeof row.id === 'string' ? row.id : null))
    .filter((id): id is string => Boolean(id))

  if (!notificationIds.length) return false

  let query = supabaseAdmin
    .from('notification_deliveries')
    .select('id')
    .in('notification_id', notificationIds)
    .eq('channel', 'email')
    .eq('template_key', options.templateKey)
    .in('status', ['pending', 'processing', 'retry', 'sent'])
    .gt('created_at', referenceCreatedAt)
    .neq('id', delivery.delivery_id)
    .limit(1)

  if (options.deliveryKeyPrefix) {
    query = query.like('delivery_key', `${options.deliveryKeyPrefix}%`)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return Boolean(data?.length)
}

const fetchBeliefBrokerRetainerMessage = async (
  supabaseAdmin: SupabaseAdminClient,
  delivery: ClaimedDelivery
) => {
  const leadId = delivery.lead_id || getPayloadString(delivery, 'lead_id')
  if (!leadId) throw new Error('Missing lead_id for Belief broker retainer email')

  const lead = await getMaybeSingle<LeadRow>(
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

  const attorney = await getMaybeSingle<BrokerAttorneyRow>(
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

  const broker = await getMaybeSingle<BrokerProfileRow>(
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

  const document = (documentRows?.[0] ?? null) as LeadDocumentRow | null
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
      appBaseUrl: getEnv('APP_BASE_URL'),
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

const fetchStandardNotificationMessage = async (
  supabaseAdmin: SupabaseAdminClient,
  delivery: ClaimedDelivery
) => {
  const notificationType = getPayloadString(delivery, 'notification_type')
  const assignedAttorneyId = getPayloadString(delivery, 'assigned_attorney_id')
  const leadId = delivery.lead_id || getPayloadString(delivery, 'lead_id')

  if (notificationType === 'case_assignment' && assignedAttorneyId && leadId) {
    const lead = await getMaybeSingle<LeadRow>(
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
      appBaseUrl: getEnv('APP_BASE_URL'),
      logoUrl: getOptionalEnv('SMTP_LOGO_URL') ?? undefined,
      backgroundUrl: getOptionalEnv('SMTP_EMAIL_BACKGROUND_URL') ?? undefined
    }),
    attachments: []
  }
}

const buildMessageForDelivery = async (
  supabaseAdmin: SupabaseAdminClient,
  delivery: ClaimedDelivery
) => {
  if (getTemplateKey(delivery) === BELIEF_BROKER_TEMPLATE_KEY) {
    return fetchBeliefBrokerRetainerMessage(supabaseAdmin, delivery)
  }

  return fetchStandardNotificationMessage(supabaseAdmin, delivery)
}

const sendSmtpMessage = async (
  supabaseAdmin: SupabaseAdminClient,
  delivery: ClaimedDelivery
) => {
  const transporter = getTransporter()
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

  return [
    'ECONNECTION',
    'ECONNRESET',
    'EDNS',
    'ESOCKET',
    'ETIMEDOUT',
    'ETLS',
    'EMISSING_RETAINER_DOCUMENT',
    'EATTACHMENT_DOWNLOAD'
  ].includes(smtpError.code ?? '')
}

const isSkippedError = (error: unknown) =>
  Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'ESTALE_DELIVERY')

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
        const providerMessageId = await sendSmtpMessage(supabaseAdmin, delivery)

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
        const shouldSkip = isSkippedError(err)
        const shouldRetry = !shouldSkip && isRetryableError(err) && delivery.attempt_count < delivery.max_attempts
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
