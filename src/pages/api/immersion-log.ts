import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';

export const prerender = false;

type LogKind = 'reading' | 'listening' | 'anime';

const CSV_SEARCH_DIRS = ['src/data/csvs', 'public/csvs', 'public/svgs'];

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function serializeCsvLine(cells: string[]): string {
  return cells
    .map((cell) => {
      const escaped = cell.replaceAll('"', '""');
      return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
    })
    .join(',');
}

async function getLatestCsvPath() {
  const candidates: { fullPath: string; fileName: string; mtimeMs: number }[] = [];

  for (const relativeDir of CSV_SEARCH_DIRS) {
    const absoluteDir = path.resolve(relativeDir);
    try {
      const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.csv')) continue;
        const fullPath = path.join(absoluteDir, entry.name);
        const stats = await fs.stat(fullPath);
        candidates.push({ fullPath, fileName: entry.name, mtimeMs: stats.mtimeMs });
      }
    } catch {
      // Skip missing directories.
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0] ?? null;
}

function formatCsvDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`;
}

function parseDateTimeLocal(value: string): Date | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value.replace('T', ' ') : value;
  const [datePart, timePartRaw] = normalized.split(' ');
  if (!datePart || !timePartRaw) return null;
  const timePart = timePartRaw.length === 5 ? `${timePartRaw}:00` : timePartRaw;
  const parsed = new Date(`${datePart}T${timePart}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatPoints(points: number): string {
  return points.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function computePoints(kind: LogKind, amount: number): number {
  return kind === 'anime' ? amount * 13 : (amount / 60) * 40.2;
}

function getField(source: FormData | URLSearchParams, key: string): string {
  return String(source.get(key) ?? '').trim();
}

async function readSubmission(request: Request): Promise<FormData | URLSearchParams> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('application/json')) {
    const body = (await request.json()) as Record<string, unknown>;
    return new URLSearchParams(
      Object.entries(body).map(([key, value]) => [key, typeof value === 'string' ? value : String(value ?? '')]),
    );
  }

  // Prefer browser form submissions, but tolerate any body Astro/undici hands us.
  try {
    return await request.formData();
  } catch {
    const text = await request.text();
    return new URLSearchParams(text);
  }
}

export const POST: APIRoute = async ({ request }) => {
  const submission = await readSubmission(request);

  const kind = getField(submission, 'kind') as LogKind;
  if (!['reading', 'listening', 'anime'].includes(kind)) {
    return new Response('Invalid log kind', { status: 400 });
  }

  const logId = Number(getField(submission, 'logId'));
  const amount = Number(getField(submission, 'amount'));
  const mediaName = getField(submission, 'mediaName') || 'N/A';
  const comment = getField(submission, 'comment') || 'No comment';
  const dateTimeLocal = getField(submission, 'dateTimeLocal');
  const parsedDate = parseDateTimeLocal(dateTimeLocal);

  if (!Number.isFinite(logId) || logId <= 0 || !Number.isInteger(logId)) {
    return new Response('Invalid log ID', { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return new Response('Invalid amount', { status: 400 });
  }
  if (!parsedDate) {
    return new Response('Invalid date', { status: 400 });
  }

  const latestCsv = await getLatestCsvPath();
  if (!latestCsv) {
    return new Response('No CSV found', { status: 500 });
  }

  const rawCsv = await fs.readFile(latestCsv.fullPath, 'utf8');
  const lines = rawCsv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return new Response('CSV is empty', { status: 500 });
  }

  const header = splitCsvLine(lines[0]);
  const headerKey = header.join(',');
  if (headerKey !== 'Log ID,Media Type,Media Name,Comment,Amount Logged,Points Received,Log Date') {
    return new Response('Unexpected CSV header', { status: 500 });
  }

  const mediaType = kind === 'reading' ? 'Reading Time' : kind === 'listening' ? 'Listening Time' : 'Anime';
  const points = computePoints(kind, amount);
  const newRow = serializeCsvLine([
    String(logId),
    mediaType,
    mediaName,
    comment,
    String(amount),
    formatPoints(points),
    formatCsvDateTime(parsedDate),
  ]);

  const timestamp = formatCsvDateTime(new Date()).replaceAll(':', '').replaceAll(' ', '_').replaceAll('-', '');
  const nextFileName = `logs-${timestamp}-${kind}-${logId}.csv`;
  const nextFilePath = path.join(path.dirname(latestCsv.fullPath), nextFileName);
  const output = [lines[0], newRow, ...lines.slice(1)].join('\n') + '\n';
  await fs.writeFile(nextFilePath, output, 'utf8');

  return Response.redirect(new URL('/japanese', request.url), 303);
};
