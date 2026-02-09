<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import {
  createInvoice,
  generateInvoiceNumber,
  getInvoice,
  getLawyerProfile,
  linkDealsToInvoice,
  listLawyers,
  listDealsForInvoice,
  unlinkDealsFromInvoice,
  updateInvoice,
  type InvoiceItem,
  type InvoiceStatus,
  type DealFlowRow
} from '../lib/invoices'

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const isEdit = computed(() => route.path.includes('/edit/'))
const invoiceId = computed(() => (route.params as Record<string, string>).id ?? null)

const loading = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)
const success = ref<string | null>(null)

const lawyers = ref<Array<{ user_id: string; email: string; display_name: string | null }>>([])
const deals = ref<Array<DealFlowRow & { selected: boolean }>>([])
const loadingDeals = ref(false)

const invoiceNumber = ref('')

const form = ref({
  lawyer_id: '',
  date_range_start: '',
  date_range_end: '',
  deal_ids: [] as string[],
  items: [] as Array<InvoiceItem & { deal_id?: string }>,
  tax_rate: 0,
  status: 'pending' as InvoiceStatus,
  notes: '',
  due_date: ''
})

const lawyerProfile = ref<{
  full_name: string | null
  firm_name: string | null
  office_address: string | null
  primary_email: string | null
  direct_phone: string | null
  bar_association_number: string | null
} | null>(null)

const selectedLawyerLabel = computed(() => {
  if (!form.value.lawyer_id) return ''
  const l = lawyers.value.find(lw => lw.user_id === form.value.lawyer_id)
  if (!l) return ''
  return l.display_name || l.email
})

const lawyerOptions = computed(() =>
  lawyers.value.map(l => ({
    label: l.display_name || l.email,
    value: l.user_id
  }))
)

const statusOptions = [
  { label: 'Pending', value: 'pending' },
  { label: 'Paid', value: 'paid' },
  { label: 'Chargeback', value: 'chargeback' }
]

const validItems = computed(() => {
  return form.value.items
    .map((i) => {
      const description = String(i.description ?? '').trim()
      const quantity = Number(i.quantity ?? 0)
      const unit_price = Number(i.unit_price ?? 0)
      const amount = Math.round(quantity * unit_price * 100) / 100
      return {
        ...i,
        description,
        quantity,
        unit_price,
        amount
      }
    })
    .filter(i => i.description.length > 0 && i.quantity > 0 && i.unit_price > 0)
})

const subtotal = computed(() =>
  validItems.value.reduce((sum, item) => sum + item.amount, 0)
)

const taxAmount = computed(() =>
  Math.round(subtotal.value * form.value.tax_rate * 100) / 100
)

const totalAmount = computed(() =>
  subtotal.value + taxAmount.value
)

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
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return value
  }
}

const addItem = () => {
  form.value.items.push({
    description: '',
    quantity: 1,
    unit_price: 0,
    amount: 0
  })
}

const removeItem = (index: number) => {
  form.value.items.splice(index, 1)
}

const recalcItem = (index: number) => {
  const item = form.value.items[index]
  if (item) {
    item.amount = Math.round(item.quantity * item.unit_price * 100) / 100
  }
}

const toDealUnitPrice = (deal: DealFlowRow) => {
  const n = Number(deal.face_amount ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n * 100) / 100)
}

const normalize = (v: unknown) => String(v ?? '').trim().toLowerCase()

const isSuccessfulDeal = (deal: DealFlowRow) => {
  const s = normalize(deal.status)
  return s === 'successfull cases'
}

const syncItemsWithSelectedDeals = () => {
  const selected = deals.value.filter(d => d.selected)
  const selectedForInvoice = selected.filter(d => {
    const name = String(d.insured_name ?? '').trim()
    return name.length > 0 && toDealUnitPrice(d) > 0
  })
  const selectedIds = new Set(selectedForInvoice.map(d => d.id))

  // Keep any manually-added items (no deal_id)
  const manualItems = form.value.items.filter(i => !i.deal_id)

  const dealItems = selectedForInvoice.map((d) => {
    const existing = form.value.items.find(i => i.deal_id === d.id)
    if (existing) return existing

    const unit = toDealUnitPrice(d)
    return {
      deal_id: d.id,
      description: `${d.insured_name ?? 'Unknown'}`,
      quantity: 1,
      unit_price: unit,
      amount: unit
    }
  })

  // Drop deal items for deals that are no longer selected
  form.value.items = [...manualItems, ...dealItems]
  // Also ensure deal_ids matches selected
  form.value.deal_ids = [...selectedIds]
}

