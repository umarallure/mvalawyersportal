<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { getInvoice, getLawyerProfile, markInvoiceAsPaid, requestChargeback, type InvoiceRow } from '../lib/invoices'
import { supabase } from '../lib/supabase'

const route = useRoute()
const auth = useAuth()

const invoiceId = computed(() => (route.params as Record<string, string>).id ?? null)

const loading = ref(true)
const error = ref<string | null>(null)

const invoice = ref<InvoiceRow | null>(null)

const lawyerInfo = ref<{
  full_name: string | null
  firm_name: string | null
  office_address: string | null
  primary_email: string | null
  direct_phone: string | null
  bar_association_number: string | null
  case_rate_per_deal: number | null
} | null>(null)

const lawyerFallback = ref<{
  display_name: string | null
  email: string | null
} | null>(null)

const vendorInfo = ref<{
  center_name: string | null
  lead_vendor: string | null
  contact_email: string | null
} | null>(null)

const isPublisherInvoice = computed(() => invoice.value?.invoice_type === 'publisher')

type InvoiceDealRow = {
  id: string
  submission_id: string
  insured_name: string | null
  state: string | null
  assigned_attorney_id: string | null
  updated_at: string | null
}

type DealDisplayRow = {
  id: string
  case_type: string | null
  insured_name: string | null
  state: string | null
  unit_price: number
  updated_at: string | null
}

const deals = ref<DealDisplayRow[]>([])
const dealLoadError = ref<string | null>(null)
const publisherAttorneyRateMap = ref(new Map<string, number>())

const billToName = computed(() => {
  if (isPublisherInvoice.value) return vendorInfo.value?.center_name ?? vendorInfo.value?.lead_vendor ?? '—'
  return lawyerName.value
})

const billToSubName = computed(() => {
  if (isPublisherInvoice.value) return vendorInfo.value?.lead_vendor ?? null
  return lawyerInfo.value?.firm_name ?? null
})

const billToEmail = computed(() => {
  if (isPublisherInvoice.value) return vendorInfo.value?.contact_email ?? '—'
  return lawyerEmail.value
})

const formatMoney = (n: number) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
  } catch {
    return `$${n.toFixed(2)}`
  }
}

const formatDate = (value: string | null) => {
  if (!value) return '—'
  try {
    const d = new Date(value)
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch {
    return value
  }
}

const formatDateShort = (value: string | null) => {
  if (!value) return '—'
  try {
    const d = new Date(value)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return value
  }
}

const weekOfLabel = computed(() => {
  const inv = invoice.value
  if (!inv) return '—'
  return `${formatDateShort(inv.date_range_start)} — ${formatDateShort(inv.date_range_end)}`
})

const loadPublisherAttorneyRates = async (rows: InvoiceDealRow[]) => {
  const ids = [...new Set(rows
    .map(r => String(r.assigned_attorney_id ?? '').trim())
    .filter(Boolean)
  )]

  if (!ids.length) {
    publisherAttorneyRateMap.value = new Map()
    return
  }

  const { data, error } = await supabase
    .from('attorney_profiles')
    .select('user_id,case_rate_per_deal')
    .in('user_id', ids)

  if (error) throw new Error(error.message)

  const map = new Map<string, number>()
  ;(data ?? []).forEach((r) => {
    const id = String((r as { user_id?: string | null }).user_id ?? '').trim()
    if (!id) return
    const raw = (r as { case_rate_per_deal?: unknown }).case_rate_per_deal
    const n = Number(raw ?? 0)
    if (!Number.isFinite(n) || n <= 0) return
    map.set(id, Math.round(n * 100) / 100)
  })

  publisherAttorneyRateMap.value = map
}

const getDealUnitPrice = (deal: InvoiceDealRow) => {
  if (isPublisherInvoice.value) {
    const attorneyId = String(deal.assigned_attorney_id ?? '').trim()
    if (!attorneyId) return 0
    const n = publisherAttorneyRateMap.value.get(attorneyId) ?? 0
    if (!Number.isFinite(n)) return 0
    return Math.max(0, Math.round(n * 100) / 100)
  }

  const n = Number(lawyerInfo.value?.case_rate_per_deal ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n * 100) / 100)
}

