import { supabase } from './supabase'

// ── Pipeline Stage Constants (submission_portal pipeline) ──
// Only stages from "Retainer Signed" onwards are relevant for settlement tracking.
// The daily_deal_flow.status column stores the stage label text.

export const PIPELINE_STAGES = {
  RETAINER_SIGNED: { key: 'retainer_signed', label: 'Retainer Signed', display_order: 7 },
  ATTORNEY_REVIEW: { key: 'attorney_review', label: 'Attorney Review', display_order: 8 },
  APPROVED_PAYABLE: { key: 'approved_payable', label: 'Approved \u2013 Payable', display_order: 9 },
  PAID_TO_BPO: { key: 'paid_to_bpo', label: 'Paid to BPO', display_order: 10 },
} as const

// The status labels we filter daily_deal_flow by
export const SETTLEMENT_STAGE_LABELS = [
  PIPELINE_STAGES.RETAINER_SIGNED.label,
  PIPELINE_STAGES.ATTORNEY_REVIEW.label,
  PIPELINE_STAGES.APPROVED_PAYABLE.label,
  PIPELINE_STAGES.PAID_TO_BPO.label,
] as const

export type SettlementStageLabel = typeof SETTLEMENT_STAGE_LABELS[number]

export const INBOUND_STATUS = {
  PENDING: 'pending',
  RECEIVED: 'received',
} as const

export type InboundStatus = typeof INBOUND_STATUS[keyof typeof INBOUND_STATUS]

export const OUTBOUND_STATUS = {
  LOCKED: 'locked',
  PAID: 'paid',
} as const

export type OutboundStatus = typeof OUTBOUND_STATUS[keyof typeof OUTBOUND_STATUS]

// ── Row Type ──
export type RetainerSettlementRow = {
  id: string
  submission_id: string
  insured_name: string | null
  client_phone_number: string | null
  lead_vendor: string | null
  date_signed: string | null
  status: string
  assigned_attorney_id: string | null
  assigned_attorney_name: string | null
  inbound_payment_status: InboundStatus
  outbound_payment_status: OutboundStatus
  created_at: string | null
}

// ── Attorney Badge Colors ──
const ATTORNEY_COLORS = [
  { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/25' },
  { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/25' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/25' },
  { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/25' },
  { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/25' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/25' },
] as const

export function getAttorneyColor(name: string | null) {
  if (!name) return ATTORNEY_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i)
    hash |= 0
  }
  return ATTORNEY_COLORS[Math.abs(hash) % ATTORNEY_COLORS.length]
}

// ── Derive initial payment state from pipeline stage ──
export function derivePaymentState(status: string): {
  inbound: InboundStatus
  outbound: OutboundStatus
} {
  if (status === PIPELINE_STAGES.PAID_TO_BPO.label) {
    return { inbound: INBOUND_STATUS.RECEIVED, outbound: OUTBOUND_STATUS.PAID }
  }
  return { inbound: INBOUND_STATUS.PENDING, outbound: OUTBOUND_STATUS.LOCKED }
}

// ── Supabase Queries ──

