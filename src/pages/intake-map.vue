<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import usSvgFallbackRaw from '../assets/us.svg?raw'

import { useAuth } from '../composables/useAuth'
import { getAttorneyProfile, patchAttorneyProfile } from '../lib/attorney-profile'
import { createOrder, listOpenOrdersForLawyer, listOrdersForLawyer, type OrderRow } from '../lib/orders'
import { US_STATES } from '../lib/us-states'

const US_SVG_ASSET_URL = new URL('../assets/us.svg', import.meta.url).toString()

type StateOrders = {
  code: string
  name: string
  openOrders: number
}

const auth = useAuth()
const router = useRouter()
const loading = ref(false)
const tooltip = ref({ open: false, x: 0, y: 0, state: null as StateOrders | null, myOrder: null as OrderRow | null, blocked: false })
const mapRoot = ref<HTMLDivElement | null>(null)
const tooltipEl = ref<HTMLDivElement | null>(null)

const states = ref<StateOrders[]>([])

const myOpenOrders = ref<OrderRow[]>([])
const myClosedOrders = ref<OrderRow[]>([])

const myOrderByStateCode = computed(() => {
  const map = new Map<string, OrderRow>()
  myOpenOrders.value.forEach((o) => {
    ;(o.target_states ?? []).forEach((s) => {
      const code = String(s || '').trim().toUpperCase()
      if (!code) return
      if (!map.has(code)) map.set(code, o)
    })
  })
  return map
})

const stateByCode = computed(() => {
  const map = new Map<string, StateOrders>()
  states.value.forEach(s => map.set(s.code, s))
  return map
})

const totalOpenOrders = computed(() => states.value.reduce((sum, s) => sum + s.openOrders, 0))

const COLOR_NEUTRAL = '#d1d5db'
const COLOR_GREEN = '#22c55e'
const COLOR_YELLOW = '#eab308'
const COLOR_RED = '#ef4444'

const isOrderInProgress = (order: Pick<OrderRow, 'quota_filled' | 'quota_total'>) => {
  return orderProgressPercent(order) > 0
}

const openOrdersForStateCode = (stateCode: string) => {
  const code = String(stateCode || '').trim().toUpperCase()
  if (!code) return [] as OrderRow[]
  return myOpenOrders.value.filter((o) => (o.target_states ?? []).some((s) => String(s || '').trim().toUpperCase() === code))
}

const hasOpenOrderForStateCode = (stateCode: string) => {
  return openOrdersForStateCode(stateCode).length > 0
}

const hasProgressInOpenOrdersForStateCode = (stateCode: string) => {
  return openOrdersForStateCode(stateCode).some((o) => isOrderInProgress(o))
}

const hasClosedOrderForStateCode = (stateCode: string) => {
  const code = String(stateCode || '').trim().toUpperCase()
  if (!code) return false
  return myClosedOrders.value.some((o) => (o.target_states ?? []).some((s) => String(s || '').trim().toUpperCase() === code))
}

const getStateFillColor = (stateCode: string) => {
  if (hasOpenOrderForStateCode(stateCode)) {
    return hasProgressInOpenOrdersForStateCode(stateCode) ? COLOR_YELLOW : COLOR_GREEN
  }

  if (hasClosedOrderForStateCode(stateCode)) return COLOR_RED
  return COLOR_NEUTRAL
}

const getMyOrderBadgeColor = (stateCode: string) => {
  if (hasOpenOrderForStateCode(stateCode)) return hasProgressInOpenOrdersForStateCode(stateCode) ? 'warning' : 'success'
  if (hasClosedOrderForStateCode(stateCode)) return 'error'
  return 'neutral'
}

const getMyOrderBadgeLabel = (stateCode: string) => {
  if (hasOpenOrderForStateCode(stateCode)) return hasProgressInOpenOrdersForStateCode(stateCode) ? 'In progress' : 'Open (0% progress)'
  if (hasClosedOrderForStateCode(stateCode)) return 'Fulfilled / Expired'
  return 'No orders'
}

const refreshMyOrders = async () => {
  const userId = auth.state.value.user?.id ?? null
  if (!userId) {
    myOpenOrders.value = []
    return
  }

  myOpenOrders.value = await listOpenOrdersForLawyer(userId)
}

