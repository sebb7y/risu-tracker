<script lang="ts">
  import { onMount } from 'svelte';
  import {
    CSV_CONVERSION_FIELDS,
    CSV_FORMATS,
    DEFAULT_CSV_IMPORT_CONFIG,
    isCsvFormatId,
    resolveCsvImportConfig,
    type CsvConversionConfig,
    type CsvFormatId,
    type CsvImportConfig,
  } from '../../lib/csv-config';

  let fileInput: HTMLInputElement;
  let dialog: HTMLDialogElement;
  let busy = false;
  let message = '';
  let error = '';

  let config: CsvImportConfig = resolveCsvImportConfig(DEFAULT_CSV_IMPORT_CONFIG);
  let selectedFormat: CsvFormatId = config.format;
  let conversions: CsvConversionConfig = { ...config.formats[selectedFormat].conversions };
  let selectedDefinition = CSV_FORMATS[0];

  $: selectedDefinition = CSV_FORMATS.find((format) => format.id === selectedFormat) ?? CSV_FORMATS[0];

  onMount(async () => {
    try {
      const response = await fetch('/api/import-csv?service=csv');
      const result = await response.json() as { config?: CsvImportConfig };
      if (!result.config) return;
      config = resolveCsvImportConfig(result.config);
      selectedFormat = config.format;
      conversions = { ...config.formats[selectedFormat].conversions };
    } catch {
      // Defaults are still usable when the local API is unavailable.
    }
  });

  function open() {
    message = '';
    error = '';
    dialog.showModal();
  }

  function close() {
    if (!busy) dialog.close();
  }

  function changeFormat(value: string) {
    if (!isCsvFormatId(value) || value === selectedFormat) return;
    config.formats[selectedFormat].conversions = { ...conversions };
    selectedFormat = value;
    conversions = { ...config.formats[selectedFormat].conversions };
  }

  function updateConversion(key: keyof CsvConversionConfig, value: string) {
    const parsed = Number(value);
    conversions = { ...conversions, [key]: Number.isFinite(parsed) ? parsed : 0 };
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
    config.format = selectedFormat;
    config.formats[selectedFormat].conversions = { ...conversions };

    const body = new FormData();
    body.append('service', 'csv');
    body.append('file', file);
    body.append('format', selectedFormat);
    body.append('config', JSON.stringify(config));

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

<dialog bind:this={dialog} class="fixed left-1/2 top-1/2 w-[min(92vw,40rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
  <form class="max-h-[90vh] space-y-5 overflow-y-auto p-5" on:submit|preventDefault={submit}>
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Import data</p>
        <h2 class="mt-1 text-lg font-semibold">Immersion CSV</h2>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose a CSV format, then adjust how its units convert to immersion time. Settings are saved per format.</p>
      </div>
      <button type="button" class="rounded-full px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" on:click={close}>✕</button>
    </div>

    <label class="block text-sm font-medium">
      CSV format
      <select
        value={selectedFormat}
        class="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
        on:change={(event) => changeFormat((event.currentTarget as HTMLSelectElement).value)}
      >
        {#each CSV_FORMATS as format}
          <option value={format.id}>{format.label}</option>
        {/each}
      </select>
    </label>
    <div class="-mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
      <p>{selectedDefinition.description}</p>
      <p class="font-mono text-[11px] text-slate-400 dark:text-slate-500">Columns: {selectedDefinition.columns}</p>
    </div>

    <input bind:this={fileInput} type="file" accept=".csv,text/csv" class="block w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900" />

    <div class="space-y-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
      <div>
        <p class="text-sm font-semibold">Conversion settings · {selectedDefinition.label}</p>
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">These rates decide how many immersion hours each unit represents. Re-import the same file after changing them to refresh its rows.</p>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        {#each CSV_CONVERSION_FIELDS as field}
          <label class="block text-xs font-medium">
            {field.label}
            <input
              value={conversions[field.key]}
              type="number"
              min={field.min}
              step="any"
              class="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              on:input={(event) => updateConversion(field.key, (event.currentTarget as HTMLInputElement).value)}
            />
            <span class="mt-1 block text-[10px] font-normal text-slate-500 dark:text-slate-400">{field.description}</span>
          </label>
        {/each}
      </div>
    </div>

    <p class="text-xs text-slate-500 dark:text-slate-400">Imported rows are stored in the local SQLite database. Re-importing the same file is safe and applies the current settings.</p>
    {#if error}<p class="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>{/if}
    {#if message}<p class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</p>{/if}

    <div class="flex justify-end gap-2">
      <button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700" on:click={close}>Cancel</button>
      <button type="submit" disabled={busy} class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">{busy ? 'Importing…' : 'Import CSV'}</button>
    </div>
  </form>
</dialog>