const getStatusLabel = (status: string) => {
  if (status === 'billable') return 'BILLABLE'
  if (status === 'pending') return 'PENDING'
  if (status === 'in_review') return 'PENDING'
  if (status === 'signed_awaiting') return 'SIGNED – AWAITING PAYMENT'
  if (status === 'in_preview') return 'IN PREVIEW'
  if (status === 'paid') return 'PAID'
  return 'CHARGEBACK'
}

const getStatusClass = (status: string) => {
  if (status === 'billable') return 'status-billable'
  if (status === 'paid') return 'status-paid'
  if (status === 'pending') return 'status-pending'
  if (status === 'in_review') return 'status-pending'
  if (status === 'signed_awaiting') return 'status-signed-awaiting'
  if (status === 'in_preview') return 'status-in-preview'
  return 'status-chargeback'
}

const lawyerName = computed(() =>
  lawyerInfo.value?.full_name || lawyerFallback.value?.display_name || lawyerFallback.value?.email || '—'
)

const lawyerEmail = computed(() =>
  lawyerInfo.value?.primary_email || lawyerFallback.value?.email || '—'
)

const markingPaid = ref(false)
const markPaidError = ref<string | null>(null)
const requestingChargeback = ref(false)
const chargebackError = ref<string | null>(null)

const handlePrint = () => {
  window.print()
}

const zoom = ref(0.9)
const clampZoom = (n: number) => Math.min(1.25, Math.max(0.65, Math.round(n * 100) / 100))
const zoomIn = () => { zoom.value = clampZoom(zoom.value + 0.05) }
const zoomOut = () => { zoom.value = clampZoom(zoom.value - 0.05) }
const zoomReset = () => { zoom.value = 0.9 }
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)

const handleMarkAsPaid = async () => {
  if (!invoice.value || invoice.value.status !== 'pending') return
  markingPaid.value = true
  markPaidError.value = null
  try {
    const updated = await markInvoiceAsPaid(invoice.value.id)
    invoice.value = updated
  } catch (e) {
    markPaidError.value = e instanceof Error ? e.message : 'Failed to mark as paid'
  } finally {
    markingPaid.value = false
  }
}

