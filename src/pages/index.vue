<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { BRANDING } from '../lib/branding'

const modules = [{
  title: 'Retainers',
  description: 'Centralize every retainer agreement, milestone, and renewal reminder.',
  icon: 'i-lucide-briefcase'
}, {
  title: 'Profiling',
  description: 'Capture intake data, medical history, and claims insight in seconds.',
  icon: 'i-lucide-id-card'
}, {
  title: 'On-Boarding',
  description: 'Automate welcome packets, discovery calls, and paralegal workflows.',
  icon: 'i-lucide-clipboard-list'
}]

const highlights = [{
  title: 'Purpose-built for MVA',
  body: 'Templates, questionnaires, and reports tuned for motor vehicle accident matters.'
}, {
  title: 'Audit-readiness',
  body: 'Traceable notes, immutable timelines, and exports that stand up in review.'
}, {
  title: 'Secure collaboration',
  body: 'Role-based workspaces so counsel, paralegals, and investigators stay in sync.'
}]

const stats = [{
  value: '78%',
  label: 'Faster intake to retainer'
}, {
  value: '45%',
  label: 'Reduction in admin load'
}, {
  value: '24/7',
  label: 'Client visibility'
}]

const steps = [{
  title: 'Import active matters',
  copy: 'Bring in your spreadsheets, Clio exports, or CSVs and we map them to our schema.'
}, {
  title: 'Configure roles',
  copy: 'Assign lead counsel, support staff, or outside adjusters in one place.'
}, {
  title: 'Launch client portal',
  copy: 'Share status updates, documents, and invoices without juggling email threads.'
}]
</script>

