<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'

const router = useRouter()
const route = useRoute()
const auth = useAuth()

const email = ref('')
const password = ref('')
const errorMessage = ref<string | null>(null)

const redirectTo = computed(() => {
  const fromQuery = route.query.redirect
  return typeof fromQuery === 'string' && fromQuery.length ? fromQuery : '/dashboard'
})

const isBusy = computed(() => auth.state.value.loading)

const handleSubmit = async () => {
  errorMessage.value = null

  try {
    await auth.signInWithPassword(email.value.trim(), password.value)
    await router.replace(redirectTo.value)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to sign in'
    errorMessage.value = msg
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0f0f10] text-white">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 lg:flex-row lg:items-stretch lg:gap-20 lg:px-10">
      <section class="flex flex-1 flex-col justify-between rounded-[32px] border border-white/10 bg-gradient-to-b from-[#151515] to-[#0f0f10] p-8 shadow-2xl shadow-black/50">
        <div>
          <p class="text-xs uppercase tracking-[0.4em] text-white/60">Lawyer Portal</p>
          <h1 class="mt-4 text-4xl font-semibold leading-tight text-white">Secure entry for your MVA workspace.</h1>
          <p class="mt-4 text-sm leading-relaxed text-white/70">
            We replaced passwords with signed access links. Use your firm email and the access code from your
            authenticator or inbox to continue.
          </p>
        </div>

        <div class="mt-10 space-y-4">
          <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p class="text-xs uppercase tracking-[0.4em] text-white/60">Need an invite?</p>
            <p class="mt-2 text-sm text-white/80">Contact ops@lawyerportal.com and we will provision your workspace.</p>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p class="text-xs uppercase tracking-[0.4em] text-white/60">Security</p>
            <p class="mt-2 text-sm text-white/80">We enforce device-based MFA and session timeouts across all orgs.</p>
          </div>
        </div>
      </section>

      <section class="flex flex-1 flex-col justify-center rounded-[32px] border border-white/10 bg-white/10 p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div class="space-y-6">
          <div>
            <p class="text-xs uppercase tracking-[0.4em] text-white/60">Sign in</p>
            <h2 class="mt-2 text-3xl font-semibold text-white">Access your dashboard</h2>
          </div>

          <form class="space-y-4" @submit.prevent="handleSubmit">
            <label class="block space-y-2 text-sm">
              <span class="text-white/80">Work email</span>
              <input
                v-model="email"
                type="email"
                placeholder="you@firm.com"
                autocomplete="email"
                class="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
              >
            </label>

            <label class="block space-y-2 text-sm">
              <span class="text-white/80">Password</span>
              <input
                v-model="password"
                type="password"
                placeholder="Enter password"
                autocomplete="current-password"
                class="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
              >
            </label>

            <p v-if="errorMessage" class="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {{ errorMessage }}
            </p>

            <button
              type="submit"
              class="w-full rounded-2xl bg-[#AE4010] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white shadow-lg shadow-[#AE4010]/40"
              :disabled="isBusy"
            >
              {{ isBusy ? 'Signing in…' : 'Continue' }}
            </button>
          </form>

          <p class="text-xs text-white/50">
            This login currently uses Supabase email/password. You can swap in magic links or SSO later.
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
