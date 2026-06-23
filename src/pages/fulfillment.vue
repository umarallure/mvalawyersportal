<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import BoardDragHint from '../components/BoardDragHint.vue'
import ProductGuideHint from '../components/product-guide/ProductGuideHint.vue'
import { useAuth } from '../composables/useAuth'
import { useBoardTouchDrag } from '../composables/useBoardTouchDrag'
import { useDragGhost } from '../composables/useDragGhost'
import { productGuideHints } from '../data/product-guide-hints'
import { supabase } from '../lib/supabase'

type StageKey = 'signed_cases' | 'active_cases' | 'dropped_cases' | 'successful_cases'

type FulfillmentCase = {
  id: string
  submissionId: string
  date: string
  clientName: string
  phone: string
  state: string
  status: string
  stage: StageKey
  leadVendor: string
  assignedAttorneyName: string
  reason?: string
  signedDate?: string
}

type LeadRow = Record<string, unknown>

const STAGES: { key: StageKey, label: string }[] = [
  { key: 'signed_cases', label: 'Signed Cases' },
  { key: 'active_cases', label: 'Active Cases' },
  { key: 'dropped_cases', label: 'Dropped Cases' },
  { key: 'successful_cases', label: 'Successful Cases' }
]

const getStageGuideHint = (stage: StageKey) => {
  if (stage === 'signed_cases') return productGuideHints.fulfillment.signedColumn
  if (stage === 'active_cases') return productGuideHints.fulfillment.activeColumn
  if (stage === 'dropped_cases') return productGuideHints.fulfillment.droppedColumn
  return productGuideHints.fulfillment.successfulColumn
}

const loading = ref(false)
const query = ref('')
const selectedStage = ref<'all' | StageKey>('all')
const showFilters = ref(false)
const filterStates = ref<string[]>([])
const cases = ref<FulfillmentCase[]>([])

const dragLeadId = ref<string | null>(null)
const dragFromStage = ref<StageKey | null>(null)

const auth = useAuth()
const router = useRouter()
const toast = useToast()
const fulfillmentHints = productGuideHints.fulfillment

const normalize = (v: unknown) => String(v ?? '').trim().toLowerCase()

const normalizeState = (v: unknown): string => {
  const raw = String(v ?? '').trim()
  if (!raw) return '-'

  const upper = raw.toUpperCase()
  if (upper.length === 2) return upper

  const map: Record<string, string> = {
    ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
    COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
    HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA',
    KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
    MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS', MISSOURI: 'MO',
    MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
    'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND',
    OHIO: 'OH', OKLAHOMA: 'OK', OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI',
    'SOUTH CAROLINA': 'SC', 'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT',
    VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV',
    WISCONSIN: 'WI', WYOMING: 'WY', 'DISTRICT OF COLUMBIA': 'DC'
  }

  return map[upper] ?? raw
}

const formatDate = (value: unknown) => {
  const raw = String(value ?? '').trim()
  if (!raw) return '-'

  try {
    const d = new Date(raw)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return raw.length >= 10 ? raw.slice(0, 10) : raw
  }
}

const formatPhone = (phone: unknown) => {
  const raw = String(phone ?? '').trim()
  if (!raw) return '-'

  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }

  return raw
}

const stageKeyToLabel = (key: StageKey) => {
  const found = STAGES.find(s => s.key === key)
  return found?.label ?? key
}

const normalizeStage = (value: unknown): StageKey | null => {
  const s = normalize(value)
  if (!s) return null
  if (s === 'signed_cases' || s === 'signed cases' || s === 'signed_retainers' || s === 'signed retainers') return 'signed_cases'
  if (s === 'active_cases' || s === 'active cases' || s === 'returned_back' || s.includes('returned back')) return 'active_cases'
  if (s === 'dropped_cases' || s === 'dropped cases' || s === 'dropped_retainers' || s.includes('dropped retainers')) return 'dropped_cases'
  if (s === 'successful_cases' || s === 'successful cases') return 'successful_cases'
  return null
}