const refreshMyClosedOrders = async () => {
  const userId = auth.state.value.user?.id ?? null
  if (!userId) {
    myClosedOrders.value = []
    return
  }

  myClosedOrders.value = await listOrdersForLawyer({
    lawyerId: userId,
    statuses: ['FULFILLED', 'EXPIRED']
  })
}

const refreshAll = async () => {
  loading.value = true
  try {
    await refreshMyOrders()
    await refreshMyClosedOrders()
    rebuildStatesFromMyOrders()
    applyMapColors()
  } finally {
    loading.value = false
  }
}

const orderProgressPercent = (order: Pick<OrderRow, 'quota_filled' | 'quota_total'>) => {
  const total = Number(order.quota_total)
  const filled = Number(order.quota_filled)
  if (!Number.isFinite(total) || total <= 0) return 0
  if (!Number.isFinite(filled) || filled <= 0) return 0
  const pct = (filled / total) * 100
  if (!Number.isFinite(pct)) return 0
  return Math.max(0, Math.min(100, Math.round(pct)))
}

type MapFilter = 'all' | 'no_orders' | 'has_orders' | 'blocked'

const mapFilter = ref<MapFilter>('all')

const mapFilterOptions = [
  { label: 'All states', value: 'all' },
  { label: 'No orders', value: 'no_orders' },
  { label: 'Has open orders', value: 'has_orders' },
  { label: 'Blocked states', value: 'blocked' }
]

watch(mapFilter, () => {
  applyMapColors()
})

const blockMode = ref(false)
const blockedStateCodes = ref<string[]>([])

const blockedStateSet = computed(() => {
  return new Set(blockedStateCodes.value.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))
})

const blockedStorageKey = computed(() => {
  const userId = auth.state.value.user?.id ?? ''
  return userId ? `intakeMapBlockedStates:${userId}` : 'intakeMapBlockedStates:anonymous'
})

const loadBlockedStatesFromLocalStorage = () => {
  try {
    const raw = localStorage.getItem(blockedStorageKey.value)
    if (!raw) return [] as string[]
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : ([] as string[])
  } catch {
    return [] as string[]
  }
}

const saveBlockedStatesToLocalStorage = (codes: string[]) => {
  try {
    localStorage.setItem(blockedStorageKey.value, JSON.stringify(codes))
  } catch {
    // ignore
  }
}

const loadBlockedStates = async () => {
  const userId = auth.state.value.user?.id ?? null
  if (!userId) {
    blockedStateCodes.value = []
    return
  }

  try {
    const profile = await getAttorneyProfile(userId)
    const raw = (profile as unknown as Record<string, unknown>)?.blocked_states
    const codes = Array.isArray(raw) ? (raw as string[]) : null
    if (codes) {
      blockedStateCodes.value = codes
      saveBlockedStatesToLocalStorage(codes)
      return
    }
  } catch {
    // ignore
  }

  blockedStateCodes.value = loadBlockedStatesFromLocalStorage()
}

let persistBlockedStatesTimer: number | null = null
watch(blockedStateCodes, () => {
  applyMapColors()

  const userId = auth.state.value.user?.id ?? null
  if (!userId) return

  const snapshot = blockedStateCodes.value.slice()
  saveBlockedStatesToLocalStorage(snapshot)

  if (persistBlockedStatesTimer) window.clearTimeout(persistBlockedStatesTimer)
  persistBlockedStatesTimer = window.setTimeout(async () => {
    try {
      await patchAttorneyProfile(userId, { blocked_states: snapshot })
    } catch {
      // keep localStorage fallback
    }
  }, 500)
}, { deep: true })

const myOpenOrderCountByState = computed(() => {
  const map = new Map<string, number>()
  myOpenOrders.value.forEach((o) => {
    ;(o.target_states ?? []).forEach((s) => {
      const code = String(s || '').trim().toUpperCase()
      if (!code) return
      map.set(code, (map.get(code) ?? 0) + 1)
    })
  })
  return map
})

const rebuildStatesFromMyOrders = () => {
  const counts = myOpenOrderCountByState.value
  states.value = US_STATES.map((s) => {
    const openOrders = counts.get(s.code) ?? 0
    return {
      code: s.code,
      name: s.name,
      openOrders
    }
  })
}

const createOrderOpen = ref(false)
const pendingStateCode = ref<string | null>(null)

const createOrderStep = ref<1 | 2>(1)
const orderVerifyPhrase = 'CONFIRM'
const orderVerifyInput = ref('')
const orderVerifyTouched = ref(false)

