import type { APIRoute } from 'astro';
import { addImmersionLog } from '../../lib/db';

export const prerender = false;
type LogKind = 'reading' | 'listening' | 'anime';

function getField(source: FormData | URLSearchParams, key: string): string {
  return String(source.get(key) ?? '').trim();
}

async function readSubmission(request: Request): Promise<FormData | URLSearchParams> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json')) {
    const body = (await request.json()) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(body).map(([key, value]) => [key, typeof value === 'string' ? value : String(value ?? '')]));
  }
  return await request.formData();
}

function parseDateTimeLocal(value: string): Date | null {
  if (!value) return null;
  const datePart = value.trim().split(/[T ]/)[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const parsed = new Date(`${datePart}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const POST: APIRoute = async ({ request }) => {
  const submission = await readSubmission(request);
  const kind = getField(submission, 'kind') as LogKind;
  const logId = Number(getField(submission, 'logId'));
  const amount = Number(getField(submission, 'amount'));
  const parsedDate = parseDateTimeLocal(getField(submission, 'dateTimeLocal'));

  if (!['reading', 'listening', 'anime'].includes(kind)) return new Response('Invalid log kind', { status: 400 });
  if (!Number.isInteger(logId) || logId <= 0) return new Response('Invalid log ID', { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return new Response('Invalid amount', { status: 400 });
  if (!parsedDate) return new Response('Invalid date', { status: 400 });

  addImmersionLog({
    kind,
    logId,
    amount,
    date: parsedDate,
    mediaName: getField(submission, 'mediaName') || 'N/A',
    comment: getField(submission, 'comment') || 'No comment',
  });

  return Response.redirect(new URL('/japanese', request.url), 303);
};
