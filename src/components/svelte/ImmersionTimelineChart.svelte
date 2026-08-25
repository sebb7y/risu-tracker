<script lang="ts">
  import { onMount } from 'svelte';

  export interface ChartDay {
    date: string;
    values: Record<string, { points: number; hours: number }>;
  }

  export interface ChartSeries {
    key: string;
    label: string;
    color: string;
    group?: string;
    deck?: string;
  }

  export let days: ChartDay[] = [];
  export let series: ChartSeries[] = [];

  type Range = '30' | '90' | '180' | 'all';
  type Scale = 'hours' | 'points';
  type Mode = 'cumulative' | 'daily';
  type ComponentAction = 'show' | 'hide' | 'merge';

  const chartWidth = 960;
  const chartHeight = 390;
  const padding = { top: 20, right: 20, bottom: 48, left: 58 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  let range: Range = 'all';
  let scale: Scale = 'hours';
  let mode: Mode = 'cumulative';
  let splitAnkiByDeck = false;
  let minimumHours = 0;
  let componentActions: Record<string, ComponentAction> = {};
  let mergeTargets: Record<string, string> = {};
  let compounds: ChartSeries[] = [];
  let compoundName = '';
  let enabled: Record<string, boolean> = {};
  let container: HTMLDivElement;
  let hoveredIndex: number | null = null;
  let containerWidth = 0;

  $: if (series.length && Object.keys(enabled).length === 0) {
    enabled = Object.fromEntries(series.map((item) => [item.key, true]));
  }
  $: if (series.length && Object.keys(componentActions).length === 0) {
    componentActions = Object.fromEntries(series.map((item) => [item.key, 'show']));
  }

  $: visibleDays = getVisibleDays(days, range);
  $: displaySeries = series.filter((item) => item.group !== 'anki' || (splitAnkiByDeck ? item.key !== 'anki' : item.key === 'anki'));
  $: configured = configureSeries(visibleDays, displaySeries, componentActions, mergeTargets, compounds);
  $: prepared = collapseSmallSeries(configured.days, configured.series, Number(minimumHours) || 0);
  $: chartSeries = prepared.series;
  $: chart = buildChart(prepared.days, chartSeries, scale, mode);
  $: hoveredDay = hoveredIndex === null ? null : prepared.days[hoveredIndex] ?? null;

  onMount(() => {
    const resize = () => {
      containerWidth = container?.clientWidth ?? 0;
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (container) observer.observe(container);
    return () => observer.disconnect();
  });

  function getVisibleDays(input: ChartDay[], selectedRange: Range): ChartDay[] {
    if (selectedRange === 'all') return input;
    const count = Number(selectedRange);
    return input.slice(Math.max(0, input.length - count));
  }

  function buildChart(input: ChartDay[], active: ChartSeries[], selectedScale: Scale, selectedMode: Mode) {
    const rows = input.map((day) => {
      const values = active.map((item) => {
        const source = day.values[item.key] ?? { points: 0, hours: 0 };
        return selectedScale === 'hours' ? source.hours : source.points;
      });
      return { date: day.date, values };
    });

    if (selectedMode === 'cumulative') {
      const totals = active.map(() => 0);
      for (const row of rows) {
        row.values = row.values.map((value, index) => {
          totals[index] += value;
          return totals[index];
        });
      }
    }

    const stacks = rows.map((row) => {
      let total = 0;
      return row.values.map((value) => {
        const bottom = total;
        total += value;
        return { bottom, top: total };
      });
    });
    const max = Math.max(1, ...stacks.map((row) => row.at(-1)?.top ?? 0));
    const tickStep = niceStep(max / 4);
    const yMax = Math.max(tickStep, Math.ceil(max / tickStep) * tickStep);

    const areas = active.map((item, seriesIndex) => {
      const top = stacks.map((stack, index) => point(index, stack[seriesIndex]?.top ?? 0, rows.length, yMax));
      const bottom = stacks
        .map((stack, index) => point(index, stack[seriesIndex]?.bottom ?? 0, rows.length, yMax))
        .reverse();
      const path = [...top, ...bottom].map((coordinate, index) => `${index === 0 ? 'M' : 'L'}${coordinate.x},${coordinate.y}`).join(' ') + ' Z';
      return { ...item, path };
    });

    return {
      areas,
      yMax,
      ticks: Array.from({ length: Math.floor(yMax / tickStep) + 1 }, (_, index) => index * tickStep),
      rows,
    };
  }

  function collapseSmallSeries(input: ChartDay[], active: ChartSeries[], threshold: number): { days: ChartDay[]; series: ChartSeries[] } {
    if (threshold <= 0 || !input.length) return { days: input, series: active };
    const smallKeys = new Set(
      active
        .filter((item) => item.key !== 'other')
        .filter((item) => input.reduce((total, day) => total + (day.values[item.key]?.hours ?? 0), 0) < threshold)
        .map((item) => item.key),
    );
    if (!smallKeys.size) return { days: input, series: active };

    const hasOther = active.some((item) => item.key === 'other');
    const outputSeries = active.filter((item) => !smallKeys.has(item.key));
    if (!hasOther) outputSeries.push({ key: 'other', label: 'Other', color: '#64748b' });

    const outputDays = input.map((day) => {
      const values = Object.fromEntries(Object.entries(day.values).map(([key, value]) => [key, { ...value }])) as ChartDay['values'];
      const collapsed = [...smallKeys].reduce((total, key) => {
        const value = values[key];
        if (!value) return total;
        delete values[key];
        return { points: total.points + value.points, hours: total.hours + value.hours };
      }, { points: 0, hours: 0 });
      const existing = values.other ?? { points: 0, hours: 0 };
      values.other = { points: existing.points + collapsed.points, hours: existing.hours + collapsed.hours };
      return { ...day, values };
    });
    return { days: outputDays, series: outputSeries };
  }

  function configureSeries(input: ChartDay[], available: ChartSeries[], actions: Record<string, ComponentAction>, targets: Record<string, string>, compoundSeries: ChartSeries[]): { days: ChartDay[]; series: ChartSeries[] } {
    const targetSeries = new Map<string, ChartSeries>(available.map((item) => [item.key, item]));
    for (const item of compoundSeries) targetSeries.set(item.key, item);
    if (!targetSeries.has('other')) targetSeries.set('other', { key: 'other', label: 'Other', color: '#64748b' });

    const outputKeys = new Set<string>();
    const mergedValues = new Map<string, Record<string, { points: number; hours: number }>>();
    for (const item of available) {
      const action = actions[item.key] ?? 'show';
      const target = action === 'merge' ? (targets[item.key] || 'other') : item.key;
      if (action === 'hide') continue;
      outputKeys.add(target);
      if (!mergedValues.has(target)) mergedValues.set(target, {});
      const targetValues = mergedValues.get(target)!;
      for (const day of input) {
        const value = day.values[item.key] ?? { points: 0, hours: 0 };
        const current = targetValues[day.date] ?? { points: 0, hours: 0 };
        targetValues[day.date] = { points: current.points + value.points, hours: current.hours + value.hours };
      }
    }

    const outputSeries = [...outputKeys]
      .map((key) => targetSeries.get(key))
      .filter((item): item is ChartSeries => Boolean(item));
    const outputDays = input.map((day) => ({
      ...day,
      values: Object.fromEntries(outputSeries.map((item) => [item.key, mergedValues.get(item.key)?.[day.date] ?? { points: 0, hours: 0 }])),
    }));
    return { days: outputDays, series: outputSeries };
  }

  function niceStep(value: number): number {
    const magnitude = 10 ** Math.floor(Math.log10(Math.max(value, 0.01)));
    const normalized = value / magnitude;
    const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
  }

  function point(index: number, value: number, count: number, yMax: number) {
    const x = count <= 1 ? padding.left + plotWidth / 2 : padding.left + (index / (count - 1)) * plotWidth;
    const y = padding.top + plotHeight - (value / yMax) * plotHeight;
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  }

  function y(value: number): number {
    return padding.top + plotHeight - (value / chart.yMax) * plotHeight;
  }

  function x(index: number): number {
    return visibleDays.length <= 1 ? padding.left + plotWidth / 2 : padding.left + (index / (visibleDays.length - 1)) * plotWidth;
  }

  function formatValue(value: number): string {
    return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${scale === 'hours' ? 'h' : 'pts'}`;
  }

  function formatDate(value: string): string {
    return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function toggle(key: string) {
    enabled = { ...enabled, [key]: !enabled[key] };
  }

  function setAction(key: string, action: ComponentAction) {
    componentActions = { ...componentActions, [key]: action };
    if (action === 'merge' && !mergeTargets[key]) mergeTargets = { ...mergeTargets, [key]: 'other' };
  }

  function addCompound() {
    const label = compoundName.trim();
    if (!label) return;
    const key = `compound_${Date.now()}`;
    compounds = [...compounds, { key, label, color: `hsl(${(compounds.length * 67 + 190) % 360} 70% 55%)` }];
    compoundName = '';
  }

  function handleMouseMove(event: MouseEvent) {
    if (!visibleDays.length) return;
    const target = event.currentTarget as SVGRectElement;
    const bounds = target.getBoundingClientRect();
    const relative = (event.clientX - bounds.left) / bounds.width;
    hoveredIndex = Math.max(0, Math.min(visibleDays.length - 1, Math.round(relative * (visibleDays.length - 1))));
  }
</script>

<div bind:this={container} class="space-y-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h2 class="text-xl font-semibold">Immersion timeline</h2>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{mode === 'cumulative' ? 'Accumulated activity over time' : 'Activity logged each day'}</p>
    </div>
    <details class="relative text-sm">
      <summary class="cursor-pointer list-none rounded-lg border border-slate-200 px-3 py-2 text-slate-600 transition hover:text-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:text-white">⚙ Settings</summary>
      <div class="absolute right-0 z-30 mt-2 w-[min(92vw,34rem)] space-y-4 rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div>
          <p class="font-semibold text-slate-800 dark:text-slate-100">Date range</p>
          <div class="mt-2 flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            {#each ['30', '90', '180', 'all'] as option}
              <button type="button" class:active-control={range === option} class="flex-1 rounded-md px-2 py-1.5 text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100" on:click={() => (range = option as Range)}>{option === 'all' ? 'All' : `${option}d`}</button>
            {/each}
          </div>
        </div>

        <div class="grid gap-2 sm:grid-cols-2">
          <label class="space-y-1"><span class="block font-semibold text-slate-800 dark:text-slate-100">Y-axis</span><select bind:value={scale} class="w-full rounded-lg border border-slate-200 bg-transparent px-2 py-2 dark:border-slate-700"><option value="hours">Hours equivalent</option><option value="points">Points</option></select></label>
          <label class="space-y-1"><span class="block font-semibold text-slate-800 dark:text-slate-100">Chart mode</span><select bind:value={mode} class="w-full rounded-lg border border-slate-200 bg-transparent px-2 py-2 dark:border-slate-700"><option value="cumulative">Cumulative stacked</option><option value="daily">Daily stacked</option></select></label>
        </div>

        {#if series.some((item) => item.group === 'anki' && item.key !== 'anki')}
          <label class="flex items-center gap-2"><input type="checkbox" bind:checked={splitAnkiByDeck} /> Split Anki into deck components</label>
        {/if}

        <label class="flex items-center gap-2"><span>Merge components below</span><input bind:value={minimumHours} type="number" min="0" step="0.5" class="w-16 rounded-lg border border-slate-200 bg-transparent px-2 py-1.5 text-right dark:border-slate-700" /><span>hours into Other</span></label>

        <div class="border-t border-slate-200 pt-3 dark:border-slate-700">
          <p class="font-semibold text-slate-800 dark:text-slate-100">Component configuration</p>
          <div class="mt-2 max-h-56 space-y-2 overflow-y-auto">
            {#each displaySeries as item}
              <div class="grid grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)] items-center gap-2">
                <span class="truncate" title={item.label}>{item.label}</span>
                <select value={componentActions[item.key] ?? 'show'} class="rounded-md border border-slate-200 bg-transparent px-1.5 py-1.5 dark:border-slate-700" on:change={(event) => setAction(item.key, (event.currentTarget as HTMLSelectElement).value as ComponentAction)}>
                  <option value="show">Show</option><option value="hide">Hide</option><option value="merge">Merge into</option>
                </select>
                {#if (componentActions[item.key] ?? 'show') === 'merge'}
                  <select value={mergeTargets[item.key] ?? 'other'} class="min-w-0 rounded-md border border-slate-200 bg-transparent px-1.5 py-1.5 dark:border-slate-700" on:change={(event) => (mergeTargets = { ...mergeTargets, [item.key]: (event.currentTarget as HTMLSelectElement).value })}>
                    <option value="other">Other</option>
                    {#each displaySeries.filter((target) => target.key !== item.key) as target}<option value={target.key}>{target.label}</option>{/each}
                    {#each compounds as compound}<option value={compound.key}>{compound.label}</option>{/each}
                  </select>
                {:else}<span />{/if}
              </div>
            {/each}
          </div>
        </div>

        <div class="flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <input bind:value={compoundName} placeholder="New compound component" class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-transparent px-2 py-1.5 dark:border-slate-700" />
          <button type="button" class="rounded-lg border border-slate-200 px-3 py-1.5 font-medium dark:border-slate-700" on:click={addCompound}>Create</button>
        </div>
      </div>
    </details>
  </div>

  <div class="flex flex-wrap gap-x-4 gap-y-2 text-xs">
    {#each chartSeries as item}
      <button type="button" class="inline-flex items-center gap-1.5 text-slate-600 transition hover:text-slate-950 dark:text-slate-300 dark:hover:text-white" on:click={() => setAction(item.key, 'hide')}>
        <span class="h-2.5 w-2.5 rounded-full" style={`background:${item.color}`} />
        {item.label}
      </button>
    {/each}
  </div>

  {#if visibleDays.length && chartSeries.length}
    <div class="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/30" style={`min-height:${containerWidth < 640 ? 280 : 390}px`}>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} class="block h-auto min-h-[280px] w-full" role="img" aria-label="Interactive immersion timeline chart">
        {#each chart.ticks as tick}
          <line x1={padding.left} x2={chartWidth - padding.right} y1={y(tick)} y2={y(tick)} stroke="currentColor" stroke-opacity="0.1" />
          <text x={padding.left - 10} y={y(tick) + 4} text-anchor="end" class="fill-slate-400 text-[11px] dark:fill-slate-500">{tick.toLocaleString('en-US', { maximumFractionDigits: 1 })}</text>
        {/each}
        {#each chart.areas as area}
          <path d={area.path} fill={area.color} fill-opacity="0.72" stroke={area.color} stroke-width="1.2" stroke-opacity="0.9" />
        {/each}
        <line x1={padding.left} x2={chartWidth - padding.right} y1={chartHeight - padding.bottom} y2={chartHeight - padding.bottom} stroke="currentColor" stroke-opacity="0.2" />
        {#if visibleDays.length}
          <text x={padding.left} y={chartHeight - 17} class="fill-slate-400 text-[11px] dark:fill-slate-500">{formatDate(visibleDays[0].date)}</text>
          <text x={chartWidth - padding.right} y={chartHeight - 17} text-anchor="end" class="fill-slate-400 text-[11px] dark:fill-slate-500">{formatDate(visibleDays.at(-1)!.date)}</text>
        {/if}
        {#if hoveredIndex !== null}
          <line x1={x(hoveredIndex)} x2={x(hoveredIndex)} y1={padding.top} y2={chartHeight - padding.bottom} stroke="currentColor" stroke-opacity="0.45" stroke-dasharray="4 4" />
        {/if}
        <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="transparent" on:mousemove={handleMouseMove} on:mouseleave={() => (hoveredIndex = null)} />
      </svg>

      {#if hoveredDay && hoveredIndex !== null}
        <div class="pointer-events-none absolute right-3 top-3 w-52 rounded-lg border border-slate-200 bg-white/95 p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900/95">
          <p class="font-semibold text-slate-900 dark:text-slate-100">{formatDate(hoveredDay.date)}</p>
          <div class="mt-2 space-y-1">
            {#each chartSeries as item, index}
              <div class="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300"><span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full" style={`background:${item.color}`} />{item.label}</span><span class="tabular-nums">{formatValue(chart.rows[hoveredIndex].values[index])}</span></div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="rounded-xl border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Enable at least one series to display the timeline.</div>
  {/if}
</div>

<style>
  :global(.active-control) {
    background: rgb(15 23 42);
    color: white;
  }

  :global(.dark .active-control) {
    background: rgb(226 232 240);
    color: rgb(15 23 42);
  }
</style>