const deriveInitialStage = (row: LeadRow): StageKey => {
  const explicitStage = normalizeStage(row.fulfillment_stage)
  if (explicitStage) return explicitStage

  const status = normalize(row.status)
  if (status.includes('return') || status.includes('back') || status.includes('active')) return 'active_cases'
  if (status.includes('drop') || status.includes('reject') || status.includes('disqual') || status.includes('cancel')) return 'dropped_cases'
  if (status.includes('success') || status.includes('qualified') || status.includes('approved') || status.includes('won')) return 'successful_cases'
  return 'signed_cases'
}

const getSignedDate = (row: LeadRow) => (
  row.signed_date
  ?? row.retainer_signed_date
  ?? row.retainer_signed_at
  ?? row.signed_at
  ?? null
)

const coerceFulfillmentCase = (row: LeadRow): FulfillmentCase | null => {
  const id = String(row.id ?? '').trim()
  if (!id) return null

  const signedDate = getSignedDate(row)
  const rawDate = row.submission_date ?? row.date ?? row.created_at ?? null

  return {
    id,
    submissionId: String(row.submission_id ?? ''),
    date: formatDate(rawDate),
    clientName: String(row.customer_full_name ?? row.insured_name ?? 'Unknown Client'),
    phone: formatPhone(row.phone_number ?? row.client_phone_number),
    state: normalizeState(row.state ?? row.state_code),
    status: String(row.status ?? '-'),
    stage: deriveInitialStage(row),
    leadVendor: String(row.lead_vendor ?? '-'),
    assignedAttorneyName: String(row.assigned_attorney_name ?? '-'),
    reason: row.reason ? String(row.reason) : undefined,
    signedDate: signedDate ? formatDate(signedDate) : undefined
  }
}

const load = async () => {
  loading.value = true

  try {
    await auth.init()

    const userId = auth.state.value.profile?.user_id ?? auth.state.value.user?.id ?? null
    const userRole = auth.state.value.profile?.role ?? null

    let qb = supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000)

    if (userRole === 'lawyer' && userId) {
      qb = qb.eq('assigned_attorney_id', userId)
    } else if (!userRole && userId) {
      const { data: userData, error: userErr } = await supabase
        .from('app_users')
        .select('center_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (userErr) throw userErr

      if (!userData?.center_id) {
        cases.value = []
        return
      }

      const { data: centerData, error: centerErr } = await supabase
        .from('centers')
        .select('lead_vendor')
        .eq('id', userData.center_id)
        .maybeSingle()

      if (centerErr) throw centerErr

      if (!centerData?.lead_vendor) {
        cases.value = []
        return
      }

      qb = qb.eq('lead_vendor', centerData.lead_vendor)
    }

    const { data, error } = await qb
    if (error) throw error

    const sourceRows = (data ?? []) as LeadRow[]
    const mapped = sourceRows
      .map(coerceFulfillmentCase)
      .filter((row): row is FulfillmentCase => Boolean(row))

    const sourceById = new Map(sourceRows.map(row => [String(row.id ?? ''), row]))
    const attorneyIds = [...new Set(
      sourceRows
        .map(row => String(row.assigned_attorney_id ?? '').trim())
        .filter(Boolean)
    )]

    if (attorneyIds.length) {
      const { data: attorneys } = await supabase
        .from('attorney_profiles')
        .select('user_id,full_name')
        .in('user_id', attorneyIds)

      const attorneyNameById = new Map(
        ((attorneys ?? []) as Array<Record<string, unknown>>).map(row => [
          String(row.user_id ?? ''),
          String(row.full_name ?? '').trim()
        ])
      )

      mapped.forEach((item) => {
        const source = sourceById.get(item.id)
        const attorneyId = String(source?.assigned_attorney_id ?? '').trim()
        const attorneyName = attorneyNameById.get(attorneyId)
        if (attorneyName) item.assignedAttorneyName = attorneyName
      })
    }

    cases.value = mapped
  } catch (err) {
    cases.value = []
    const msg = err instanceof Error ? err.message : 'Failed to load fulfillment cases'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load().catch(() => {})
})

const availableStates = computed(() => {
  const states = new Set<string>()
  cases.value.forEach((item) => {
    const state = String(item.state ?? '').trim().toUpperCase()
    if (state && state !== '-') states.add(state)
  })
  return [...states].sort()
})

const stateFilterOptions = computed(() => [
  { label: 'All states', value: '__all__' },
  ...availableStates.value.map(state => ({ label: state, value: state }))
])

