<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { listInvoices, markInvoiceAsPaid, requestChargeback, type InvoiceRow, type InvoiceStatus } from '../lib/invoices'
import { supabase } from '../lib/supabase'

type ViewMode = 'kanban' | 'list'

const router = useRouter()
const auth = useAuth()

const isSuperAdmin = computed(() => auth.state.value.profile?.role === 'super_admin')
const isAdmin = computed(() => auth.state.value.profile?.role === 'admin')
const isAdminOrSuper = computed(() => isSuperAdmin.value || isAdmin.value)

const loading = ref(false)
const error = ref<string | null>(null)
const query = ref('')
const page = ref(1)
const PAGE_SIZE = 25
const viewMode = ref<ViewMode>('kanban')
const selectedStatus = ref<'all' | InvoiceStatus>('all')

const invoices = ref<(InvoiceRow & { lawyer_name?: string | null })[]>([])

const filteredInvoices = computed(() => {
  const q = query.value.trim().toLowerCase()
  return invoices.value.filter((inv) => {
    if (selectedStatus.value !== 'all' && inv.status !== selectedStatus.value) return false
    if (!q) return true
    const haystack = [inv.invoice_number, inv.lawyer_name ?? '', inv.notes ?? ''].join(' ').toLowerCase()
    return haystack.includes(q)
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredInvoices.value.length / PAGE_SIZE)))

const pagedRows = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filteredInvoices.value.slice(start, start + PAGE_SIZE)
})

const invoicesByStatus = computed(() => {
  const grouped = new Map<InvoiceStatus, typeof invoices.value>()
  const statuses: InvoiceStatus[] = ['pending', 'paid', 'chargeback']
  statuses.forEach((s) => grouped.set(s, []))
  filteredInvoices.value.forEach((inv) => {
    const arr = grouped.get(inv.status)
    if (arr) arr.push(inv)
  })
  return grouped
})

const totalAmount = computed(() => invoices.value.reduce((sum, inv) => sum + Number(inv.total_amount), 0))
const paidAmount = computed(() => invoices.value.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + Number(inv.total_amount), 0))
const pendingAmount = computed(() => invoices.value.filter(inv => inv.status === 'pending').reduce((sum, inv) => sum + Number(inv.total_amount), 0))
const chargebackAmount = computed(() => invoices.value.filter(inv => inv.status === 'chargeback').reduce((sum, inv) => sum + Number(inv.total_amount), 0))

