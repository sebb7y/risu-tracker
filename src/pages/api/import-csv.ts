import type { APIRoute } from 'astro';
import { getServiceConfig, importHelloTalkCsv, importImmersionCsv } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const service = url.searchParams.get('service');
  if (service !== 'hellotalk') return Response.json({ error: 'Unknown service.' }, { status: 400 });
  return Response.json({ config: getServiceConfig(service) });
};

export const POST: APIRoute = async ({ request }) => {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('multipart/form-data')) return Response.json({ error: 'Upload a CSV file as multipart form data.' }, { status: 400 });

  const form = await request.formData();
  if (form.get('service') === 'hellotalk') {
    const messages = form.get('messages');
    const calls = form.get('calls');
    const userId = String(form.get('userId') || '').trim();
    if (!(messages instanceof File) && !(calls instanceof File)) return Response.json({ error: 'Choose messages.csv, calls.csv, or both.' }, { status: 400 });
    if (!userId) return Response.json({ error: 'Enter the user ID used by the export.' }, { status: 400 });
    try {
      const config = JSON.parse(String(form.get('config') || '{}'));
      return Response.json(importHelloTalkCsv({
        messagesCsv: messages instanceof File ? await messages.text() : undefined,
        callsCsv: calls instanceof File ? await calls.text() : undefined,
        messagesFileName: messages instanceof File ? messages.name : undefined,
        callsFileName: calls instanceof File ? calls.name : undefined,
        userId,
        config,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import the HelloTalk CSVs.';
      return Response.json({ error: message }, { status: 400 });
    }
  }
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
