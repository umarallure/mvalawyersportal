<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import usSvgFallbackRaw from '../assets/us.svg?raw'

import { useAuth } from '../composables/useAuth'
import { createOrder, listOpenOrderCountsByState } from '../lib/orders'
import { US_STATES } from '../lib/us-states'

const US_SVG_ASSET_URL = new URL('../assets/us.svg', import.meta.url).toString()

type CompetitionStatus = 'light' | 'moderate' | 'heavy'

type StateCompetition = {
  code: string
  name: string
  openOrders: number
  status: CompetitionStatus
}

const auth = useAuth()
const loading = ref(false)
const tooltip = ref({ open: false, x: 0, y: 0, state: null as StateCompetition | null })
const mapRoot = ref<HTMLDivElement | null>(null)
const tooltipEl = ref<HTMLDivElement | null>(null)

const states = ref<StateCompetition[]>([])

const stateByCode = computed(() => {
  const map = new Map<string, StateCompetition>()
  states.value.forEach(s => map.set(s.code, s))
  return map
})

const totalOpenOrders = computed(() => states.value.reduce((sum, s) => sum + s.openOrders, 0))

const toCompetitionStatus = (openOrders: number): CompetitionStatus => {
  if (openOrders < 10) return 'light'
  if (openOrders <= 20) return 'moderate'
  return 'heavy'
}

const getStatusColor = (status: CompetitionStatus) => {
  if (status === 'light') return '#22c55e'
  if (status === 'moderate') return '#eab308'
  return '#ef4444'
}

const getStatusLabel = (status: CompetitionStatus) => {
  if (status === 'light') return 'Light Competition'
  if (status === 'moderate') return 'Moderate Competition'
  return 'Heavy Competition'
}

const refreshCounts = async () => {
  loading.value = true
  try {
    const rows = await listOpenOrderCountsByState()
    const counts = new Map(rows.map(r => [String(r.state_code).toUpperCase(), Number(r.open_orders) || 0]))

    states.value = US_STATES.map((s) => {
      const openOrders = counts.get(s.code) ?? 0
      return {
        code: s.code,
        name: s.name,
        openOrders,
        status: toCompetitionStatus(openOrders)
      }
    })
  } finally {
    loading.value = false
  }
}

const createOrderOpen = ref(false)
const createOrderConfirmOpen = ref(false)

const pendingStateCode = ref<string | null>(null)

const orderForm = ref({
  stateCode: '' as string,
  caseType: 'Motor Vehicle Accident' as string,
  caseSubType: '' as string,
  injurySeverity: [] as string[],
  liabilityStatus: 'clear_only' as 'clear_only' | 'disputed_ok',
  insuranceStatus: 'insured_only' as 'insured_only' | 'uninsured_ok',
  minimumCaseValue: 25000 as number,
  medicalTreatment: 'ongoing' as string,
  languages: ['English'] as string[],
  noPriorAttorney: true as boolean,
  quotaTotal: 10 as number,
  expiresAt: '' as string
})

const resetOrderForm = () => {
  orderForm.value = {
    stateCode: '',
    caseType: 'Motor Vehicle Accident',
    caseSubType: '',
    injurySeverity: [],
    liabilityStatus: 'clear_only',
    insuranceStatus: 'insured_only',
    minimumCaseValue: 25000,
    medicalTreatment: 'ongoing',
    languages: ['English'],
    noPriorAttorney: true,
    quotaTotal: 10,
    expiresAt: ''
  }
}

const openCreateOrder = () => {
  pendingStateCode.value = null
  createOrderConfirmOpen.value = false
  createOrderOpen.value = true
}

const openCreateOrderForState = (stateCode: string) => {
  const code = String(stateCode || '').trim().toUpperCase()
  if (!code) return
  pendingStateCode.value = code
  createOrderConfirmOpen.value = true
}

const confirmCreateOrderForState = () => {
  const code = pendingStateCode.value
  createOrderConfirmOpen.value = false
  if (!code) return
  orderForm.value.stateCode = code
  createOrderOpen.value = true
}

const handleCreateOrderOpenUpdate = (v: boolean) => {
  createOrderOpen.value = v
  if (!v) {
    pendingStateCode.value = null
  }
}