const orderVerifyIsValid = computed(() => {
  return String(orderVerifyInput.value || '').trim().toUpperCase() === orderVerifyPhrase
})

const orderVerifyError = computed(() => {
  if (!orderVerifyTouched.value) return undefined
  if (orderVerifyIsValid.value) return undefined
  return `Type ${orderVerifyPhrase} to continue.`
})

const orderForm = ref({
  stateCode: '' as string,
  caseCategory: 'Motor Vehicle Accident' as string,
  injurySeverity: [] as string[],
  liabilityStatus: 'clear_only' as 'clear_only' | 'disputed_ok',
  insuranceStatus: 'insured_only' as 'insured_only' | 'uninsured_ok',
  medicalTreatment: 'ongoing' as string,
  languages: ['English'] as string[],
  noPriorAttorney: true as boolean,
  quotaTotal: 0 as number,
  expiresInDays: 7 as 7 | 14 | 30 | 60
})

const createOrderSubmitting = ref(false)

const selectedStateName = computed(() => {
  const code = String(orderForm.value.stateCode || '').trim().toUpperCase()
  if (!code) return ''
  return US_STATES.find(s => s.code === code)?.name ?? code
})

const quotaError = computed(() => {
  const raw = Number(orderForm.value.quotaTotal)
  if (!Number.isFinite(raw) || raw <= 5) return null

  const stateCode = String(orderForm.value.stateCode || '').trim().toUpperCase()
  if (!stateCode) return 'Select a state for placing this order.'

  return `Maximum 5 cases are allowed per order in ${selectedStateName.value}. Please reduce your quota to 5 or less.`
})

const resetOrderForm = () => {
  orderForm.value = {
    stateCode: '',
    caseCategory: 'Motor Vehicle Accident',
    injurySeverity: [],
    liabilityStatus: 'clear_only',
    insuranceStatus: 'insured_only',
    medicalTreatment: 'ongoing',
    languages: ['English'],
    noPriorAttorney: true,
    quotaTotal: 0,
    expiresInDays: 7
  }
}

const openCreateOrder = () => {
  pendingStateCode.value = null
  createOrderOpen.value = true
  createOrderStep.value = 1
  orderVerifyInput.value = ''
  orderVerifyTouched.value = false
}

const openCreateOrderForState = (stateCode: string) => {
  const code = String(stateCode || '').trim().toUpperCase()
  if (!code) return
  pendingStateCode.value = code
  orderForm.value.stateCode = code
  createOrderOpen.value = true
  createOrderStep.value = 1
  orderVerifyInput.value = ''
  orderVerifyTouched.value = false
}

const handleCreateOrderOpenUpdate = (v: boolean) => {
  createOrderOpen.value = v
  if (!v) {
    pendingStateCode.value = null
    createOrderStep.value = 1
    orderVerifyInput.value = ''
    orderVerifyTouched.value = false
  }
}

const goToCreateOrderStep2 = () => {
  orderVerifyTouched.value = true
  if (!orderVerifyIsValid.value) return
  createOrderStep.value = 2
}

