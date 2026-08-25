<script lang="ts">
  export interface HeatmapCell {
    dateKey: string;
    points: number;
    inYear: boolean;
  }

  export interface HeatmapWeek {
    cells: HeatmapCell[];
  }

  export interface YearHeatmap {
    year: number;
    weeks: HeatmapWeek[];
    monthLabels: (string | null)[];
    monthStarts: boolean[];
    maxPoints: number;
  }

  export let focus: YearHeatmap;
  export let otherYears: YearHeatmap[] = [];

  let expanded = false;

  /** Instant tooltip (native `title` is slow and feels laggy). */
  let tip: { text: string; x: number; y: number } | null = null;

  const GAP = 'gap-[3px]';
  const LEGEND_CELL = 'h-3.5 w-3.5 shrink-0 rounded-[2px]';
  const FILL_CELL =
    'aspect-square w-full min-h-0 rounded-[2px] border box-border [image-rendering:crisp-edges]';

  function formatPoints(n: number): string {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);
  }

  /** 0 = no activity; 1–4 = discrete bands (solid colors). */
  function activityLevel(points: number, maxPoints: number): number {
    if (points <= 0) return 0;
    if (maxPoints <= 0) return 1;
    const r = points / maxPoints;
    if (r <= 0.25) return 1;
    if (r <= 0.5) return 2;
    if (r <= 0.75) return 3;
    return 4;
  }

  function levelPaint(level: number): string {
    switch (level) {
      case 0:
        return 'border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-800';
      case 1:
        return 'border-emerald-500/70 bg-emerald-300 dark:border-emerald-700 dark:bg-emerald-800';
      case 2:
        return 'border-emerald-600 bg-emerald-500 dark:border-emerald-600 dark:bg-emerald-600';
      case 3:
        return 'border-emerald-700 bg-emerald-600 dark:border-emerald-700 dark:bg-emerald-500';
      case 4:
      default:
        return 'border-emerald-800 bg-emerald-800 dark:border-emerald-500 dark:bg-emerald-400';
    }
  }

  function cellClass(cell: HeatmapCell, maxPoints: number): string {
    if (!cell.inYear) {
      return `${FILL_CELL} border-slate-100 bg-transparent dark:border-slate-800/40`;
    }
    const lvl = activityLevel(cell.points, maxPoints);
    return `${FILL_CELL} ${levelPaint(lvl)}`;
  }

  function legendClass(level: number): string {
    return `${LEGEND_CELL} border box-border ${levelPaint(level)}`;
  }

  function showTip(e: MouseEvent, cell: HeatmapCell) {
    if (!cell.inYear) return;
    tip = {
      text: `${cell.dateKey}\n${formatPoints(cell.points)} pts`,
      x: e.clientX,
      y: e.clientY,
    };
  }

  function moveTip(e: MouseEvent) {
    if (!tip) return;
    tip = { ...tip, x: e.clientX, y: e.clientY };
  }

  function hideTip() {
    tip = null;
  }

  function toggleExpanded() {
    expanded = !expanded;
    hideTip();
  }

  const legendLevels = [0, 1, 2, 3, 4] as const;
</script>

<svelte:window onscroll={hideTip} />

<div class="relative w-full max-w-full space-y-6">
  {#if tip}
    <div
      role="tooltip"
      class="pointer-events-none fixed z-[100] max-w-[240px] whitespace-pre-line rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg ring-1 ring-black/5 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:ring-white/10"
      style:left="{tip.x + 12}px"
      style:top="{tip.y + 14}px"
    >
      {tip.text}
    </div>
  {/if}

  {#snippet heatmapYear(y: YearHeatmap)}
    <div class="grid w-full min-w-0 max-w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
      <div></div>
      <div class="flex min-w-0 {GAP}">
        {#each y.monthLabels as label}
          <div class="flex min-w-0 flex-1 basis-0 justify-start overflow-visible">
            <span class="whitespace-nowrap text-[10px] leading-none text-slate-500 dark:text-slate-400">{label ?? ''}</span>
          </div>
        {/each}
      </div>

      <div class="flex min-w-[2.25rem] shrink-0 flex-col justify-between py-0.5 text-[10px] leading-none text-slate-500 dark:text-slate-400">
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
        <span>Sun</span>
      </div>

      <div class="flex min-w-0 max-w-full {GAP}">
        {#each y.weeks as week}
          <div class="flex min-w-0 flex-1 basis-0 flex-col {GAP}">
            {#each week.cells as cell}
              <div
                role="presentation"
                class="{cellClass(
                  cell,
                  y.maxPoints,
                )} transition-shadow hover:z-10 hover:shadow-[0_0_0_2px_rgba(16,185,129,0.55)] dark:hover:shadow-[0_0_0_2px_rgba(52,211,153,0.45)]"
                onmouseenter={(e) => showTip(e, cell)}
                onmousemove={(e) => moveTip(e)}
                onmouseleave={hideTip}
              />
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/snippet}

  <div class="w-full min-w-0">
    <div class="mb-3">
      <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">{focus.year}</h3>
    </div>

    {@render heatmapYear(focus)}

    <div class="mt-3 flex flex-wrap items-center justify-end gap-2 text-xs text-slate-500 dark:text-slate-400">
      <span>Less</span>
      {#each legendLevels as lvl}
        <span class={legendClass(lvl)}></span>
      {/each}
      <span>More</span>
    </div>
  </div>

  {#if otherYears.length > 0}
    <div class="flex justify-end -mt-1">
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 underline-offset-2 transition-colors hover:text-slate-700 hover:underline focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:text-slate-400 dark:hover:text-slate-200 dark:focus:ring-slate-500 dark:focus:ring-offset-slate-900"
        onclick={toggleExpanded}
        aria-expanded={expanded}
      >
        {expanded ? 'Hide earlier years' : `Show earlier years (${otherYears.length})`}
      </button>
    </div>

    {#if expanded}
      <div class="space-y-8 border-t border-slate-200 pt-6 dark:border-slate-800">
        {#each otherYears as y}
          <div>
            <div class="mb-3">
              <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">{y.year}</h3>
            </div>
            {@render heatmapYear(y)}
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
