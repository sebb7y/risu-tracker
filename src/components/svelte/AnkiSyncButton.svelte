<script lang="ts">
  import { onMount } from 'svelte';

  interface AnkiReview {
    id: number;
    time: number;
    ease?: number;
    type?: number;
    rating?: number;
    usn?: number;
  }

  let busy = false;
  let status = '';
  let error = '';
  let endpoint = 'http://127.0.0.1:8765';

  onMount(() => {
    endpoint = window.localStorage.getItem('anki-connect-endpoint') || endpoint;
  });

  async function anki<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch('/api/anki-connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: endpoint.replace(/\/$/, ''), action, version: 6, params }),
    });
    if (!response.ok) throw new Error(`AnkiConnect returned HTTP ${response.status}.`);
    const payload = (await response.json()) as { result: T; error: string | null };
    if (payload.error) throw new Error(payload.error);
    return payload.result;
  }

  function chunks<T>(items: T[], size: number): T[][] {
    const output: T[][] = [];
    for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
    return output;
  }

  async function sync() {
    busy = true;
    status = 'Connecting to Anki…';
    error = '';
    try {
      window.localStorage.setItem('anki-connect-endpoint', endpoint.replace(/\/$/, ''));
      const decks = (await anki<string[]>('deckNames')).sort((a, b) => b.split('::').length - a.split('::').length);
      const reviews: Array<{ reviewId: string; deck: string; reviewedAt: string; timeMs: number; rating?: number; cardId: string }> = [];
      const seenReviews = new Set<string>();

      for (const deck of decks) {
        status = `Reading ${deck}…`;
        const cardIds = await anki<number[]>('findCards', { query: `deck:"${deck.replaceAll('"', '')}"` });
        for (const cardChunk of chunks(cardIds, 200)) {
          const result = await anki<Record<string, AnkiReview[]>>('getReviewsOfCards', { cards: cardChunk });
          for (const [cardId, cardReviews] of Object.entries(result)) {
            for (const [index, review] of cardReviews.entries()) {
              const timestamp = review.id < 1_000_000_000_000 ? review.id * 1000 : review.id;
              const reviewKey = `${cardId}:${timestamp}:${review.usn ?? index}:${review.type ?? 0}:${review.time ?? 0}`;
              if (seenReviews.has(reviewKey)) continue;
              seenReviews.add(reviewKey);
              reviews.push({
                reviewId: reviewKey,
                deck,
                reviewedAt: new Date(timestamp).toISOString(),
                timeMs: Number(review.time) || 0,
                rating: review.rating ?? review.ease,
                cardId,
              });
            }
          }
        }
      }

      let imported = 0;
      let duplicates = 0;
      const reviewChunks = chunks(reviews, 5000);
      for (const [index, reviewChunk] of reviewChunks.entries()) {
        status = `Saving batch ${index + 1}/${reviewChunks.length}…`;
        const response = await fetch('/api/anki-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviews: reviewChunk }),
        });
        const result = (await response.json()) as { imported?: number; duplicates?: number; error?: string };
        if (!response.ok) throw new Error(result.error || 'The server rejected the Anki sync.');
        imported += result.imported ?? 0;
        duplicates += result.duplicates ?? 0;
      }
      window.sessionStorage.setItem('immersion-toast', `Anki sync complete: ${imported} new events, ${duplicates} duplicates skipped.`);
      window.location.reload();
    } catch (caught) {
      error = caught instanceof TypeError
        ? `Could not reach ${endpoint}. Check the host, port, AnkiConnect CORS settings, and that Anki is running.`
        : caught instanceof Error
          ? `${caught.message} Check the AnkiConnect endpoint and CORS settings.`
        : 'Could not sync Anki.';
      status = '';
    } finally {
      busy = false;
    }
  }
</script>

<div class="relative flex items-center gap-2">
  <button
    type="button"
    class="rounded-full border border-slate-200 bg-white px-4 py-2 text-base font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white dark:focus:ring-slate-500 dark:focus:ring-offset-slate-950"
    disabled={busy}
    on:click={sync}
  >
    {busy ? 'Syncing Anki…' : 'Sync Anki'}
  </button>
  <details class="relative text-xs text-slate-500 dark:text-slate-400">
    <summary class="cursor-pointer list-none rounded-full border border-slate-200 px-2 py-2 hover:text-slate-900 dark:border-slate-700 dark:hover:text-white" title="Configure AnkiConnect">⚙</summary>
    <div class="absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <label class="block text-xs font-medium text-slate-600 dark:text-slate-300" for="anki-endpoint">AnkiConnect endpoint</label>
      <input id="anki-endpoint" bind:value={endpoint} class="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" placeholder="http://127.0.0.1:8765" />
      <p class="mt-2 leading-4">The endpoint is saved in this browser. AnkiConnect must allow this dashboard origin through <code>webCorsOrigin</code>.</p>
    </div>
  </details>
  {#if error}
    <p class="absolute right-0 top-full z-20 mt-2 w-72 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 shadow-lg dark:border-rose-900/60 dark:bg-rose-950/90 dark:text-rose-300">{error}</p>
  {:else if status}
    <p class="absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{status}</p>
  {/if}
</div>
