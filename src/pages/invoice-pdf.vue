<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { getInvoice, getLawyerProfile, type InvoiceItem, type InvoiceRow } from '../lib/invoices'
import { supabase } from '../lib/supabase'

const route = useRoute()
const auth = useAuth()

const invoiceId = computed(() => (route.params as Record<string, string>).id ?? null)

const loading = ref(true)
const error = ref<string | null>(null)

const invoice = ref<InvoiceRow | null>(null)
const invoicePaper = ref<HTMLElement | null>(null)
const downloadingPdf = ref(false)
const pdfDownloadError = ref<string | null>(null)

const lawyerInfo = ref<{
  full_name: string | null
  firm_name: string | null
  office_address: string | null
  primary_email: string | null
  direct_phone: string | null
  bar_association_number: string | null
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

const billToName = computed(() => {
  if (isPublisherInvoice.value) return vendorInfo.value?.center_name ?? vendorInfo.value?.lead_vendor ?? '-'
  return lawyerName.value
})

const billToSubName = computed(() => {
  if (isPublisherInvoice.value) return vendorInfo.value?.lead_vendor ?? null
  return lawyerInfo.value?.firm_name ?? null
})

const billToEmail = computed(() => {
  if (isPublisherInvoice.value) return vendorInfo.value?.contact_email ?? '-'
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
  if (!value) return '-'
  try {
    const d = new Date(value)
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch {
    return value
  }
}

const formatDateShort = (value: string | null) => {
  if (!value) return '-'
  try {
    const d = new Date(value)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return value
  }
}

const getStatusLabel = (status: string) => {
  if (status === 'billable') return 'BILLABLE'
  if (status === 'pending') return 'BILLABLE'
  if (status === 'in_review') return 'PENDING PAYMENT'
  if (status === 'signed_awaiting') return 'PENDING PAYMENT'
  if (status === 'in_preview') return 'IN PREVIEW'
  if (status === 'paid') return 'SUCCESSFUL PAYMENT'
  return 'LATE PAYMENT'
}

const getStatusClass = (status: string) => {
  if (status === 'billable') return 'status-billable'
  if (status === 'pending') return 'status-billable'
  if (status === 'paid') return 'status-paid'
  if (status === 'in_review') return 'status-in-review'
  if (status === 'signed_awaiting') return 'status-in-review'
  if (status === 'in_preview') return 'status-in-preview'
  return 'status-chargeback'
}

const getStatusBadgeWidth = (status: string) => {
  const label = getStatusLabel(status)
  if (label === 'SUCCESSFUL PAYMENT') return 162
  if (label === 'PENDING PAYMENT') return 142
  if (label === 'LATE PAYMENT') return 116
  if (label === 'IN PREVIEW') return 102
  return 86
}

const getStatusBadgeSvgWidth = (status: string) => getStatusBadgeWidth(status) + 8
const statusBadgeSvgHeight = 38
const pdfPaperWidthPx = 816
const pdfPaperHeightPx = 1056

const lawyerName = computed(() =>
  lawyerInfo.value?.full_name || lawyerFallback.value?.display_name || lawyerFallback.value?.email || '-'
)

const lawyerEmail = computed(() =>
  lawyerInfo.value?.primary_email || lawyerFallback.value?.email || '-'
)

const pdfFileName = computed(() => {
  const fallback = 'invoice'
  const raw = invoice.value?.invoice_number || fallback
  const safe = raw.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || fallback
  return `${safe}.pdf`
})

const waitForInvoiceAssets = async (element: HTMLElement) => {
  const images = Array.from(element.querySelectorAll('img'))
  await Promise.all(images.map((img) => {
    if (img.complete) return Promise.resolve()
    return new Promise<void>((resolve) => {
      img.addEventListener('load', () => resolve(), { once: true })
      img.addEventListener('error', () => resolve(), { once: true })
    })
  }))

  if (document.fonts) {
    await document.fonts.ready
  }
}

const handleDownloadPdf = async () => {
  const paper = invoicePaper.value
  if (!paper || downloadingPdf.value) return

  downloadingPdf.value = true
  pdfDownloadError.value = null

  try {
    await waitForInvoiceAssets(paper)

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf')
    ])

    const canvas = await html2canvas(paper, {
      backgroundColor: '#ffffff',
      height: pdfPaperHeightPx,
      scale: Math.min(3, Math.max(2, window.devicePixelRatio || 1)),
      scrollX: 0,
      scrollY: 0,
      useCORS: true,
      width: pdfPaperWidthPx,
      logging: false,
      windowWidth: pdfPaperWidthPx,
      windowHeight: pdfPaperHeightPx,
      onclone: (clonedDocument) => {
        const clonedPaper = clonedDocument.querySelector('.invoice-paper') as HTMLElement | null
        if (!clonedPaper) return
        clonedPaper.style.border = '0'
        clonedPaper.style.borderRadius = '0'
        clonedPaper.style.boxShadow = 'none'
        clonedPaper.style.boxSizing = 'border-box'
        clonedPaper.style.height = `${pdfPaperHeightPx}px`
        clonedPaper.style.maxHeight = `${pdfPaperHeightPx}px`
        clonedPaper.style.maxWidth = `${pdfPaperWidthPx}px`
        clonedPaper.style.minHeight = `${pdfPaperHeightPx}px`
        clonedPaper.style.overflow = 'hidden'
        clonedPaper.style.width = `${pdfPaperWidthPx}px`
      }
    })

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'letter'
    })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const imageData = canvas.toDataURL('image/png')

    pdf.addImage(imageData, 'PNG', 0, 0, pageWidth, pageHeight)
    pdf.save(pdfFileName.value)
  } catch (e) {
    pdfDownloadError.value = e instanceof Error ? e.message : 'Failed to download PDF'
  } finally {
    downloadingPdf.value = false
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

  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load invoice'
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
      <!-- PDF action (hidden on print) -->
      <div class="pdf-action-bar no-print">
        <div class="pdf-action-copy">
          <span class="pdf-action-eyebrow">PDF ready</span>
          <strong>Download the PDF version</strong>
        </div>
        <button
          class="pdf-download-btn"
          type="button"
          :disabled="downloadingPdf"
          @click="handleDownloadPdf"
        >
          {{ downloadingPdf ? 'Preparing PDF...' : 'Download PDF' }}
        </button>
      </div>
      <div v-if="pdfDownloadError" class="pdf-download-error no-print">
        {{ pdfDownloadError }}
      </div>

      <div ref="invoicePaper" class="invoice-paper">
        <div class="paper-content">

          <!-- Header -->
          <header class="invoice-header">
            <div class="brand-mark">
              <img src="/assets/logo-black.png" alt="Accident Payments" class="company-logo">
            </div>
            <div class="invoice-id-block">
              <div class="invoice-number-label">No.</div>
              <div class="invoice-number">{{ invoice.invoice_number }}</div>
              <svg
                :class="['status-badge', getStatusClass(invoice.status)]"
                :width="getStatusBadgeSvgWidth(invoice.status)"
                :height="statusBadgeSvgHeight"
                :viewBox="`0 0 ${getStatusBadgeSvgWidth(invoice.status)} ${statusBadgeSvgHeight}`"
                overflow="visible"
                role="img"
                :aria-label="getStatusLabel(invoice.status)"
              >
                <rect
                  class="status-badge-bg"
                  x="4.75"
                  y="7.75"
                  :width="getStatusBadgeWidth(invoice.status) - 1.5"
                  height="22.5"
                  rx="11.25"
                />
                <text
                  class="status-badge-text"
                  :x="getStatusBadgeSvgWidth(invoice.status) / 2"
                  :y="statusBadgeSvgHeight / 2"
                  dominant-baseline="middle"
                  text-anchor="middle"
                >
                  {{ getStatusLabel(invoice.status) }}
                </text>
              </svg>
            </div>
          </header>

          <section class="title-section">
            <div class="invoice-kicker">{{ isPublisherInvoice ? 'Publisher Statement' : 'Legal Services Statement' }}</div>
            <h1>INVOICE</h1>
            <div class="invoice-date-line">
              <span>Date:</span>
              <strong>{{ formatDate(invoice.created_at) }}</strong>
            </div>
          </section>

          <!-- Billing Info -->
          <section class="billing-section" aria-label="Billing details">
            <div class="billing-card billing-card-to">
              <div class="billing-label">Billed to:</div>
              <div class="billing-name">{{ billToName }}</div>
              <div v-if="billToSubName" class="billing-detail">{{ billToSubName }}</div>
              <div class="billing-detail">{{ billToEmail }}</div>
              <div v-if="!isPublisherInvoice && lawyerInfo?.office_address" class="billing-detail">
                {{ lawyerInfo.office_address }}
              </div>
              <div v-if="!isPublisherInvoice && lawyerInfo?.direct_phone" class="billing-detail">
                {{ lawyerInfo.direct_phone }}
              </div>
            </div>

            <div class="billing-card">
              <div class="billing-label">From:</div>
              <div class="billing-name">Accident Payments</div>
              <div class="billing-detail">Motor Vehicle Accident Division</div>
              <div class="billing-detail">admin@accidentpayments.com</div>
            </div>
          </section>

          <section class="invoice-meta-grid" aria-label="Invoice dates">
            <div class="meta-item">
              <span>Due date</span>
              <strong>{{ formatDate(invoice.due_date) }}</strong>
            </div>
            <div class="meta-item">
              <span>Service period</span>
              <strong>{{ formatDateShort(invoice.date_range_start) }} - {{ formatDateShort(invoice.date_range_end) }}</strong>
            </div>
            <div class="meta-item">
              <span>Invoice type</span>
              <strong>{{ isPublisherInvoice ? 'Publisher' : 'Lawyer' }}</strong>
            </div>
          </section>

          <!-- Line Items Table -->
          <section class="items-section" aria-label="Invoice line items">
            <table class="items-table">
              <thead>
                <tr>
                  <th class="th-desc">Item</th>
                  <th class="th-qty">Quantity</th>
                  <th class="th-price">Price</th>
                  <th class="th-amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in (invoice.items as InvoiceItem[])" :key="idx">
                  <td class="td-desc">
                    <span class="item-index">{{ String(idx + 1).padStart(2, '0') }}</span>
                    <span>{{ item.description }}</span>
                  </td>
                  <td class="td-qty">{{ item.quantity }}</td>
                  <td class="td-price">{{ formatMoney(item.unit_price) }}</td>
                  <td class="td-amount">{{ formatMoney(item.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <!-- Totals -->
          <section class="summary-section" aria-label="Invoice summary">
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
                <span class="total-label">Total</span>
                <span class="total-value">{{ formatMoney(Number(invoice.total_amount)) }}</span>
              </div>
            </div>
          </section>
        </div>

        <footer class="invoice-footer" aria-label="Invoice footer">
          <div class="footer-wave footer-wave-light" />
          <div class="footer-wave footer-wave-dark" />
          <div class="footer-content">
            <div>Thank you for your business.</div>
            <div>{{ invoice.invoice_number }}</div>
          </div>
        </footer>
      </div>
    </div>
  </div>
</template>

<style>
/* Redesigned invoice presentation */
.invoice-pdf-page {
  background:
    linear-gradient(135deg, rgba(174, 64, 16, 0.08), transparent 28%),
    #ece8e2;
  color: #171514;
  font-family: 'Montserrat', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  letter-spacing: 0;
}

.invoice-container {
  max-width: 940px;
  padding: 34px 20px 48px;
}

.pdf-action-bar {
  align-items: center;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(23, 21, 20, 0.08);
  border-radius: 8px;
  box-shadow: 0 14px 36px rgba(23, 21, 20, 0.08);
  display: flex;
  gap: 16px;
  justify-content: space-between;
  margin: 0 auto 18px;
  max-width: 816px;
  padding: 12px 12px 12px 16px;
}

.pdf-action-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.pdf-action-eyebrow {
  color: #ae4010;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0;
  text-transform: uppercase;
}

.pdf-action-copy strong {
  color: #171514;
  font-size: 13px;
  font-weight: 900;
}

.pdf-download-btn {
  background: #171514;
  border: 0;
  border-radius: 6px;
  box-shadow: 0 10px 24px rgba(23, 21, 20, 0.16);
  color: #ffffff;
  cursor: pointer;
  flex: 0 0 auto;
  font-family: inherit;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0;
  padding: 11px 18px;
  transition: background 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}

.pdf-download-btn:hover {
  background: #2a2522;
  box-shadow: 0 12px 26px rgba(23, 21, 20, 0.2);
  transform: translateY(-1px);
}

.pdf-download-btn:disabled {
  cursor: wait;
  opacity: 0.65;
  transform: none;
}

.pdf-download-btn:active {
  transform: translateY(0);
}

.pdf-download-error {
  color: #b42318;
  font-size: 12px;
  font-weight: 700;
  margin: -8px auto 14px;
  max-width: 816px;
  text-align: right;
}

.invoice-paper {
  background: #ffffff;
  border: 1px solid rgba(23, 21, 20, 0.08);
  border-radius: 6px;
  box-shadow: 0 24px 80px rgba(23, 21, 20, 0.14);
  margin: 0 auto;
  max-width: 816px;
  min-height: 1056px;
  overflow: hidden;
  padding: 0;
  position: relative;
}

.paper-content {
  padding: 54px 64px 214px;
  position: relative;
  z-index: 2;
}

.invoice-header {
  align-items: flex-start;
  display: flex;
  justify-content: space-between;
  margin-bottom: 38px;
  padding: 0;
}

.brand-mark {
  align-items: flex-start;
  display: flex;
  min-height: 42px;
}

.company-logo {
  height: 34px;
  max-width: 168px;
  object-fit: contain;
  object-position: left center;
}

.invoice-id-block {
  align-items: flex-end;
  color: #26211e;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  line-height: 1;
  text-align: right;
}

.invoice-number-label {
  color: #6e6762;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 14px;
  text-transform: uppercase;
}

.invoice-number {
  color: #171514;
  font-size: 13px;
  font-weight: 800;
  line-height: 18px;
  margin-top: 1px;
}

.status-badge {
  display: block;
  flex: 0 0 auto;
  margin-top: 5px;
  overflow: visible;
}

.status-badge-bg {
  fill: #fff5ef;
  shape-rendering: geometricPrecision;
  stroke: currentColor;
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
}

.status-badge-text {
  dominant-baseline: middle;
  fill: currentColor;
  font-family: 'Montserrat', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0;
  text-anchor: middle;
}

.status-billable,
.status-in-review,
.status-in-preview {
  color: #ae4010;
}

.status-paid {
  color: #1b7a3d;
}

.status-chargeback {
  color: #b42318;
}

.status-paid .status-badge-bg {
  fill: #effaf2;
}

.status-chargeback .status-badge-bg {
  fill: #fff1f1;
}

.title-section {
  margin-bottom: 30px;
}

.invoice-kicker {
  color: #ae4010;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.title-section h1 {
  color: #171514;
  font-size: clamp(48px, 8vw, 70px);
  font-weight: 900;
  letter-spacing: 0;
  line-height: 0.92;
  margin: 0;
}

.invoice-date-line {
  align-items: baseline;
  color: #171514;
  display: flex;
  font-size: 13px;
  gap: 7px;
  margin-top: 24px;
}

.invoice-date-line span,
.billing-label,
.total-label,
.meta-item span {
  color: #171514;
  font-weight: 900;
  letter-spacing: 0;
}

.invoice-date-line strong,
.meta-item strong {
  color: #342f2c;
  font-weight: 600;
}

.billing-section {
  display: grid;
  gap: 54px;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  margin: 0 0 26px;
}

.billing-card {
  min-width: 0;
}

.billing-label {
  font-size: 13px;
  margin-bottom: 9px;
}

.billing-name {
  color: #171514;
  font-size: 15px;
  font-weight: 800;
  margin-bottom: 5px;
}

.billing-detail {
  color: #524a45;
  font-size: 13px;
  line-height: 1.48;
  overflow-wrap: anywhere;
}

.invoice-meta-grid {
  border-bottom: 1px solid #e3dfdc;
  border-top: 1px solid #e3dfdc;
  display: grid;
  gap: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 18px 0 30px;
}

.meta-item {
  border-right: 1px solid #e3dfdc;
  padding: 14px 18px 14px 0;
}

.meta-item + .meta-item {
  padding-left: 18px;
}

.meta-item:last-child {
  border-right: 0;
}

.meta-item span,
.meta-item strong {
  display: block;
}

.meta-item span {
  font-size: 11px;
  margin-bottom: 4px;
  text-transform: uppercase;
}

.meta-item strong {
  font-size: 12px;
}

.items-section {
  margin: 0 0 28px;
}

.items-table {
  border-collapse: collapse;
  color: #171514;
  table-layout: fixed;
  width: 100%;
}

.items-table thead tr {
  background: #e9e8e7;
}

.items-table th {
  border: 0;
  color: #3c3632;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  padding: 12px 14px;
  text-align: left;
  text-transform: none;
}

.items-table td {
  border-bottom: 1px solid #e6e2df;
  color: #302b28;
  font-size: 13px;
  padding: 14px;
  vertical-align: top;
}

.items-table tbody tr:last-child td {
  border-bottom: 2px solid #171514;
}

.th-desc {
  width: auto;
}

.th-qty,
.td-qty {
  text-align: center;
  width: 92px;
}

.th-price,
.td-price,
.th-amount,
.td-amount {
  text-align: right;
  width: 124px;
}

.td-desc {
  color: #171514;
  font-weight: 700;
}

.item-index {
  color: #9a928c;
  display: inline-block;
  font-size: 11px;
  font-weight: 800;
  margin-right: 12px;
  width: 24px;
}

.td-qty,
.td-price {
  color: #5d5550;
  font-variant-numeric: tabular-nums;
}

.td-amount {
  color: #171514;
  font-variant-numeric: tabular-nums;
  font-weight: 900;
}

.summary-section {
  display: flex;
  justify-content: flex-end;
}

.totals-box {
  color: #171514;
  max-width: 100%;
  width: 292px;
}

.total-row {
  align-items: center;
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
}

.total-label,
.total-value {
  font-size: 13px;
}

.total-value {
  color: #171514;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
}

.total-grand {
  border-top: 2px solid #171514;
  margin-top: 8px;
  padding-top: 13px;
}

.total-grand .total-label {
  color: #171514;
  font-size: 15px;
}

.total-grand .total-value {
  color: #ae4010;
  font-size: 20px;
  font-weight: 900;
}

.invoice-footer {
  border: 0;
  bottom: 0;
  height: 190px;
  left: 0;
  overflow: hidden;
  padding: 0;
  position: absolute;
  right: 0;
  z-index: 1;
}

.footer-wave {
  position: absolute;
  transform-origin: center bottom;
}

.footer-wave-light {
  background: #d85a1e;
  border-radius: 56% 44% 0 0 / 72% 58% 0 0;
  bottom: -96px;
  height: 218px;
  left: -22%;
  right: 20%;
  transform: rotate(4deg);
}

.footer-wave-dark {
  background: #171917;
  border-radius: 52% 48% 0 0 / 64% 54% 0 0;
  bottom: -118px;
  height: 250px;
  left: -9%;
  right: -18%;
  transform: rotate(-5deg);
}

.footer-content {
  align-items: end;
  bottom: 18px;
  color: rgba(255, 255, 255, 0.86);
  display: flex;
  font-size: 11px;
  font-weight: 700;
  justify-content: space-between;
  left: 64px;
  position: absolute;
  right: 64px;
  z-index: 3;
}

@media print {
  .no-print {
    display: none !important;
  }

  .invoice-pdf-page {
    background: #ffffff;
  }

  .invoice-container {
    max-width: none;
    padding: 0;
  }

  .invoice-paper {
    border: 0;
    border-radius: 0;
    box-shadow: none;
    max-width: none;
    min-height: 11in;
    width: 100%;
  }

  .paper-content {
    padding: 0.55in 0.62in 2.05in;
  }

  .invoice-footer {
    height: 1.85in;
  }

  @page {
    margin: 0;
    size: letter;
  }
}

@media (max-width: 768px) {
  .invoice-container {
    padding: 18px 12px 32px;
  }

  .pdf-action-bar {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .pdf-download-btn {
    width: 100%;
  }

  .invoice-paper {
    border-radius: 4px;
    min-height: auto;
    padding: 0;
  }

  .paper-content {
    padding: 34px 24px 178px;
  }

  .invoice-header {
    flex-direction: row;
    gap: 18px;
    margin-bottom: 30px;
  }

  .company-logo {
    height: 28px;
    max-width: 136px;
  }

  .title-section h1 {
    font-size: 44px;
  }

  .billing-section {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .summary-section {
    justify-content: stretch;
  }

  .totals-box {
    width: 100%;
  }

  .invoice-meta-grid {
    grid-template-columns: 1fr;
  }

  .meta-item,
  .meta-item + .meta-item {
    border-right: 0;
    border-top: 1px solid #e3dfdc;
    padding: 12px 0;
  }

  .meta-item:first-child {
    border-top: 0;
  }

  .items-section {
    overflow-x: auto;
  }

  .items-table {
    min-width: 560px;
  }

  .items-table th,
  .items-table td {
    padding: 11px 10px;
  }

  .footer-content {
    left: 24px;
    right: 24px;
  }
}
</style>
