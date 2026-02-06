<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TableColumn } from '@nuxt/ui'

type InvoiceStatus = 'pending' | 'paid' | 'chargeback'

type Invoice = {
  id: string
  invoiceNumber: string
  date: string
  dueDate: string
  clientName: string
  caseId: string
  amount: number
  status: InvoiceStatus
  paidDate?: string
  paymentMethod?: string
  chargebackReason?: string
}

type ViewMode = 'kanban' | 'list'

const loading = ref(false)
const query = ref('')
const page = ref(1)
const PAGE_SIZE = 25
const viewMode = ref<ViewMode>('kanban')
const selectedStatus = ref<'all' | InvoiceStatus>('all')

const mockInvoices = ref<Invoice[]>([
  { id: 'INV-1001', invoiceNumber: 'INV-2024-001', date: '2024-01-15', dueDate: '2024-02-15', clientName: 'John Smith', caseId: 'F-1001', amount: 5000, status: 'paid', paidDate: '2024-01-20', paymentMethod: 'Wire Transfer' },
  { id: 'INV-1002', invoiceNumber: 'INV-2024-002', date: '2024-01-15', dueDate: '2024-02-15', clientName: 'Jane Wilson', caseId: 'F-1002', amount: 6000, status: 'paid', paidDate: '2024-01-18', paymentMethod: 'Check' },
  { id: 'INV-1003', invoiceNumber: 'INV-2024-003', date: '2024-01-14', dueDate: '2024-02-14', clientName: 'Robert Johnson', caseId: 'F-1003', amount: 3600, status: 'pending' },
  { id: 'INV-1004', invoiceNumber: 'INV-2024-004', date: '2024-01-14', dueDate: '2024-02-14', clientName: 'Alice Williams', caseId: 'F-1004', amount: 4400, status: 'pending' },
  { id: 'INV-1005', invoiceNumber: 'INV-2024-005', date: '2024-01-13', dueDate: '2024-02-13', clientName: 'Michael Brown', caseId: 'F-1005', amount: 7000, status: 'paid', paidDate: '2024-01-19', paymentMethod: 'Wire Transfer' },
  { id: 'INV-1006', invoiceNumber: 'INV-2024-006', date: '2024-01-13', dueDate: '2024-02-13', clientName: 'Emily Davis', caseId: 'F-1006', amount: 5600, status: 'paid', paidDate: '2024-01-17', paymentMethod: 'ACH' },
  { id: 'INV-1007', invoiceNumber: 'INV-2024-007', date: '2024-01-12', dueDate: '2024-02-12', clientName: 'Daniel Miller', caseId: 'F-1007', amount: 3000, status: 'chargeback', chargebackReason: 'Disputed charges' },
  { id: 'INV-1008', invoiceNumber: 'INV-2024-008', date: '2024-01-12', dueDate: '2024-02-12', clientName: 'Sophia Garcia', caseId: 'F-1008', amount: 4000, status: 'pending' },
  { id: 'INV-1009', invoiceNumber: 'INV-2024-009', date: '2024-01-11', dueDate: '2024-02-11', clientName: 'William Martinez', caseId: 'F-1009', amount: 6400, status: 'paid', paidDate: '2024-01-16', paymentMethod: 'Wire Transfer' },
  { id: 'INV-1010', invoiceNumber: 'INV-2024-010', date: '2024-01-11', dueDate: '2024-02-11', clientName: 'Olivia Anderson', caseId: 'F-1010', amount: 5200, status: 'paid', paidDate: '2024-01-21', paymentMethod: 'Check' },
  { id: 'INV-1011', invoiceNumber: 'INV-2024-011', date: '2024-01-10', dueDate: '2024-02-10', clientName: 'James Taylor', caseId: 'F-1011', amount: 3800, status: 'pending' },
  { id: 'INV-1012', invoiceNumber: 'INV-2024-012', date: '2024-01-10', dueDate: '2024-02-10', clientName: 'Emma Thomas', caseId: 'F-1012', amount: 3400, status: 'chargeback', chargebackReason: 'Client dispute' }
])

