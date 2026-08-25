import type { APIRoute } from 'astro';
import { importAnkiReviews, type AnkiReviewInput } from '../../lib/db';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as { reviews?: AnkiReviewInput[] };
    if (!Array.isArray(body.reviews)) return Response.json({ error: 'Reviews must be an array.' }, { status: 400 });
    if (body.reviews.length > 250000) return Response.json({ error: 'Sync payload is too large.' }, { status: 413 });
    return Response.json(importAnkiReviews(body.reviews));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not import Anki reviews.';
    return Response.json({ error: message }, { status: 400 });
  }
};