<template>
  <div class="min-h-screen bg-[#0f0f10] text-white">
    <div class="relative isolate overflow-hidden bg-gradient-to-b from-[#131313] via-[#111010] to-[#0f0f10]">
      <div class="absolute inset-0 pointer-events-none">
        <div class="absolute -top-32 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-[#AE4010]/40 blur-[120px]" />
        <div class="absolute top-20 right-12 h-48 w-48 rounded-full bg-[#f7c480]/30 blur-[90px]" />
      </div>

      <header class="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 lg:px-10">
        <div class="flex items-center gap-3">
          <img :src="BRANDING.logo" alt="Lawyer Portal" class="h-10 w-auto" />
        </div>
        <div class="hidden items-center gap-3 text-sm font-medium text-white/70 lg:flex">
          <RouterLink to="/login" class="rounded-full border border-white/15 px-4 py-2 transition hover:border-white/40 hover:text-white">
            Log in
          </RouterLink>
          <RouterLink
            to="/dashboard"
            class="rounded-full bg-white px-5 py-2 text-sm font-semibold uppercase tracking-wide text-[#141010]"
          >
            Launch app
          </RouterLink>
        </div>
      </header>

      <main class="mx-auto flex w-full max-w-6xl flex-col gap-14 px-6 pb-20 pt-10 lg:px-10 lg:pb-32 lg:pt-16">
        <section class="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div class="space-y-6">
            <h1 class="text-4xl font-semibold leading-tight text-white md:text-5xl lg:text-6xl">
              Modern legal workflows for retainers, profiling, and onboarding.
            </h1>
            <p class="text-base leading-relaxed text-white/70 md:text-lg">
              Give every attorney, paralegal, and claims partner a single workspace—from first notification
              of loss to signed engagement letter. Centralize intake, automate follow-ups, and surface the exact
              data your firm needs to win.
            </p>
            <div class="flex flex-col gap-3 text-sm text-white/70 sm:flex-row sm:items-center sm:gap-6">
              <div class="flex items-center gap-2">
                <span class="text-2xl font-bold text-white">250+</span>
                active matters orchestrated each month.
              </div>
              <div class="flex items-center gap-2">
                <span class="text-2xl font-bold text-white">12</span>
                boutique firms scaling with Lawyer Portal.
              </div>
            </div>
            <div class="flex flex-col gap-3 sm:flex-row">
              <RouterLink
                to="/dashboard"
                class="flex-1 rounded-xl bg-[#AE4010] px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-white shadow-lg shadow-[#AE4010]/40 transition hover:translate-y-0.5"
              >
                Explore the app
              </RouterLink>
              <RouterLink
                to="/login"
                class="flex-1 rounded-xl border border-white/15 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-white/80 transition hover:border-white/40 hover:text-white"
              >
                Sign in to workspace
              </RouterLink>
            </div>
          </div>

          <div class="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl">
            <div class="rounded-3xl border border-white/10 bg-black/30 p-6">
              <div class="flex items-center justify-between text-xs uppercase tracking-[0.4em] text-white/50">
                <span>Live workflow</span>
                <span>January docket</span>
              </div>
              <div class="mt-6 space-y-4">
                <div class="rounded-2xl bg-white/5 p-4">
                  <p class="text-xs uppercase tracking-[0.4em] text-white/50">Retainers</p>
                  <p class="mt-2 text-3xl font-semibold text-white">42 matters</p>
                  <p class="text-sm text-white/60">Next steps automatically routed to lead counsel.</p>
                </div>
                <div class="rounded-2xl bg-white/5 p-4">
                  <p class="text-xs uppercase tracking-[0.4em] text-white/50">Profiling</p>
                  <p class="mt-2 text-3xl font-semibold text-white">17 pending</p>
                  <p class="text-sm text-white/60">Medical + claims history ready for paralegals.</p>
                </div>
                <div class="rounded-2xl bg-white/5 p-4">
                  <p class="text-xs uppercase tracking-[0.4em] text-white/50">On-Boarding</p>
                  <p class="mt-2 text-3xl font-semibold text-white">8 welcomes</p>
                  <p class="text-sm text-white/60">Clients tracking tasks inside the shared portal.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="grid gap-5 rounded-3xl border border-white/10 bg-white/5 p-6 lg:grid-cols-3">
          <div v-for="highlight in highlights" :key="highlight.title" class="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-5">
            <h3 class="text-lg font-semibold text-white">{{ highlight.title }}</h3>
            <p class="text-sm leading-relaxed text-white/70">
              {{ highlight.body }}
            </p>
          </div>
        </section>

        <section class="space-y-8">
          <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p class="text-xs uppercase tracking-[0.4em] text-white/50">Modules</p>
              <h2 class="mt-1 text-3xl font-semibold text-white">One surface for every MVA milestone.</h2>
            </div>
            <RouterLink to="/dashboard" class="text-sm font-semibold text-[#f9d7b1] hover:text-white">
              See dashboard view →
            </RouterLink>
          </div>
          <div class="grid gap-5 lg:grid-cols-3">
            <article
              v-for="module in modules"
              :key="module.title"
              class="rounded-3xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 p-6 transition hover:border-white/25"
            >
              <div class="flex items-center gap-3">
                <div class="flex size-12 items-center justify-center rounded-2xl bg-white/10">
                  <UIcon :name="module.icon" class="size-6 text-white" />
                </div>
                <h3 class="text-xl font-semibold text-white">{{ module.title }}</h3>
              </div>
              <p class="mt-4 text-sm text-white/70">
                {{ module.description }}
              </p>
            </article>
          </div>
        </section>

        <section class="grid gap-6 rounded-3xl border border-white/10 bg-black/20 p-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div class="space-y-6">
            <p class="text-xs uppercase tracking-[0.4em] text-white/50">Implementation</p>
            <h2 class="text-3xl font-semibold text-white">Launch in a weekend.</h2>
            <div class="space-y-4">
              <div
                v-for="(step, index) in steps"
                :key="step.title"
                class="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div class="flex items-center gap-3 text-sm font-semibold tracking-wide text-[#f9d7b1]">
                  <span class="text-white/40">{{ `0${index + 1}` }}</span>
                  {{ step.title }}
                </div>
                <p class="mt-2 text-sm leading-relaxed text-white/70">
                  {{ step.copy }}
                </p>
              </div>
            </div>
          </div>
          <div class="flex flex-col justify-between rounded-3xl border border-white/10 bg-gradient-to-b from-[#AE4010] to-[#7c2c0a] p-6">
            <div>
              <p class="text-xs uppercase tracking-[0.4em] text-white/60">Impact</p>
              <h3 class="mt-2 text-3xl font-semibold text-white">Operational clarity from day one.</h3>
            </div>
            <div class="mt-6 grid gap-4">
              <div v-for="stat in stats" :key="stat.label" class="rounded-2xl bg-black/30 p-4">
                <p class="text-4xl font-semibold text-white">{{ stat.value }}</p>
                <p class="text-sm text-white/70">{{ stat.label }}</p>
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <p class="text-xs uppercase tracking-[0.4em] text-white/60">Ready to build?</p>
          <h2 class="mt-4 text-3xl font-semibold text-white">Plug the Lawyer Portal into your existing stack.</h2>
          <p class="mx-auto mt-3 max-w-3xl text-sm text-white/70">
            Reuse your Supabase models, reconfigure RBAC, and keep your analytics intact. We ship a Vue and Next.js
            starter so your engineers stay in flow.
          </p>
          <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <RouterLink
              to="/dashboard"
              class="rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-wide text-[#141010]"
            >
              Browse the dashboard
            </RouterLink>
            <RouterLink
              to="/login"
              class="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white/80"
            >
              Access your workspace
            </RouterLink>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
