import type { APIRoute } from 'astro';
import { importImmersionCsv } from '../../lib/db';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('multipart/form-data')) return Response.json({ error: 'Upload a CSV file as multipart form data.' }, { status: 400 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'Choose a CSV file.' }, { status: 400 });
  if (!file.name.toLowerCase().endsWith('.csv')) return Response.json({ error: 'Only CSV files are supported.' }, { status: 400 });

  try {
    return Response.json(importImmersionCsv(await file.text(), file.name));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not import this CSV.';
    return Response.json({ error: message }, { status: 400 });
  }
};
