<script lang="ts">
  let fileInput: HTMLInputElement;
  let dialog: HTMLDialogElement;
  let busy = false;
  let message = '';
  let error = '';

  function open() {
    message = '';
    error = '';
    dialog.showModal();
  }

  function close() {
    if (!busy) dialog.close();
  }

  async function submit() {
    const file = fileInput?.files?.[0];
    if (!file) {
      error = 'Choose a CSV file first.';
      return;
    }

    busy = true;
    error = '';
    message = '';
    const body = new FormData();
    body.append('file', file);

    try {
      const response = await fetch('/api/import-csv', { method: 'POST', body });
      const result = (await response.json()) as { imported?: number; duplicates?: number; invalid?: number; error?: string };
      if (!response.ok) throw new Error(result.error || 'Import failed.');
      message = `Imported ${result.imported ?? 0} logs. ${result.duplicates ?? 0} duplicates skipped${result.invalid ? `; ${result.invalid} invalid rows skipped` : ''}.`;
      window.sessionStorage.setItem('immersion-toast', message);
      window.setTimeout(() => window.location.reload(), 500);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : 'Import failed.';
    } finally {
      busy = false;
    }
  }
</script>

<button
  type="button"
  class="rounded-full border border-slate-200 bg-white px-4 py-2 text-base font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white dark:focus:ring-slate-500 dark:focus:ring-offset-slate-950"
  on:click={open}
>
  Import CSV
</button>

<dialog bind:this={dialog} class="fixed left-1/2 top-1/2 w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
  <form class="space-y-5 p-5" on:submit|preventDefault={submit}>
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Import data</p>
        <h2 class="mt-1 text-lg font-semibold">Immersion CSV</h2>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Use a CSV with the existing Log ID, Media Type, Amount Logged, Points Received, and Log Date columns.</p>
      </div>
      <button type="button" class="rounded-full px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" on:click={close}>✕</button>
    </div>

    <input bind:this={fileInput} type="file" accept=".csv,text/csv" class="block w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900" />
    <p class="text-xs text-slate-500 dark:text-slate-400">Imported rows are stored in the local SQLite database. Re-importing the same file is safe.</p>
    {#if error}<p class="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>{/if}
    {#if message}<p class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</p>{/if}

    <div class="flex justify-end gap-2">
      <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700" on:click={close}>Cancel</button>
      <button type="submit" disabled={busy} class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">{busy ? 'Importing…' : 'Import CSV'}</button>
    </div>
  </form>
</dialog>
