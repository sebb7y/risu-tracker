export interface DashboardSource {
  key: string;
  label: string;
  description: string;
}

export interface DashboardComponentConfig {
  key: string;
  label: string;
  anchor: string;
  enabled: boolean;
  order: number;
  dataSources: string[];
}

export const DASHBOARD_SOURCES: DashboardSource[] = [
  { key: 'immersion', label: 'Immersion logs', description: 'Reading, listening, anime, manga, and other logs' },
  { key: 'anki', label: 'Anki', description: 'Review time and deck activity' },
  { key: 'hellotalk', label: 'HelloTalk', description: 'Calls, message output, and message reading' },
];

export const DEFAULT_DASHBOARD_COMPONENTS: DashboardComponentConfig[] = [
  { key: 'overview', label: 'Overview', anchor: 'dashboard-overview', enabled: true, order: 0, dataSources: ['immersion'] },
  { key: 'timeline', label: 'Timeline', anchor: 'dashboard-timeline', enabled: true, order: 1, dataSources: ['immersion', 'anki', 'hellotalk'] },
  { key: 'goals', label: 'Goals', anchor: 'dashboard-goals', enabled: true, order: 2, dataSources: ['immersion'] },
  { key: 'heatmap', label: 'Heatmap', anchor: 'dashboard-heatmap', enabled: true, order: 3, dataSources: ['immersion'] },
  { key: 'monthly', label: 'Monthly breakdown', anchor: 'dashboard-monthly', enabled: true, order: 4, dataSources: ['immersion'] },
  { key: 'raw-totals', label: 'Overall raw totals', anchor: 'dashboard-raw-totals', enabled: true, order: 5, dataSources: ['immersion'] },
  { key: 'yearly', label: 'By year', anchor: 'dashboard-yearly', enabled: true, order: 6, dataSources: ['immersion'] },
  { key: 'extras', label: 'Interesting extras', anchor: 'dashboard-extras', enabled: true, order: 7, dataSources: ['immersion'] },
];

export function resolveDashboardComponents(input?: Partial<DashboardComponentConfig>[]): DashboardComponentConfig[] {
  const saved = new Map((input ?? []).map((component) => [component.key, component]));
  return DEFAULT_DASHBOARD_COMPONENTS
    .map((component) => ({ ...component, ...(saved.get(component.key) ?? {}), dataSources: saved.get(component.key)?.dataSources ?? component.dataSources }))
    .sort((left, right) => left.order - right.order)
    .map((component, order) => ({ ...component, order }));
}