const injurySeverityOptions = [
  { label: 'Minor', value: 'minor' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Severe', value: 'severe' },
  { label: 'Catastrophic', value: 'catastrophic' }
]

const caseCategoryOptions = [
  { label: 'MVA', value: 'Motor Vehicle Accident' },
  { label: 'Commercial injury', value: 'Commercial injury' },
]

const expirationOptions = [
  { label: 'In 7 days', value: 7 },
  { label: 'In 14 days', value: 14 },
  { label: 'In 30 days', value: 30 },
  { label: 'In 60 days', value: 60 }
]

const liabilityOptions = [
  { label: 'Clear liability only', value: 'clear_only' },
  { label: 'Disputed acceptable', value: 'disputed_ok' }
]

const insuranceOptions = [
  { label: 'Insured only', value: 'insured_only' },
  { label: 'Uninsured acceptable', value: 'uninsured_ok' }
]

const medicalTreatmentOptions = [
  { label: 'No medical', value: 'no_medical' },
  { label: 'Ongoing', value: 'ongoing' },
  { label: 'Proof of medical treatment', value: 'proof_of_medical_treatment' }
]

const languageOptions = [
  'English',
  'Spanish'
]

const multiSelectUi = {
  value: 'truncate whitespace-nowrap overflow-hidden',
  item: 'group',
  itemTrailingIcon: 'hidden'
}

const orderStateOptions = computed(() => {
  return US_STATES
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((s) => !blockedStateSet.value.has(s.code))
    .filter((s) => !hasOpenOrderForStateCode(s.code))
    .map((s) => ({ label: `${s.name} (${s.code})`, value: s.code }))
})

const submitCreateOrder = async () => {
  const userId = auth.state.value.user?.id ?? null
  if (!userId) return false

  const stateCode = String(orderForm.value.stateCode || '').trim().toUpperCase()
  if (!stateCode) return false

  if (hasOpenOrderForStateCode(stateCode)) return false

  const quotaTotal = Number(orderForm.value.quotaTotal)
  if (!Number.isFinite(quotaTotal) || quotaTotal <= 0) return false
  if (quotaTotal > 5) return false

  const expiresInDays = Number(orderForm.value.expiresInDays)
  if (![7, 14, 30, 60].includes(expiresInDays)) return false

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiresInDays)

  await createOrder({
    lawyer_id: userId,
    target_states: [stateCode],
    case_type: String(orderForm.value.caseCategory || '').trim(),
    quota_total: Math.round(quotaTotal),
    expires_at: expiresAt.toISOString(),
    criteria: {
      injury_severity: orderForm.value.injurySeverity,
      liability_status: orderForm.value.liabilityStatus,
      insurance_status: orderForm.value.insuranceStatus,
      medical_treatment: orderForm.value.medicalTreatment,
      languages: orderForm.value.languages,
      no_prior_attorney: orderForm.value.noPriorAttorney
    }
  })

  createOrderOpen.value = false
  resetOrderForm()
  await refreshMyOrders()
  await refreshMyClosedOrders()
  rebuildStatesFromMyOrders()
  applyMapColors()

  return true
}

const handleCreateOrderSubmit = async (close: () => void) => {
  if (createOrderSubmitting.value) return
  if (quotaError.value) return

  createOrderSubmitting.value = true
  try {
    const created = await submitCreateOrder()
    if (created) close()
  } finally {
    createOrderSubmitting.value = false
  }
}

const MAP_PATH_SELECTOR = 'path[data-id], path[id]'

const BLOCKED_PATTERN_ID = 'blocked-hatch'

const ensureBlockedPattern = (svg: SVGSVGElement) => {
  const existing = svg.querySelector(`#${BLOCKED_PATTERN_ID}`)
  if (existing) return

  let defs = svg.querySelector('defs')
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    svg.insertBefore(defs, svg.firstChild)
  }

  const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern')
  pattern.setAttribute('id', BLOCKED_PATTERN_ID)
  pattern.setAttribute('patternUnits', 'userSpaceOnUse')
  pattern.setAttribute('width', '10')
  pattern.setAttribute('height', '10')
  pattern.setAttribute('patternTransform', 'rotate(45)')

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  bg.setAttribute('width', '10')
  bg.setAttribute('height', '10')
  bg.setAttribute('fill', '#f3f4f6')

  const stripe = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  stripe.setAttribute('width', '2')
  stripe.setAttribute('height', '10')
  stripe.setAttribute('fill', '#9ca3af')

  pattern.appendChild(bg)
  pattern.appendChild(stripe)
  defs.appendChild(pattern)
}