const filteredInvoices = computed(() => {
  const q = query.value.trim().toLowerCase()
  return mockInvoices.value.filter((inv) => {
    if (selectedStatus.value !== 'all' && inv.status !== selectedStatus.value) return false
    if (!q) return true
    const haystack = [inv.invoiceNumber, inv.clientName, inv.caseId].join(' ').toLowerCase()
    return haystack.includes(q)
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(filteredInvoices.value.length / PAGE_SIZE)))

const pagedRows = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return filteredInvoices.value.slice(start, start + PAGE_SIZE)
})

const invoicesByStatus = computed(() => {
  const grouped = new Map<InvoiceStatus, Invoice[]>()
  const statuses: InvoiceStatus[] = ['pending', 'paid', 'chargeback']
  statuses.forEach((s) => grouped.set(s, []))
  filteredInvoices.value.forEach((inv) => {
    const arr = grouped.get(inv.status)
    if (arr) arr.push(inv)
  })
  return grouped
})

const totalAmount = computed(() => mockInvoices.value.reduce((sum, inv) => sum + inv.amount, 0))
const paidAmount = computed(() => mockInvoices.value.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + inv.amount, 0))
const pendingAmount = computed(() => mockInvoices.value.filter(inv => inv.status === 'pending').reduce((sum, inv) => sum + inv.amount, 0))
const chargebackAmount = computed(() => mockInvoices.value.filter(inv => inv.status === 'chargeback').reduce((sum, inv) => sum + inv.amount, 0))

const formatMoney = (n: number) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
  } catch {
    return `$${n}`
  }
}

const getStatusLabel = (status: InvoiceStatus) => {
  if (status === 'pending') return 'Pending'
  if (status === 'paid') return 'Paid'
  return 'Chargeback'
}

const getStatusColor = (status: InvoiceStatus) => {
  if (status === 'paid') return 'success'
  if (status === 'pending') return 'warning'
  return 'error'
}

const columns: TableColumn<Invoice>[] = [
  { accessorKey: 'invoiceNumber', header: 'Invoice #' },
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'clientName', header: 'Client' },
  { accessorKey: 'caseId', header: 'Case ID' },
  { accessorKey: 'amount', header: 'Amount' },
  { accessorKey: 'dueDate', header: 'Due Date' },
  { accessorKey: 'status', header: 'Status' }
]
</script>

