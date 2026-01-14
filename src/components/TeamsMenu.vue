<script setup lang="ts">
import { computed } from 'vue'
import { useColorMode } from '@vueuse/core'

const props = defineProps<{
  collapsed?: boolean
}>()

const colorMode = useColorMode()

const logoSrc = computed(() => {
  if (props.collapsed) return '/assets/logo-collapse.png'
  return colorMode.value === 'dark' ? '/assets/logo-white.png' : '/assets/logo-black.png'
})
</script>

<template>
  <div
    class="flex w-full items-center justify-center"
    :class="[collapsed ? 'py-2' : 'py-3']"
  >
    <img
      :src="logoSrc"
      alt="Lawyer Portal"
      :class="collapsed ? 'h-7 w-auto' : 'h-8 w-auto max-w-44'"
    >
  </div>
</template>