const injurySeverityOptions = [
  { label: 'Minor', value: 'minor' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Severe', value: 'severe' },
  { label: 'Catastrophic', value: 'catastrophic' }
]

const caseCategoryOptions = [
  { label: 'Motor Vehicle Accident', value: 'Motor Vehicle Accident' },
  { label: 'Slip & Fall', value: 'Slip & Fall' },
  { label: 'Workplace Injury', value: 'Workplace Injury' },
  { label: 'Medical Malpractice', value: 'Medical Malpractice' },
  { label: 'Other', value: 'Other' }
]

const subCategoriesByCategory: Record<string, Array<{ label: string, value: string }>> = {
  'Motor Vehicle Accident': [
    { label: 'Rear-end', value: 'Rear-end' },
    { label: 'T-Bone', value: 'T-Bone' },
    { label: 'Head-on', value: 'Head-on' },
    { label: 'Pedestrian', value: 'Pedestrian' },
    { label: 'Rideshare (Uber/Lyft)', value: 'Rideshare (Uber/Lyft)' },
    { label: 'Hit & Run', value: 'Hit & Run' },
    { label: 'Uninsured/Underinsured', value: 'Uninsured/Underinsured' }
  ],
  'Slip & Fall': [
    { label: 'Premises liability', value: 'Premises liability' },
    { label: 'Trip & fall', value: 'Trip & fall' },
    { label: 'Wet floor', value: 'Wet floor' }
  ],
  'Workplace Injury': [
    { label: 'Workers\' comp', value: "Workers' comp" },
    { label: 'Third-party liability', value: 'Third-party liability' }
  ],
  'Medical Malpractice': [
    { label: 'Misdiagnosis', value: 'Misdiagnosis' },
    { label: 'Surgical error', value: 'Surgical error' }
  ],
  'Other': []
}

const caseSubCategoryOptions = computed(() => {
  return subCategoriesByCategory[String(orderForm.value.caseType || '')] ?? []
})

watch(
  () => orderForm.value.caseType,
  () => {
    orderForm.value.caseSubType = ''
  }
)

const liabilityOptions = [
  { label: 'Clear liability only', value: 'clear_only' },
  { label: 'Disputed acceptable', value: 'disputed_ok' }
]

const insuranceOptions = [
  { label: 'Insured only', value: 'insured_only' },
  { label: 'Uninsured acceptable', value: 'uninsured_ok' }
]

const medicalTreatmentOptions = [
  { label: 'ER Visit', value: 'er' },
  { label: 'Ongoing Treatment', value: 'ongoing' },
  { label: 'Surgery', value: 'surgery' }
]

const languageOptions = [
  'English',
  'Spanish'
]

const orderStateOptions = computed(() => {
  return US_STATES
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({ label: `${s.name} (${s.code})`, value: s.code }))
})

const submitCreateOrder = async () => {
  const userId = auth.state.value.user?.id ?? null
  if (!userId) return

  const stateCode = String(orderForm.value.stateCode || '').trim().toUpperCase()
  if (!stateCode) return

  const quotaTotal = Number(orderForm.value.quotaTotal)
  if (!Number.isFinite(quotaTotal) || quotaTotal <= 0) return

  const expiresAt = String(orderForm.value.expiresAt || '').trim()
  if (!expiresAt) return

  await createOrder({
    lawyer_id: userId,
    target_states: [stateCode],
    case_type: String(orderForm.value.caseType || '').trim(),
    case_subtype: String(orderForm.value.caseSubType || '').trim() || null,
    quota_total: Math.round(quotaTotal),
    expires_at: new Date(expiresAt).toISOString(),
    criteria: {
      injury_severity: orderForm.value.injurySeverity,
      liability_status: orderForm.value.liabilityStatus,
      insurance_status: orderForm.value.insuranceStatus,
      minimum_case_value: Number(orderForm.value.minimumCaseValue) || null,
      medical_treatment: orderForm.value.medicalTreatment,
      languages: orderForm.value.languages,
      no_prior_attorney: orderForm.value.noPriorAttorney
    }
  })

  createOrderOpen.value = false
  resetOrderForm()
  await refreshCounts()
  applyMapColors()
}

