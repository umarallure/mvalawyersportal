<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { DropdownMenuItem } from '@nuxt/ui'
import { useDashboard } from '../composables/useDashboard'
import { useAuth } from '../composables/useAuth'
import { supabase } from '../lib/supabase'
import { listInvoices, markInvoiceAsPaid, type InvoiceRow, type InvoiceStatus } from '../lib/invoices'
import { listOrdersForLawyer, type OrderRow } from '../lib/orders'

const router = useRouter()
const { isNotificationsSlideoverOpen } = useDashboard()
const auth = useAuth()

const items = [[{
  label: 'New mail',
  icon: 'i-lucide-send',
  to: '/inbox'
}, {
  label: 'New retainer',
  icon: 'i-lucide-briefcase',
  to: '/retainers'
}]] satisfies DropdownMenuItem[][]

const isSuperAdmin = computed(() => auth.state.value.profile?.role === 'super_admin')
const isAdmin = computed(() => auth.state.value.profile?.role === 'admin')
const isAdminOrSuper = computed(() => isSuperAdmin.value || isAdmin.value)

// ── State ──
const loading = ref(true)

type RetainerRow = {
  id: string
  submission_id: string
  insured_name: string | null
  client_phone_number: string | null
  lead_vendor: string | null
  date: string | null
  status: string | null
  assigned_attorney_id: string | null
  created_at: string | null
  invoice_id: string | null
}

const retainers = ref<RetainerRow[]>([])
const retainerCount = ref(0)

const orders = ref<OrderRow[]>([])
const orderCount = ref(0)

const invoices = ref<(InvoiceRow & { lawyer_name?: string | null })[]>([])

// ── Computed stats ──
const totalInvoiced = computed(() => invoices.value.reduce((s, i) => s + Number(i.total_amount), 0))
const pendingInvoiceAmount = computed(() => invoices.value.filter(i => i.status === 'pending').reduce((s, i) => s + Number(i.total_amount), 0))
const paidInvoiceAmount = computed(() => invoices.value.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total_amount), 0))
const pendingInvoiceCount = computed(() => invoices.value.filter(i => i.status === 'pending').length)

const fulfillmentPercent = computed(() => {
  const total = orders.value.reduce((s, o) => s + o.quota_total, 0)
  const filled = orders.value.reduce((s, o) => s + o.quota_filled, 0)
  if (!total) return 0
  return Math.round((filled / total) * 100)
})

// ── Helpers ──
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

const formatPhone = (phone: string | null) => {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return phone
}

