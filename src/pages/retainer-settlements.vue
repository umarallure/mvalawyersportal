<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import {
  SETTLEMENT_COLUMNS,
  SETTLEMENT_STAGE_LABELS,
  INBOUND_STATUS,
  OUTBOUND_STATUS,
  KANBAN_COLUMNS,
  getAttorneyColor,
  listSettlements,
  markPaidToBpo,
  updateDealSettlementColumn,
  derivePaymentState,
  type RetainerSettlementRow,
} from '../lib/retainer-settlements'

const router = useRouter()
const auth = useAuth()

// ── State ──
const loading = ref(false)
const error = ref<string | null>(null)
const query = ref('')
const attorneyFilter = ref('All')
const statusFilter = ref('All')
const filterDateStart = ref('')
const viewMode = ref<'table' | 'kanban'>('kanban')

const pageSize = 25
const currentPage = ref(1)

const rows = ref<RetainerSettlementRow[]>([])

// ── Load Data ──
const load = async () => {
  loading.value = true
  error.value = null

  try {
    await auth.init()

    rows.value = await listSettlements()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load settlements'
    error.value = msg
  } finally {
    loading.value = false
  }
}

// ── Derived Data ──
const availableAttorneys = computed(() => {
  const names = [...new Set(rows.value.map(r => r.assigned_attorney_name).filter(Boolean))] as string[]
  names.sort((a, b) => a.localeCompare(b))
  return names
})

const attorneyOptions = computed(() => ['All', ...availableAttorneys.value])

const statusOptions = computed(() => [
  'All',
  ...SETTLEMENT_STAGE_LABELS,
])

const filtered = computed(() => {
  let result = rows.value

  if (attorneyFilter.value !== 'All') {
    result = result.filter(r => r.assigned_attorney_name === attorneyFilter.value)
  }

  if (statusFilter.value !== 'All') {
    // Match by column label
    const col = KANBAN_COLUMNS.find(c => c.label === statusFilter.value)
    if (col) result = result.filter(r => r.settlement_column === col.key)
  }

  if (filterDateStart.value) {
    result = result.filter(r => (r.created_at ?? '').slice(0, 10) >= filterDateStart.value)
  }

  const q = query.value.trim().toLowerCase()
  if (q) {
    result = result.filter(r => {
      const name = (r.insured_name ?? '').toLowerCase()
      const subId = (r.submission_id ?? '').toLowerCase()
      const vendor = (r.lead_vendor ?? '').toLowerCase()
      const attorney = (r.assigned_attorney_name ?? '').toLowerCase()
      return name.includes(q) || subId.includes(q) || vendor.includes(q) || attorney.includes(q)
    })
  }

  return result
})

const totalCount = computed(() => filtered.value.length)
const pageCount = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize)))
const displayPage = computed(() => Math.min(Math.max(1, currentPage.value), pageCount.value))

const pagedRows = computed(() => {
  const from = (displayPage.value - 1) * pageSize
  return filtered.value.slice(from, from + pageSize)
})

const canPrev = computed(() => currentPage.value > 1)
const canNext = computed(() => currentPage.value < pageCount.value)

const goPrev = () => { if (canPrev.value) currentPage.value -= 1 }
const goNext = () => { if (canNext.value) currentPage.value += 1 }

// ── Summary Stats ──
const totalSettlements = computed(() => rows.value.length)
const awaitingBillableCount = computed(() => rows.value.filter(r => r.settlement_column === SETTLEMENT_COLUMNS.AWAITING_BILLABLE.key).length)
const invoiceToAttorneyCount = computed(() => rows.value.filter(r => r.settlement_column === SETTLEMENT_COLUMNS.INVOICE_TO_ATTORNEY.key).length)
const attorneyPaidCount = computed(() => rows.value.filter(r => r.settlement_column === SETTLEMENT_COLUMNS.ATTORNEY_PAID.key).length)
const invoiceToPublisherCount = computed(() => rows.value.filter(r => r.settlement_column === SETTLEMENT_COLUMNS.INVOICE_TO_PUBLISHER.key).length)
const paidToBpoCount = computed(() => rows.value.filter(r => r.settlement_column === SETTLEMENT_COLUMNS.PAID_TO_BPO.key).length)

