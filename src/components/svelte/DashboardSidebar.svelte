<script lang="ts">
  import { onMount } from 'svelte';
  import { tick } from 'svelte';
  import type { DashboardComponentConfig, DashboardSource } from '../../lib/dashboard-config';

  export let initialComponents: DashboardComponentConfig[] = [];
  export let sources: DashboardSource[] = [];

  let components = initialComponents;
  let configureSources = false;
  let saving = false;
  let status = '';
  let open = false;

  onMount(async () => {
    try {
      const response = await fetch('/api/dashboard-config');
      const result = await response.json() as { components?: DashboardComponentConfig[] };
      if (result.components?.length) components = normalize(result.components);
      await tick();
      applyOrder();
    } catch {
      // Server defaults remain usable if the config endpoint is unavailable.
    }
  });

  function normalize(input: DashboardComponentConfig[]): DashboardComponentConfig[] {
    return [...input].sort((left, right) => left.order - right.order).map((component, order) => ({ ...component, order }));
  }

  async function save() {
    saving = true;
    status = '';
    try {
      const response = await fetch('/api/dashboard-config', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ components }),
      });
      if (!response.ok) throw new Error('Could not save dashboard layout.');
      status = 'Saved';
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      status = error instanceof Error ? error.message : 'Could not save dashboard layout.';
    } finally {
      saving = false;
    }
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= components.length) return;
    const next = [...components];
    [next[index], next[target]] = [next[target], next[index]];
    components = normalize(next);
    applyOrder();
  }

  function applyOrder() {
    const stack = document.querySelector('[data-dashboard-stack]');
    if (!stack) return;
    for (const component of components) {
      const element = document.getElementById(component.anchor);
      if (element && element.parentElement === stack) stack.appendChild(element);
    }
  }

  function toggleSource(componentKey: string, sourceKey: string) {
    components = components.map((component) => {
      if (component.key !== componentKey) return component;
      const dataSources = component.dataSources.includes(sourceKey)
        ? component.dataSources.filter((key) => key !== sourceKey)
        : [...component.dataSources, sourceKey];
      return { ...component, dataSources };
    });
  }
</script>

<button type="button" class="fixed left-4 top-24 z-40 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-lg transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" on:click={() => (open = true)} aria-label="Open dashboard sidebar">☰ <span class="hidden sm:inline">Dashboard</span></button>
{#if open}
  <button type="button" class="fixed inset-0 z-40 cursor-default bg-slate-950/30" aria-label="Close dashboard sidebar" on:click={() => (open = false)}></button>

<aside class="fixed inset-y-0 left-0 z-50 w-80 max-w-[88vw] overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900" aria-label="Dashboard sidebar">
  <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
    <div class="flex items-center justify-between gap-2 px-2 pb-2">
      <div><p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Dashboard</p><p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Jump to a section</p></div>
      <div class="flex items-center gap-2"><button type="button" class="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-300" on:click={() => (configureSources = !configureSources)}>{configureSources ? 'Done' : 'Configure'}</button><button type="button" class="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" on:click={() => (open = false)} aria-label="Close dashboard sidebar">✕</button></div>
    </div>
    <nav class="space-y-1" aria-label="Dashboard components">
      {#each components as component, index}
        {#if component.enabled}
          <div class="group flex items-center gap-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <a class="min-w-0 flex-1 truncate px-2 py-2 text-sm text-slate-600 dark:text-slate-300" href={`#${component.anchor}`} on:click={() => (open = false)}>{component.label}</a>
            {#if configureSources}
              <button type="button" class="rounded px-1 text-xs text-slate-400 hover:text-slate-900 dark:hover:text-white" aria-label={`Move ${component.label} up`} on:click={() => move(index, -1)}>↑</button>
              <button type="button" class="rounded px-1 text-xs text-slate-400 hover:text-slate-900 dark:hover:text-white" aria-label={`Move ${component.label} down`} on:click={() => move(index, 1)}>↓</button>
            {/if}
          </div>
          {#if configureSources}
            <div class="mb-2 ml-2 space-y-1 border-l border-slate-200 pl-3 dark:border-slate-700">
              <p class="text-[10px] uppercase tracking-wide text-slate-400">Data sources</p>
              {#each sources as source}
                <label class="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400"><input type="checkbox" checked={component.dataSources.includes(source.key)} on:change={() => toggleSource(component.key, source.key)} /><span>{source.label}</span></label>
              {/each}
            </div>
          {/if}
        {/if}
      {/each}
    </nav>
    {#if configureSources}
      <button type="button" disabled={saving} class="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900" on:click={save}>{saving ? 'Saving…' : 'Save dashboard settings'}</button>
      {#if status}<p class="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">{status}</p>{/if}
    {/if}
  </div>
</aside>
{/if}