let _skipStatesWatch = false
watch(filterStates, (newVal, oldVal) => {
  if (_skipStatesWatch) return
  const hadAll = oldVal.includes('__all__')
  const hasAll = newVal.includes('__all__')
  const realCodes = availableStates.value

  _skipStatesWatch = true
  if (hasAll && !hadAll) {
    filterStates.value = ['__all__', ...realCodes]
  } else if (!hasAll && hadAll) {
    filterStates.value = []
  } else if (hadAll && hasAll) {
    const withoutAll = newVal.filter(v => v !== '__all__')
    if (withoutAll.length < realCodes.length) {
      filterStates.value = withoutAll
    }
  } else if (!hadAll && !hasAll) {
    const withoutAll = newVal.filter(v => v !== '__all__')
    if (withoutAll.length === realCodes.length && realCodes.length > 0) {
      filterStates.value = ['__all__', ...realCodes]
    }
  }
  _skipStatesWatch = false
})

const multiSelectUi = {
  value: 'truncate whitespace-nowrap overflow-hidden',
  item: 'group',
  itemTrailingIcon: 'hidden'
}

const activeFilterCount = computed(() => {
  let count = 0
  if (filterStates.value.filter(v => v !== '__all__').length > 0) count++
  if (selectedStage.value !== 'all') count++
  return count
})

const hasActiveFilters = computed(() => activeFilterCount.value > 0 || query.value.trim().length > 0)

const resetAllFilters = () => {
  query.value = ''
  filterStates.value = []
  selectedStage.value = 'all'
}

const filteredCases = computed(() => {
  const q = query.value.trim().toLowerCase()
  const stageFilter = selectedStage.value
  const activeStates = filterStates.value.filter(v => v !== '__all__')

  return cases.value.filter((item) => {
    if (stageFilter !== 'all' && item.stage !== stageFilter) return false
    if (activeStates.length > 0 && !activeStates.includes(String(item.state ?? '').trim().toUpperCase())) return false
    if (!q) return true

    return [
      item.clientName,
      item.phone,
      item.id,
      item.submissionId,
      item.status,
      item.state,
      item.leadVendor,
      item.assignedAttorneyName,
      stageKeyToLabel(item.stage)
    ].some(v => String(v ?? '').toLowerCase().includes(q))
  })
})

const casesByStage = computed(() => {
  const grouped = new Map<StageKey, FulfillmentCase[]>()
  STAGES.forEach((stage) => grouped.set(stage.key, []))
  filteredCases.value.forEach((item) => {
    const arr = grouped.get(item.stage) ?? []
    arr.push(item)
    grouped.set(item.stage, arr)
  })
  return grouped
})

const signedCount = computed(() => (casesByStage.value.get('signed_cases') ?? []).length)
const activeCount = computed(() => (casesByStage.value.get('active_cases') ?? []).length)
const droppedCount = computed(() => (casesByStage.value.get('dropped_cases') ?? []).length)
const successfulCount = computed(() => (casesByStage.value.get('successful_cases') ?? []).length)

const stageHeaderBg = (key: StageKey) => {
  switch (key) {
    case 'signed_cases':
      return 'bg-gradient-to-r from-blue-500/[0.10] via-blue-500/[0.04] to-transparent dark:from-blue-400/[0.14] dark:via-blue-400/[0.06] dark:to-transparent'
    case 'active_cases':
      return 'bg-gradient-to-r from-amber-500/[0.10] via-amber-500/[0.04] to-transparent dark:from-amber-400/[0.14] dark:via-amber-400/[0.06] dark:to-transparent'
    case 'dropped_cases':
      return 'bg-gradient-to-r from-red-500/[0.10] via-red-500/[0.04] to-transparent dark:from-red-400/[0.14] dark:via-red-400/[0.06] dark:to-transparent'
    case 'successful_cases':
      return 'bg-gradient-to-r from-emerald-500/[0.10] via-emerald-500/[0.04] to-transparent dark:from-emerald-400/[0.14] dark:via-emerald-400/[0.06] dark:to-transparent'
  }
}