const handleRequestChargeback = async () => {
  if (!invoice.value || invoice.value.status !== 'paid') return
  requestingChargeback.value = true
  chargebackError.value = null
  try {
    const updated = await requestChargeback(invoice.value.id)
    invoice.value = updated
  } catch (e) {
    chargebackError.value = e instanceof Error ? e.message : 'Failed to request chargeback'
  } finally {
    requestingChargeback.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await auth.init()

    if (!invoiceId.value) {
      error.value = 'No invoice ID provided'
      return
    }

    const inv = await getInvoice(invoiceId.value)
    if (!inv) {
      error.value = 'Invoice not found'
      return
    }

    invoice.value = inv

    if (inv.invoice_type === 'publisher' && inv.lead_vendor_id) {
      // Fetch vendor info from centers table
      const { data: center } = await supabase
        .from('centers')
        .select('center_name,lead_vendor,contact_email')
        .eq('id', inv.lead_vendor_id)
        .maybeSingle()
      vendorInfo.value = center ? {
        center_name: center.center_name ?? null,
        lead_vendor: center.lead_vendor ?? null,
        contact_email: center.contact_email ?? null
      } : null
    } else if (inv.lawyer_id) {
      try {
        lawyerInfo.value = await getLawyerProfile(inv.lawyer_id)
      } catch {
        lawyerInfo.value = null
      }

      const { data: appUser } = await supabase
        .from('app_users')
        .select('display_name,email')
        .eq('user_id', inv.lawyer_id)
        .maybeSingle()

      lawyerFallback.value = appUser ? {
        display_name: appUser.display_name ?? null,
        email: appUser.email ?? null
      } : null
    }

    deals.value = []
    dealLoadError.value = null
    if (inv.deal_ids?.length) {
      const { data: ddfRows, error: ddfErr } = await supabase
        .from('daily_deal_flow')
        .select('id,submission_id,insured_name,state,assigned_attorney_id,updated_at')
        .in('id', inv.deal_ids)

      if (ddfErr) throw new Error(ddfErr.message)

      const rawDeals = (ddfRows ?? []) as InvoiceDealRow[]
      if (isPublisherInvoice.value) {
        await loadPublisherAttorneyRates(rawDeals)
      } else {
        publisherAttorneyRateMap.value = new Map()
      }

      const normalizeSubmissionId = (sid: unknown) => {
        const s = String(sid ?? '').trim()
        if (!s) return ''
        const n = Number(s)
        if (Number.isFinite(n) && n > 0) return String(n)
        return s
      }

      const submissionIds = [...new Set(rawDeals
        .map(d => normalizeSubmissionId(d.submission_id))
        .filter(Boolean)
      )]

      const submissionToLeadId = new Map<string, string>()
      const leadIdToOrderId = new Map<string, string>()
      const orderIdToCaseType = new Map<string, string>()

      if (submissionIds.length) {
        const { data: leadRows, error: leadErr } = await supabase
          .from('leads')
          .select('id,submission_id')
          .in('submission_id', submissionIds)

        if (leadErr) throw new Error(leadErr.message)

        ;(leadRows ?? []).forEach((r) => {
          const sid = normalizeSubmissionId((r as { submission_id?: string | null }).submission_id ?? '')
          const lid = String((r as { id?: string | null }).id ?? '').trim()
          if (!sid || !lid) return
          submissionToLeadId.set(sid, lid)
        })
      }

      const leadIds = [...new Set([...submissionToLeadId.values()].filter(Boolean))]
      if (leadIds.length) {
        const { data: fulfillmentRows, error: fErr } = await supabase
          .from('order_fulfillments')
          .select('lead_id,order_id')
          .in('lead_id', leadIds)
          .limit(5000)

        if (fErr) throw new Error(fErr.message)

        ;(fulfillmentRows ?? []).forEach((r) => {
          const lid = String((r as { lead_id?: string | null }).lead_id ?? '').trim()
          const oid = String((r as { order_id?: string | null }).order_id ?? '').trim()
          if (!lid || !oid) return
          if (!leadIdToOrderId.has(lid)) leadIdToOrderId.set(lid, oid)
        })
      }

      const orderIds = [...new Set([...leadIdToOrderId.values()].filter(Boolean))]
      if (orderIds.length) {
        const { data: orderRows, error: oErr } = await supabase
          .from('orders')
          .select('id,case_type')
          .in('id', orderIds)

        if (oErr) throw new Error(oErr.message)

        ;(orderRows ?? []).forEach((r) => {
          const id = String((r as { id?: string | null }).id ?? '').trim()
          const ct = (r as { case_type?: string | null }).case_type ?? null
          if (!id) return
          if (ct) orderIdToCaseType.set(id, ct)
        })
      }

      deals.value = rawDeals.map((d) => {
        const sid = normalizeSubmissionId(d.submission_id)
        const leadId = sid ? submissionToLeadId.get(sid) : undefined
        const orderId = leadId ? leadIdToOrderId.get(leadId) : undefined
        const caseType = orderId ? (orderIdToCaseType.get(orderId) ?? null) : null
        return {
          id: d.id,
          case_type: caseType,
          insured_name: d.insured_name ?? null,
          state: d.state ?? null,
          unit_price: getDealUnitPrice(d),
          updated_at: d.updated_at ?? null,
        }
      })
    }

  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load invoice'
    dealLoadError.value = e instanceof Error ? e.message : 'Failed to load invoice deals'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="invoice-pdf-page">
    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <div class="spinner" />
      <p>Loading invoice...</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
    </div>

    <!-- Invoice -->
    <div v-else-if="invoice" class="invoice-container">
      <!-- Action Buttons (hidden on print) -->
      <div class="print-actions no-print">
        <div class="zoom-controls">
          <button class="zoom-btn" type="button" @click="zoomOut">−</button>
          <div class="zoom-label">{{ zoomLabel }}</div>
          <button class="zoom-btn" type="button" @click="zoomIn">+</button>
          <button class="zoom-btn" type="button" @click="zoomReset">Reset</button>
        </div>
        <button
          v-if="invoice.status === 'pending'"
          class="mark-paid-btn"
          :disabled="markingPaid"
          @click="handleMarkAsPaid"
        >
          {{ markingPaid ? 'Marking...' : 'Mark as Paid' }}
        </button>
        <button
          v-if="invoice.status === 'paid'"
          class="chargeback-btn"
          :disabled="requestingChargeback"
          @click="handleRequestChargeback"
        >
          {{ requestingChargeback ? 'Requesting...' : 'Request Chargeback' }}
        </button>
        <button class="print-btn" @click="handlePrint">
          Print / Save as PDF
        </button>
      </div>
      <div v-if="markPaidError" class="mark-paid-error no-print">
        {{ markPaidError }}
      </div>
      <div v-if="chargebackError" class="mark-paid-error no-print">
        {{ chargebackError }}
      </div>

      <div class="invoice-zoom-viewport">
        <div class="invoice-zoom-wrapper" :style="{ transform: `scale(${zoom})` }">
          <div class="invoice-paper">
        <!-- Top accent bar -->
        <div class="accent-bar" />

        <!-- Header -->
        <div class="invoice-header">
          <div class="header-left">
            <img src="/assets/logo-black.png" alt="Accident Payments" class="company-logo">
          </div>
          <div class="header-right">
            <div class="invoice-title">INVOICE</div>
            <div class="invoice-number">{{ invoice.invoice_number }}</div>
            <div :class="['status-badge', getStatusClass(invoice.status)]">
              {{ getStatusLabel(invoice.status) }}
            </div>
          </div>
        </div>

        <!-- Divider -->
        <div class="divider" />

        <!-- Billing Info -->
        <div class="billing-section">
          <div class="billing-from">
            <div class="billing-label">FROM</div>
            <div class="billing-name">Accident Payments</div>
            <div class="billing-detail">Motor Vehicle Accident Division</div>
            <div class="billing-detail">admin@accidentpayments.com</div>
          </div>

          <div class="billing-to">
            <div class="billing-label">BILL TO</div>
            <div class="billing-name">{{ billToName }}</div>
            <div v-if="billToSubName" class="billing-detail">{{ billToSubName }}</div>
            <div class="billing-detail">{{ billToEmail }}</div>
          </div>

          <div class="billing-dates">
            <div class="date-row">
              <span class="date-label">Invoice Date</span>
              <span class="date-value">{{ formatDate(invoice.created_at) }}</span>
            </div>
            <div class="date-row">
              <span class="date-label">Due Date</span>
              <span class="date-value">{{ formatDate(invoice.due_date) }}</span>
            </div>
            <div class="date-row">
              <span class="date-label">Week Of</span>
              <span class="date-value">{{ weekOfLabel }}</span>
            </div>
          </div>
        </div>

        <!-- Line Items Table -->
        <div class="items-section">
          <div v-if="dealLoadError" class="mark-paid-error no-print">
            {{ dealLoadError }}
          </div>
          <table class="items-table">
            <thead>
              <tr>
                <th class="th-week">Week Of</th>
                <th class="th-pub">Publisher</th>
                <th class="th-type">Case Type</th>
                <th class="th-client">Client Name</th>
                <th class="th-state">State</th>
                <th class="th-price">Value</th>
                <th class="th-date">Updated</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="deal in deals" :key="deal.id">
                <td class="td-week">{{ weekOfLabel }}</td>
                <td class="td-pub">Accident Payments</td>
                <td class="td-type">{{ deal.case_type ?? '—' }}</td>
                <td class="td-client">{{ deal.insured_name ?? '—' }}</td>
                <td class="td-state">{{ deal.state ?? '—' }}</td>
                <td class="td-price">{{ formatMoney(deal.unit_price) }}</td>
                <td class="td-date">{{ formatDateShort(deal.updated_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Totals -->
        <div class="totals-section">
          <div class="totals-box">
            <div class="total-row">
              <span class="total-label">Subtotal</span>
              <span class="total-value">{{ formatMoney(Number(invoice.subtotal)) }}</span>
            </div>
            <div v-if="Number(invoice.tax_rate) > 0" class="total-row">
              <span class="total-label">Tax ({{ (Number(invoice.tax_rate) * 100).toFixed(1) }}%)</span>
              <span class="total-value">{{ formatMoney(Number(invoice.tax_amount)) }}</span>
            </div>
            <div class="total-row total-grand">
              <span class="total-label">Total Due</span>
              <span class="total-value">{{ formatMoney(Number(invoice.total_amount)) }}</span>
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div v-if="invoice.notes" class="notes-section">
          <div class="notes-label">Notes</div>
          <div class="notes-text">{{ invoice.notes }}</div>
        </div>

        <!-- Footer -->
        <div class="invoice-footer">
          <div class="footer-left">
            <div class="footer-text">Thank you for your business.</div>
            <div class="footer-sub">Payment is due by {{ formatDate(invoice.due_date) }}.</div>
          </div>
          <div class="footer-right" />
        </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Reset for PDF page — Accident Payments brand palette */
.invoice-pdf-page {
  min-height: 100vh;
  background: #f5f0ec;
  font-family: 'Montserrat', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #141010;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  gap: 16px;
  color: #7c6a5a;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e8ddd3;
  border-top-color: #ae4010;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error-state p {
  color: #ae4010;
  font-size: 14px;
}

.invoice-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 40px 20px;
}

.print-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.zoom-controls {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid #e8ddd3;
  border-radius: 10px;
  background: #fff;
}

.zoom-btn {
  padding: 6px 10px;
  border: 1px solid #e8ddd3;
  border-radius: 8px;
  background: #faf7f4;
  color: #3d3530;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.zoom-label {
  min-width: 52px;
  text-align: center;
  font-size: 12px;
  color: #7c6a5a;
  font-weight: 700;
}

.mark-paid-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  background: #16a34a;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  font-family: inherit;
}

.mark-paid-btn:hover {
  background: #15803d;
}

.mark-paid-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mark-paid-error {
  text-align: right;
  color: #b91c1c;
  font-size: 13px;
  margin-bottom: 12px;
}

.chargeback-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  background: #b91c1c;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  font-family: inherit;
}

.chargeback-btn:hover {
  background: #991b1b;
}

.chargeback-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.print-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  background: #ae4010;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  font-family: inherit;
}

.print-btn:hover {
  background: #7c2c0a;
}

/* Invoice Paper */
.invoice-paper {
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  border: 1px solid #f0e8e0;
}

.invoice-zoom-viewport {
  overflow-x: auto;
  padding-bottom: 6px;
}

.invoice-zoom-wrapper {
  transform-origin: top center;
  display: inline-block;
}

.accent-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 5px;
  background: linear-gradient(90deg, #7c2c0a, #ae4010, #f7c480);
}

/* Header */
.invoice-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
  padding-top: 8px;
}

