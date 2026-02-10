<script setup lang="ts">
import { ref, computed } from 'vue'

interface GuideStep {
  id: number
  title: string
  description: string
  icon: string
  vimeoId: string
  duration: string
}

const steps: GuideStep[] = [
  {
    id: 1,
    title: 'Dashboard Overview',
    description: 'Get familiar with your command center — stats, retainers, invoices, and quick actions.',
    icon: 'i-lucide-house',
    vimeoId: '1163430559',
    duration: '00:08'
  },
  {
    id: 2,
    title: 'Intake Map',
    description: 'Learn how to place orders on the interactive US map and manage state-level intake.',
    icon: 'i-lucide-map',
    vimeoId: '1163430559',
    duration: '00:08'
  },
  {
    id: 3,
    title: 'Retainers',
    description: 'Track signed retainers, view statuses, and navigate to linked invoices.',
    icon: 'i-lucide-briefcase',
    vimeoId: '1163430559',
    duration: '00:08'
  },
  {
    id: 4,
    title: 'Fulfillment',
    description: 'Monitor your order fulfillment pipeline from intake through case completion.',
    icon: 'i-lucide-package',
    vimeoId: '1163430559',
    duration: '00:08'
  },
  {
    id: 5,
    title: 'Invoicing',
    description: 'Create, manage, and track invoices with Kanban and list views.',
    icon: 'i-lucide-receipt',
    vimeoId: '1163430559',
    duration: '00:08'
  },
  {
    id: 6,
    title: 'Settings & Profile',
    description: 'Configure your attorney profile, expertise, jurisdiction, and capacity settings.',
    icon: 'i-lucide-settings',
    vimeoId: '1163430559',
    duration: '00:08'
  }
]

const activeStepId = ref(1)
const activeStep = computed(() => steps.find(s => s.id === activeStepId.value)!)

const hasVideo = (step: GuideStep) => step.vimeoId !== ''

const selectStep = (id: number) => {
  activeStepId.value = id
}

const goToNext = () => {
  const idx = steps.findIndex(s => s.id === activeStepId.value)
  if (idx < steps.length - 1) {
    activeStepId.value = steps[idx + 1].id
  }
}

const goToPrev = () => {
  const idx = steps.findIndex(s => s.id === activeStepId.value)
  if (idx > 0) {
    activeStepId.value = steps[idx - 1].id
  }
}

const isFirst = computed(() => activeStepId.value === steps[0].id)
const isLast = computed(() => activeStepId.value === steps[steps.length - 1].id)
</script>