export async function listSettlements(): Promise<RetainerSettlementRow[]> {
  const { data, error } = await supabase
    .from('daily_deal_flow')
    .select('id,submission_id,insured_name,client_phone_number,lead_vendor,date,status,assigned_attorney_id,created_at')
    .in('status', [...SETTLEMENT_STAGE_LABELS])
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  if (!data?.length) return []

  const rows = data as Array<Record<string, unknown>>

  // Resolve attorney names from attorney_profiles
  const attorneyIds = [...new Set(
    rows
      .map(r => r.assigned_attorney_id)
      .filter((id): id is string => Boolean(id))
      .map(String)
  )]

  let attorneyMap = new Map<string, string>()
  if (attorneyIds.length) {
    const { data: attorneys } = await supabase
      .from('attorney_profiles')
      .select('user_id,full_name')
      .in('user_id', attorneyIds)

    attorneyMap = new Map(
      (attorneys ?? []).map((a: Record<string, unknown>) =>
        [String(a.user_id), String(a.full_name ?? '').trim()]
      )
    )
  }

  return rows.map((r): RetainerSettlementRow => {
    const attId = r.assigned_attorney_id ? String(r.assigned_attorney_id) : null
    const attName = attId ? (attorneyMap.get(attId) || null) : null
    const status = String(r.status ?? '')
    const payment = derivePaymentState(status)

    return {
      id: String(r.id),
      submission_id: String(r.submission_id ?? ''),
      insured_name: r.insured_name ? String(r.insured_name) : null,
      client_phone_number: r.client_phone_number ? String(r.client_phone_number) : null,
      lead_vendor: r.lead_vendor ? String(r.lead_vendor) : null,
      date_signed: r.date ? String(r.date) : null,
      status,
      assigned_attorney_id: attId,
      assigned_attorney_name: attName,
      inbound_payment_status: payment.inbound,
      outbound_payment_status: payment.outbound,
      created_at: r.created_at ? String(r.created_at) : null,
    }
  })
}

// Update deal status to any settlement stage (used by kanban drag-and-drop)
export async function updateDealStatus(dealId: string, newStatus: string): Promise<void> {
  const { error } = await supabase
    .from('daily_deal_flow')
    .update({ status: newStatus })
    .eq('id', dealId)

  if (error) throw new Error(error.message)
}

// Update deal status to "Paid to BPO" (final settlement stage)
export async function markPaidToBpo(dealId: string): Promise<void> {
  const { error } = await supabase
    .from('daily_deal_flow')
    .update({ status: PIPELINE_STAGES.PAID_TO_BPO.label })
    .eq('id', dealId)

  if (error) throw new Error(error.message)
}

// ── Kanban Column Definitions ──
// Colors match pipeline_stages column_class from the submission_portal pipeline.
export const KANBAN_COLUMNS = [
  {
    key: PIPELINE_STAGES.RETAINER_SIGNED.key,
    label: PIPELINE_STAGES.RETAINER_SIGNED.label,
    icon: 'i-lucide-file-signature',
    borderClass: 'border-t-emerald-500/50',
    headerBg: 'bg-emerald-50/60 dark:bg-emerald-950/10',
    bodyBg: 'bg-emerald-50/50 dark:bg-emerald-950/15',
    badgeClass: 'bg-emerald-500/10 text-emerald-500',
  },
  {
    key: PIPELINE_STAGES.ATTORNEY_REVIEW.key,
    label: PIPELINE_STAGES.ATTORNEY_REVIEW.label,
    icon: 'i-lucide-scale',
    borderClass: 'border-t-violet-500/50',
    headerBg: 'bg-violet-50/60 dark:bg-violet-950/10',
    bodyBg: 'bg-violet-50/50 dark:bg-violet-950/15',
    badgeClass: 'bg-violet-500/10 text-violet-500',
  },
  {
    key: PIPELINE_STAGES.APPROVED_PAYABLE.key,
    label: PIPELINE_STAGES.APPROVED_PAYABLE.label,
    icon: 'i-lucide-check-circle',
    borderClass: 'border-t-teal-500/50',
    headerBg: 'bg-teal-50/60 dark:bg-teal-950/10',
    bodyBg: 'bg-teal-50/50 dark:bg-teal-950/15',
    badgeClass: 'bg-teal-500/10 text-teal-500',
  },
  {
    key: PIPELINE_STAGES.PAID_TO_BPO.key,
    label: PIPELINE_STAGES.PAID_TO_BPO.label,
    icon: 'i-lucide-banknote',
    borderClass: 'border-t-fuchsia-500/50',
    headerBg: 'bg-fuchsia-50/60 dark:bg-fuchsia-950/10',
    bodyBg: 'bg-fuchsia-50/50 dark:bg-fuchsia-950/15',
    badgeClass: 'bg-fuchsia-500/10 text-fuchsia-500',
  },
] as const