.company-logo {
  height: 44px;
  width: auto;
  object-fit: contain;
}

.company-tagline {
  font-size: 11px;
  color: #9a8a7c;
  margin-top: 6px;
  letter-spacing: 0.3px;
}

.header-right {
  text-align: right;
}

.invoice-title {
  font-size: 30px;
  font-weight: 800;
  color: #ae4010;
  letter-spacing: 5px;
}

.invoice-number {
  font-size: 14px;
  font-weight: 600;
  color: #7c6a5a;
  margin-top: 4px;
}

.status-badge {
  display: inline-block;
  margin-top: 8px;
  padding: 4px 14px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
}

.status-billable {
  background: #eff6ff;
  color: #1d4ed8;
}

.status-paid {
  background: #e6f4ea;
  color: #1a7a3a;
}

.status-pending {
  background: #fef3e2;
  color: #ae4010;
}

.status-in-review {
  background: #f5f3ff;
  color: #6d28d9;
}

.status-signed-awaiting {
  background: #ecfdf5;
  color: #065f46;
}

.status-in-preview {
  background: #e0f2fe;
  color: #0369a1;
}

.status-chargeback {
  background: #fde8e8;
  color: #b91c1c;
}

/* Divider */
.divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, #e8ddd3, transparent);
  margin: 24px 0;
}

