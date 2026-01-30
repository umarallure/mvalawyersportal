<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
    <div class="text-5xl font-bold">
      404
    </div>
    <div class="mt-3 text-lg font-semibold">
      Page not found
    </div>
    <div class="mt-2 text-sm text-muted">
      The page you are looking for doesn’t exist.
    </div>

    <div class="mt-6 flex items-center justify-center gap-2">
      <UButton color="primary" variant="solid" @click="() => { void router.push('/dashboard') }">
        Go to dashboard
      </UButton>
    </div>
  </div>
</template>
