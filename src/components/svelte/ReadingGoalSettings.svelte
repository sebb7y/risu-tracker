<script lang="ts">
  import type { ReadingGoalConfig } from '../../lib/goal-config';

  export let config: ReadingGoalConfig;

  let dialogEl: HTMLDialogElement | null = null;
  let goalMinutes = config.dailyGoalMinutes;
  let maxHours = config.maxMinutesPerDay / 60;
  let saving = false;
  let status = '';

  function openDialog() {
    goalMinutes = config.dailyGoalMinutes;
    maxHours = config.maxMinutesPerDay / 60;
    status = '';
    dialogEl?.showModal();
  }

  function closeDialog() {
    dialogEl?.close();
  }

  async function save() {
    const goal = Number(goalMinutes);
    const maxMinutes = Number(maxHours) * 60;
    if (!Number.isFinite(goal) || goal <= 0) {
      status = 'Daily goal must be a positive number of minutes.';
      return;
    }
    if (!Number.isFinite(maxMinutes) || maxMinutes <= goal) {
      status = 'Max hours per day must be greater than the daily goal.';
      return;
    }

    saving = true;
    status = '';
    try {
      const response = await fetch('/api/reading-goal-config', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dailyGoalMinutes: goal, maxMinutesPerDay: maxMinutes }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not save reading goal settings.');
      status = 'Saved';
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      status = error instanceof Error ? error.message : 'Could not save reading goal settings.';
      saving = false;
    }
  }
</script>

<button
  type="button"
  class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
  on:click={openDialog}
>
  Adjust goal
</button>

<dialog
  bind:this={dialogEl}
  class="fixed left-1/2 top-1/2 w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
>
  <form method="dialog" class="space-y-5 p-5" on:submit|preventDefault={save}>
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Reading goals</p>
        <h3 class="mt-1 text-lg font-semibold">Adjust goal</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">The goal marks the midpoint of each day's progress bar.</p>
      </div>
      <button
        type="button"
        class="rounded-full px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        on:click={closeDialog}
      >
        ✕
      </button>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <label class="space-y-1 text-sm">
        <span class="block text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Daily goal (minutes)</span>
        <input
          bind:value={goalMinutes}
          type="number"
          min="1"
          step="1"
          class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 outline-none transition focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:focus:border-slate-500 dark:focus:bg-slate-900"
        />
      </label>

      <label class="space-y-1 text-sm">
        <span class="block text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Max hours per day</span>
        <input
          bind:value={maxHours}
          type="number"
          min="0.5"
          step="0.5"
          class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 outline-none transition focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:focus:border-slate-500 dark:focus:bg-slate-900"
        />
      </label>
    </div>

    {#if status}
      <p class="text-center text-xs text-slate-500 dark:text-slate-400">{status}</p>
    {/if}

    <div class="flex items-center justify-end gap-2">
      <button
        type="button"
        class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        on:click={closeDialog}
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving}
        class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:focus:ring-slate-500 dark:focus:ring-offset-slate-950"
      >
        {saving ? 'Saving…' : 'Save goal'}
      </button>
    </div>
  </form>
</dialog>
