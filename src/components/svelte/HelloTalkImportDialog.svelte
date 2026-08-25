<script lang="ts">
  import { onMount } from 'svelte';
  import { DEFAULT_HELLO_TALK_CONFIG, type HelloTalkConfig } from '../../lib/hello-talk-config';

  let messagesInput: HTMLInputElement;
  let callsInput: HTMLInputElement;
  let dialog: HTMLDialogElement;
  let busy = false;
  let message = '';
  let error = '';
  let userId = '';
  let connectedStatuses = DEFAULT_HELLO_TALK_CONFIG.calls.connectedStatuses.join(', ');
  let callImmersionPercent = DEFAULT_HELLO_TALK_CONFIG.calls.immersionPercent;
  let targetLanguageFilter = DEFAULT_HELLO_TALK_CONFIG.messages.targetLanguageFilter;
  let minimumCharacters = DEFAULT_HELLO_TALK_CONFIG.messages.minimumCharacters;
  let messageImmersionPercent = DEFAULT_HELLO_TALK_CONFIG.messages.immersionPercent;
  let charactersPerHourRead = DEFAULT_HELLO_TALK_CONFIG.reading.charactersPerHour;
  let charactersPerHourWrite = DEFAULT_HELLO_TALK_CONFIG.writing.charactersPerHour;

  onMount(async () => {
    try {
      const response = await fetch('/api/import-csv?service=hellotalk');
      const result = await response.json() as { config?: HelloTalkConfig };
      if (!result.config) return;
      connectedStatuses = result.config.calls.connectedStatuses.join(', ');
      callImmersionPercent = result.config.calls.immersionPercent;
      targetLanguageFilter = result.config.messages.targetLanguageFilter;
      minimumCharacters = result.config.messages.minimumCharacters;
      messageImmersionPercent = result.config.messages.immersionPercent;
      charactersPerHourRead = result.config.reading.charactersPerHour;
      charactersPerHourWrite = result.config.writing.charactersPerHour;
    } catch { /* Defaults are still usable when the local API is unavailable. */ }
  });

  function open() { message = ''; error = ''; dialog.showModal(); }
  function close() { if (!busy) dialog.close(); }
  function config(): HelloTalkConfig {
    return {
      calls: { connectedStatuses: connectedStatuses.split(',').map((value) => value.trim()).filter(Boolean), immersionPercent: Number(callImmersionPercent) },
      messages: { targetLanguageFilter, minimumCharacters: Number(minimumCharacters), immersionPercent: Number(messageImmersionPercent), excludeSystemMessages: true },
      reading: { charactersPerHour: Number(charactersPerHourRead) },
      writing: { charactersPerHour: Number(charactersPerHourWrite), estimateAutomatically: false },
    };
  }
  async function submit() {
    const messages = messagesInput?.files?.[0];
    const calls = callsInput?.files?.[0];
    if (!messages && !calls) { error = 'Choose messages.csv, calls.csv, or both.'; return; }
    if (!userId.trim()) { error = 'Enter the user ID used by the export.'; return; }
    busy = true; error = ''; message = '';
    const body = new FormData();
    body.append('service', 'hellotalk'); body.append('userId', userId.trim()); body.append('config', JSON.stringify(config()));
    if (messages) body.append('messages', messages);
    if (calls) body.append('calls', calls);
    try {
      const response = await fetch('/api/import-csv', { method: 'POST', body });
      const result = await response.json() as { imported?: number; duplicates?: number; connectedCalls?: number; outputTextMinutes?: number; readingTextMinutes?: number; error?: string };
      if (!response.ok) throw new Error(result.error || 'Import failed.');
      message = `Imported ${result.imported ?? 0} events. ${result.connectedCalls ?? 0} connected calls; ${Math.round((result.outputTextMinutes ?? 0) + (result.readingTextMinutes ?? 0))} message minutes.`;
      window.sessionStorage.setItem('immersion-toast', message);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (caught) { error = caught instanceof Error ? caught.message : 'Import failed.'; }
    finally { busy = false; }
  }
</script>

<button type="button" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-base font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" on:click={open}>Import HelloTalk</button>

<dialog bind:this={dialog} class="fixed left-1/2 top-1/2 w-[min(92vw,40rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
  <form class="max-h-[90vh] space-y-5 overflow-y-auto p-5" on:submit|preventDefault={submit}>
    <div class="flex items-start justify-between gap-4"><div><p class="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Service import</p><h2 class="mt-1 text-lg font-semibold">HelloTalk data</h2><p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Upload the CSVs produced by the HelloTalk extractor. The original rows and settings are stored locally.</p></div><button type="button" class="rounded-full px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" on:click={close}>✕</button></div>
    <label class="block text-sm font-medium">Your HelloTalk user ID<input bind:value={userId} placeholder="e.g. 123456789" class="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" /></label>
    <div class="grid gap-3 sm:grid-cols-2"><label class="block text-sm font-medium">messages.csv<input bind:this={messagesInput} type="file" accept=".csv,text/csv" class="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" /></label><label class="block text-sm font-medium">calls.csv<input bind:this={callsInput} type="file" accept=".csv,text/csv" class="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" /></label></div><p class="-mt-2 text-xs text-slate-500 dark:text-slate-400">Re-importing files with the same names reprocesses them using the current settings.</p>
    <div class="grid gap-3 sm:grid-cols-2"><label class="block text-sm font-medium">Connected statuses<input bind:value={connectedStatuses} class="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" /></label><label class="block text-sm font-medium">Call immersion %<input bind:value={callImmersionPercent} type="number" min="0" max="100" class="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" /></label></div>
    <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p class="text-sm font-semibold">Messages</p><label class="mt-2 flex items-center gap-2 text-sm"><input bind:checked={targetLanguageFilter} type="checkbox" /> Keep Japanese characters only</label><div class="mt-3 grid gap-3 sm:grid-cols-3"><label class="block text-xs font-medium">Minimum chars<input bind:value={minimumCharacters} type="number" min="0" class="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label><label class="block text-xs font-medium">Immersion %<input bind:value={messageImmersionPercent} type="number" min="0" max="100" class="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label><label class="block text-xs font-medium">Read chars/hour<input bind:value={charactersPerHourRead} type="number" min="1" class="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label></div><label class="mt-3 block text-xs font-medium">Write chars/hour<input bind:value={charactersPerHourWrite} type="number" min="1" class="mt-1 block w-full rounded-lg border border-slate-200 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label></div>
    {#if error}<p class="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>{/if}{#if message}<p class="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">{message}</p>{/if}
    <div class="flex justify-end gap-2"><button type="button" class="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700" on:click={close}>Cancel</button><button type="submit" disabled={busy} class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">{busy ? 'Importing…' : 'Import HelloTalk'}</button></div>
  </form>
</dialog>