const getInitials = (name: string | null) => {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

const getStatusColor = (status: InvoiceStatus) => {
  if (status === 'paid') return 'text-green-400'
  if (status === 'pending') return 'text-amber-400'
  return 'text-red-400'
}

const getStatusBg = (status: InvoiceStatus) => {
  if (status === 'paid') return 'bg-green-500/10'
  if (status === 'pending') return 'bg-amber-500/10'
  return 'bg-red-500/10'
}

const getStatusIcon = (status: InvoiceStatus) => {
  if (status === 'paid') return 'i-lucide-check-circle'
  if (status === 'pending') return 'i-lucide-clock'
  return 'i-lucide-alert-triangle'
}

const getStatusLabel = (status: InvoiceStatus) => {
  if (status === 'paid') return 'Paid'
  if (status === 'pending') return 'Pending'
  return 'Chargeback'
}

const getRetainerStatusStyle = (status: string | null) => {
  const s = (status ?? '').toLowerCase()
  if (s.includes('pending')) return 'bg-amber-500/10 text-amber-400'
  if (s.includes('sign')) return 'bg-green-500/10 text-green-400'
  if (s.includes('drop') || s.includes('cancel')) return 'bg-red-500/10 text-red-400'
  if (s.includes('return') || s.includes('back')) return 'bg-blue-500/10 text-blue-400'
  if (s.includes('success') || s.includes('qualified') || s.includes('won')) return 'bg-emerald-500/10 text-emerald-400'
  return 'bg-white/[0.04] text-muted'
}

const getOrderStatusColor = (status: string) => {
  if (status === 'OPEN') return 'text-[var(--ap-accent)] bg-[var(--ap-accent)]/10'
  if (status === 'FULFILLED') return 'text-green-400 bg-green-500/10'
  return 'text-muted bg-white/[0.04]'
}

const orderFillPercent = (o: OrderRow) => {
  if (!o.quota_total) return 0
  return Math.round((o.quota_filled / o.quota_total) * 100)
}

// ── Data loading ──
const load = async () => {
  loading.value = true
  try {
    await auth.init()
    const userId = auth.state.value.user?.id ?? null
    const role = auth.state.value.profile?.role ?? null

    // Retainers
    let retainerQb = supabase
      .from('daily_deal_flow')
      .select('id,submission_id,insured_name,client_phone_number,lead_vendor,date,status,assigned_attorney_id,created_at,invoice_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(5)

    if (role === 'lawyer' && userId) {
      retainerQb = retainerQb.eq('assigned_attorney_id', userId)
    }

    const { data: retainerData, count: rCount } = await retainerQb
    retainers.value = (retainerData ?? []) as RetainerRow[]
    retainerCount.value = rCount ?? 0

    // Orders
    if (userId) {
      const ordersData = await listOrdersForLawyer({ lawyerId: userId })
      orders.value = ordersData.slice(0, 5)
      orderCount.value = ordersData.length
    }

    // Invoices
    const invFilters: { lawyer_id?: string; status?: InvoiceStatus } = {}
    if (role === 'lawyer' && userId) {
      invFilters.lawyer_id = userId
    }
    const invData = await listInvoices(invFilters)

    if (role === 'super_admin' || role === 'admin') {
      const lawyerIds = [...new Set(invData.map(d => d.lawyer_id).filter(Boolean))]
      if (lawyerIds.length) {
        const { data: profiles } = await supabase
          .from('attorney_profiles')
          .select('user_id,full_name')
          .in('user_id', lawyerIds)

        const nameMap = new Map(
          (profiles ?? []).map((p: any) => [String(p.user_id), String(p.full_name ?? '').trim()])
        )

        const { data: appUsers } = await supabase
          .from('app_users')
          .select('user_id,display_name,email')
          .in('user_id', lawyerIds)

        const fallbackMap = new Map(
          (appUsers ?? []).map((u: any) => [String(u.user_id), String(u.display_name || u.email || '').trim()])
        )

        invData.forEach((inv: any) => {
          inv.lawyer_name = nameMap.get(inv.lawyer_id) || fallbackMap.get(inv.lawyer_id) || null
        })
      }
    }

    invoices.value = invData as (InvoiceRow & { lawyer_name?: string | null })[]
  } catch (e) {
    console.error('[dashboard] load error', e)
  } finally {
    loading.value = false
  }
}

const handleMarkAsPaid = async (invoice: InvoiceRow) => {
  try {
    const updated = await markInvoiceAsPaid(invoice.id)
    const idx = invoices.value.findIndex(i => i.id === invoice.id)
    if (idx !== -1) {
      invoices.value[idx] = { ...invoices.value[idx], ...updated }
    }
  } catch (e) {
    console.error('[dashboard] mark paid error', e)
  }
}

const openRetainer = (row: RetainerRow) => router.push(`/retainers/${row.id}`)
const openRetainerInvoice = (row: RetainerRow) => {
  if (!row.invoice_id) return
  const url = router.resolve(`/invoicing/${row.invoice_id}/pdf`).href
  window.open(url, '_blank')
}
const openOrder = (order: OrderRow) => router.push(`/orders/${order.id}`)
const openInvoicePdf = (invoice: InvoiceRow) => {
  const url = router.resolve(`/invoicing/${invoice.id}/pdf`).href
  window.open(url, '_blank')
}

const latestInvoices = computed(() => invoices.value.slice(0, 5))

onMounted(() => {
  load()
})
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Dashboard" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-refresh-cw"
            size="sm"
            :loading="loading"
            class="rounded-lg"
            @click="load"
          />

          <UTooltip text="Notifications" :shortcuts="['N']">
            <UButton
              color="neutral"
              variant="ghost"
              square
              @click="isNotificationsSlideoverOpen = true"
            >
              <UChip color="error" inset>
                <UIcon name="i-lucide-bell" class="size-5 shrink-0" />
              </UChip>
            </UButton>
          </UTooltip>

          <UDropdownMenu :items="items">
            <UButton icon="i-lucide-plus" size="md" class="rounded-full" />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-6">
        <!-- ═══ Stat Cards ═══ -->
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <!-- Retainers -->
          <div
            class="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-[var(--ap-accent)]/30 hover:bg-[var(--ap-accent)]/[0.03]"
            @click="router.push('/retainers')"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Retainers</p>
                <p class="mt-1.5 text-3xl font-bold text-highlighted">{{ retainerCount }}</p>
              </div>
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10 transition-all duration-300 group-hover:bg-[var(--ap-accent)]/20">
                <UIcon name="i-lucide-briefcase" class="text-xl text-[var(--ap-accent)]" />
              </div>
            </div>
            <div class="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <UIcon name="i-lucide-arrow-right" class="text-[10px] transition-transform duration-200 group-hover:translate-x-0.5" />
              <span class="group-hover:text-[var(--ap-accent)] transition-colors">View all retainers</span>
            </div>
          </div>

          <!-- Orders -->
          <div
            class="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-[var(--ap-accent)]/30 hover:bg-[var(--ap-accent)]/[0.03]"
            @click="router.push('/fulfillment')"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Active Orders</p>
                <p class="mt-1.5 text-3xl font-bold text-highlighted">{{ orderCount }}</p>
              </div>
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10 transition-all duration-300 group-hover:bg-[var(--ap-accent)]/20">
                <UIcon name="i-lucide-shopping-cart" class="text-xl text-[var(--ap-accent)]" />
              </div>
            </div>
            <div class="mt-3">
              <div class="flex items-center justify-between text-xs text-muted mb-1">
                <span>Fulfillment</span>
                <span class="font-semibold text-highlighted">{{ fulfillmentPercent }}%</span>
              </div>
              <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  class="h-full rounded-full bg-[var(--ap-accent)] transition-all duration-500"
                  :style="{ width: `${fulfillmentPercent}%` }"
                />
              </div>
            </div>
          </div>

          <!-- Total Invoiced -->
          <div
            class="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-green-500/30 hover:bg-green-500/[0.03]"
            @click="router.push('/invoicing')"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Total Invoiced</p>
                <p class="mt-1.5 text-3xl font-bold text-green-400">{{ formatMoney(totalInvoiced) }}</p>
              </div>
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10 transition-all duration-300 group-hover:bg-green-500/20">
                <UIcon name="i-lucide-circle-dollar-sign" class="text-xl text-green-400" />
              </div>
            </div>
            <div class="mt-3 flex items-center gap-3 text-xs">
              <span class="text-green-400">{{ formatMoney(paidInvoiceAmount) }} paid</span>
              <span class="text-muted">·</span>
              <span class="text-amber-400">{{ formatMoney(pendingInvoiceAmount) }} pending</span>
            </div>
          </div>

          <!-- Pending Invoices -->
          <div
            class="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-amber-500/30 hover:bg-amber-500/[0.03]"
            @click="router.push('/invoicing')"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">Pending Invoices</p>
                <p class="mt-1.5 text-3xl font-bold text-amber-400">{{ pendingInvoiceCount }}</p>
              </div>
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 transition-all duration-300 group-hover:bg-amber-500/20">
                <UIcon name="i-lucide-clock" class="text-xl text-amber-400" />
              </div>
            </div>
            <div class="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <UIcon name="i-lucide-arrow-right" class="text-[10px] transition-transform duration-200 group-hover:translate-x-0.5" />
              <span class="group-hover:text-amber-400 transition-colors">Review invoices</span>
            </div>
          </div>
        </div>

        <!-- ═══ Main Content Grid ═══ -->
        <div class="grid gap-5 lg:grid-cols-3">

          <!-- ── Latest Retainers Card ── -->
          <div class="lg:col-span-2 flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <!-- Header -->
            <div class="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10">
                  <UIcon name="i-lucide-briefcase" class="text-sm text-[var(--ap-accent)]" />
                </div>
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">Latest Retainers</h3>
                  <p class="text-[11px] text-muted">Most recent first</p>
                </div>
              </div>
              <button
                class="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted transition-all hover:border-[var(--ap-accent)]/30 hover:bg-[var(--ap-accent)]/10 hover:text-[var(--ap-accent)]"
                @click="router.push('/retainers')"
              >
                See All
                <UIcon name="i-lucide-arrow-right" class="text-[10px]" />
              </button>
            </div>

            <!-- Loading -->
            <div v-if="loading" class="flex flex-1 items-center justify-center p-10">
              <UIcon name="i-lucide-loader-2" class="animate-spin text-xl text-[var(--ap-accent)]" />
            </div>

            <!-- Empty -->
            <div v-else-if="!retainers.length" class="flex flex-1 items-center justify-center p-10">
              <div class="text-center">
                <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10 mb-3">
                  <UIcon name="i-lucide-inbox" class="text-xl text-[var(--ap-accent)]/50" />
                </div>
                <p class="text-sm text-muted">No retainers found</p>
              </div>
            </div>

            <!-- Table -->
            <div v-else class="flex-1 overflow-auto dash-scroll">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-white/[0.04] bg-white/[0.015]">
                    <th class="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted">Client</th>
                    <th class="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted">Phone</th>
                    <th class="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted">Status</th>
                    <th class="px-5 py-2.5 text-center text-[10px] font-semibold uppercase tracking-widest text-muted">Invoice</th>
                    <th class="px-5 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest text-muted" />
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in retainers"
                    :key="row.id"
                    class="group cursor-pointer border-b border-white/[0.03] transition-all duration-200 hover:bg-[var(--ap-accent)]/[0.04]"
                    @click="openRetainer(row)"
                  >
                    <td class="px-5 py-3">
                      <div class="flex items-center gap-2.5">
                        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--ap-accent)]/20 to-[var(--ap-accent)]/5 text-[10px] font-bold text-[var(--ap-accent)] ring-1 ring-[var(--ap-accent)]/10">
                          {{ getInitials(row.insured_name) }}
                        </div>
                        <span class="text-sm font-medium text-highlighted truncate max-w-[160px] group-hover:text-[var(--ap-accent)] transition-colors">
                          {{ row.insured_name ?? 'Unknown' }}
                        </span>
                      </div>
                    </td>
                    <td class="px-5 py-3">
                      <span class="text-sm text-default tabular-nums">{{ formatPhone(row.client_phone_number) }}</span>
                    </td>
                    <td class="px-5 py-3">
                      <span
                        class="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold"
                        :class="getRetainerStatusStyle(row.status)"
                      >
                        {{ row.status ?? '—' }}
                      </span>
                    </td>
                    <td class="px-5 py-3 text-center">
                      <button
                        v-if="row.invoice_id"
                        class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 transition-all hover:bg-amber-500/20 hover:scale-110"
                        title="View linked invoice"
                        @click.stop="openRetainerInvoice(row)"
                      >
                        <UIcon name="i-lucide-receipt" class="text-sm" />
                      </button>
                      <span v-else class="text-xs text-muted/40">—</span>
                    </td>
                    <td class="px-5 py-3 text-right">
                      <UIcon name="i-lucide-chevron-right" class="text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- ── Invoices Card ── -->
          <div class="flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <!-- Header -->
            <div class="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                  <UIcon name="i-lucide-receipt" class="text-sm text-amber-400" />
                </div>
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">Invoices</h3>
                  <p class="text-[11px] text-muted">{{ invoices.length }} total</p>
                </div>
              </div>
              <button
                class="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted transition-all hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-400"
                @click="router.push('/invoicing')"
              >
                See All
                <UIcon name="i-lucide-arrow-right" class="text-[10px]" />
              </button>
            </div>

            <!-- Loading -->
            <div v-if="loading" class="flex flex-1 items-center justify-center p-10">
              <UIcon name="i-lucide-loader-2" class="animate-spin text-xl text-amber-400" />
            </div>

            <!-- Empty -->
            <div v-else-if="!invoices.length" class="flex flex-1 items-center justify-center p-10">
              <div class="text-center">
                <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 mb-3">
                  <UIcon name="i-lucide-receipt" class="text-xl text-amber-400/50" />
                </div>
                <p class="text-sm text-muted">No invoices yet</p>
                <UButton
                  v-if="isAdminOrSuper"
                  color="primary"
                  size="xs"
                  class="mt-3"
                  icon="i-lucide-plus"
                  @click="router.push('/invoicing/create')"
                >
                  Create Invoice
                </UButton>
              </div>
            </div>

            <!-- Invoice List -->
            <div v-else class="flex-1 overflow-auto dash-scroll">
              <div class="divide-y divide-white/[0.04]">
                <div
                  v-for="inv in latestInvoices"
                  :key="inv.id"
                  class="group flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-all duration-200 hover:bg-white/[0.03]"
                  @click="openInvoicePdf(inv)"
                >
                  <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" :class="getStatusBg(inv.status)">
                    <UIcon :name="getStatusIcon(inv.status)" class="text-sm" :class="getStatusColor(inv.status)" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-sm font-semibold text-highlighted truncate group-hover:text-[var(--ap-accent)] transition-colors">
                        {{ inv.invoice_number }}
                      </span>
                      <span class="text-sm font-bold text-highlighted shrink-0">{{ formatMoney(Number(inv.total_amount)) }}</span>
                    </div>
                    <div class="mt-0.5 flex items-center justify-between gap-2">
                      <span v-if="isAdminOrSuper && inv.lawyer_name" class="text-[11px] text-muted truncate">{{ inv.lawyer_name }}</span>
                      <span v-else class="text-[11px] text-muted">{{ formatDate(inv.due_date) }}</span>
                      <span
                        class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0"
                        :class="[getStatusBg(inv.status), getStatusColor(inv.status)]"
                      >
                        {{ getStatusLabel(inv.status) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Quick Create -->
            <div v-if="isAdminOrSuper && invoices.length" class="border-t border-white/[0.06] px-5 py-3">
              <button
                class="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-xs font-medium text-muted transition-all hover:border-[var(--ap-accent)]/30 hover:bg-[var(--ap-accent)]/[0.04] hover:text-[var(--ap-accent)]"
                @click="router.push('/invoicing/create')"
              >
                <UIcon name="i-lucide-plus" class="text-sm" />
                Create Invoice
              </button>
            </div>
          </div>
        </div>

        <!-- ═══ Orders Section ═══ -->
        <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div class="flex items-center gap-3">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10">
                <UIcon name="i-lucide-shopping-cart" class="text-sm text-[var(--ap-accent)]" />
              </div>
              <div>
                <h3 class="text-sm font-semibold text-highlighted">Recent Orders</h3>
                <p class="text-[11px] text-muted">{{ orderCount }} orders · {{ fulfillmentPercent }}% fulfilled overall</p>
              </div>
            </div>
            <button
              class="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted transition-all hover:border-[var(--ap-accent)]/30 hover:bg-[var(--ap-accent)]/10 hover:text-[var(--ap-accent)]"
              @click="router.push('/fulfillment')"
            >
              See All
              <UIcon name="i-lucide-arrow-right" class="text-[10px]" />
            </button>
          </div>

          <!-- Loading -->
          <div v-if="loading" class="flex items-center justify-center p-10">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-xl text-[var(--ap-accent)]" />
          </div>

          <!-- Empty -->
          <div v-else-if="!orders.length" class="flex items-center justify-center p-10">
            <div class="text-center">
              <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ap-accent)]/10 mb-3">
                <UIcon name="i-lucide-shopping-cart" class="text-xl text-[var(--ap-accent)]/50" />
              </div>
              <p class="text-sm text-muted">No orders placed yet</p>
            </div>
          </div>

          <!-- Orders Grid -->
          <div v-else class="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div
              v-for="order in orders"
              :key="order.id"
              class="group cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-[var(--ap-accent)]/20 hover:bg-[var(--ap-accent)]/[0.03]"
              @click="openOrder(order)"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-highlighted truncate group-hover:text-[var(--ap-accent)] transition-colors">
                    {{ order.case_type }}
                  </p>
                  <p class="mt-0.5 text-[11px] text-muted">
                    {{ (order.target_states || []).map(s => s.toUpperCase()).join(', ') || '—' }}
                  </p>
                </div>
                <span
                  class="inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                  :class="getOrderStatusColor(order.status)"
                >
                  {{ order.status }}
                </span>
              </div>

              <!-- Progress -->
              <div class="mt-3">
                <div class="flex items-center justify-between text-[11px] mb-1">
                  <span class="text-muted">{{ order.quota_filled }}/{{ order.quota_total }} filled</span>
                  <span class="font-semibold" :class="orderFillPercent(order) >= 100 ? 'text-green-400' : 'text-[var(--ap-accent)]'">
                    {{ orderFillPercent(order) }}%
                  </span>
                </div>
                <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    :class="orderFillPercent(order) >= 100 ? 'bg-green-400' : 'bg-[var(--ap-accent)]'"
                    :style="{ width: `${Math.min(orderFillPercent(order), 100)}%` }"
                  />
                </div>
              </div>

              <div class="mt-2.5 flex items-center justify-between text-[11px] text-muted">
                <span>Created {{ formatDate(order.created_at) }}</span>
                <span>Exp. {{ formatDate(order.expires_at) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.dash-scroll::-webkit-scrollbar {
  width: 4px;
}
.dash-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.dash-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
}
.dash-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