const MAP_PATH_SELECTOR = 'path[data-id], path[id]'

const applyMapColors = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg')
  if (!svg) return

  const paths = svg.querySelectorAll(MAP_PATH_SELECTOR)
  paths.forEach((p) => {
    const path = p as SVGPathElement
    const code = p.getAttribute('data-id') || p.getAttribute('id')
    if (!code) return
    const state = stateByCode.value.get(code)

    const fill = state ? getStatusColor(state.status) : '#e5e7eb'
    const stroke = '#0b0b0b'

    path.style.setProperty('fill', fill, 'important')
    path.style.setProperty('stroke', stroke, 'important')
    path.style.setProperty('stroke-width', '0.8', 'important')
    path.style.cursor = state ? 'pointer' : 'default'
    path.style.opacity = '1'
  })

  applyStateLabels()
}

const applyStateLabels = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg') as SVGSVGElement | null
  if (!svg) return

  const old = svg.querySelector('#state-labels')
  if (old) old.remove()

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  g.setAttribute('id', 'state-labels')
  g.setAttribute('pointer-events', 'none')

  const paths = svg.querySelectorAll(MAP_PATH_SELECTOR)
  paths.forEach((p) => {
    const code = p.getAttribute('data-id') || p.getAttribute('id')
    if (!code) return

    let bbox: DOMRect
    try {
      bbox = (p as unknown as SVGGraphicsElement).getBBox()
    } catch {
      return
    }

    const cx = bbox.x + bbox.width / 2
    const cy = bbox.y + bbox.height / 2

    const state = stateByCode.value.get(code)
    if (!state) return

    const fontSize = Math.max(6, Math.min(bbox.width, bbox.height) / 3)
    const fill = '#ffffff'

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.textContent = code
    text.setAttribute('x', String(cx))
    text.setAttribute('y', String(cy))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dominant-baseline', 'middle')
    text.style.setProperty('font-size', `${fontSize}px`, 'important')
    text.style.setProperty('font-weight', '700', 'important')
    text.style.setProperty('fill', fill, 'important')
    text.style.setProperty('paint-order', 'stroke', 'important')
    text.style.setProperty('stroke', 'rgba(0,0,0,0.5)', 'important')
    text.style.setProperty('stroke-width', '1', 'important')

    g.appendChild(text)
  })

  svg.appendChild(g)
}

const handleStateEnter = (evt: Event) => {
  const target = evt.target as HTMLElement | null
  if (!target) return
  const code = target.getAttribute('data-id') || target.getAttribute('id')
  if (!code) return
  const state = stateByCode.value.get(code) ?? null
  if (!state) return

  tooltip.value.state = state
  tooltip.value.open = true
}

const handleStateLeave = () => {
  tooltip.value.open = false
  tooltip.value.state = null
}

const handleMouseMove = (evt: MouseEvent) => {
  if (!tooltip.value.open) return

  const root = mapRoot.value
  if (!root) return
  const rect = root.getBoundingClientRect()

  const offset = 6
  const rawX = evt.clientX - rect.left + offset
  const rawY = evt.clientY - rect.top + offset

  const w = tooltipEl.value?.offsetWidth ?? 0
  const h = tooltipEl.value?.offsetHeight ?? 0

  const maxX = Math.max(0, rect.width - w - 4)
  const maxY = Math.max(0, rect.height - h - 4)

  tooltip.value.x = Math.max(4, Math.min(rawX, maxX))
  tooltip.value.y = Math.max(4, Math.min(rawY, maxY))
}

const handleStateClick = (evt: Event) => {
  const target = evt.target as HTMLElement | null
  if (!target) return
  const code = target.getAttribute('data-id') || target.getAttribute('id')
  if (!code) return
  const state = stateByCode.value.get(code) ?? null
  if (!state) return
  openCreateOrderForState(state.code)
}

