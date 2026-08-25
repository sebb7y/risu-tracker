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
  const chartHeight = 460;
  const padding = { top: 24, right: 24, bottom: 62, left: 72 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  let range: Range = 'all';
  let scale: Scale = 'hours';
  let mode: Mode = 'cumulative';
  let splitAnkiByDeck = false;
  let minimumHours = 0;
  let showPercentages = true;
  let componentActions: Record<string, ComponentAction> = {};
  let mergeTargets: Record<string, string> = {};
  let compounds: ChartSeries[] = [];
  let compoundName = '';
  let hydrated = false;
  let enabled: Record<string, boolean> = {};
  let hoveredIndex: number | null = null;

  $: if (series.length && Object.keys(enabled).length === 0) {
    enabled = Object.fromEntries(series.map((item) => [item.key, true]));
  }
  $: if (series.length && Object.keys(componentActions).length === 0) {
    componentActions = Object.fromEntries(series.map((item) => [item.key, 'show']));
  }

  $: visibleDays = getVisibleDays(days, range);
  $: displaySeries = [...series.filter((item) => item.group !== 'anki' || (splitAnkiByDeck ? item.key !== 'anki' : item.key === 'anki'))]
    .sort((left, right) => left.key === 'other' ? 1 : right.key === 'other' ? -1 : 0);
  $: configured = configureSeries(visibleDays, displaySeries, componentActions, mergeTargets, compounds);
  $: prepared = collapseSmallSeries(configured.days, configured.series, Number(minimumHours) || 0);
  $: chartSeries = prepared.series;
  $: chart = buildChart(prepared.days, chartSeries, scale, mode);
  $: pieSlices = buildPieSlices(prepared.days, chartSeries);
  $: hoveredDay = hoveredIndex === null ? null : prepared.days[hoveredIndex] ?? null;
  $: hoveredTotal = hoveredIndex === null || !chart.rows[hoveredIndex] ? 0 : chart.rows[hoveredIndex].values.reduce((total, value) => total + value, 0);

  onMount(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('risu-timeline-config') ?? '{}') as {
        range?: Range; mode?: Mode; splitAnkiByDeck?: boolean; minimumHours?: number; showPercentages?: boolean;
        componentActions?: Record<string, ComponentAction>; mergeTargets?: Record<string, string>; compounds?: ChartSeries[];
      };
      if (saved.range) range = saved.range;
      if (saved.mode) mode = saved.mode;
      if (typeof saved.splitAnkiByDeck === 'boolean') splitAnkiByDeck = saved.splitAnkiByDeck;
      if (typeof saved.minimumHours === 'number') minimumHours = saved.minimumHours;
      if (typeof saved.showPercentages === 'boolean') showPercentages = saved.showPercentages;
      if (saved.componentActions) componentActions = saved.componentActions;
      if (saved.mergeTargets) mergeTargets = saved.mergeTargets;
      if (saved.compounds) compounds = saved.compounds;
    } catch {
      // Ignore malformed local configuration.
    }
    hydrated = true;
  });

  $: if (hydrated) {
    window.localStorage.setItem('risu-timeline-config', JSON.stringify({ range, mode, splitAnkiByDeck, minimumHours, showPercentages, componentActions, mergeTargets, compounds }));
  }

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
    // Keep the data scale stable while resizing; only the plot's vertical
    // spacing should change when the container height changes.
    const tickStep = niceStep(max / 6);
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
      xTicks: input.length <= 1
        ? [{ index: 0, label: input[0]?.date ?? '' }]
        : Array.from({ length: Math.min(4, input.length) }, (_, index) => {
          const tickCount = Math.min(4, input.length);
          const tickIndex = Math.round((index / (tickCount - 1)) * (input.length - 1));
          return { index: tickIndex, label: input[tickIndex].date };
        }).filter((tick, index, ticks) => index === ticks.findIndex((candidate) => candidate.index === tick.index)),
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
      .filter((item): item is ChartSeries => Boolean(item))
      .sort((left, right) => left.key === 'other' ? 1 : right.key === 'other' ? -1 : 0);
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

  function formatAxisDate(value: string): string {
    return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  function buildPieSlices(input: ChartDay[], active: ChartSeries[]) {
    const totals = active.map((item) => ({ item, hours: input.reduce((total, day) => total + (day.values[item.key]?.hours ?? 0), 0) }));
    const totalHours = totals.reduce((total, slice) => total + slice.hours, 0);
    if (totalHours <= 0) return [];
    const circumference = 2 * Math.PI * 70;
    let consumed = 0;
    return totals.filter((slice) => slice.hours > 0).map((slice) => {
      const percentage = slice.hours / totalHours;
      const result = {
        ...slice,
        percentage,
        totalHours,
        dash: `${percentage * circumference} ${circumference}`,
        offset: -consumed * circumference,
      };
      consumed += percentage;
      return result;
    });
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

<div class="space-y-4">
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
          <label class="space-y-1"><span class="block font-semibold text-slate-800 dark:text-slate-100">Y-axis</span><p class="rounded-lg border border-slate-200 px-2 py-2 text-slate-600 dark:border-slate-700 dark:text-slate-300">Hours equivalent</p></label>
          <label class="space-y-1"><span class="block font-semibold text-slate-800 dark:text-slate-100">Chart mode</span><select bind:value={mode} class="w-full rounded-lg border border-slate-200 bg-transparent px-2 py-2 dark:border-slate-700"><option value="cumulative">Cumulative stacked</option><option value="daily">Daily stacked</option></select></label>
        </div>

        {#if series.some((item) => item.group === 'anki' && item.key !== 'anki')}
          <label class="flex items-center gap-2"><input type="checkbox" bind:checked={splitAnkiByDeck} /> Split Anki into deck components</label>
        {/if}

        <label class="flex items-center gap-2"><span>Merge components below</span><input bind:value={minimumHours} type="number" min="0" step="0.5" class="w-16 rounded-lg border border-slate-200 bg-transparent px-2 py-1.5 text-right dark:border-slate-700" /><span>hours into Other</span></label>
        <label class="flex items-center gap-2"><input type="checkbox" bind:checked={showPercentages} /> Show percentages in hover details</label>

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
    <div class="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/30">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} class="block h-auto w-full" role="img" aria-label="Interactive immersion timeline chart">
        {#each chart.ticks as tick}
          <line x1={padding.left} x2={chartWidth - padding.right} y1={y(tick)} y2={y(tick)} stroke="currentColor" stroke-opacity={tick === 0 ? '0.2' : '0.1'} stroke-dasharray={tick === 0 ? undefined : '2 6'} />
          <line x1={padding.left - 6} x2={padding.left} y1={y(tick)} y2={y(tick)} stroke="currentColor" stroke-opacity="0.25" />
          <text x={padding.left - 12} y={y(tick) + 4} text-anchor="end" class="fill-slate-500 text-[11px] font-medium dark:fill-slate-400">{tick.toLocaleString('en-US', { maximumFractionDigits: 1 })}h</text>
        {/each}
        <text x={padding.left} y={padding.top - 9} class="fill-slate-400 text-[10px] font-semibold uppercase tracking-[0.16em] dark:fill-slate-500">Hours</text>
        {#each chart.xTicks as tick}
          <line x1={x(tick.index)} x2={x(tick.index)} y1={padding.top} y2={chartHeight - padding.bottom} stroke="currentColor" stroke-opacity="0.055" />
          <line x1={x(tick.index)} x2={x(tick.index)} y1={chartHeight - padding.bottom} y2={chartHeight - padding.bottom + 6} stroke="currentColor" stroke-opacity="0.25" />
          <text x={x(tick.index)} y={chartHeight - 26} text-anchor={tick.index === 0 ? 'start' : tick.index === visibleDays.length - 1 ? 'end' : 'middle'} class="fill-slate-500 text-[11px] font-medium dark:fill-slate-400">{formatAxisDate(tick.label)}</text>
        {/each}
        {#each chart.areas as area}
          <path d={area.path} fill={area.color} fill-opacity="0.72" stroke={area.color} stroke-width="1.2" stroke-opacity="0.9" />
        {/each}
        <line x1={padding.left} x2={chartWidth - padding.right} y1={chartHeight - padding.bottom} y2={chartHeight - padding.bottom} stroke="currentColor" stroke-opacity="0.25" />
        {#if hoveredIndex !== null}
          <line x1={x(hoveredIndex)} x2={x(hoveredIndex)} y1={padding.top} y2={chartHeight - padding.bottom} stroke="currentColor" stroke-opacity="0.45" stroke-dasharray="4 4" />
        {/if}
        <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} fill="transparent" on:mousemove={handleMouseMove} on:mouseleave={() => (hoveredIndex = null)} />
      </svg>

      {#if hoveredDay && hoveredIndex !== null}
        <div class="pointer-events-none absolute right-3 top-3 w-52 rounded-lg border border-slate-200 bg-white/95 p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900/95">
          <p class="font-semibold text-slate-900 dark:text-slate-100">{formatDate(hoveredDay.date)}</p>
          <p class="mt-1 border-b border-slate-200 pb-2 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:text-slate-100">Total · {formatValue(hoveredTotal)}</p>
          <div class="mt-2 space-y-1">
            {#each chartSeries as item, index}
              <div class="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300"><span class="flex min-w-0 items-center gap-1.5 truncate"><span class="h-2 w-2 shrink-0 rounded-full" style={`background:${item.color}`} />{item.label}</span><span class="shrink-0 text-right"><span class="tabular-nums">{formatValue(chart.rows[hoveredIndex].values[index])}</span>{#if showPercentages}<span class="ml-1 text-[10px] text-slate-400 dark:text-slate-500">{hoveredTotal ? `${((chart.rows[hoveredIndex].values[index] / hoveredTotal) * 100).toFixed(0)}%` : '0%'}</span>{/if}</span></div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
    {#if pieSlices.length}
      <details class="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <summary class="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Component breakdown</summary>
        <div class="grid items-center gap-5 border-t border-slate-200 px-4 py-4 dark:border-slate-800 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <svg viewBox="0 0 220 220" class="mx-auto h-44 w-44" role="img" aria-label="Component breakdown donut chart">
            <circle cx="110" cy="110" r="70" fill="none" stroke="currentColor" stroke-opacity="0.08" stroke-width="32" />
            {#each pieSlices as slice}
              <circle cx="110" cy="110" r="70" fill="none" stroke={slice.item.color} stroke-width="32" stroke-dasharray={slice.dash} stroke-dashoffset={slice.offset} stroke-linecap="butt" transform="rotate(-90 110 110)" />
            {/each}
            <circle cx="110" cy="110" r="51" class="fill-white dark:fill-slate-900" />
            <text x="110" y="105" text-anchor="middle" class="fill-slate-900 text-[18px] font-semibold dark:fill-slate-100">{formatValue(pieSlices[0].totalHours)}</text>
            <text x="110" y="124" text-anchor="middle" class="fill-slate-400 text-[9px] font-semibold uppercase tracking-[0.16em] dark:fill-slate-500">visible total</text>
          </svg>
          <div class="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {#each pieSlices as slice}
              <div class="flex min-w-0 items-center justify-between gap-3 text-sm">
                <span class="flex min-w-0 items-center gap-2 truncate text-slate-600 dark:text-slate-300"><span class="h-2.5 w-2.5 shrink-0 rounded-full" style={`background:${slice.item.color}`} />{slice.item.label}</span>
                <span class="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{formatValue(slice.hours)} · {(slice.percentage * 100).toFixed(0)}%</span>
              </div>
            {/each}
          </div>
        </div>
      </details>
    {/if}
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
