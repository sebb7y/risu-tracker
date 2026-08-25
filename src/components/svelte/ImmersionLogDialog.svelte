<script lang="ts">
  import { onMount, tick } from 'svelte';

  export type LogKind = 'reading' | 'listening' | 'anime';

  export interface LogDefaults {
    logId: number;
    mediaName: string;
    comment: string;
    amount: number;
  }

  export interface RecentLogEntry {
    dateKey: string;
    typeLabel: string;
    amountLabel: string;
    count: number;
    command: string;
  }

  export interface CsvSnapshotEntry {
    fileName: string;
    label: string;
    isLatest: boolean;
  }

  export let submitUrl = '/api/immersion-log';
  export let deleteUrl = '/api/delete-old-csvs';
  export let defaults: Record<LogKind, LogDefaults>;
  export let recentLogs: RecentLogEntry[] = [];
  export let csvSnapshots: CsvSnapshotEntry[] = [];

  const MEDIA_LABELS: Record<LogKind, string> = {
    reading: 'Reading Time',
    listening: 'Listening Time',
    anime: 'Anime',
  };

  let dialogEl: HTMLDialogElement | null = null;
  let recentDialogEl: HTMLDialogElement | null = null;
  let amountInput: HTMLInputElement | null = null;
  let exportButtonEl: HTMLButtonElement | null = null;

  let currentKind: LogKind = 'reading';
  let logId = '';
  let mediaName = 'N/A';
  let comment = 'No comment';
  let dateTimeLocal = '';
  let amount = 60;
  let computedPoints = 0;
  let toastTimeout: ReturnType<typeof setTimeout> | undefined;

  function formatDateTimeLocal(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
      date.getMinutes(),
    )}`;
  }

  function pointsFor(kind: LogKind, currentAmount: number): number {
    if (kind === 'anime') return currentAmount * 13;
    return (currentAmount / 60) * 40.2;
  }

  function formatPoints(points: number): string {
    return points.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  }

  function resetForm(kind: LogKind) {
    currentKind = kind;
    const preset = defaults[kind];
    logId = String(preset.logId);
    mediaName = preset.mediaName;
    comment = preset.comment;
    amount = preset.amount;
    dateTimeLocal = formatDateTimeLocal(new Date());
  }

  async function openDialog(kind: LogKind) {
    resetForm(kind);
    if (dialogEl?.open) dialogEl.close();
    dialogEl?.showModal();
    await tick();
    amountInput?.focus();
    amountInput?.select();
  }

  function closeDialog() {
    dialogEl?.close();
  }

  function openRecentLogs() {
    if (recentDialogEl?.open) recentDialogEl.close();
    recentDialogEl?.showModal();
    void tick().then(() => {
      exportButtonEl?.focus();
    });
  }

  function closeRecentLogs() {
    recentDialogEl?.close();
  }

  function flashToast(message: string) {
    const existing = document.getElementById('immersion-toast');
    const createToast = () => {
      const el = document.createElement('div');
      el.id = 'immersion-toast';
      el.className =
        'fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-lg shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200';
      el.textContent = message;
      document.body.appendChild(el);
      if (toastTimeout) window.clearTimeout(toastTimeout);
      toastTimeout = window.setTimeout(() => {
        el.remove();
        if (document.getElementById('immersion-toast') === el) {
          // no-op
        }
      }, 2200);
    };

    if (existing) {
      existing.textContent = message;
      if (toastTimeout) window.clearTimeout(toastTimeout);
      toastTimeout = window.setTimeout(() => existing.remove(), 2200);
      return;
    }

    createToast();
  }

  function copyTextToClipboard(text: string) {
    try {
      const fallback = document.createElement('textarea');
      fallback.value = text;
      fallback.setAttribute('readonly', 'true');
      fallback.style.position = 'fixed';
      fallback.style.top = '-9999px';
      fallback.style.opacity = '0';
      document.body.appendChild(fallback);
      fallback.focus();
      fallback.select();
      fallback.setSelectionRange(0, fallback.value.length);
      const copied = document.execCommand('copy');
      document.body.removeChild(fallback);

      if (copied) return true;
      return false;
    } catch {
      return false;
    }
  }

  async function exportRecentLogs() {
    if (!recentLogs.length) {
      flashToast('No recent logs to export.');
      return;
    }

    const payload = recentLogs.map((entry) => entry.command).join('\n');

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
        flashToast('Copied recent logs to clipboard.');
        return;
      }
    } catch {
      // Fall through to the modal-dialog-safe fallback below.
    }

    const wasOpen = recentDialogEl?.open ?? false;
    if (wasOpen) recentDialogEl?.close();

    try {
      const copied = copyTextToClipboard(payload);
      if (wasOpen) recentDialogEl?.showModal();
      flashToast(copied ? 'Copied recent logs to clipboard.' : 'Could not copy to clipboard.');
    } catch {
      if (wasOpen && !recentDialogEl?.open) recentDialogEl?.showModal();
      flashToast('Could not copy to clipboard.');
    }
  }

  async function updateCsvSnapshots(keepFileName?: string) {
    const response = await fetch(deleteUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(keepFileName ? { keepFileName } : {}),
    });

    if (!response.ok) throw new Error(`CSV update failed with status ${response.status}`);
    return (await response.json()) as { deletedCount?: number; keptFile?: string };
  }

  async function deleteOldCsvs() {
    const confirmed = window.confirm('Delete all old CSV snapshots and keep only the newest one?');
    if (!confirmed) return;

    try {
      const data = await updateCsvSnapshots();
      const deletedCount = Number(data.deletedCount ?? 0);
      window.sessionStorage.setItem(
        'immersion-toast',
        deletedCount > 0
          ? `Deleted ${deletedCount} old CSV snapshot${deletedCount === 1 ? '' : 's'}.`
          : 'No old CSV snapshots to delete.',
      );
      window.location.reload();
    } catch {
      flashToast('Could not delete old CSVs.');
    }
  }

  async function revertToCsv(snapshot: CsvSnapshotEntry) {
    if (snapshot.isLatest) return;

    const confirmed = window.confirm(
      `Revert to ${snapshot.fileName} and delete all newer CSV snapshots?`,
    );
    if (!confirmed) return;

    try {
      const data = await updateCsvSnapshots(snapshot.fileName);
      const deletedCount = Number(data.deletedCount ?? 0);
      window.sessionStorage.setItem(
        'immersion-toast',
        deletedCount > 0
          ? `Reverted to ${snapshot.fileName} and deleted ${deletedCount} newer CSV snapshot${deletedCount === 1 ? '' : 's'}.`
          : `Reverted to ${snapshot.fileName}.`,
      );
      window.location.reload();
    } catch {
      flashToast('Could not revert to that CSV.');
    }
  }

  onMount(() => {
    const pendingToast = window.sessionStorage.getItem('immersion-toast');
    if (pendingToast) {
      window.sessionStorage.removeItem('immersion-toast');
      flashToast(pendingToast);
    }
  });

  $: computedPoints = pointsFor(currentKind, Number(amount) || 0);
</script>

<div class="contents">
  <div class="flex flex-wrap items-center gap-2">
    <button
      type="button"
      class="rounded-full border border-slate-200 bg-white px-4 py-2 text-base font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white dark:focus:ring-slate-500 dark:focus:ring-offset-slate-950"
      on:click={() => openDialog('reading')}
    >
      Log reading
    </button>
    <button
      type="button"
      class="rounded-full border border-slate-200 bg-white px-4 py-2 text-base font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white dark:focus:ring-slate-500 dark:focus:ring-offset-slate-950"
      on:click={() => openDialog('listening')}
    >
      Log listening
    </button>
    <button
      type="button"
      class="rounded-full border border-slate-200 bg-white px-4 py-2 text-base font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white dark:focus:ring-slate-500 dark:focus:ring-offset-slate-950"
      on:click={() => openDialog('anime')}
    >
      Log anime
    </button>
  </div>

  <button
    type="button"
    class="rounded-full border border-slate-200 bg-white px-4 py-2 text-base font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white dark:focus:ring-slate-500 dark:focus:ring-offset-slate-950"
    on:click={openRecentLogs}
  >
    View recent logs
  </button>
</div>

<dialog
  bind:this={dialogEl}
  class="fixed left-1/2 top-1/2 w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
>
  <form method="post" action={submitUrl} class="space-y-5 p-5">
    <input type="hidden" name="kind" value={currentKind} />

    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Add log</p>
        <h3 class="mt-1 text-lg font-semibold">{MEDIA_LABELS[currentKind]}</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Points update automatically when you change the amount.</p>
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
      <label class="space-y-1 text-sm opacity-75 transition-opacity focus-within:opacity-100 sm:col-span-1">
        <span class="block text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Log ID</span>
        <input
          name="logId"
          value={logId}
          class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 outline-none transition focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:focus:border-slate-500 dark:focus:bg-slate-900"
          inputmode="numeric"
          autocomplete="off"
        />
      </label>

      <label class="space-y-1 text-sm opacity-75 transition-opacity focus-within:opacity-100 sm:col-span-1">
        <span class="block text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Date</span>
        <input
          name="dateTimeLocal"
          type="datetime-local"
          value={dateTimeLocal}
          class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 outline-none transition focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:focus:border-slate-500 dark:focus:bg-slate-900"
        />
      </label>

      <label class="space-y-1 text-sm opacity-75 transition-opacity focus-within:opacity-100 sm:col-span-1">
        <span class="block text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Media name</span>
        <input
          name="mediaName"
          value={mediaName}
          class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 outline-none transition focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:focus:border-slate-500 dark:focus:bg-slate-900"
          autocomplete="off"
        />
      </label>

      <label class="space-y-1 text-sm opacity-75 transition-opacity focus-within:opacity-100 sm:col-span-1">
        <span class="block text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Comment</span>
        <input
          name="comment"
          value={comment}
          class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 outline-none transition focus:border-slate-400 focus:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:focus:border-slate-500 dark:focus:bg-slate-900"
          autocomplete="off"
        />
      </label>
    </div>

    <div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
      <div class="flex items-center justify-between gap-4">
        <label class="flex-1 space-y-1 text-sm">
          <span class="block text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Amount</span>
          <input
            bind:this={amountInput}
            bind:value={amount}
            name="amount"
            type="number"
            min="1"
            step="1"
            class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-2xl font-semibold tabular-nums outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:focus:border-slate-500"
          />
        </label>
        <div class="shrink-0 text-right">
          <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Points</p>
          <p class="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatPoints(computedPoints)}</p>
        </div>
      </div>
      <p class="text-xs text-slate-500 dark:text-slate-400">
        {currentKind === 'anime' ? '13.0 points per episode.' : '40.2 points per hour.'}
      </p>
    </div>

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
        class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:focus:ring-slate-500 dark:focus:ring-offset-slate-950"
      >
        Submit log
      </button>
    </div>
  </form>
</dialog>

<dialog
  bind:this={recentDialogEl}
  class="fixed left-1/2 top-1/2 w-[min(94vw,48rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
>
  <div class="space-y-5 p-5">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Recent logs</p>
        <h3 class="mt-1 text-lg font-semibold">{recentLogs.length ? `${recentLogs.length} merged log group${recentLogs.length === 1 ? '' : 's'}` : 'No recent logs'}</h3>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Compared from the oldest CSV snapshot to the newest one.</p>
      </div>
      <button
        type="button"
        class="rounded-full px-2 py-1 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        on:click={closeRecentLogs}
      >
        ✕
      </button>
    </div>

    <div class="max-h-[55vh] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
      {#if recentLogs.length}
        {#each recentLogs as entry}
          <div class="flex items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm shadow-slate-950/5 dark:border-slate-800 dark:bg-slate-950/40 dark:shadow-none">
            <div class="min-w-0">
              <p class="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{entry.dateKey}</p>
              <p class="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{entry.typeLabel}</p>
              <p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {entry.amountLabel}{entry.count > 1 ? ` · ${entry.count} logs merged` : ''}
              </p>
            </div>
            <p class="max-w-[16rem] truncate text-right font-mono text-[11px] leading-5 text-slate-400 dark:text-slate-500">{entry.command}</p>
          </div>
        {/each}
      {:else}
        <p class="text-sm text-slate-500 dark:text-slate-400">No logs have been added since the oldest CSV snapshot.</p>
      {/if}
    {#if csvSnapshots.length}
      <div class="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">CSV snapshots</p>
            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Revert to any older snapshot and remove the newer ones.</p>
          </div>
        </div>

        <div class="max-h-40 space-y-2 overflow-y-auto">
          {#each csvSnapshots as snapshot}
            <div class="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm shadow-slate-950/5 dark:border-slate-800 dark:bg-slate-950/40 dark:shadow-none">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{snapshot.fileName}</p>
                <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{snapshot.label}{snapshot.isLatest ? ' · current' : ' · older snapshot'}</p>
              </div>

              {#if snapshot.isLatest}
                <span class="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:border-slate-700 dark:text-slate-400">Current</span>
              {:else}
                <button
                  type="button"
                  class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50"
                  on:click={() => revertToCsv(snapshot)}
                >
                  Revert
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <div class="flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/50"
        on:click={deleteOldCsvs}
      >
        Delete old CSVs
      </button>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          on:click={closeRecentLogs}
        >
          Close
        </button>
        <button
          bind:this={exportButtonEl}
          type="button"
          class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:focus:ring-slate-500 dark:focus:ring-offset-slate-950"
          on:click={exportRecentLogs}
          disabled={!recentLogs.length}
        >
          Export
        </button>
      </div>
    </div>
  </div>
</dialog>
