import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as { endpoint?: string; action?: string; version?: number; params?: Record<string, unknown> };
    const endpoint = new URL(body.endpoint || process.env.ANKI_CONNECT_URL || 'http://127.0.0.1:8765');
    if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('AnkiConnect endpoint must use HTTP or HTTPS.');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: body.action, version: body.version ?? 6, params: body.params ?? {} }),
    });
    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not reach AnkiConnect.', result: null }, { status: 502 });
  }
};