<template>
  <UDashboardPanel id="product-guide" class="!overflow-hidden">
    <template #header>
      <UDashboardNavbar title="Product Guide">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted">
              Step {{ activeStepId }} of {{ steps.length }}
            </span>
            <div class="flex items-center gap-1">
              <button
                :disabled="isFirst"
                class="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] text-muted transition-all hover:border-[var(--ap-accent)]/30 hover:text-[var(--ap-accent)] disabled:opacity-30 disabled:pointer-events-none"
                @click="goToPrev"
              >
                <UIcon name="i-lucide-chevron-left" class="text-sm" />
              </button>
              <button
                :disabled="isLast"
                class="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] text-muted transition-all hover:border-[var(--ap-accent)]/30 hover:text-[var(--ap-accent)] disabled:opacity-30 disabled:pointer-events-none"
                @click="goToNext"
              >
                <UIcon name="i-lucide-chevron-right" class="text-sm" />
              </button>
            </div>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full gap-5">
        <!-- ═══ Left: Step List ═══ -->
        <div class="w-80 shrink-0 flex flex-col gap-4">
          <!-- Header Card -->
          <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] p-5">
            <div class="flex items-center gap-3 mb-3">
              <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
                <UIcon name="i-lucide-play-circle" class="text-lg text-[var(--ap-accent)]" />
              </div>
              <div>
                <h2 class="text-sm font-semibold text-highlighted">Portal Walkthrough</h2>
                <p class="text-[11px] text-muted">{{ steps.length }} video guides</p>
              </div>
            </div>
            <!-- Progress -->
            <div class="flex items-center gap-2">
              <div class="flex-1 h-1.5 rounded-full bg-[var(--ap-card-border)] overflow-hidden">
                <div
                  class="h-full rounded-full bg-[var(--ap-accent)] transition-all duration-300"
                  :style="{ width: `${((activeStepId) / steps.length) * 100}%` }"
                />
              </div>
              <span class="text-[10px] font-medium text-muted tabular-nums">
                {{ activeStepId }}/{{ steps.length }}
              </span>
            </div>
          </div>

          <!-- Steps List -->
          <div class="flex-1 overflow-y-auto rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)]">
            <div class="p-2 space-y-1">
              <button
                v-for="step in steps"
                :key="step.id"
                class="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-all duration-200"
                :class="[
                  activeStepId === step.id
                    ? 'bg-[var(--ap-accent)]/10 border border-[var(--ap-accent)]/20'
                    : 'border border-transparent hover:bg-[var(--ap-card-hover)]'
                ]"
                @click="selectStep(step.id)"
              >
                <!-- Step Number -->
                <div
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors"
                  :class="[
                    activeStepId === step.id
                      ? 'bg-[var(--ap-accent)] text-white'
                      : 'bg-[var(--ap-card-border)] text-muted'
                  ]"
                >
                  {{ step.id }}
                </div>

                <!-- Step Info -->
                <div class="min-w-0 flex-1">
                  <p
                    class="text-sm font-medium truncate"
                    :class="activeStepId === step.id ? 'text-highlighted' : 'text-muted'"
                  >
                    {{ step.title }}
                  </p>
                  <p class="text-[11px] text-muted/60 truncate mt-0.5">
                    {{ step.description }}
                  </p>
                </div>

                <!-- Duration / Status -->
                <div class="shrink-0 flex items-center gap-1.5">
                  <UIcon
                    v-if="hasVideo(step)"
                    name="i-lucide-circle-check"
                    class="text-sm text-emerald-400"
                  />
                  <UIcon
                    v-else
                    name="i-lucide-clock"
                    class="text-xs text-muted/40"
                  />
                  <span class="text-[10px] text-muted tabular-nums">{{ step.duration }}</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        <!-- ═══ Right: Video Player ═══ -->
        <div class="flex-1 flex flex-col gap-4 min-w-0 overflow-y-auto">
          <!-- Video Card -->
          <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] overflow-hidden">
            <!-- Video Header -->
            <div class="flex items-center justify-between border-b border-[var(--ap-card-border)] px-5 py-3">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ap-accent)] text-white text-xs font-bold"
                >
                  {{ activeStep.id }}
                </div>
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">{{ activeStep.title }}</h3>
                  <p class="text-[11px] text-muted">{{ activeStep.description }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <UIcon :name="activeStep.icon" class="text-base text-[var(--ap-accent)]" />
              </div>
            </div>

            <!-- Video Player Area -->
            <div class="relative aspect-video bg-black/20">
              <!-- Vimeo Embed -->
              <iframe
                v-if="hasVideo(activeStep)"
                :src="`https://player.vimeo.com/video/${activeStep.vimeoId}?badge=0&autopause=0&player_id=0&app_id=58479&byline=0&title=0&portrait=0`"
                class="absolute inset-0 h-full w-full"
                frameborder="0"
                allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
                allowfullscreen
              />

              <!-- Placeholder when no video -->
              <div
                v-else
                class="absolute inset-0 flex flex-col items-center justify-center"
              >
                <div class="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--ap-accent)]/10 mb-5">
                  <UIcon name="i-lucide-video" class="text-4xl text-[var(--ap-accent)]/40" />
                </div>
                <h4 class="text-base font-semibold text-highlighted mb-1">Video Coming Soon</h4>
                <p class="text-sm text-muted max-w-sm text-center">
                  The walkthrough video for <span class="text-[var(--ap-accent)]">{{ activeStep.title }}</span> is being produced and will be available here shortly.
                </p>
                <div class="mt-4 flex items-center gap-2 rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] px-3 py-2">
                  <UIcon name="i-lucide-info" class="text-xs text-muted" />
                  <span class="text-[11px] text-muted">Vimeo video ID will be configured by admin</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Navigation Footer -->
          <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] px-5 py-3">
            <div class="flex items-center justify-between">
              <button
                :disabled="isFirst"
                class="inline-flex items-center gap-2 rounded-lg border border-[var(--ap-card-border)] bg-[var(--ap-card-hover)] px-4 py-2 text-xs font-medium text-muted transition-all hover:border-[var(--ap-accent)]/30 hover:text-[var(--ap-accent)] disabled:opacity-30 disabled:pointer-events-none"
                @click="goToPrev"
              >
                <UIcon name="i-lucide-arrow-left" class="text-sm" />
                Previous
              </button>

              <div class="flex items-center gap-1.5">
                <button
                  v-for="step in steps"
                  :key="step.id"
                  class="h-2 rounded-full transition-all duration-300"
                  :class="[
                    activeStepId === step.id
                      ? 'w-6 bg-[var(--ap-accent)]'
                      : 'w-2 bg-[var(--ap-dot-bg)] hover:bg-[var(--ap-dot-hover)]'
                  ]"
                  @click="selectStep(step.id)"
                />
              </div>

              <button
                :disabled="isLast"
                class="inline-flex items-center gap-2 rounded-lg bg-[var(--ap-accent)] px-4 py-2 text-xs font-medium text-white transition-all hover:bg-[var(--ap-accent)]/90 disabled:opacity-30 disabled:pointer-events-none"
                @click="goToNext"
              >
                Next Step
                <UIcon name="i-lucide-arrow-right" class="text-sm" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