const stageIconName = (key: StageKey) => {
  switch (key) {
    case 'signed_cases':
      return 'i-lucide-check-circle'
    case 'active_cases':
      return 'i-lucide-activity'
    case 'dropped_cases':
      return 'i-lucide-x-circle'
    case 'successful_cases':
      return 'i-lucide-trophy'
  }
}

const stageBgClass = (key: StageKey) => {
  switch (key) {
    case 'signed_cases':
      return 'bg-blue-500/10'
    case 'active_cases':
      return 'bg-amber-500/10'
    case 'dropped_cases':
      return 'bg-red-500/10'
    case 'successful_cases':
      return 'bg-emerald-500/10'
  }
}

const stageIconClass = (key: StageKey) => {
  switch (key) {
    case 'signed_cases':
      return 'text-blue-400'
    case 'active_cases':
      return 'text-amber-400'
    case 'dropped_cases':
      return 'text-red-400'
    case 'successful_cases':
      return 'text-emerald-400'
  }
}

const openLead = (item: FulfillmentCase) => {
  router.push(`/retainers/${item.id}`)
}

const { startDrag, endDrag } = useDragGhost()

const onDragStartLead = (e: DragEvent, item: FulfillmentCase) => {
  startDrag(e)
  dragLeadId.value = item.id
  dragFromStage.value = item.stage
}

const onDragEndLead = () => {
  endDrag()
  dragLeadId.value = null
  dragFromStage.value = null
}

const onDropToStage = async (targetStage: StageKey) => {
  const leadId = dragLeadId.value
  const fromStage = dragFromStage.value
  if (!leadId || !fromStage) return

  if (fromStage === targetStage) {
    onDragEndLead()
    return
  }

  const idx = cases.value.findIndex(item => item.id === leadId)
  if (idx < 0) {
    onDragEndLead()
    return
  }

  const prevStage = cases.value[idx].stage
  cases.value[idx] = {
    ...cases.value[idx],
    stage: targetStage
  }

  try {
    const { error } = await supabase
      .from('leads')
      .update({
        fulfillment_stage: targetStage,
        fulfillment_stage_updated_at: new Date().toISOString(),
        fulfillment_stage_updated_by: auth.state.value.user?.id ?? null
      })
      .eq('id', leadId)

    if (error) throw error
  } catch (err) {
    cases.value[idx] = {
      ...cases.value[idx],
      stage: prevStage
    }

    const msg = err instanceof Error ? err.message : 'Unable to update fulfillment stage'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    onDragEndLead()
  }
}

const { onCardTouchStart } = useBoardTouchDrag<FulfillmentCase>({
  onStart: (item) => {
    dragLeadId.value = item.id
    dragFromStage.value = item.stage
  },
  onDrop: (stage) => { void onDropToStage(stage as StageKey) },
  onCancel: () => { onDragEndLead() }
})
</script>