const bindSvgEvents = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg')
  if (!svg) return

  const paths = svg.querySelectorAll(MAP_PATH_SELECTOR)
  paths.forEach((p) => {
    p.addEventListener('mouseenter', handleStateEnter)
    p.addEventListener('mouseleave', handleStateLeave)
    p.addEventListener('click', handleStateClick)
  })

  svg.addEventListener('mousemove', handleMouseMove)
}

const unbindSvgEvents = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg')
  if (!svg) return

  const paths = svg.querySelectorAll(MAP_PATH_SELECTOR)
  paths.forEach((p) => {
    p.removeEventListener('mouseenter', handleStateEnter)
    p.removeEventListener('mouseleave', handleStateLeave)
    p.removeEventListener('click', handleStateClick)
  })

  svg.removeEventListener('mousemove', handleMouseMove)
}

const mountSvg = async () => {
  await nextTick()
  if (!mapRoot.value) return

  let svgMarkup = ''
  try {
    const res = await fetch(US_SVG_ASSET_URL)
    if (!res.ok) throw new Error('Failed to load bundled SVG')
    svgMarkup = await res.text()
  } catch {
    svgMarkup = usSvgFallbackRaw
  }

  mapRoot.value.innerHTML = svgMarkup

  await nextTick()
  const svg = mapRoot.value.querySelector('svg') as SVGSVGElement | null
  if (svg) {
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.style.width = '100%'
    svg.style.height = '100%'
    svg.style.display = 'block'
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
  }
}

onMounted(() => {
  const run = async () => {
    if (!mapRoot.value) return

    await auth.init()
    await refreshCounts()

    await mountSvg()
    bindSvgEvents()
    applyMapColors()
  }

  void run()
})

onUnmounted(() => {
  unbindSvgEvents()
})

watch(states, () => {
  applyMapColors()
})
</script>