// ── Helpers ──
const formatMoney = (n: number) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  } catch {
    return `$${n.toFixed(2)}`
  }
}

const formatDate = (value: string | null) => {
  if (!value) return '—'
  try {
    const d = new Date(value)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return value.length >= 10 ? value.slice(0, 10) : value
  }
}

const getInitials = (name: string | null) => {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

const getStatusStyle = (colKey: string) => {
  switch (colKey) {
    case SETTLEMENT_COLUMNS.AWAITING_BILLABLE.key:
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    case SETTLEMENT_COLUMNS.INVOICE_TO_ATTORNEY.key:
      return 'bg-violet-500/10 text-violet-400 border-violet-500/20'
    case SETTLEMENT_COLUMNS.ATTORNEY_PAID.key:
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    case SETTLEMENT_COLUMNS.INVOICE_TO_PUBLISHER.key:
      return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
    case SETTLEMENT_COLUMNS.PAID_TO_BPO.key:
      return 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20'
    default:
      return 'bg-[var(--ap-card-divide)] text-muted border-[var(--ap-card-border)]'
  }
}

const getStatusIcon = (colKey: string) => {
  switch (colKey) {
    case SETTLEMENT_COLUMNS.AWAITING_BILLABLE.key: return 'i-lucide-file-signature'
    case SETTLEMENT_COLUMNS.INVOICE_TO_ATTORNEY.key: return 'i-lucide-scale'
    case SETTLEMENT_COLUMNS.ATTORNEY_PAID.key: return 'i-lucide-badge-dollar-sign'
    case SETTLEMENT_COLUMNS.INVOICE_TO_PUBLISHER.key: return 'i-lucide-send'
    case SETTLEMENT_COLUMNS.PAID_TO_BPO.key: return 'i-lucide-banknote'
    default: return 'i-lucide-circle'
  }
}

const getColumnLabel = (colKey: string) => {
  const col = KANBAN_COLUMNS.find(c => c.key === colKey)
  return col?.label ?? colKey
}

const isPaidToBpo = (row: RetainerSettlementRow) => row.settlement_column === SETTLEMENT_COLUMNS.PAID_TO_BPO.key

// Safety Lock: Can't pay outbound until inbound is received
const canPayOutbound = (row: RetainerSettlementRow) => {
  if (isPaidToBpo(row)) return false
  if (row.outbound_payment_status === OUTBOUND_STATUS.PAID) return false
  return row.inbound_payment_status === INBOUND_STATUS.RECEIVED
}

const canMarkInbound = (row: RetainerSettlementRow) => {
  if (isPaidToBpo(row)) return false
  return row.inbound_payment_status === INBOUND_STATUS.PENDING
}

// ── Actions ──
const toggleInbound = async (row: RetainerSettlementRow) => {
  if (!canMarkInbound(row)) return

  const oldInbound = row.inbound_payment_status
  const oldColumn = row.settlement_column

  // Optimistic UI
  row.inbound_payment_status = INBOUND_STATUS.RECEIVED

  // If this lead is still in awaiting billable or invoice to attorney, advance to attorney paid
  const shouldAdvance =
    row.settlement_column === SETTLEMENT_COLUMNS.AWAITING_BILLABLE.key ||
    row.settlement_column === SETTLEMENT_COLUMNS.INVOICE_TO_ATTORNEY.key

  if (shouldAdvance) {
    row.settlement_column = SETTLEMENT_COLUMNS.ATTORNEY_PAID.key
    row.outbound_payment_status = OUTBOUND_STATUS.LOCKED
  }

  try {
    if (shouldAdvance) {
      await updateDealSettlementColumn(row.id, SETTLEMENT_COLUMNS.ATTORNEY_PAID.key)
    }
  } catch (e) {
    // Revert
    row.inbound_payment_status = oldInbound
    row.settlement_column = oldColumn
    const payment = derivePaymentState(oldColumn)
    row.outbound_payment_status = payment.outbound
    error.value = e instanceof Error ? e.message : 'Failed to update inbound payment'
  }
}

const toggleOutbound = async (row: RetainerSettlementRow) => {
  if (!canPayOutbound(row)) return
  const oldColumn = row.settlement_column
  try {
    await markPaidToBpo(row.id)
    row.outbound_payment_status = OUTBOUND_STATUS.PAID
    row.settlement_column = SETTLEMENT_COLUMNS.PAID_TO_BPO.key
  } catch (e) {
    row.settlement_column = oldColumn
    error.value = e instanceof Error ? e.message : 'Failed to mark as paid to BPO'
  }
}

// ── Kanban ──
const kanbanColumns = computed(() =>
  KANBAN_COLUMNS.map(col => {
    const cards = filtered.value.filter(r => r.settlement_column === col.key)
    const totalValue = cards.reduce((sum, c) => sum + Number(c.face_amount ?? 0), 0)
    return {
      ...col,
      cards,
      totalValue,
    }
  })
)

// Drag-and-drop state
const draggedCard = ref<RetainerSettlementRow | null>(null)
const dragOverColumn = ref<string | null>(null)
const isDragging = ref(false)
const kanbanBoardEl = ref<HTMLElement | null>(null)
let lastAutoScrollAt = 0

const autoScrollKanbanBoard = (e: DragEvent) => {
  if (!isDragging.value) return
  const el = kanbanBoardEl.value
  if (!el) return

  const now = performance.now()
  if (now - lastAutoScrollAt < 16) return
  lastAutoScrollAt = now

  const rect = el.getBoundingClientRect()
  const x = e.clientX
  const threshold = 64
  const maxSpeed = 10

  const leftDist = x - rect.left
  const rightDist = rect.right - x

  if (leftDist < threshold) {
    const intensity = Math.max(0, Math.min(1, (threshold - leftDist) / threshold))
    el.scrollLeft -= Math.ceil(maxSpeed * intensity)
  } else if (rightDist < threshold) {
    const intensity = Math.max(0, Math.min(1, (threshold - rightDist) / threshold))
    el.scrollLeft += Math.ceil(maxSpeed * intensity)
  }
}

const onDragStart = (e: DragEvent, row: RetainerSettlementRow) => {
  isDragging.value = true
  draggedCard.value = row
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', row.id)
  }
}