<template>
  <UDashboardPanel id="fulfillment">
    <template #header>
      <UDashboardNavbar title="Fulfillment">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            @click="load"
          >
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="ap-mobile-workspace flex h-full min-h-0 flex-col gap-5">
        <div class="ap-mobile-kpi-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div class="ap-fade-in group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-blue-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <div class="flex items-start gap-1.5">
                  <p class="text-[10px] font-medium uppercase tracking-wider text-blue-500 dark:text-blue-400">Signed Cases</p>
                  <ProductGuideHint
                    :title="fulfillmentHints.signedCasesCard.title"
                    :description="fulfillmentHints.signedCasesCard.description"
                    :guide-target="fulfillmentHints.signedCasesCard.guideTarget"
                  />
                </div>
                <p class="mt-1 text-2xl font-bold text-blue-500 dark:text-blue-400 tabular-nums">{{ signedCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                <UIcon name="i-lucide-check-circle" class="text-lg text-blue-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-1 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-amber-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <div class="flex items-start gap-1.5">
                  <p class="text-[10px] font-medium uppercase tracking-wider text-amber-500 dark:text-amber-400">Active Cases</p>
                  <ProductGuideHint
                    :title="fulfillmentHints.activeCasesCard.title"
                    :description="fulfillmentHints.activeCasesCard.description"
                    :guide-target="fulfillmentHints.activeCasesCard.guideTarget"
                  />
                </div>
                <p class="mt-1 text-2xl font-bold text-amber-500 dark:text-amber-400 tabular-nums">{{ activeCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                <UIcon name="i-lucide-activity" class="text-lg text-amber-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-2 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-red-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <div class="flex items-start gap-1.5">
                  <p class="text-[10px] font-medium uppercase tracking-wider text-red-500 dark:text-red-400">Dropped Cases</p>
                  <ProductGuideHint
                    :title="fulfillmentHints.droppedCasesCard.title"
                    :description="fulfillmentHints.droppedCasesCard.description"
                    :guide-target="fulfillmentHints.droppedCasesCard.guideTarget"
                  />
                </div>
                <p class="mt-1 text-2xl font-bold text-red-500 dark:text-red-400 tabular-nums">{{ droppedCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                <UIcon name="i-lucide-x-circle" class="text-lg text-red-400" />
              </div>
            </div>
          </div>

          <div class="ap-fade-in ap-delay-3 group relative overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
            <div class="absolute inset-y-0 left-0 w-1 bg-emerald-400" />
            <div class="flex items-center justify-between px-5 py-4 pl-5">
              <div>
                <div class="flex items-start gap-1.5">
                  <p class="text-[10px] font-medium uppercase tracking-wider text-emerald-500 dark:text-emerald-400">Successful Cases</p>
                  <ProductGuideHint
                    :title="fulfillmentHints.successfulCasesCard.title"
                    :description="fulfillmentHints.successfulCasesCard.description"
                    :guide-target="fulfillmentHints.successfulCasesCard.guideTarget"
                  />
                </div>
                <p class="mt-1 text-2xl font-bold text-emerald-500 dark:text-emerald-400 tabular-nums">{{ successfulCount }}</p>
              </div>
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <UIcon name="i-lucide-trophy" class="text-lg text-emerald-400" />
              </div>
            </div>
          </div>
        </div>

        <div class="ap-fade-in ap-delay-4 overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm">
          <div class="ap-mobile-toolbar-row flex flex-wrap items-center gap-3 px-5 py-3">
            <div class="ap-mobile-toolbar-primary flex flex-wrap items-center gap-3 min-w-0">
              <UInput
                v-model="query"
                class="ap-mobile-control max-w-xs"
                icon="i-lucide-search"
                placeholder="Search cases..."
                size="sm"
              />
              <ProductGuideHint
                :title="fulfillmentHints.filters.title"
                :description="fulfillmentHints.filters.description"
                :guide-target="fulfillmentHints.filters.guideTarget"
              />
            </div>

            <div class="ap-mobile-toolbar-actions ml-auto flex flex-wrap items-center justify-end gap-2.5 text-right">
              <p
                aria-live="polite"
                class="text-sm font-medium text-muted tabular-nums"
              >
                {{ filteredCases.length }} cases
              </p>
              <UButton
                :icon="showFilters ? 'i-lucide-filter-x' : 'i-lucide-filter'"
                size="xs"
                :color="activeFilterCount > 0 ? 'primary' : 'neutral'"
                :variant="showFilters ? 'soft' : 'outline'"
                @click="showFilters = !showFilters"
              >
                {{ showFilters ? 'Hide Filters' : 'Filters' }}
                <template v-if="activeFilterCount > 0" #trailing>
                  <span class="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                    {{ activeFilterCount }}
                  </span>
                </template>
              </UButton>
              <UButton
                v-if="hasActiveFilters"
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                label="Reset all"
                @click="resetAllFilters"
              />
            </div>
          </div>

          <div
            class="ap-collapse"
            :class="showFilters ? 'ap-collapse--open' : ''"
          >
            <div>
              <div class="border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02] px-5 py-4">
                <div class="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                  <div>
                    <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">States</label>
                    <USelect
                      v-model="filterStates"
                      :items="stateFilterOptions"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="All states"
                      size="xs"
                      class="w-full"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon name="i-lucide-square" class="absolute size-4 text-muted group-data-[state=checked]:hidden" />
                          <UIcon name="i-lucide-check-square" class="absolute hidden size-4 text-primary group-data-[state=checked]:block" />
                        </span>
                      </template>
                    </USelect>
                  </div>

                  <div>
                    <label class="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted">Stages</label>
                    <USelect
                      v-model="selectedStage"
                      :items="[{ label: 'All Stages', value: 'all' }, ...STAGES.map(s => ({ label: s.label, value: s.key }))]"
                      value-key="value"
                      label-key="label"
                      placeholder="All stages"
                      size="xs"
                      class="w-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <BoardDragHint class="shrink-0" />

        <div class="ap-mobile-board-shell min-h-0 flex-1 overflow-hidden">
          <div class="ap-mobile-board-track flex h-full gap-4">
            <div
              v-for="(stage, stageIdx) in STAGES"
              :key="stage.key"
              class="ap-mobile-board-column ap-fade-in flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-white/90 dark:bg-[#1a1a1a]/60 shadow-lg backdrop-blur-sm"
              :style="{ animationDelay: `${500 + stageIdx * 100}ms` }"
              :data-board-stage="stage.key"
              @dragover.prevent
              @drop.prevent="onDropToStage(stage.key)"
            >
              <div
                class="flex items-center justify-between border-b border-[var(--ap-card-border)] px-4 py-3"
                :class="stageHeaderBg(stage.key)"
              >
                <div class="flex items-center gap-2.5">
                  <div
                    class="flex h-7 w-7 items-center justify-center rounded-lg"
                    :class="stageBgClass(stage.key)"
                  >
                    <UIcon
                      :name="stageIconName(stage.key)"
                      class="text-xs"
                      :class="stageIconClass(stage.key)"
                    />
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-sm font-semibold text-highlighted">{{ stage.label }}</span>
                    <ProductGuideHint
                      :title="getStageGuideHint(stage.key).title"
                      :description="getStageGuideHint(stage.key).description"
                      :guide-target="getStageGuideHint(stage.key).guideTarget"
                    />
                  </div>
                </div>
              </div>

              <div class="flex-1 space-y-2 overflow-y-auto p-3 fulfillment-scroll">
                <div
                  v-for="caseItem in (casesByStage.get(stage.key) ?? [])"
                  :key="caseItem.id"
                  class="group cursor-pointer rounded-lg border border-black/[0.05] dark:border-white/[0.06] bg-white/60 dark:bg-white/[0.03] p-3 transition-all duration-200 hover:border-[var(--ap-accent)]/20 hover:bg-[var(--ap-accent)]/[0.03] hover:shadow-sm"
                  draggable="true"
                  @dragstart="onDragStartLead($event, caseItem)"
                  @dragend="onDragEndLead"
                  @touchstart="onCardTouchStart($event, caseItem)"
                  @click="openLead(caseItem)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold text-highlighted transition-colors group-hover:text-[var(--ap-accent)]">
                        {{ caseItem.clientName }}
                      </div>
                      <div class="mt-0.5 text-[11px] text-muted">{{ caseItem.phone }}</div>
                    </div>
                  </div>

                  <div class="mt-2 flex items-center justify-between gap-2">
                    <span class="inline-flex items-center rounded-md border border-[var(--ap-card-border)] bg-[var(--ap-card-border)] px-2 py-0.5 text-[11px] font-medium text-default">
                      {{ caseItem.state }}
                    </span>
                    <span class="text-[11px] text-muted">{{ caseItem.date }}</span>
                  </div>

                  <div v-if="caseItem.assignedAttorneyName !== '-'" class="mt-2 text-[11px] text-muted">
                    {{ caseItem.assignedAttorneyName }}
                  </div>

                  <div v-if="caseItem.reason" class="mt-2 rounded-lg bg-[var(--ap-card-hover)] px-2.5 py-1.5 text-[11px] text-muted">
                    {{ caseItem.reason }}
                  </div>

                  <div v-if="caseItem.signedDate" class="mt-2 flex items-center gap-1 text-[11px] text-blue-400">
                    <UIcon name="i-lucide-check" class="size-3" />
                    <span>Signed: {{ caseItem.signedDate }}</span>
                  </div>
                </div>

                <div
                  v-if="(casesByStage.get(stage.key)?.length ?? 0) === 0"
                  class="flex items-center justify-center rounded-lg border border-dashed border-black/[0.06] dark:border-white/[0.08] px-3 py-8 text-center text-xs text-muted"
                >
                  No Cases
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
.fulfillment-scroll::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.fulfillment-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.fulfillment-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
}
.fulfillment-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