const canSubmit = computed(() => {
  if (!form.value.lawyer_id) return false
  if (!form.value.date_range_start || !form.value.date_range_end) return false
  if (!form.value.due_date) return false
  if (validItems.value.length === 0) return false
  return true
})

const fetchDeals = async () => {
  if (!form.value.lawyer_id || !form.value.date_range_start || !form.value.date_range_end) {
    deals.value = []
    return
  }

  loadingDeals.value = true
  try {
    const data = await listDealsForInvoice({
      lawyerId: form.value.lawyer_id,
      dateStart: form.value.date_range_start,
      dateEnd: form.value.date_range_end,
      editingInvoiceId: isEdit.value ? invoiceId.value : null
    })

    const filtered = data.filter(isSuccessfulDeal)

    deals.value = filtered.map((d: DealFlowRow) => ({
      ...d,
      selected: form.value.deal_ids.includes(d.id)
    }))
    syncItemsWithSelectedDeals()
  } catch (e) {
    console.error('Failed to fetch deals:', e)
  } finally {
    loadingDeals.value = false
  }
}

const toggleDeal = (dealId: string) => {
  const deal = deals.value.find(d => d.id === dealId)
  if (!deal) return

  // Prevent selecting deals that would generate empty/$0 invoice rows
  if (!deal.selected) {
    const name = String(deal.insured_name ?? '').trim()
    const unit = toDealUnitPrice(deal)
    if (!name.length || unit <= 0) {
      error.value = 'This deal has no billable value and cannot be added to an invoice.'
      return
    }
  }

  deal.selected = !deal.selected

  if (deal.selected) {
    if (!form.value.deal_ids.includes(dealId)) {
      form.value.deal_ids.push(dealId)
    }
  } else {
    form.value.deal_ids = form.value.deal_ids.filter(id => id !== dealId)
  }

  syncItemsWithSelectedDeals()
}

const selectAllDeals = () => {
  const allSelected = deals.value.every(d => d.selected)
  deals.value.forEach(d => {
    d.selected = !allSelected
  })
  form.value.deal_ids = allSelected ? [] : deals.value.map(d => d.id)

  syncItemsWithSelectedDeals()
}

const autoGenerateItems = () => {
  syncItemsWithSelectedDeals()
}

const fetchLawyerProfile = async () => {
  if (!form.value.lawyer_id) {
    lawyerProfile.value = null
    return
  }
  try {
    lawyerProfile.value = await getLawyerProfile(form.value.lawyer_id)
  } catch {
    lawyerProfile.value = null
  }
}

