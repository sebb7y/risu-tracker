<script lang="ts">
  export interface MonthBarSegment {
    color: string;
    pct: number;
  }

  export interface MonthRow {
    key: string;
    label: string;
    total: number;
    barWidth: string;
    hoverDetails: string;
    barSegments: MonthBarSegment[];
  }

  export let months: MonthRow[] = [];
  export let visibleCount = 6;

  let expanded = false;
  let visibleMonths: MonthRow[] = [];

  function toggleExpanded() {
    expanded = !expanded;
  }

  $: visibleMonths = expanded ? months : months.slice(0, visibleCount);
</script>

<div class="space-y-3">
  {#each visibleMonths as month}
    <div class="grid grid-cols-[8rem_minmax(0,1fr)_5rem] items-center gap-3">
      <p class="text-sm text-slate-600 dark:text-slate-300">{month.label}</p>
      <div title={month.hoverDetails} class="h-6 rounded-md bg-slate-100 dark:bg-slate-800">
        <div class="flex h-full overflow-hidden rounded-md" style={`width:${month.barWidth}`}>
          {#each month.barSegments as segment}
            <span class={segment.color} style={`width:${segment.pct}%`} />
          {/each}
        </div>
      </div>
      <p class="w-[5rem] text-right tabular-nums text-sm font-medium text-slate-700 dark:text-slate-200">{Math.round(month.total)} pts</p>
    </div>
  {/each}
</div>

{#if months.length > visibleCount}
  <div class="mt-3 flex justify-end">
    <button
      type="button"
      class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 underline-offset-2 transition-colors hover:text-slate-700 hover:underline focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:text-slate-400 dark:hover:text-slate-200 dark:focus:ring-slate-500 dark:focus:ring-offset-slate-900"
      on:click={toggleExpanded}
      aria-expanded={expanded}
    >
      {expanded ? 'Show fewer months' : `Show more months (${months.length - visibleCount})`}
    </button>
  </div>
{/if}