const onDragOver = (e: DragEvent, colKey: string) => {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverColumn.value = colKey
  autoScrollKanbanBoard(e)
}

const onBoardDragOver = (e: DragEvent) => {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  autoScrollKanbanBoard(e)
}

const onDragLeave = () => {
  dragOverColumn.value = null
}

const onDrop = async (e: DragEvent, colKey: string) => {
  e.preventDefault()
  dragOverColumn.value = null
  const card = draggedCard.value
  draggedCard.value = null
  if (!card || card.settlement_column === colKey) return

  // Don't allow drops on non-droppable columns
  const col = KANBAN_COLUMNS.find(c => c.key === colKey)
  if (!col || !col.droppable) return

  const oldColumn = card.settlement_column
  // Optimistic update
  card.settlement_column = colKey
  const payment = derivePaymentState(colKey)
  card.inbound_payment_status = payment.inbound
  card.outbound_payment_status = payment.outbound

  try {
    await updateDealSettlementColumn(card.id, colKey)
  } catch (err) {
    // Revert on failure
    card.settlement_column = oldColumn
    const revert = derivePaymentState(oldColumn)
    card.inbound_payment_status = revert.inbound
    card.outbound_payment_status = revert.outbound
    error.value = err instanceof Error ? err.message : 'Failed to update status'
  }
}

const onDragEnd = () => {
  draggedCard.value = null
  dragOverColumn.value = null
  window.setTimeout(() => {
    isDragging.value = false
  }, 0)
}

const onCardClick = (row: RetainerSettlementRow) => {
  if (isDragging.value) return
  router.push({ path: `/retainers/${row.id}`, query: { from: '/retainer-settlements' } })
}

