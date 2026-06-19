<script setup lang="ts">
import { useStorage } from '@vueuse/core'

const props = withDefaults(defineProps<{
  /** localStorage key for the dismissed state. Shared by default so the gesture
   *  is only taught once across all boards. */
  storageKey?: string
  text?: string
}>(), {
  storageKey: 'board-drag-hint-dismissed',
  text: 'Press & hold a card, then drag it to another column to move it.'
})

// Only relevant on touch devices — desktop already implies drag via the cursor.
const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
const dismissed = useStorage(props.storageKey, false)
</script>

<template>
  <div
    v-if="isTouch && !dismissed"
    class="ap-fade-in flex items-center gap-2.5 rounded-xl border border-[var(--ap-accent)]/20 bg-[var(--ap-accent)]/[0.06] px-3.5 py-2.5"
  >
    <div class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--ap-accent)]/10">
      <UIcon name="i-lucide-hand" class="size-4 text-[var(--ap-accent)]" />
    </div>
    <p class="min-w-0 flex-1 text-xs leading-snug text-default">
      <span class="font-semibold text-highlighted">Tip:</span> {{ text }}
    </p>
    <button
      type="button"
      class="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-black/5 hover:text-highlighted dark:hover:bg-white/10"
      aria-label="Dismiss tip"
      @click="dismissed = true"
    >
      <UIcon name="i-lucide-x" class="size-4" />
    </button>
  </div>
</template>
