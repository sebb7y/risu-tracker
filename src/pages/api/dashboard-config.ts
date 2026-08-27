import type { APIRoute } from 'astro';
import { getDashboardConfig, saveDashboardConfig } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = () => Response.json({ components: getDashboardConfig() });

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json() as { components?: unknown };
    if (!Array.isArray(body.components)) return Response.json({ error: 'Dashboard components must be an array.' }, { status: 400 });
    saveDashboardConfig(body.components);
    return Response.json({ components: getDashboardConfig() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not save dashboard configuration.' }, { status: 400 });
  }
};
