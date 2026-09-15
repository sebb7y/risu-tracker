export interface ReadingGoalConfig {
  dailyGoalMinutes: number;
  maxMinutesPerDay: number;
}

export const DEFAULT_READING_GOAL_CONFIG: ReadingGoalConfig = {
  dailyGoalMinutes: 210,
  maxMinutesPerDay: 16 * 60,
};

function toPositiveMinutes(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

export function resolveReadingGoalConfig(input?: Partial<ReadingGoalConfig>): ReadingGoalConfig {
  const dailyGoalMinutes = toPositiveMinutes(input?.dailyGoalMinutes) ?? DEFAULT_READING_GOAL_CONFIG.dailyGoalMinutes;
  const maxMinutesPerDay = toPositiveMinutes(input?.maxMinutesPerDay) ?? DEFAULT_READING_GOAL_CONFIG.maxMinutesPerDay;
  // The progress bar treats the goal as its midpoint, so the scale must stay above it.
  return { dailyGoalMinutes, maxMinutesPerDay: Math.max(maxMinutesPerDay, dailyGoalMinutes * 2) };
}