<template>
  <UDashboardPanel id="intake-map">
    <template #header>
      <UDashboardNavbar title="Intake Map">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="primary"
            variant="solid"
            icon="i-lucide-plus"
            @click="openCreateOrder"
          >
            Create Order
          </UButton>

          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            @click="refreshCounts"
          >
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UModal
          v-if="createOrderConfirmOpen"
          :open="true"
          title="Create order"
          :dismissible="false"
          @update:open="(v) => { createOrderConfirmOpen = v }"
        >
          <template #body>
            <div class="space-y-4">
              <div class="text-sm text-muted">
                Are you sure you want to create an order for
                <span class="font-semibold">{{ pendingStateCode }}</span>?
              </div>

              <div class="flex items-center justify-end gap-2">
                <UButton
                  color="neutral"
                  variant="outline"
                  @click="() => { createOrderConfirmOpen = false; pendingStateCode = null }"
                >
                  Cancel
                </UButton>
                <UButton
                  color="primary"
                  variant="solid"
                  @click="confirmCreateOrderForState"
                >
                  Continue
                </UButton>
              </div>
            </div>
          </template>
        </UModal>

        <UModal
          v-if="createOrderOpen"
          :open="true"
          title="Create Intake Order"
          :dismissible="false"
          @update:open="handleCreateOrderOpenUpdate"
        >
          <template #body="{ close }">
            <div class="space-y-4">
              <div class="text-sm text-muted">Define your demand packet for the selected geography.</div>

              <UFormField label="State" required>
                <USelect
                  v-model="orderForm.stateCode"
                  :items="orderStateOptions"
                  value-key="value"
                  label-key="label"
                  placeholder="Select a state"
                />
              </UFormField>

              <UFormField label="Case category" required>
                <USelect
                  v-model="orderForm.caseType"
                  :items="caseCategoryOptions"
                  value-key="value"
                  label-key="label"
                  placeholder="Select case category"
                />
              </UFormField>

              <UFormField label="Sub-category">
                <USelect
                  v-model="orderForm.caseSubType"
                  :items="caseSubCategoryOptions"
                  value-key="value"
                  label-key="label"
                  :disabled="caseSubCategoryOptions.length === 0"
                  placeholder="Select sub-category"
                />
              </UFormField>

              <UFormField label="Injury severity" required>
                <USelect
                  v-model="orderForm.injurySeverity"
                  :items="injurySeverityOptions"
                  value-key="value"
                  label-key="label"
                  multiple
                  placeholder="Select injury severities"
                />
              </UFormField>

              <UFormField label="Liability status" required>
                <USelect
                  v-model="orderForm.liabilityStatus"
                  :items="liabilityOptions"
                  value-key="value"
                  label-key="label"
                  placeholder="Select liability"
                />
              </UFormField>

              <UFormField label="Insurance status" required>
                <USelect
                  v-model="orderForm.insuranceStatus"
                  :items="insuranceOptions"
                  value-key="value"
                  label-key="label"
                  placeholder="Select insurance"
                />
              </UFormField>

              <UFormField label="Minimum estimated case value" required>
                <UInput v-model.number="orderForm.minimumCaseValue" type="number" min="0" />
              </UFormField>

              <UFormField label="Medical treatment" required>
                <USelect
                  v-model="orderForm.medicalTreatment"
                  :items="medicalTreatmentOptions"
                  value-key="value"
                  label-key="label"
                />
              </UFormField>

              <UFormField label="Languages" required>
                <UInputMenu
                  v-model="orderForm.languages"
                  :items="languageOptions"
                  multiple
                  placeholder="Select languages"
                />
              </UFormField>

              <UFormField label="Client requirements">
                <UCheckbox v-model="orderForm.noPriorAttorney" label="No prior attorney" />
              </UFormField>

              <UFormField label="Quota" description="Total number of cases needed" required>
                <UInput v-model.number="orderForm.quotaTotal" type="number" min="1" />
              </UFormField>

              <UFormField label="Expiration" description="Date when this order stops accepting retainers" required>
                <UInput v-model="orderForm.expiresAt" type="date" />
              </UFormField>

              <div class="flex items-center justify-end gap-2">
                <UButton
                  color="neutral"
                  variant="outline"
                  @click="() => { resetOrderForm(); close() }"
                >
                  Cancel
                </UButton>
                <UButton
                  color="primary"
                  variant="solid"
                  :disabled="!String(orderForm.stateCode || '').trim() || Number(orderForm.quotaTotal) <= 0 || !String(orderForm.expiresAt || '').trim()"
                  @click="async () => { await submitCreateOrder(); close() }"
                >
                  Create
                </UButton>
              </div>
            </div>
          </template>
        </UModal>

        <div class="grid gap-4 sm:grid-cols-3">
          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Open Orders (All States)</p>
                <p class="text-2xl font-semibold">{{ totalOpenOrders }}</p>
              </div>
              <UIcon name="i-lucide-activity" class="size-8 text-primary" />
            </div>
          </UCard>
        </div>

        <div>
          <UCard>
            <div class="space-y-3">
              <h3 class="font-semibold">Competition Legend</h3>
              <div class="grid gap-3 sm:grid-cols-3">
                <div class="flex items-center gap-2">
                  <div class="size-4 rounded-full bg-green-500" />
                  <span class="text-sm">Light (&lt; 10 open orders)</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="size-4 rounded-full bg-yellow-500" />
                  <span class="text-sm">Moderate (10–20 open orders)</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="size-4 rounded-full bg-red-500" />
                  <span class="text-sm">Heavy (&gt; 20 open orders)</span>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <UCard :ui="{ body: 'p-4' }">
          <div class="relative">
            <div
              ref="mapRoot"
              class="w-full rounded-lg bg-white overflow-hidden"
              style="height: 520px;"
            ></div>

            <div
              v-if="tooltip.open && tooltip.state"
              ref="tooltipEl"
              class="pointer-events-none absolute z-10 rounded-lg border border-default bg-elevated px-3 py-2 shadow-lg"
              :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
            >
              <div class="font-semibold">{{ tooltip.state.name }} ({{ tooltip.state.code }})</div>
              <div class="mt-1 flex items-center gap-2">
                <UBadge
                  :color="tooltip.state.status === 'light' ? 'success' : tooltip.state.status === 'moderate' ? 'warning' : 'error'"
                  variant="subtle"
                  :label="getStatusLabel(tooltip.state.status)"
                  size="xs"
                />
              </div>
              <div class="mt-2 space-y-1 text-xs text-muted">
                <div>Open orders: {{ tooltip.state.openOrders }}</div>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