const formatMoney = (n: number) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
  } catch {
    return `$${n}`
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

const getStatusLabel = (status: InvoiceStatus) => {
  if (status === 'pending') return 'Pending'
  if (status === 'paid') return 'Paid'
  return 'Chargeback'
}

const getStatusIcon = (status: InvoiceStatus) => {
  if (status === 'paid') return 'i-lucide-check-circle'
  if (status === 'pending') return 'i-lucide-clock'
  return 'i-lucide-alert-triangle'
}

const load = async () => {
  loading.value = true
  error.value = null

  try {
    await auth.init()
    const userId = auth.state.value.user?.id ?? null
    const role = auth.state.value.profile?.role ?? null

    const filters: { lawyer_id?: string; status?: InvoiceStatus } = {}

    if (role === 'lawyer' && userId) {
      filters.lawyer_id = userId
    }

    if (selectedStatus.value !== 'all') {
      filters.status = selectedStatus.value
    }

    const data = await listInvoices(filters)

    // Fetch lawyer names for admin view
    if (role === 'super_admin' || role === 'admin') {
      const lawyerIds = [...new Set(data.map(d => d.lawyer_id).filter(Boolean))]
      if (lawyerIds.length) {
        const { data: profiles } = await supabase
          .from('attorney_profiles')
          .select('user_id,full_name')
          .in('user_id', lawyerIds)

        const nameMap = new Map(
          (profiles ?? []).map((p: any) => [String(p.user_id), String(p.full_name ?? '').trim()])
        )

        // Also fetch from app_users as fallback
        const { data: appUsers } = await supabase
          .from('app_users')
          .select('user_id,display_name,email')
          .in('user_id', lawyerIds)

        const fallbackMap = new Map(
          (appUsers ?? []).map((u: any) => [String(u.user_id), String(u.display_name || u.email || '').trim()])
        )

        data.forEach((inv: any) => {
          inv.lawyer_name = nameMap.get(inv.lawyer_id) || fallbackMap.get(inv.lawyer_id) || null
        })
      }
    }

    invoices.value = data as (InvoiceRow & { lawyer_name?: string | null })[]
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load invoices'
    error.value = msg
  } finally {
    loading.value = false
  }
}

const openInvoicePdf = (invoice: InvoiceRow) => {
  const url = router.resolve(`/invoicing/${invoice.id}/pdf`).href
  window.open(url, '_blank')
}

const editInvoice = (invoice: InvoiceRow) => {
  router.push(`/invoicing/edit/${invoice.id}`)
}

const handleMarkAsPaid = async (invoice: InvoiceRow & { lawyer_name?: string | null }) => {
  try {
    const updated = await markInvoiceAsPaid(invoice.id)
    const idx = invoices.value.findIndex(i => i.id === invoice.id)
    if (idx !== -1) {
      invoices.value[idx] = { ...invoices.value[idx], ...updated }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to mark as paid'
  }
}

const handleRequestChargeback = async (invoice: InvoiceRow & { lawyer_name?: string | null }) => {
  try {
    const updated = await requestChargeback(invoice.id)
    const idx = invoices.value.findIndex(i => i.id === invoice.id)
    if (idx !== -1) {
      invoices.value[idx] = { ...invoices.value[idx], ...updated }
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to request chargeback'
  }
}

const createInvoice = () => {
  router.push('/invoicing/create')
}

onMounted(() => {
  load()
})

watch([selectedStatus], () => {
  page.value = 1
  load()
})

watch(pageCount, () => {
  if (page.value > pageCount.value) page.value = pageCount.value
})
</script>

<template>
  <UDashboardPanel id="invoicing">
    <template #header>
      <UDashboardNavbar title="Invoicing">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <div class="hidden items-center gap-1.5 rounded-full border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/8 px-3 py-1 sm:flex">
              <span class="h-1.5 w-1.5 rounded-full bg-[var(--ap-accent)] animate-pulse" />
              <span class="text-xs font-medium text-[var(--ap-accent)]">{{ invoices.length }} total</span>
            </div>

            <UButton
              v-if="isAdminOrSuper"
              color="primary"
              icon="i-lucide-plus"
              size="sm"
              class="rounded-lg"
              @click="createInvoice"
            >
              Create Invoice
            </UButton>

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
        <!-- Stats Cards -->
        <div class="grid gap-4 sm:grid-cols-4">
          <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Total Invoiced</p>
                <p class="mt-1 text-2xl font-bold text-highlighted">{{ formatMoney(totalAmount) }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
                <UIcon name="i-lucide-receipt" class="text-lg text-[var(--ap-accent)]" />
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Paid</p>
                <p class="mt-1 text-2xl font-bold text-green-400">{{ formatMoney(paidAmount) }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
                <UIcon name="i-lucide-check-circle" class="text-lg text-green-400" />
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Pending</p>
                <p class="mt-1 text-2xl font-bold text-amber-400">{{ formatMoney(pendingAmount) }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                <UIcon name="i-lucide-clock" class="text-lg text-amber-400" />
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Chargeback</p>
                <p class="mt-1 text-2xl font-bold text-red-400">{{ formatMoney(chargebackAmount) }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                <UIcon name="i-lucide-alert-circle" class="text-lg text-red-400" />
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
                class="w-full [&_input]:rounded-xl [&_input]:border-white/[0.06] [&_input]:bg-white/[0.03] [&_input]:pl-10 [&_input]:backdrop-blur-sm"
                icon="i-lucide-search"
                placeholder="Search invoices..."
              />
            </div>

            <USelect
              v-model="selectedStatus"
              :items="[
                { label: 'All Statuses', value: 'all' },
                { label: 'Pending', value: 'pending' },
                { label: 'Paid', value: 'paid' },
                { label: 'Chargeback', value: 'chargeback' }
              ]"
              class="w-44 [&_button]:rounded-xl [&_button]:border-white/[0.06] [&_button]:bg-white/[0.03]"
              value-key="value"
              label-key="label"
            />
          </div>

          <div class="flex items-center gap-2.5">
            <div class="inline-flex rounded-xl border border-white/[0.06] bg-white/[0.02] p-0.5">
              <button
                v-for="mode in (['kanban', 'list'] as ViewMode[])"
                :key="mode"
                type="button"
                class="rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
                :class="viewMode === mode
                  ? 'bg-[var(--ap-accent)] text-white shadow-sm'
                  : 'text-muted hover:text-highlighted hover:bg-white/[0.04]'"
                @click="viewMode = mode"
              >
                {{ mode === 'kanban' ? 'Board' : 'List' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Error Alert -->
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          title="Unable to load invoices"
          :description="error"
          class="rounded-xl"
        />

        <!-- Loading -->
        <div v-if="loading && !invoices.length" class="flex flex-1 items-center justify-center p-12">
          <div class="flex flex-col items-center gap-3">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-2xl text-[var(--ap-accent)]" />
            <span class="text-sm text-muted">Loading invoices...</span>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else-if="!loading && !invoices.length" class="flex flex-1 items-center justify-center p-12">
          <div class="flex flex-col items-center gap-4 text-center">
            <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10">
              <UIcon name="i-lucide-receipt" class="text-3xl text-[var(--ap-accent)]/60" />
            </div>
            <div>
              <p class="text-sm font-medium text-highlighted">No invoices yet</p>
              <p class="mt-1 text-xs text-muted">
                {{ isAdminOrSuper ? 'Create your first invoice to get started' : 'No invoices have been created for you yet' }}
              </p>
            </div>
            <UButton
              v-if="isAdminOrSuper"
              color="primary"
              icon="i-lucide-plus"
              @click="createInvoice"
            >
              Create Invoice
            </UButton>
          </div>
        </div>

        <!-- Kanban View -->
        <div v-else-if="viewMode === 'kanban'" class="min-h-0 flex-1 overflow-hidden">
          <div class="flex h-full gap-3">
            <div
              v-for="status in (['pending', 'paid', 'chargeback'] as InvoiceStatus[])"
              :key="status"
              class="flex min-w-0 flex-1 flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02]"
            >
              <div class="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <div class="flex items-center gap-2">
                  <UIcon :name="getStatusIcon(status)" class="text-sm" :class="{
                    'text-amber-400': status === 'pending',
                    'text-green-400': status === 'paid',
                    'text-red-400': status === 'chargeback'
                  }" />
                  <span class="text-sm font-semibold text-highlighted">{{ getStatusLabel(status) }}</span>
                </div>
                <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/[0.06] px-1.5 text-[10px] font-bold text-muted">
                  {{ invoicesByStatus.get(status)?.length ?? 0 }}
                </span>
              </div>

              <div class="flex-1 space-y-2 overflow-y-auto p-2 invoicing-scroll">
                <div
                  v-for="invoice in (invoicesByStatus.get(status) ?? [])"
                  :key="invoice.id"
                  class="group cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all duration-200 hover:border-[var(--ap-accent)]/30 hover:bg-[var(--ap-accent)]/[0.04]"
                  @click="openInvoicePdf(invoice)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-highlighted group-hover:text-[var(--ap-accent)]">
                        {{ invoice.invoice_number }}
                      </div>
                      <div v-if="isAdminOrSuper && invoice.lawyer_name" class="mt-0.5 text-xs text-muted">
                        {{ invoice.lawyer_name }}
                      </div>
                    </div>
                    <div class="shrink-0 text-sm font-bold text-highlighted">
                      {{ formatMoney(Number(invoice.total_amount)) }}
                    </div>
                  </div>

                  <div class="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
                    <span>{{ formatDate(invoice.date_range_start) }} - {{ formatDate(invoice.date_range_end) }}</span>
                  </div>

                  <div class="mt-2 flex items-center justify-between">
                    <span v-if="invoice.due_date" class="text-xs text-muted">
                      Due: {{ formatDate(invoice.due_date) }}
                    </span>
                    <div class="flex items-center gap-1.5">
                      <button
                        v-if="invoice.status === 'pending'"
                        class="rounded-lg px-2 py-1 text-[10px] font-semibold text-green-400 bg-green-500/10 opacity-0 transition-all hover:bg-green-500/20 group-hover:opacity-100"
                        title="Mark as Paid"
                        @click.stop="handleMarkAsPaid(invoice)"
                      >
                        Paid
                      </button>
                      <button
                        v-if="invoice.status === 'paid'"
                        class="rounded-lg px-2 py-1 text-[10px] font-semibold text-red-400 bg-red-500/10 opacity-0 transition-all hover:bg-red-500/20 group-hover:opacity-100"
                        title="Request Chargeback"
                        @click.stop="handleRequestChargeback(invoice)"
                      >
                        Chargeback
                      </button>
                      <button
                        v-if="isAdminOrSuper"
                        class="rounded-lg p-1 text-muted opacity-0 transition-all hover:bg-white/[0.06] hover:text-highlighted group-hover:opacity-100"
                        title="Edit invoice"
                        @click.stop="editInvoice(invoice)"
                      >
                        <UIcon name="i-lucide-pencil" class="text-xs" />
                      </button>
                      <button
                        class="rounded-lg p-1 text-muted opacity-0 transition-all hover:bg-white/[0.06] hover:text-highlighted group-hover:opacity-100"
                        title="View PDF"
                        @click.stop="openInvoicePdf(invoice)"
                      >
                        <UIcon name="i-lucide-external-link" class="text-xs" />
                      </button>
                    </div>
                  </div>

                  <div class="mt-2 text-[10px] text-muted">
                    {{ invoice.items?.length ?? 0 }} item{{ (invoice.items?.length ?? 0) === 1 ? '' : 's' }}
                    · Created {{ formatDate(invoice.created_at) }}
                  </div>
                </div>

                <div
                  v-if="(invoicesByStatus.get(status)?.length ?? 0) === 0"
                  class="rounded-xl border border-dashed border-white/[0.06] px-3 py-8 text-center text-xs text-muted"
                >
                  No {{ getStatusLabel(status).toLowerCase() }} invoices
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- List View -->
        <div v-else class="relative flex flex-1 min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <div class="flex-1 min-h-0 overflow-y-auto invoicing-scroll">
            <table class="w-full">
              <thead class="sticky top-0 z-10">
                <tr class="border-b border-white/[0.06] bg-white/[0.03] backdrop-blur-xl">
                  <th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted whitespace-nowrap">Invoice #</th>
                  <th v-if="isAdminOrSuper" class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted whitespace-nowrap">Lawyer</th>
                  <th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted whitespace-nowrap">Date Range</th>
                  <th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted whitespace-nowrap">Amount</th>
                  <th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted whitespace-nowrap">Due Date</th>
                  <th class="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-muted whitespace-nowrap">Status</th>
                  <th class="px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-widest text-muted whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="invoice in pagedRows"
                  :key="invoice.id"
                  class="group cursor-pointer border-b border-white/[0.03] transition-all duration-200 hover:bg-[var(--ap-accent)]/[0.04]"
                  @click="openInvoicePdf(invoice)"
                >
                  <td class="px-5 py-3.5">
                    <span class="text-sm font-semibold text-highlighted group-hover:text-[var(--ap-accent)]">
                      {{ invoice.invoice_number }}
                    </span>
                  </td>
                  <td v-if="isAdminOrSuper" class="px-5 py-3.5">
                    <span class="text-sm text-default">{{ invoice.lawyer_name ?? '—' }}</span>
                  </td>
                  <td class="px-5 py-3.5">
                    <span class="text-sm text-default">{{ formatDate(invoice.date_range_start) }} - {{ formatDate(invoice.date_range_end) }}</span>
                  </td>
                  <td class="px-5 py-3.5">
                    <span class="text-sm font-bold text-highlighted">{{ formatMoney(Number(invoice.total_amount)) }}</span>
                  </td>
                  <td class="px-5 py-3.5">
                    <span class="text-sm text-default">{{ formatDate(invoice.due_date) }}</span>
                  </td>
                  <td class="px-5 py-3.5">
                    <span
                      class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium"
                      :class="{
                        'bg-amber-500/10 text-amber-400': invoice.status === 'pending',
                        'bg-green-500/10 text-green-400': invoice.status === 'paid',
                        'bg-red-500/10 text-red-400': invoice.status === 'chargeback'
                      }"
                    >
                      <UIcon :name="getStatusIcon(invoice.status)" class="text-xs" />
                      {{ getStatusLabel(invoice.status) }}
                    </span>
                  </td>
                  <td class="px-5 py-3.5">
                    <div class="flex items-center justify-center gap-1.5 whitespace-nowrap">
                      <button
                        v-if="invoice.status === 'pending'"
                        class="inline-flex items-center gap-1 rounded-lg border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-400 transition-all hover:bg-green-500/20"
                        @click.stop="handleMarkAsPaid(invoice)"
                      >
                        <UIcon name="i-lucide-check-circle" class="text-xs" />
                        Mark Paid
                      </button>
                      <button
                        v-if="invoice.status === 'paid'"
                        class="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 transition-all hover:bg-red-500/20"
                        @click.stop="handleRequestChargeback(invoice)"
                      >
                        <UIcon name="i-lucide-alert-triangle" class="text-xs" />
                        Chargeback
                      </button>
                      <button
                        v-if="isAdminOrSuper"
                        class="inline-flex items-center gap-1 rounded-lg border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--ap-accent)] transition-all hover:bg-[var(--ap-accent)]/20"
                        @click.stop="editInvoice(invoice)"
                      >
                        <UIcon name="i-lucide-pencil" class="text-xs" />
                        Edit
                      </button>
                      <button
                        class="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-muted transition-all hover:bg-white/[0.06] hover:text-highlighted"
                        @click.stop="openInvoicePdf(invoice)"
                      >
                        <UIcon name="i-lucide-file-text" class="text-xs" />
                        PDF
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div class="flex items-center justify-between border-t border-white/[0.06] bg-white/[0.02] px-5 py-3 backdrop-blur-xl">
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted">
                Showing <span class="font-medium text-highlighted">{{ pagedRows.length }}</span> of <span class="font-medium text-highlighted">{{ filteredInvoices.length }}</span>
              </span>
            </div>

            <div class="flex items-center gap-1.5">
              <button
                class="inline-flex h-8 items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-xs font-medium text-default transition-all hover:bg-white/[0.06] disabled:pointer-events-none disabled:opacity-30"
                :disabled="page <= 1"
                @click="page = Math.max(1, page - 1)"
              >
                <UIcon name="i-lucide-chevron-left" class="text-sm" />
                Prev
              </button>

              <div class="flex h-8 items-center rounded-lg border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/8 px-3">
                <span class="text-xs font-semibold text-[var(--ap-accent)]">{{ page }}</span>
                <span class="mx-1 text-xs text-muted">/</span>
                <span class="text-xs text-muted">{{ pageCount }}</span>
              </div>

              <button
                class="inline-flex h-8 items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-xs font-medium text-default transition-all hover:bg-white/[0.06] disabled:pointer-events-none disabled:opacity-30"
                :disabled="page >= pageCount"
                @click="page = Math.min(pageCount, page + 1)"
              >
                Next
                <UIcon name="i-lucide-chevron-right" class="text-sm" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.invoicing-scroll::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.invoicing-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.invoicing-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
}
.invoicing-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