<template>
  <UDashboardPanel id="invoicing">
    <template #header>
      <UDashboardNavbar title="Invoicing - Payment Management">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            :loading="loading"
          >
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col">
        <div class="mb-4 grid gap-4 sm:grid-cols-4">
          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Total Invoiced</p>
                <p class="text-2xl font-semibold">{{ formatMoney(totalAmount) }}</p>
              </div>
              <UIcon name="i-lucide-receipt" class="size-8 text-primary" />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Paid</p>
                <p class="text-2xl font-semibold">{{ formatMoney(paidAmount) }}</p>
              </div>
              <UIcon name="i-lucide-check-circle" class="size-8 text-success" />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Pending</p>
                <p class="text-2xl font-semibold">{{ formatMoney(pendingAmount) }}</p>
              </div>
              <UIcon name="i-lucide-clock" class="size-8 text-warning" />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Chargebacks</p>
                <p class="text-2xl font-semibold">{{ formatMoney(chargebackAmount) }}</p>
              </div>
              <UIcon name="i-lucide-alert-circle" class="size-8 text-error" />
            </div>
          </UCard>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <UInput
              v-model="query"
              class="max-w-md"
              icon="i-lucide-search"
              placeholder="Search invoices..."
            />

            <USelect
              v-model="selectedStatus"
              :items="[
                { label: 'All Statuses', value: 'all' },
                { label: 'Pending', value: 'pending' },
                { label: 'Paid', value: 'paid' },
                { label: 'Chargeback', value: 'chargeback' }
              ]"
              class="w-56"
              value-key="value"
              label-key="label"
            />
          </div>

          <div class="flex items-center gap-3">
            <div class="inline-flex rounded-lg border border-default bg-white p-0.5 dark:bg-white/[0.03]">
              <button
                v-for="mode in ['kanban', 'list']"
                :key="mode"
                type="button"
                class="rounded-md px-3 py-1.5 text-sm font-medium transition"
                :class="viewMode === mode
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-muted hover:bg-muted/50'"
                @click="viewMode = mode as ViewMode"
              >
                {{ mode === 'kanban' ? 'Kanban View' : 'List View' }}
              </button>
            </div>

            <UBadge variant="subtle" :label="`${filteredInvoices.length} invoices`" />
          </div>
        </div>

        <div v-if="viewMode === 'kanban'" class="mt-4 min-h-0 flex-1 overflow-auto">
          <div class="flex min-h-0 gap-3 pr-2" style="min-width: 1400px;">
            <div
              v-for="status in ['pending', 'paid', 'chargeback']"
              :key="status"
              class="flex min-h-[560px] w-[28rem] flex-col rounded-lg border border-default bg-elevated/20"
            >
              <div class="flex items-center justify-between border-b border-default px-3 py-2">
                <div class="text-sm font-semibold">{{ getStatusLabel(status as InvoiceStatus) }}</div>
                <UBadge
                  variant="subtle"
                  :label="String(invoicesByStatus.get(status as InvoiceStatus)?.length ?? 0)"
                />
              </div>

              <div class="flex-1 space-y-2 p-2">
                <UCard
                  v-for="invoice in (invoicesByStatus.get(status as InvoiceStatus) ?? [])"
                  :key="invoice.id"
                  class="w-full"
                  :ui="{ body: '!p-2 sm:!p-2' }"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold">{{ invoice.clientName }}</div>
                      <div class="mt-0.5 text-xs text-muted">{{ invoice.invoiceNumber }} · {{ invoice.caseId }}</div>
                    </div>
                    <div class="shrink-0 text-sm font-semibold">{{ formatMoney(invoice.amount) }}</div>
                  </div>

                  <div class="mt-2 flex items-center justify-between gap-2">
                    <div class="text-xs text-muted">Due: {{ invoice.dueDate }}</div>
                    <div class="text-xs text-muted">{{ invoice.date }}</div>
                  </div>

                  <div v-if="invoice.paidDate" class="mt-2 flex items-center gap-1 text-xs text-success">
                    <UIcon name="i-lucide-check" class="size-3" />
                    <span>Paid: {{ invoice.paidDate }} ({{ invoice.paymentMethod }})</span>
                  </div>

                  <div v-if="invoice.chargebackReason" class="mt-2 rounded bg-error/10 px-2 py-1 text-xs text-error">
                    {{ invoice.chargebackReason }}
                  </div>
                </UCard>

                <div
                  v-if="(invoicesByStatus.get(status as InvoiceStatus)?.length ?? 0) === 0"
                  class="rounded-md border border-dashed border-default px-3 py-6 text-center text-xs text-muted"
                >
                  No invoices
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="mt-4 flex-1">
          <UCard class="flex min-h-0 flex-1 flex-col" :ui="{ body: 'p-0 min-h-0 flex-1 flex flex-col' }">
            <div class="min-h-0 flex-1 overflow-auto">
              <UTable
                :loading="loading"
                :data="pagedRows"
                :columns="columns"
                :ui="{
                  base: 'w-full',
                  thead: '[&>tr]:bg-elevated/50',
                  tbody: '[&>tr]:hover:bg-muted/50',
                  th: 'px-4 py-3 text-left',
                  td: 'px-4 py-3'
                }"
              >
                <template #status-cell="{ row }">
                  <UBadge
                    :color="getStatusColor(row.original.status)"
                    variant="subtle"
                    :label="getStatusLabel(row.original.status)"
                  />
                </template>

                <template #amount-cell="{ row }">
                  <div class="font-semibold">{{ formatMoney(row.original.amount) }}</div>
                </template>
              </UTable>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default px-4 py-3">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="page <= 1"
                @click="page = Math.max(1, page - 1)"
              >
                Previous
              </UButton>

              <div class="text-sm text-muted">
                Page {{ page }} of {{ pageCount }}
              </div>

              <UButton
                color="neutral"
                variant="outline"
                :disabled="page >= pageCount"
                @click="page = Math.min(pageCount, page + 1)"
              >
                Next
              </UButton>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