const loadExisting = async () => {
  if (!invoiceId.value) return

  loading.value = true
  try {
    const inv = await getInvoice(invoiceId.value)
    if (!inv) {
      error.value = 'Invoice not found'
      return
    }

    invoiceNumber.value = inv.invoice_number

    form.value = {
      lawyer_id: inv.lawyer_id,
      date_range_start: inv.date_range_start,
      date_range_end: inv.date_range_end,
      deal_ids: inv.deal_ids ?? [],
      items: (inv.items ?? []) as Array<InvoiceItem & { deal_id?: string }>,
      tax_rate: Number(inv.tax_rate) || 0,
      status: inv.status,
      notes: inv.notes ?? '',
      due_date: inv.due_date ?? ''
    }

    await fetchLawyerProfile()
    await fetchDeals()
    // Make sure deal selections are reflected in line items
    syncItemsWithSelectedDeals()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load invoice'
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  error.value = null
  success.value = null

  if (!form.value.lawyer_id) {
    error.value = 'Please select a lawyer'
    return
  }
  if (!form.value.date_range_start || !form.value.date_range_end) {
    error.value = 'Please select a date range'
    return
  }
  if (!form.value.due_date) {
    error.value = 'Please select a due date'
    return
  }
  if (!validItems.value.length) {
    error.value = 'Please add at least one line item with a description and a non-zero price'
    return
  }

  saving.value = true
  try {
    const userId = auth.state.value.user?.id
    if (!userId) throw new Error('Not authenticated')

    const payload = {
      lawyer_id: form.value.lawyer_id,
      date_range_start: form.value.date_range_start,
      date_range_end: form.value.date_range_end,
      deal_ids: form.value.deal_ids,
      items: validItems.value.map(({ description, quantity, unit_price, amount }) => ({
        description,
        quantity,
        unit_price,
        amount
      })),
      subtotal: subtotal.value,
      tax_rate: form.value.tax_rate,
      tax_amount: taxAmount.value,
      total_amount: totalAmount.value,
      status: form.value.status,
      notes: form.value.notes || null,
      due_date: form.value.due_date || null
    }

    if (isEdit.value && invoiceId.value) {
      // Unlink old deals, update invoice, then re-link new deals
      await unlinkDealsFromInvoice(invoiceId.value)
      await updateInvoice(invoiceId.value, payload)
      await linkDealsToInvoice(form.value.deal_ids, invoiceId.value)
      success.value = 'Invoice updated successfully'
    } else {
      const invNumber = invoiceNumber.value || await generateInvoiceNumber()
      const created = await createInvoice({
        ...payload,
        invoice_number: invNumber,
        created_by: userId
      })
      // Link selected deals to the newly created invoice
      await linkDealsToInvoice(form.value.deal_ids, created.id)
      success.value = 'Invoice created successfully'
    }

    setTimeout(() => {
      router.push('/invoicing')
    }, 1200)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save invoice'
  } finally {
    saving.value = false
  }
}

const goBack = () => {
  router.push('/invoicing')
}

watch(() => form.value.lawyer_id, () => {
  fetchLawyerProfile()
  fetchDeals()
})

watch([() => form.value.date_range_start, () => form.value.date_range_end], () => {
  fetchDeals()
})

onMounted(async () => {
  loading.value = true
  try {
    await auth.init()

    const role = auth.state.value.profile?.role
    if (role !== 'super_admin' && role !== 'admin') {
      router.push('/invoicing')
      return
    }

    const lawyerData = await listLawyers()
    lawyers.value = lawyerData

    if (isEdit.value) {
      await loadExisting()
    } else {
      invoiceNumber.value = await generateInvoiceNumber()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to initialize'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <UDashboardPanel id="create-invoice">
    <template #header>
      <UDashboardNavbar :title="isEdit ? 'Edit Invoice' : 'Create Invoice'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-left"
              size="sm"
              class="rounded-lg"
              @click="goBack"
            >
              Back
            </UButton>

            <UButton
              color="primary"
              icon="i-lucide-save"
              size="sm"
              class="rounded-lg"
              :loading="saving"
              :disabled="saving || !canSubmit"
              @click="handleSave"
            >
              {{ isEdit ? 'Update Invoice' : 'Create Invoice' }}
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-6 create-invoice-scroll">
        <!-- Loading -->
        <div v-if="loading" class="flex flex-1 items-center justify-center p-12">
          <div class="flex flex-col items-center gap-3">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-2xl text-[var(--ap-accent)]" />
            <span class="text-sm text-muted">Loading...</span>
          </div>
        </div>

        <template v-else>
          <!-- Alerts -->
          <UAlert
            v-if="error"
            color="error"
            variant="subtle"
            title="Error"
            :description="error"
            class="rounded-xl"
          />
          <UAlert
            v-if="success"
            color="success"
            variant="subtle"
            :title="success"
            class="rounded-xl"
          />

          <div class="grid gap-6 lg:grid-cols-3">
            <!-- Left Column: Main Form -->
            <div class="lg:col-span-2 space-y-6">
              <!-- Invoice Details -->
              <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                <h3 class="mb-4 text-sm font-semibold uppercase tracking-wider text-highlighted">
                  Invoice Details
                </h3>

                <div class="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-muted">Status</label>
                    <USelect
                      v-model="form.status"
                      :items="statusOptions"
                      class="w-full [&_button]:rounded-xl [&_button]:border-white/[0.06] [&_button]:bg-white/[0.03]"
                      value-key="value"
                      label-key="label"
                    />
                  </div>

                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-muted">Select Lawyer <span class="text-red-400">*</span></label>
                    <USelect
                      v-model="form.lawyer_id"
                      :items="lawyerOptions"
                      class="w-full [&_button]:rounded-xl [&_button]:border-white/[0.06] [&_button]:bg-white/[0.03]"
                      value-key="value"
                      label-key="label"
                      placeholder="Choose a lawyer..."
                    />
                  </div>

                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-muted">Due Date <span class="text-red-400">*</span></label>
                    <UInput
                      v-model="form.due_date"
                      type="date"
                      class="w-full [&_input]:rounded-xl [&_input]:border-white/[0.06] [&_input]:bg-white/[0.03]"
                    />
                  </div>

                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-muted">Date Range Start <span class="text-red-400">*</span></label>
                    <UInput
                      v-model="form.date_range_start"
                      type="date"
                      class="w-full [&_input]:rounded-xl [&_input]:border-white/[0.06] [&_input]:bg-white/[0.03]"
                    />
                  </div>

                  <div>
                    <label class="mb-1.5 block text-xs font-medium text-muted">Date Range End <span class="text-red-400">*</span></label>
                    <UInput
                      v-model="form.date_range_end"
                      type="date"
                      class="w-full [&_input]:rounded-xl [&_input]:border-white/[0.06] [&_input]:bg-white/[0.03]"
                    />
                  </div>
                </div>

                <div class="mt-4">
                  <label class="mb-1.5 block text-xs font-medium text-muted">Notes</label>
                  <UTextarea
                    v-model="form.notes"
                    class="w-full [&_textarea]:rounded-xl [&_textarea]:border-white/[0.06] [&_textarea]:bg-white/[0.03]"
                    placeholder="Additional notes..."
                    :rows="3"
                  />
                </div>
              </div>

              <!-- Deals Selection -->
              <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                <div class="mb-4 flex items-center justify-between">
                  <h3 class="text-sm font-semibold uppercase tracking-wider text-highlighted">
                    Assigned Deals
                  </h3>
                  <div class="flex items-center gap-2">
                    <UButton
                      v-if="deals.length"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      class="rounded-lg"
                      @click="selectAllDeals"
                    >
                      {{ deals.every(d => d.selected) ? 'Deselect All' : 'Select All' }}
                    </UButton>
                    <UButton
                      v-if="deals.some(d => d.selected)"
                      color="primary"
                      variant="soft"
                      size="xs"
                      class="rounded-lg"
                      icon="i-lucide-sparkles"
                      @click="autoGenerateItems"
                    >
                      Auto-generate Items
                    </UButton>
                  </div>
                </div>

                <div v-if="!form.lawyer_id || !form.date_range_start || !form.date_range_end" class="rounded-xl border border-dashed border-white/[0.06] px-4 py-8 text-center text-xs text-muted">
                  Select a lawyer and date range to load deals
                </div>

                <div v-else-if="loadingDeals" class="flex items-center justify-center py-8">
                  <UIcon name="i-lucide-loader-2" class="animate-spin text-lg text-[var(--ap-accent)]" />
                </div>

                <div v-else-if="!deals.length" class="rounded-xl border border-dashed border-white/[0.06] px-4 py-8 text-center text-xs text-muted">
                  No deals found for this lawyer in the selected date range
                </div>

                <div v-else class="space-y-2 max-h-64 overflow-y-auto create-invoice-scroll">
                  <div
                    v-for="deal in deals"
                    :key="deal.id"
                    class="flex items-center gap-3 rounded-xl border p-3 transition-all cursor-pointer"
                    :class="deal.selected
                      ? 'border-[var(--ap-accent)]/30 bg-[var(--ap-accent)]/[0.06]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'"
                    @click="toggleDeal(deal.id)"
                  >
                    <div
                      class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all"
                      :class="deal.selected
                        ? 'border-[var(--ap-accent)] bg-[var(--ap-accent)] text-white'
                        : 'border-white/[0.15] bg-white/[0.03]'"
                    >
                      <UIcon v-if="deal.selected" name="i-lucide-check" class="text-xs" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-medium text-highlighted">
                        {{ deal.insured_name ?? 'Unknown' }}
                      </div>
                      <div class="mt-0.5 text-xs text-muted">
                        {{ deal.status ?? 'Successfull Cases' }}
                      </div>
                    </div>
                    <div class="shrink-0 text-right">
                      <div class="text-sm font-semibold text-[var(--ap-accent)]">
                        {{ formatMoney(Number(deal.face_amount ?? 0)) }}
                      </div>
                      <div class="text-xs text-muted">
                        {{ formatDate(deal.created_at) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Line Items -->
              <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                <div class="mb-4 flex items-center justify-between">
                  <h3 class="text-sm font-semibold uppercase tracking-wider text-highlighted">
                    Line Items
                  </h3>
                  <UButton
                    color="primary"
                    variant="soft"
                    size="xs"
                    icon="i-lucide-plus"
                    class="rounded-lg"
                    @click="addItem"
                  >
                    Add Item
                  </UButton>
                </div>

                <div v-if="!form.items.length" class="rounded-xl border border-dashed border-white/[0.06] px-4 py-8 text-center text-xs text-muted">
                  No line items yet. Click "Add Item" to get started.
                </div>

                <div v-else class="space-y-3">
                  <!-- Header -->
                  <div class="grid grid-cols-12 gap-3 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
                    <div class="col-span-5">Description</div>
                    <div class="col-span-2">Qty</div>
                    <div class="col-span-2">Unit Price</div>
                    <div class="col-span-2">Amount</div>
                    <div class="col-span-1"></div>
                  </div>

                  <div
                    v-for="(item, idx) in form.items"
                    :key="idx"
                    class="grid grid-cols-12 gap-3 items-start rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
                  >
                    <div class="col-span-5">
                      <UInput
                        v-model="item.description"
                        class="w-full [&_input]:rounded-lg [&_input]:border-white/[0.06] [&_input]:bg-white/[0.03] [&_input]:text-sm"
                        placeholder="Description"
                      />
                    </div>
                    <div class="col-span-2">
                      <UInput
                        v-model.number="item.quantity"
                        type="number"
                        :min="1"
                        class="w-full [&_input]:rounded-lg [&_input]:border-white/[0.06] [&_input]:bg-white/[0.03] [&_input]:text-sm"
                        @update:model-value="recalcItem(idx)"
                      />
                    </div>
                    <div class="col-span-2">
                      <UInput
                        v-model.number="item.unit_price"
                        type="number"
                        :min="0"
                        :step="0.01"
                        class="w-full [&_input]:rounded-lg [&_input]:border-white/[0.06] [&_input]:bg-white/[0.03] [&_input]:text-sm"
                        @update:model-value="recalcItem(idx)"
                      />
                    </div>
                    <div class="col-span-2 flex items-center">
                      <span class="text-sm font-semibold text-highlighted">{{ formatMoney(item.amount) }}</span>
                    </div>
                    <div class="col-span-1 flex items-center justify-end">
                      <button
                        class="rounded-lg p-1.5 text-muted transition-all hover:bg-red-500/10 hover:text-red-400"
                        @click="removeItem(idx)"
                      >
                        <UIcon name="i-lucide-trash-2" class="text-sm" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Totals -->
                <div v-if="form.items.length" class="mt-6 border-t border-white/[0.06] pt-4">
                  <div class="flex flex-col items-end gap-2">
                    <div class="flex items-center gap-8">
                      <span class="text-sm text-muted">Subtotal</span>
                      <span class="text-sm font-semibold text-highlighted w-28 text-right">{{ formatMoney(subtotal) }}</span>
                    </div>
                    <div class="flex items-center gap-4">
                      <span class="text-sm text-muted">Tax Rate (%)</span>
                      <UInput
                        v-model.number="form.tax_rate"
                        type="number"
                        :min="0"
                        :max="1"
                        :step="0.01"
                        class="w-24 [&_input]:rounded-lg [&_input]:border-white/[0.06] [&_input]:bg-white/[0.03] [&_input]:text-sm [&_input]:text-right"
                      />
                      <span class="text-sm font-semibold text-highlighted w-28 text-right">{{ formatMoney(taxAmount) }}</span>
                    </div>
                    <div class="flex items-center gap-8 border-t border-white/[0.06] pt-2">
                      <span class="text-base font-bold text-highlighted">Total</span>
                      <span class="text-lg font-bold text-[var(--ap-accent)] w-28 text-right">{{ formatMoney(totalAmount) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Column: Preview & Info -->
            <div class="space-y-6">
              <!-- Lawyer Info Card -->
              <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                <h3 class="mb-4 text-sm font-semibold uppercase tracking-wider text-highlighted">
                  Lawyer Info
                </h3>

                <div v-if="!form.lawyer_id" class="text-xs text-muted">
                  Select a lawyer to see their details
                </div>

                <div v-else-if="lawyerProfile" class="space-y-3">
                  <div>
                    <div class="text-xs text-muted">Name</div>
                    <div class="text-sm font-medium text-highlighted">{{ lawyerProfile.full_name ?? '—' }}</div>
                  </div>
                  <div>
                    <div class="text-xs text-muted">Firm</div>
                    <div class="text-sm text-default">{{ lawyerProfile.firm_name ?? '—' }}</div>
                  </div>
                  <div>
                    <div class="text-xs text-muted">Email</div>
                    <div class="text-sm text-default">{{ lawyerProfile.primary_email ?? '—' }}</div>
                  </div>
                  <div>
                    <div class="text-xs text-muted">Phone</div>
                    <div class="text-sm text-default">{{ lawyerProfile.direct_phone ?? '—' }}</div>
                  </div>
                  <div>
                    <div class="text-xs text-muted">Address</div>
                    <div class="text-sm text-default">{{ lawyerProfile.office_address ?? '—' }}</div>
                  </div>
                  <div>
                    <div class="text-xs text-muted">Bar #</div>
                    <div class="text-sm text-default">{{ lawyerProfile.bar_association_number ?? '—' }}</div>
                  </div>
                </div>

                <div v-else class="text-xs text-muted">
                  No profile found for this lawyer
                </div>
              </div>

              <!-- Invoice Summary -->
              <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                <h3 class="mb-4 text-sm font-semibold uppercase tracking-wider text-highlighted">
                  Summary
                </h3>

                <div class="space-y-3">
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-muted">Invoice #</span>
                    <span class="text-sm font-medium text-highlighted">{{ invoiceNumber || '—' }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-muted">Lawyer</span>
                    <span class="text-sm text-default">{{ selectedLawyerLabel || '—' }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-muted">Date Range</span>
                    <span class="text-sm text-default">
                      {{ form.date_range_start && form.date_range_end
                        ? `${formatDate(form.date_range_start)} - ${formatDate(form.date_range_end)}`
                        : '—'
                      }}
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-muted">Deals</span>
                    <span class="text-sm text-default">{{ form.deal_ids.length }} selected</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-muted">Line Items</span>
                    <span class="text-sm text-default">{{ form.items.length }}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-muted">Status</span>
                    <span
                      class="inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-medium"
                      :class="{
                        'bg-amber-500/10 text-amber-400': form.status === 'pending',
                        'bg-green-500/10 text-green-400': form.status === 'paid',
                        'bg-red-500/10 text-red-400': form.status === 'chargeback'
                      }"
                    >
                      {{ form.status.charAt(0).toUpperCase() + form.status.slice(1) }}
                    </span>
                  </div>

                  <div class="border-t border-white/[0.06] pt-3">
                    <div class="flex items-center justify-between">
                      <span class="text-sm font-bold text-highlighted">Total</span>
                      <span class="text-lg font-bold text-[var(--ap-accent)]">{{ formatMoney(totalAmount) }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="space-y-2">
                <UButton
                  color="primary"
                  block
                  icon="i-lucide-save"
                  class="rounded-xl"
                  :loading="saving"
                  :disabled="saving || !canSubmit"
                  @click="handleSave"
                >
                  {{ isEdit ? 'Update Invoice' : 'Create Invoice' }}
                </UButton>
                <UButton
                  color="neutral"
                  variant="ghost"
                  block
                  icon="i-lucide-x"
                  class="rounded-xl"
                  @click="goBack"
                >
                  Cancel
                </UButton>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
.create-invoice-scroll::-webkit-scrollbar {
  width: 4px;
}
.create-invoice-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.create-invoice-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
}
.create-invoice-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