const applyMapColors = () => {
  const root = mapRoot.value
  if (!root) return
  const svg = root.querySelector('svg')
  if (!svg) return

  ensureBlockedPattern(svg as SVGSVGElement)

  const paths = svg.querySelectorAll(MAP_PATH_SELECTOR)
  paths.forEach((p) => {
    const path = p as SVGPathElement
    const code = p.getAttribute('data-id') || p.getAttribute('id')
    if (!code) return
    const state = stateByCode.value.get(code)

    const normalizedCode = String(code || '').trim().toUpperCase()
    const isBlocked = blockedStateSet.value.has(normalizedCode)

    const openOrders = Number(state?.openOrders) || 0
    const matchesFilter = mapFilter.value === 'all'
      ? true
      : mapFilter.value === 'no_orders'
        ? !isBlocked && openOrders === 0
        : mapFilter.value === 'has_orders'
          ? !isBlocked && openOrders > 0
          : isBlocked

    const fill = isBlocked
      ? `url(#${BLOCKED_PATTERN_ID})`
      : state
        ? getStateFillColor(state.code)
        : COLOR_NEUTRAL

    const stroke = '#0b0b0b'
    const strokeWidth = '0.8'

    path.style.setProperty('fill', fill, 'important')
    path.style.setProperty('stroke', stroke, 'important')
    path.style.setProperty('stroke-width', strokeWidth, 'important')
    path.style.cursor = matchesFilter && state && !isBlocked ? 'pointer' : 'default'
    path.style.opacity = matchesFilter ? '1' : '0.25'
    path.style.pointerEvents = matchesFilter ? 'auto' : 'none'
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

    const fontSize = Math.max(7, Math.min(14, Math.min(bbox.width, bbox.height) / 4))
    const fill = '#111827'

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.textContent = code
    text.setAttribute('x', String(cx))
    text.setAttribute('y', String(cy))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dominant-baseline', 'middle')
    text.style.setProperty('font-size', `${fontSize}px`, 'important')
    text.style.setProperty('font-weight', '700', 'important')
    text.style.setProperty('font-family', 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial', 'important')
    text.style.setProperty('fill', fill, 'important')
    text.style.setProperty('paint-order', 'stroke', 'important')
    text.style.setProperty('stroke', 'rgba(255,255,255,0.9)', 'important')
    text.style.setProperty('stroke-width', '2', 'important')
    text.style.setProperty('stroke-linejoin', 'round', 'important')

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

  tooltip.value.blocked = blockedStateSet.value.has(String(code || '').trim().toUpperCase())

  tooltip.value.state = state
  tooltip.value.myOrder = myOrderByStateCode.value.get(code) ?? null
  tooltip.value.open = true
}

const handleStateLeave = () => {
  tooltip.value.open = false
  tooltip.value.state = null
  tooltip.value.myOrder = null
  tooltip.value.blocked = false
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

  const normalizedCode = String(code || '').trim().toUpperCase()
  if (blockMode.value) {
    const next = new Set(blockedStateSet.value)
    if (next.has(normalizedCode)) next.delete(normalizedCode)
    else next.add(normalizedCode)
    blockedStateCodes.value = Array.from(next)
    return
  }

  if (blockedStateSet.value.has(normalizedCode)) return

  const existing = myOrderByStateCode.value.get(normalizedCode) ?? null
  if (existing) {
    router.push(`/orders/${existing.id}`)
    return
  }

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
    loading.value = true
    try {
      await refreshMyOrders()
      await refreshMyClosedOrders()
      await loadBlockedStates()
      rebuildStatesFromMyOrders()
    } finally {
      loading.value = false
    }

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

watch(myOpenOrders, () => {
  rebuildStatesFromMyOrders()
  applyMapColors()
})

watch(myClosedOrders, () => {
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
            color="neutral"
            :variant="blockMode ? 'solid' : 'outline'"
            :icon="blockMode ? 'i-lucide-check' : 'i-lucide-ban'"
            @click="() => { blockMode = !blockMode }"
          >
            {{ blockMode ? 'Done blocking' : 'Block states' }}
          </UButton>

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
            @click="refreshAll"
          >
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-5">
        <UAlert
          v-if="blockMode"
          color="neutral"
          variant="subtle"
          title="Blocking mode"
          description="Click states on the map to block/unblock them. Blocked states are disabled and removed from the order state dropdown."
        />

        <UModal
          v-if="createOrderOpen"
          :open="true"
          title="Create Intake Order"
          :dismissible="false"
          :ui="{ content: 'sm:max-w-4xl', body: 'p-0' }"
          @update:open="handleCreateOrderOpenUpdate"
        >
          <template #body="{ close }">
            <div class="flex max-h-[78vh] flex-col">
              <div>
                <div class="mt-2 flex items-center justify-center">
                  <div class="w-full max-w-sm">
                    <div class="relative">
                      <div class="absolute left-30 right-30 top-4 h-px border-t border-dashed border-primary/50" />
                      <div
                        v-if="createOrderStep >= 2"
                        class="absolute left-30 right-30 top-4 h-px bg-primary"
                      />
                      <div class="relative flex items-start justify-center gap-24">
                        <div class="flex flex-col items-center gap-2">
                          <div
                            class="flex size-8 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset"
                            :class="createOrderStep >= 1 ? 'bg-primary text-white ring-primary' : 'bg-elevated text-muted ring-default'"
                          >
                            1
                          </div>
                          <div class="text-xs" :class="createOrderStep === 1 ? 'font-semibold text-foreground' : 'text-muted'">
                            Verification
                          </div>
                        </div>

                        <div class="flex flex-col items-center gap-2">
                          <div
                            class="flex size-8 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset"
                            :class="createOrderStep >= 2 ? 'bg-primary text-white ring-primary' : 'bg-elevated text-[var(--ap-accent)] ring-[var(--ap-accent)]'"
                          >
                            2
                          </div>
                          <div class="text-xs" :class="createOrderStep === 2 ? 'font-semibold text-foreground' : 'text-muted'">
                            Order Details
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="createOrderStep === 1" class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <div class="space-y-4">
                  <UAlert
                    color="neutral"
                    variant="subtle"
                    title="Verification"
                    :description="`To continue, type ${orderVerifyPhrase} below.`"
                  />

                  <UFormField label="Verification word" required :error="orderVerifyError">
                    <UInput
                      v-model="orderVerifyInput"
                      placeholder="Type the verification word"
                      @blur="() => { orderVerifyTouched = true }"
                    />
                  </UFormField>
                </div>
              </div>

              <div v-else class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <UAlert
                  v-if="quotaError"
                  color="error"
                  variant="subtle"
                  title="Quota limit"
                  :description="quotaError"
                  class="mb-4"
                />

                <div class="grid gap-4 sm:grid-cols-2">
                  <UFormField label="State" required>
                    <USelect
                      v-model="orderForm.stateCode"
                      :items="orderStateOptions"
                      class="w-full sm:w-1/2"
                      value-key="value"
                      label-key="label"
                      placeholder="Select a state"
                      :ui="{ content: 'w-(--reka-select-trigger-width)' }"
                    />
                  </UFormField>

                  <UFormField label="Case category" required>
                    <USelect
                      v-model="orderForm.caseCategory"
                      :items="caseCategoryOptions"
                      class="w-full sm:w-1/2"
                      value-key="value"
                      label-key="label"
                      placeholder="Select case category"
                      :ui="{ content: 'w-(--reka-select-trigger-width)' }"
                    />
                  </UFormField>

                  <UFormField label="Injury severity" required>
                    <USelect
                      v-model="orderForm.injurySeverity"
                      :items="injurySeverityOptions"
                      class="w-full sm:w-1/2"
                      value-key="value"
                      label-key="label"
                      multiple
                      placeholder="Select injury severities"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon
                            name="i-lucide-square"
                            class="absolute size-4 text-muted group-data-[state=checked]:hidden"
                          />
                          <UIcon
                            name="i-lucide-check-square"
                            class="absolute hidden size-4 text-primary group-data-[state=checked]:block"
                          />
                        </span>
                      </template>
                    </USelect>
                  </UFormField>

                  <UFormField label="Liability status" required>
                    <USelect
                      v-model="orderForm.liabilityStatus"
                      :items="liabilityOptions"
                      class="w-full sm:w-1/2"
                      value-key="value"
                      label-key="label"
                      placeholder="Select liability"
                      :ui="{ content: 'w-(--reka-select-trigger-width)' }"
                    />
                  </UFormField>

                  <UFormField label="Insurance status" required>
                    <USelect
                      v-model="orderForm.insuranceStatus"
                      :items="insuranceOptions"
                      class="w-full sm:w-1/2"
                      value-key="value"
                      label-key="label"
                      placeholder="Select insurance"
                      :ui="{ content: 'w-(--reka-select-trigger-width)' }"
                    />
                  </UFormField>

                  <UFormField label="Medical treatment" required>
                    <USelect
                      v-model="orderForm.medicalTreatment"
                      :items="medicalTreatmentOptions"
                      class="w-full sm:w-1/2"
                      value-key="value"
                      label-key="label"
                      :ui="{ content: 'w-(--reka-select-trigger-width)' }"
                    />
                  </UFormField>

                  <UFormField label="Languages" required>
                    <USelect
                      v-model="orderForm.languages"
                      :items="languageOptions"
                      class="w-full sm:w-1/2"
                      multiple
                      placeholder="Select languages"
                      :ui="multiSelectUi"
                    >
                      <template #item-leading>
                        <span class="relative flex size-4 items-center justify-center">
                          <UIcon
                            name="i-lucide-square"
                            class="absolute size-4 text-muted group-data-[state=checked]:hidden"
                          />
                          <UIcon
                            name="i-lucide-check-square"
                            class="absolute hidden size-4 text-primary group-data-[state=checked]:block"
                          />
                        </span>
                      </template>
                    </USelect>
                  </UFormField>

                  <UFormField label="Client requirements">
                    <UCheckbox v-model="orderForm.noPriorAttorney" label="No prior attorney" />
                  </UFormField>

                  <UFormField label="Quota" description="Total number of cases needed" required>
                    <UInput
                      v-model.number="orderForm.quotaTotal"
                      type="number"
                      min="1"
                      max="5"
                    />
                    <div class="mt-1 text-xs text-muted">
                      Maximum 5 cases per order.
                    </div>
                  </UFormField>

                  <UFormField label="Expiration" description="Stop accepting retainers" required>
                    <div class="grid grid-cols-2 gap-x-1 gap-y-2">
                      <label
                        v-for="opt in expirationOptions"
                        :key="opt.value"
                        class="flex items-center gap-3"
                      >
                        <input
                          :checked="orderForm.expiresInDays === opt.value"
                          type="radio"
                          name="expiresInDays"
                          class="h-4 w-4"
                          @change="() => { orderForm.expiresInDays = opt.value as 7 | 14 | 30 | 60 }"
                        >
                        <span class="text-sm">
                          {{ opt.label }}
                        </span>
                      </label>
                    </div>
                  </UFormField>
                </div>
              </div>

              <div class="flex items-center justify-end gap-2 border-t border-default px-6 py-4">
                <UButton
                  v-if="createOrderStep === 1"
                  color="neutral"
                  variant="outline"
                  @click="() => { resetOrderForm(); close() }"
                >
                  Cancel
                </UButton>
                <UButton
                  v-if="createOrderStep === 1"
                  color="primary"
                  variant="solid"
                  :disabled="!orderVerifyIsValid"
                  @click="goToCreateOrderStep2"
                >
                  Next
                </UButton>

                <UButton
                  v-else
                  color="neutral"
                  variant="outline"
                  @click="() => { createOrderStep = 1 }"
                >
                  Back
                </UButton>
                <UButton
                  v-if="createOrderStep === 2"
                  color="neutral"
                  variant="outline"
                  @click="() => { resetOrderForm(); close() }"
                >
                  Cancel
                </UButton>
                <UButton
                  v-if="createOrderStep === 2"
                  color="primary"
                  variant="solid"
                  :loading="createOrderSubmitting"
                  :disabled="createOrderSubmitting || !!quotaError || !String(orderForm.stateCode || '').trim() || Number(orderForm.quotaTotal) <= 0"
                  @click="async () => { await handleCreateOrderSubmit(close) }"
                >
                  Create
                </UButton>
              </div>
            </div>
          </template>
        </UModal>

        <!-- ═══ Stat Card ═══ -->
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="group overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 transition-all duration-300 hover:border-blue-500/30 hover:bg-blue-500/[0.03]">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs font-medium uppercase tracking-wider text-muted">My Open Orders (All States)</p>
                <p class="mt-1.5 text-3xl font-bold text-highlighted">{{ totalOpenOrders }}</p>
              </div>
              <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
                <UIcon name="i-lucide-activity" class="text-xl text-blue-400" />
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ Legend & Filter ═══ -->
        <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10">
                  <UIcon name="i-lucide-map" class="text-sm text-[var(--ap-accent)]" />
                </div>
                <h3 class="text-sm font-semibold text-highlighted">My order volume by state</h3>
              </div>
              <USelect v-model="mapFilter" :items="mapFilterOptions" size="sm" />
            </div>
            <div class="grid gap-3 sm:grid-cols-5">
              <div class="flex items-center gap-2">
                <div class="size-4 rounded-full bg-gray-300" />
                <span class="text-xs text-muted">No orders</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="size-4 rounded-full bg-green-500" />
                <span class="text-xs text-muted">Open (0% progress)</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="size-4 rounded-full bg-yellow-500" />
                <span class="text-xs text-muted">In progress</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="size-4 rounded-full bg-red-500" />
                <span class="text-xs text-muted">Fulfilled / Expired</span>
              </div>
              <div class="flex items-center gap-2">
                <div
                  class="size-4 rounded-full"
                  style="background: repeating-linear-gradient(45deg, #9ca3af 0 2px, #f3f4f6 2px 6px);"
                />
                <span class="text-xs text-muted">Blocked</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ Map ═══ -->
        <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 overflow-hidden">
          <div class="relative">
            <div
              ref="mapRoot"
              class="w-full rounded-xl bg-white overflow-hidden"
              style="height: 520px;"
            />

            <div
              v-if="tooltip.open && tooltip.state"
              ref="tooltipEl"
              class="pointer-events-none absolute z-10 rounded-xl border border-white/[0.06] bg-[#1a1a1a] px-4 py-3 shadow-xl"
              :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
            >
              <div class="text-sm font-semibold text-highlighted">
                {{ tooltip.state.name }} ({{ tooltip.state.code }})
              </div>
              <div class="mt-1.5 flex items-center gap-2">
                <UBadge
                  :color="getMyOrderBadgeColor(tooltip.state.code)"
                  variant="subtle"
                  :label="getMyOrderBadgeLabel(tooltip.state.code)"
                  size="xs"
                />

                <UBadge
                  v-if="tooltip.blocked"
                  color="neutral"
                  variant="subtle"
                  label="Blocked"
                  size="xs"
                />

                <UBadge
                  v-if="tooltip.myOrder"
                  color="primary"
                  variant="subtle"
                  label="Your order active"
                  size="xs"
                />
              </div>
              <div class="mt-2 space-y-1 text-[11px] text-muted">
                <div>My open orders in state: {{ tooltip.state.openOrders }}</div>
                <div v-if="tooltip.myOrder">
                  Your quota: {{ tooltip.myOrder.quota_filled }}/{{ tooltip.myOrder.quota_total }}
                </div>
                <div v-if="tooltip.myOrder">
                  Expires: {{ String(tooltip.myOrder.expires_at || '').slice(0, 10) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ My Open Orders List ═══ -->
        <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <div class="flex items-center gap-3">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                <UIcon name="i-lucide-shopping-cart" class="text-sm text-blue-400" />
              </div>
              <div>
                <h3 class="text-sm font-semibold text-highlighted">My Open Orders</h3>
                <p class="text-[11px] text-muted">Your currently active intake orders</p>
              </div>
            </div>
            <span class="inline-flex items-center rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-1 text-xs font-semibold text-muted">
              {{ myOpenOrders.length }} orders
            </span>
          </div>

          <!-- Empty -->
          <div v-if="myOpenOrders.length === 0" class="flex items-center justify-center p-10">
            <div class="text-center">
              <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 mb-3">
                <UIcon name="i-lucide-shopping-cart" class="text-xl text-blue-400/50" />
              </div>
              <p class="text-sm text-muted">No open orders</p>
            </div>
          </div>

          <!-- Orders -->
          <div v-else class="divide-y divide-white/[0.04]">
            <div
              v-for="order in myOpenOrders"
              :key="order.id"
              class="group cursor-pointer px-5 py-4 transition-all duration-200 hover:bg-[var(--ap-accent)]/[0.04]"
              @click="router.push(`/orders/${order.id}`)"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-highlighted group-hover:text-[var(--ap-accent)] transition-colors">
                    {{ order.case_type }}
                    <span v-if="order.case_subtype" class="text-muted">— {{ order.case_subtype }}</span>
                  </div>
                  <div class="mt-1 text-[11px] text-muted">
                    States:
                    {{ (order.target_states || []).map(s => String(s || '').toUpperCase()).join(', ') || '—' }}
                  </div>
                </div>

                <div class="min-w-[170px]">
                  <div class="flex items-center justify-end gap-2">
                    <span class="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-400">
                      Quota {{ order.quota_filled }}/{{ order.quota_total }}
                    </span>
                    <span class="inline-flex items-center rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-muted">
                      Expires {{ String(order.expires_at || '').slice(0, 10) }}
                    </span>
                  </div>

                  <div class="mt-2 flex items-center justify-end gap-2">
                    <div class="w-10 text-right text-[11px] text-muted tabular-nums">
                      {{ orderProgressPercent(order) }}%
                    </div>
                    <div class="h-1.5 w-28 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        class="h-full rounded-full transition-all duration-500"
                        :class="orderProgressPercent(order) >= 100 ? 'bg-green-400' : 'bg-blue-400'"
                        :style="{ width: `${Math.min(orderProgressPercent(order), 100)}%` }"
                      />
                    </div>
                    <div class="w-12 text-right text-[11px] text-muted tabular-nums">
                      {{ order.quota_filled }}/{{ order.quota_total }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
