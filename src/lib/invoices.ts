import { supabase } from './supabase'

export type InvoiceStatus = 'pending' | 'paid' | 'chargeback'

export type InvoiceItem = {
  description: string
  quantity: number
  unit_price: number
  amount: number
}

export type InvoiceRow = {
  id: string
  invoice_number: string
  lawyer_id: string
  created_by: string
  date_range_start: string
  date_range_end: string
  deal_ids: string[]
  items: InvoiceItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  total_amount: number
  status: InvoiceStatus
  notes: string | null
  due_date: string | null
  created_at: string
  updated_at: string
}

export type InvoiceWithLawyer = InvoiceRow & {
  lawyer_name?: string | null
  lawyer_email?: string | null
  lawyer_firm?: string | null
}

const INVOICE_COLUMNS = 'id,invoice_number,lawyer_id,created_by,date_range_start,date_range_end,deal_ids,items,subtotal,tax_rate,tax_amount,total_amount,status,notes,due_date,created_at,updated_at'

export async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const { count, error } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .ilike('invoice_number', `INV-${year}-%`)

  if (error) throw new Error(error.message)

  const seq = String((count ?? 0) + 1).padStart(4, '0')
  return `INV-${year}-${seq}`
}

export async function createInvoice(input: {
  invoice_number: string
  lawyer_id: string
  created_by: string
  date_range_start: string
  date_range_end: string
  deal_ids: string[]
  items: InvoiceItem[]
  subtotal: number
  tax_rate: number
  tax_amount: number
  total_amount: number
  status?: InvoiceStatus
  notes?: string | null
  due_date?: string | null
}): Promise<InvoiceRow> {
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      invoice_number: input.invoice_number,
      lawyer_id: input.lawyer_id,
      created_by: input.created_by,
      date_range_start: input.date_range_start,
      date_range_end: input.date_range_end,
      deal_ids: input.deal_ids,
      items: input.items,
      subtotal: input.subtotal,
      tax_rate: input.tax_rate,
      tax_amount: input.tax_amount,
      total_amount: input.total_amount,
      status: input.status ?? 'pending',
      notes: input.notes ?? null,
      due_date: input.due_date ?? null
    })
    .select(INVOICE_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return data as InvoiceRow
}

export async function updateInvoice(
  invoiceId: string,
  input: Partial<{
    lawyer_id: string
    date_range_start: string
    date_range_end: string
    deal_ids: string[]
    items: InvoiceItem[]
    subtotal: number
    tax_rate: number
    tax_amount: number
    total_amount: number
    status: InvoiceStatus
    notes: string | null
    due_date: string | null
  }>
): Promise<InvoiceRow> {
  const { data, error } = await supabase
    .from('invoices')
    .update(input)
    .eq('id', invoiceId)
    .select(INVOICE_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return data as InvoiceRow
}

export async function getInvoice(invoiceId: string): Promise<InvoiceRow | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .eq('id', invoiceId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as InvoiceRow) ?? null
}

export async function listInvoices(filters?: {
  lawyer_id?: string
  status?: InvoiceStatus
}): Promise<InvoiceRow[]> {
  let qb = supabase
    .from('invoices')
    .select(INVOICE_COLUMNS)
    .order('created_at', { ascending: false })

  if (filters?.lawyer_id) {
    qb = qb.eq('lawyer_id', filters.lawyer_id)
  }

  if (filters?.status) {
    qb = qb.eq('status', filters.status)
  }

  const { data, error } = await qb

  if (error) throw new Error(error.message)
  return (data ?? []) as InvoiceRow[]
}

export async function deleteInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoiceId)

  if (error) throw new Error(error.message)
}

export async function listLawyers(): Promise<Array<{
  user_id: string
  email: string
  display_name: string | null
}>> {
  const { data, error } = await supabase
    .from('app_users')
    .select('user_id,email,display_name')
    .eq('role', 'lawyer')
    .order('display_name', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Array<{ user_id: string; email: string; display_name: string | null }>
}

export async function getLawyerProfile(lawyerId: string): Promise<{
  full_name: string | null
  firm_name: string | null
  office_address: string | null
  primary_email: string | null
  direct_phone: string | null
  bar_association_number: string | null
} | null> {
  const { data, error } = await supabase
    .from('attorney_profiles')
    .select('full_name,firm_name,office_address,primary_email,direct_phone,bar_association_number')
    .eq('user_id', lawyerId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ?? null
}

export type DealFlowRow = {
  id: string
  submission_id: string
  insured_name: string | null
  client_phone_number: string | null
  lead_vendor: string | null
  date: string | null
  status: string | null
  assigned_attorney_id: string | null
  agent: string | null
  carrier: string | null
  face_amount: number | null
  invoice_id: string | null
  created_at: string | null
}

export async function listDealsForInvoice(input: {
  lawyerId: string
  dateStart: string
  dateEnd: string
  editingInvoiceId?: string | null
}): Promise<DealFlowRow[]> {
  const qb = supabase
    .from('daily_deal_flow')
    .select('id,submission_id,insured_name,client_phone_number,lead_vendor,date,status,assigned_attorney_id,agent,carrier,face_amount,invoice_id,created_at')
    .eq('assigned_attorney_id', input.lawyerId)
    .gte('created_at', input.dateStart)
    .lte('created_at', input.dateEnd + 'T23:59:59.999Z')
    .order('created_at', { ascending: false })

  const { data, error } = await qb

  if (error) throw new Error(error.message)

  // Filter out deals already linked to a different invoice
  const rows = (data ?? []) as DealFlowRow[]
  return rows.filter(d => {
    if (!d.invoice_id) return true
    // If editing an existing invoice, keep deals that belong to it
    if (input.editingInvoiceId && d.invoice_id === input.editingInvoiceId) return true
    return false
  })
}

export async function markInvoiceAsPaid(invoiceId: string): Promise<InvoiceRow> {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'paid' })
    .eq('id', invoiceId)
    .select(INVOICE_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return data as InvoiceRow
}

export async function requestChargeback(invoiceId: string): Promise<InvoiceRow> {
  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'chargeback' })
    .eq('id', invoiceId)
    .select(INVOICE_COLUMNS)
    .single()

  if (error) throw new Error(error.message)
  return data as InvoiceRow
}

export async function linkDealsToInvoice(dealIds: string[], invoiceId: string): Promise<void> {
  if (!dealIds.length) return
  const { data, error } = await supabase
    .from('daily_deal_flow')
    .update({ invoice_id: invoiceId })
    .in('id', dealIds)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Failed to link deals to invoice. No rows were updated — check RLS policies on daily_deal_flow.')
  }
  if (data.length < dealIds.length) {
    console.warn(`linkDealsToInvoice: only ${data.length} of ${dealIds.length} deals were linked`)
  }
}

export async function unlinkDealsFromInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('daily_deal_flow')
    .update({ invoice_id: null })
    .eq('invoice_id', invoiceId)
    .select('id')

  if (error) throw new Error(error.message)
}