/* Billing Section */
.billing-section {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 32px;
  margin-bottom: 40px;
}

.billing-label {
  font-size: 10px;
  font-weight: 700;
  color: #ae4010;
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.billing-name {
  font-size: 15px;
  font-weight: 700;
  color: #141010;
  margin-bottom: 4px;
}

.billing-detail {
  font-size: 13px;
  color: #7c6a5a;
  line-height: 1.6;
}

.billing-dates {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.date-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: #faf7f4;
  border-radius: 8px;
  border: 1px solid #f0e8e0;
}

.date-label {
  font-size: 12px;
  font-weight: 600;
  color: #9a8a7c;
}

.date-value {
  font-size: 13px;
  font-weight: 600;
  color: #141010;
}

/* Items Table */
.items-section {
  margin-bottom: 32px;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
}

.items-table thead tr {
  background: #faf7f4;
}

.items-table th {
  padding: 12px 16px;
  font-size: 10px;
  font-weight: 700;
  color: #ae4010;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  text-align: left;
  border-bottom: 2px solid #e8ddd3;
  white-space: nowrap;
}

.th-week { width: 280px; }
.th-pub { width: 180px; }
.th-type { width: 220px; }
.th-client { width: auto; }
.th-state { width: 90px; }
.th-date { width: 140px; }
.th-price { width: 140px; text-align: right; }

.items-table td {
  padding: 14px 16px;
  font-size: 14px;
  color: #3d3530;
  border-bottom: 1px solid #f0e8e0;
  white-space: nowrap;
  overflow: visible;
  text-overflow: clip;
}

.td-week {
  overflow: visible;
  text-overflow: clip;
}


.td-week,
.td-pub,
.td-type,
.td-client,
.td-state,
.td-date {
  color: #7c6a5a;
}

.td-client {
  font-weight: 500;
  color: #3d3530;
}

.td-state {
  font-weight: 600;
  color: #9a8a7c;
}

.td-date {
  font-variant-numeric: tabular-nums;
}

.td-price {
  text-align: right;
  color: #7c6a5a;
  font-variant-numeric: tabular-nums;
}

.items-table tbody tr:last-child td {
  border-bottom: 2px solid #e8ddd3;
}

/* Totals */
.totals-section {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 40px;
}

.totals-box {
  width: 300px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.total-label {
  font-size: 14px;
  color: #7c6a5a;
}

.total-value {
  font-size: 14px;
  font-weight: 600;
  color: #3d3530;
  font-variant-numeric: tabular-nums;
}

.total-grand {
  border-top: 2px solid #e8ddd3;
  margin-top: 8px;
  padding-top: 12px;
}

.total-grand .total-label {
  font-size: 16px;
  font-weight: 800;
  color: #141010;
}

.total-grand .total-value {
  font-size: 22px;
  font-weight: 800;
  color: #ae4010;
}

/* Notes */
.notes-section {
  background: #faf7f4;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 40px;
  border: 1px solid #f0e8e0;
}

.notes-label {
  font-size: 10px;
  font-weight: 700;
  color: #ae4010;
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.notes-text {
  font-size: 13px;
  color: #7c6a5a;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* Footer */
.invoice-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding-top: 24px;
  border-top: 1px solid #e8ddd3;
}

.footer-text {
  font-size: 14px;
  font-weight: 600;
  color: #141010;
}

.footer-sub {
  font-size: 12px;
  color: #9a8a7c;
  margin-top: 4px;
}

.footer-id {
  font-size: 11px;
  color: #c4b8ac;
  font-family: monospace;
}

/* Print Styles */
@media print {
  .no-print {
    display: none !important;
  }

  .invoice-zoom-viewport {
    overflow: visible !important;
  }

  .invoice-zoom-wrapper {
    transform: none !important;
  }

  .invoice-pdf-page {
    background: white;
    padding: 0;
  }

  .invoice-container {
    padding: 0;
    max-width: none;
  }

  .invoice-paper {
    box-shadow: none;
    border-radius: 0;
    padding: 24px;
  }

  body {
    margin: 0;
    padding: 0;
  }

  @page {
    margin: 0.5in;
    size: letter landscape;
  }
}

/* Responsive */
@media (max-width: 768px) {
  .invoice-paper {
    padding: 24px;
  }

  .invoice-header {
    flex-direction: column;
    gap: 16px;
  }

  .header-right {
    text-align: left;
  }

  .billing-section {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .items-table {
    font-size: 12px;
  }

  .items-table th,
  .items-table td {
    padding: 8px;
  }
}
</style>