// ── Watchers ──
watch([query, attorneyFilter, statusFilter, filterDateStart], () => {
  currentPage.value = 1
})

watch(pageCount, () => {
  if (currentPage.value > pageCount.value) currentPage.value = pageCount.value
})

onMounted(load)
</script>

<template>
  <UDashboardPanel id="retainer-settlements">
    <template #header>
      <UDashboardNavbar title="Retainer Settlements">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <div class="hidden items-center gap-1.5 rounded-full border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/8 px-3 py-1 sm:flex">
              <span class="h-1.5 w-1.5 rounded-full bg-[var(--ap-accent)] animate-pulse" />
              <span class="text-xs font-medium text-[var(--ap-accent)]">{{ totalSettlements }} settlements</span>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-refresh-cw"
              size="sm"
              :loading="loading"
              class="rounded-lg"
              @click="load"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col gap-5">
        <!-- Summary Cards -->
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div class="rounded-xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-4">
            <div class="flex items-center gap-2">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10">
                <UIcon name="i-lucide-file-text" class="text-sm text-[var(--ap-accent)]" />
              </div>
              <div>
                <p class="text-lg font-bold text-highlighted tabular-nums">{{ totalSettlements }}</p>
                <p class="text-[10px] font-medium uppercase tracking-wider text-muted">Total</p>
              </div>
            </div>
          </div>
          <div class="rounded-xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-4">
            <div class="flex items-center gap-2">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                <UIcon name="i-lucide-file-signature" class="text-sm text-emerald-400" />
              </div>
              <div>
                <p class="text-lg font-bold text-highlighted tabular-nums">{{ awaitingBillableCount }}</p>
                <p class="text-[10px] font-medium uppercase tracking-wider text-muted">Awaiting Billable</p>
              </div>
            </div>
          </div>
          <div class="rounded-xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-4">
            <div class="flex items-center gap-2">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
                <UIcon name="i-lucide-scale" class="text-sm text-violet-400" />
              </div>
              <div>
                <p class="text-lg font-bold text-highlighted tabular-nums">{{ invoiceToAttorneyCount }}</p>
                <p class="text-[10px] font-medium uppercase tracking-wider text-muted">Invoice to Attorney</p>
              </div>
            </div>
          </div>
          <div class="rounded-xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-4">
            <div class="flex items-center gap-2">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                <UIcon name="i-lucide-badge-dollar-sign" class="text-sm text-amber-400" />
              </div>
              <div>
                <p class="text-lg font-bold text-highlighted tabular-nums">{{ attorneyPaidCount }}</p>
                <p class="text-[10px] font-medium uppercase tracking-wider text-muted">Attorney Paid</p>
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-4">
            <div class="flex items-center gap-2">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10">
                <UIcon name="i-lucide-send" class="text-sm text-indigo-400" />
              </div>
              <div>
                <p class="text-lg font-bold text-highlighted tabular-nums">{{ invoiceToPublisherCount }}</p>
                <p class="text-[10px] font-medium uppercase tracking-wider text-muted">Invoice to Publisher</p>
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-4">
            <div class="flex items-center gap-2">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-fuchsia-500/10">
                <UIcon name="i-lucide-banknote" class="text-sm text-fuchsia-400" />
              </div>
              <div>
                <p class="text-lg font-bold text-highlighted tabular-nums">{{ paidToBpoCount }}</p>
                <p class="text-[10px] font-medium uppercase tracking-wider text-muted">Paid to BPO</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-1 flex-wrap items-center gap-2.5">
            <div class="relative max-w-xs flex-1">
              <UInput
                v-model="query"
                class="w-full [&_input]:rounded-xl [&_input]:border-[var(--ap-card-border)] [&_input]:bg-[var(--ap-card-hover)] [&_input]:pl-10 [&_input]:backdrop-blur-sm"
                icon="i-lucide-search"
                placeholder="Search settlements..."
              />
            </div>

            <USelect
              v-model="attorneyFilter"
              :items="attorneyOptions"
              placeholder="Attorney: All"
              class="w-48 [&_button]:rounded-xl [&_button]:border-[var(--ap-card-border)] [&_button]:bg-[var(--ap-card-hover)]"
            />

            <USelect
              v-model="statusFilter"
              :items="statusOptions"
              placeholder="Stage: All"
              class="w-48 [&_button]:rounded-xl [&_button]:border-[var(--ap-card-border)] [&_button]:bg-[var(--ap-card-hover)]"
            />

            <UInput
              v-model="filterDateStart"
              type="date"
              class="w-38 [&_input]:rounded-xl [&_input]:border-[var(--ap-card-border)] [&_input]:bg-[var(--ap-card-hover)]"
              placeholder="Created start"
              title="Created date start"
            />
          </div>

          <div class="flex items-center gap-1 rounded-xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-0.5">
            <button
              class="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all"
              :class="viewMode === 'table' ? 'bg-[var(--ap-accent)]/15 text-[var(--ap-accent)]' : 'text-muted hover:text-default'"
              @click="viewMode = 'table'"
            >
              <UIcon name="i-lucide-table-2" class="text-sm" />
              Table
            </button>
            <button
              class="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-all"
              :class="viewMode === 'kanban' ? 'bg-[var(--ap-accent)]/15 text-[var(--ap-accent)]' : 'text-muted hover:text-default'"
              @click="viewMode = 'kanban'"
            >
              <UIcon name="i-lucide-columns-3" class="text-sm" />
              Board
            </button>
          </div>
        </div>

        <!-- Error Alert -->
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          title="Unable to load settlements"
          :description="error"
          class="rounded-xl"
        />

        <!-- Table Card -->
        <div v-if="viewMode === 'table'" class="relative flex flex-1 min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)]">
          <!-- Loading Skeleton -->
          <div v-if="loading && !rows.length" class="flex flex-1 items-center justify-center p-12">
            <div class="flex flex-col items-center gap-3">
              <UIcon name="i-lucide-loader-2" class="animate-spin text-2xl text-[var(--ap-accent)]" />
              <span class="text-sm text-muted">Loading settlements...</span>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else-if="!loading && !filtered.length" class="flex flex-1 items-center justify-center p-12">
            <div class="flex flex-col items-center gap-3 text-center">
              <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10">
                <UIcon name="i-lucide-landmark" class="text-2xl text-[var(--ap-accent)]/60" />
              </div>
              <div>
                <p class="text-sm font-medium text-highlighted">No settlements found</p>
                <p class="mt-0.5 text-xs text-muted">Try adjusting your search or filters</p>
              </div>
            </div>
          </div>

          <!-- Table Content -->
          <div v-else class="flex-1 min-h-0 overflow-auto settlements-scroll">
            <table class="w-full min-w-[1100px]">
              <thead class="sticky top-0 z-10">
                <tr class="border-b border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] backdrop-blur-xl">
                  <th class="w-[130px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                    Date Signed
                  </th>
                  <th class="w-[200px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                    Lead Details
                  </th>
                  <th class="w-[170px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                    Attorney
                  </th>
                  <th class="w-[140px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                    Source
                  </th>
                  <th class="w-[160px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                    Case Status
                  </th>
                  <th class="w-[150px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                    Inbound
                  </th>
                  <th class="w-[150px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted">
                    Outbound
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in pagedRows"
                  :key="row.id"
                  class="group border-b border-[var(--ap-card-hover)] transition-all duration-200 hover:bg-[var(--ap-accent)]/[0.04]"
                >
                  <!-- Date Signed -->
                  <td class="px-4 py-3.5">
                    <div class="flex items-center gap-2">
                      <UIcon name="i-lucide-calendar" class="shrink-0 text-xs text-muted" />
                      <span class="text-sm text-default">{{ formatDate(row.date_signed) }}</span>
                    </div>
                  </td>

                  <!-- Lead Details -->
                  <td class="px-4 py-3.5">
                    <div class="flex items-center gap-3">
                      <div class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--ap-accent)]/20 to-[var(--ap-accent)]/5 text-xs font-bold text-[var(--ap-accent)] ring-1 ring-[var(--ap-accent)]/10 transition-all duration-200 group-hover:ring-[var(--ap-accent)]/30 group-hover:shadow-[0_0_12px_var(--ap-accent-shadow)]">
                        {{ getInitials(row.insured_name) }}
                      </div>
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-highlighted transition-colors duration-200 group-hover:text-[var(--ap-accent)]">
                          {{ row.insured_name ?? 'Unknown' }}
                        </p>
                        <p class="truncate text-[11px] text-muted font-mono">
                          {{ row.submission_id }}
                        </p>
                      </div>
                    </div>
                  </td>

                  <!-- Attorney (Badge/Tag) -->
                  <td class="px-4 py-3.5">
                    <span
                      v-if="row.assigned_attorney_name"
                      class="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold"
                      :class="[
                        getAttorneyColor(row.assigned_attorney_name).bg,
                        getAttorneyColor(row.assigned_attorney_name).text,
                        getAttorneyColor(row.assigned_attorney_name).border,
                      ]"
                    >
                      <UIcon name="i-lucide-briefcase" class="text-[10px]" />
                      {{ row.assigned_attorney_name }}
                    </span>
                    <span v-else class="text-xs text-muted">—</span>
                  </td>

                  <!-- Source (Origin / BPO) -->
                  <td class="px-4 py-3.5">
                    <span
                      v-if="row.lead_vendor"
                      class="inline-flex items-center rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] px-2.5 py-1 text-xs font-medium text-default"
                    >
                      {{ row.lead_vendor }}
                    </span>
                    <span v-else class="text-xs text-muted">—</span>
                  </td>

                  <!-- Case Status (Pill) -->
                  <td class="px-4 py-3.5">
                    <span
                      class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
                      :class="getStatusStyle(row.settlement_column)"
                    >
                      <UIcon :name="getStatusIcon(row.settlement_column)" class="text-[11px]" />
                      {{ getColumnLabel(row.settlement_column) }}
                    </span>
                  </td>

                  <!-- Inbound Payment (Attorney → Us) -->
                  <td class="px-4 py-3.5">
                    <button
                      v-if="row.inbound_payment_status === 'pending'"
                      class="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-1.5 text-xs font-medium text-amber-400 transition-all hover:bg-amber-500/15 hover:border-amber-500/40"
                      @click.stop="toggleInbound(row)"
                    >
                      <span class="relative flex h-2.5 w-2.5">
                        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-50" />
                        <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
                      </span>
                      Pending
                    </button>
                    <div
                      v-else
                      class="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-1.5"
                    >
                      <span class="flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      <span class="text-xs font-medium text-emerald-400">Received</span>
                    </div>
                  </td>

                  <!-- Outbound Payment (Us → BPO) — Safety Lock -->
                  <td class="px-4 py-3.5">
                    <div
                      v-if="row.outbound_payment_status === 'paid'"
                      class="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-1.5"
                    >
                      <span class="flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      <span class="text-xs font-medium text-emerald-400">Paid</span>
                    </div>
                    <button
                      v-else-if="canPayOutbound(row)"
                      class="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/8 px-3 py-1.5 text-xs font-medium text-blue-400 transition-all hover:bg-blue-500/15 hover:border-blue-500/40"
                      @click.stop="toggleOutbound(row)"
                    >
                      <UIcon name="i-lucide-send" class="text-[11px]" />
                      Pay BPO
                    </button>
                    <div
                      v-else
                      class="flex items-center gap-2 rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-divide)] px-3 py-1.5 opacity-50"
                      title="Locked — Inbound payment must be received first"
                    >
                      <UIcon name="i-lucide-lock" class="text-[11px] text-muted" />
                      <span class="text-xs font-medium text-muted">Locked</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination Footer -->
          <div class="flex items-center justify-between border-t border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-5 py-3 backdrop-blur-xl">
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted">
                Showing <span class="font-medium text-highlighted">{{ pagedRows.length }}</span> of <span class="font-medium text-highlighted">{{ totalCount }}</span>
              </span>
            </div>

            <div class="flex items-center gap-1.5">
              <button
                class="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] px-3 text-xs font-medium text-default transition-all hover:bg-[var(--ap-card-border)] disabled:pointer-events-none disabled:opacity-30"
                :disabled="!canPrev"
                @click="goPrev"
              >
                <UIcon name="i-lucide-chevron-left" class="text-sm" />
                Prev
              </button>

              <div class="flex h-8 items-center rounded-lg border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/8 px-3">
                <span class="text-xs font-semibold text-[var(--ap-accent)]">{{ displayPage }}</span>
                <span class="mx-1 text-xs text-muted">/</span>
                <span class="text-xs text-muted">{{ pageCount }}</span>
              </div>

              <button
                class="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] px-3 text-xs font-medium text-default transition-all hover:bg-[var(--ap-card-border)] disabled:pointer-events-none disabled:opacity-30"
                :disabled="!canNext"
                @click="goNext"
              >
                Next
                <UIcon name="i-lucide-chevron-right" class="text-sm" />
              </button>
            </div>
          </div>
        </div>

        <!-- Kanban Board -->
        <div v-else-if="viewMode === 'kanban'" class="flex flex-1 min-h-0 flex-col">
          <!-- Loading -->
          <div v-if="loading && !rows.length" class="flex flex-1 items-center justify-center p-12">
            <div class="flex flex-col items-center gap-3">
              <UIcon name="i-lucide-loader-2" class="animate-spin text-2xl text-[var(--ap-accent)]" />
              <span class="text-sm text-muted">Loading settlements...</span>
            </div>
          </div>

          <!-- Empty -->
          <div v-else-if="!loading && !filtered.length" class="flex flex-1 items-center justify-center p-12">
            <div class="flex flex-col items-center gap-3 text-center">
              <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10">
                <UIcon name="i-lucide-landmark" class="text-2xl text-[var(--ap-accent)]/60" />
              </div>
              <div>
                <p class="text-sm font-medium text-highlighted">No settlements found</p>
                <p class="mt-0.5 text-xs text-muted">Try adjusting your search or filters</p>
              </div>
            </div>
          </div>

          <!-- Kanban Columns -->
          <div
            v-else
            ref="kanbanBoardEl"
            class="flex flex-1 min-h-0 gap-4 overflow-x-auto pb-2 kanban-scroll"
            @dragover="onBoardDragOver"
          >
            <div
              v-for="col in kanbanColumns"
              :key="col.key"
              class="flex w-72 shrink-0 flex-col rounded-2xl border border-t-[3px] border-[var(--ap-card-border)] transition-all duration-200"
              :class="[
                col.borderClass,
                dragOverColumn === col.key ? 'ring-2 ring-[var(--ap-accent)]/30 bg-[var(--ap-accent)]/[0.02]' : 'bg-[var(--ap-card-bg)]',
              ]"
              @dragover="onDragOver($event, col.key)"
              @dragleave="onDragLeave"
              @drop="onDrop($event, col.key)"
            >
              <!-- Column Header -->
              <div class="flex items-center justify-between px-4 py-3">
                <div class="flex items-center gap-2">
                  <UIcon :name="col.icon" class="text-sm text-muted" />
                  <span class="text-xs font-semibold text-highlighted">{{ col.label }}</span>
                </div>
                <div class="flex items-end gap-2">
                  <div class="text-right">
                    <div class="text-[10px] font-semibold text-muted">{{ formatMoney(col.totalValue) }}</div>
                    <div class="text-[9px] text-muted">Total value</div>
                  </div>
                  <span
                    class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
                    :class="col.badgeClass"
                  >
                    {{ col.cards.length }}
                  </span>
                </div>
              </div>

              <!-- Column Body / Cards -->
              <div class="flex flex-1 min-h-0 flex-col gap-2.5 overflow-y-auto px-3 pb-3 kanban-scroll">
                <div
                  v-for="card in col.cards"
                  :key="card.id"
                  draggable="true"
                  class="group/card cursor-grab rounded-xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-3.5 shadow-sm transition-all duration-200 hover:border-[var(--ap-accent)]/20 hover:shadow-md active:cursor-grabbing"
                  :class="draggedCard?.id === card.id ? 'opacity-40 scale-95' : ''"
                  @click.stop="onCardClick(card)"
                  @dragstart="onDragStart($event, card)"
                  @dragend="onDragEnd"
                >
                  <!-- Card Header: Name + Initials -->
                  <div class="flex items-start gap-2.5">
                    <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--ap-accent)]/20 to-[var(--ap-accent)]/5 text-[10px] font-bold text-[var(--ap-accent)] ring-1 ring-[var(--ap-accent)]/10">
                      {{ getInitials(card.insured_name) }}
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-highlighted leading-tight">
                        {{ card.insured_name ?? 'Unknown' }}
                      </p>
                      <p class="truncate text-[10px] text-muted mt-0.5">
                        {{ card.face_amount ? formatMoney(Number(card.face_amount)) : '—' }}
                      </p>
                    </div>
                  </div>

                  <!-- Attorney Tag -->
                  <div v-if="card.assigned_attorney_name" class="mt-2.5">
                    <span
                      class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold"
                      :class="[
                        getAttorneyColor(card.assigned_attorney_name).bg,
                        getAttorneyColor(card.assigned_attorney_name).text,
                        getAttorneyColor(card.assigned_attorney_name).border,
                      ]"
                    >
                      <UIcon name="i-lucide-briefcase" class="text-[9px]" />
                      {{ card.assigned_attorney_name }}
                    </span>
                  </div>

                  <!-- Card Details Row -->
                  <div class="mt-2.5 flex items-center gap-3 text-[10px] text-muted">
                    <div v-if="card.lead_vendor" class="flex items-center gap-1 truncate">
                      <UIcon name="i-lucide-building-2" class="text-[9px] shrink-0" />
                      <span class="truncate">{{ card.lead_vendor }}</span>
                    </div>
                    <div v-if="card.date_signed" class="flex items-center gap-1 shrink-0">
                      <UIcon name="i-lucide-calendar" class="text-[9px]" />
                      {{ formatDate(card.date_signed) }}
                    </div>
                  </div>

                  <!-- Payment Indicators -->
                  <div class="mt-2.5 flex items-center gap-2">
                    <div
                      class="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                      :class="card.inbound_payment_status === 'received'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-amber-500/10 text-amber-400'"
                    >
                      <span
                        class="h-1.5 w-1.5 rounded-full"
                        :class="card.inbound_payment_status === 'received' ? 'bg-emerald-400' : 'bg-amber-400'"
                      />
                      {{ card.inbound_payment_status === 'received' ? 'Received' : 'Pending' }}
                    </div>
                    <div
                      class="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                      :class="card.outbound_payment_status === 'paid'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-[var(--ap-card-divide)] text-muted'"
                    >
                      <UIcon
                        :name="card.outbound_payment_status === 'paid' ? 'i-lucide-check' : 'i-lucide-lock'"
                        class="text-[9px]"
                      />
                      {{ card.outbound_payment_status === 'paid' ? 'Paid' : 'Locked' }}
                    </div>
                  </div>
                </div>

                <!-- Drop Placeholder (when column is empty) -->
                <div
                  v-if="!col.cards.length"
                  class="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-[var(--ap-card-border)] p-6"
                >
                  <span class="text-xs text-muted">Drop cards here</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.settlements-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.settlements-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.settlements-scroll::-webkit-scrollbar-thumb {
  background: var(--ap-card-border);
  border-radius: 3px;
}
.settlements-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--ap-dot-hover);
}
.kanban-scroll::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}
.kanban-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.kanban-scroll::-webkit-scrollbar-thumb {
  background: var(--ap-card-border);
  border-radius: 3px;
}
.kanban-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--ap-dot-hover);
}
</style>
