import type { APIRoute } from 'astro';
import { getReadingGoalConfig, saveReadingGoalConfig } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = () => Response.json({ config: getReadingGoalConfig() });

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as { dailyGoalMinutes?: unknown; maxMinutesPerDay?: unknown };
    const dailyGoalMinutes = Number(body.dailyGoalMinutes);
    const maxMinutesPerDay = Number(body.maxMinutesPerDay);
    if (!Number.isFinite(dailyGoalMinutes) || dailyGoalMinutes <= 0) {
      return Response.json({ error: 'Daily goal must be a positive number of minutes.' }, { status: 400 });
    }
    if (!Number.isFinite(maxMinutesPerDay) || maxMinutesPerDay <= dailyGoalMinutes) {
      return Response.json({ error: 'Max minutes per day must be greater than the daily goal.' }, { status: 400 });
    }
    const config = saveReadingGoalConfig({ dailyGoalMinutes, maxMinutesPerDay });
    return Response.json({ config });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not save reading goal configuration.' }, { status: 400 });
  }
};
