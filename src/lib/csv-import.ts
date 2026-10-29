import crypto from 'node:crypto';
import type { CsvConversionConfig, CsvFormatId } from './csv-config';

export type ImmersionKind =
  | 'reading'
  | 'listening'
  | 'anime'
  | 'manga'
  | 'book'
  | 'visual-novel'
  | 'reading-text'
  | 'other';

export interface CsvDerivedRow {
  sourceRecordId: string;
  mediaType: string;
  mediaName: string;
  comment: string;
  amount: number;
  points: number;
  date: Date;
  kind: ImmersionKind;
  metric: string;
  unit: string;
  immersionMinutes: number;
  raw: Record<string, string>;
  fingerprint: string;
}

export interface CsvDerivation {
  rows: CsvDerivedRow[];
  invalid: number;
}

interface CsvTable {
  headers: string[];
  rows: string[][];
}

interface FieldMap {
  id: number;
  mediaType: number;
  mediaName: number;
  comment: number;
  amount: number;
  points: number;
  date: number;
}

const TMW_REQUIRED_HEADERS = [
  'Log ID',
  'Media Type',
  'Media Name',
  'Comment',
  'Amount Logged',
  'Points Received',
  'Log Date',
];

const GENERIC_ALIASES = {
  id: ['log id', 'id', 'log_id', 'source id'],
  mediaType: ['media type', 'media_type', 'type', 'media'],
  mediaName: ['media name', 'media_name', 'name', 'title'],
  comment: ['comment', 'notes', 'note'],
  amount: ['amount logged', 'amount_logged', 'amount', 'value'],
  points: ['points received', 'points_received', 'points'],
  date: ['log date', 'log_date', 'date', 'timestamp', 'occurred at', 'occurred_at'],
};

export function canonicalMediaType(mediaType: string): ImmersionKind {
  const normalized = mediaType.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (normalized === 'reading time') return 'reading';
  if (normalized === 'listening time' || normalized === 'listening') return 'listening';
  if (normalized === 'anime') return 'anime';
  if (normalized === 'manga') return 'manga';
  if (normalized === 'book' || normalized === 'books') return 'book';
  if (normalized === 'visual novel' || normalized === 'visual novels' || normalized === 'vn') return 'visual-novel';
  if (normalized === 'reading') return 'reading-text';
  return 'other';
}

export function metricForKind(kind: ImmersionKind): { metric: string; unit: string } {
  if (kind === 'anime') return { metric: 'episodes', unit: 'episodes' };
  if (kind === 'manga' || kind === 'book') return { metric: 'pages', unit: 'pages' };
  if (kind === 'visual-novel' || kind === 'reading-text') return { metric: 'characters', unit: 'characters' };
  return { metric: 'time', unit: 'minutes' };
}

export function immersionMinutesFor(
  amount: number,
  kind: ImmersionKind,
  conversions: CsvConversionConfig,
): number {
  switch (kind) {
    case 'anime':
      return amount * conversions.animeMinutesPerEpisode;
    case 'manga':
      return (amount / conversions.mangaPagesPerHour) * 60;
    case 'book':
      return (amount / conversions.bookPagesPerHour) * 60;
    case 'visual-novel':
      return (amount / conversions.visualNovelCharactersPerHour) * 60;
    case 'reading-text':
      return (amount / conversions.readingCharactersPerHour) * 60;
    case 'reading':
    case 'listening':
    case 'other':
    default:
      return amount;
  }
}

function parseTable(text: string): CsvTable {
  const normalizedText = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < normalizedText.length; index += 1) {
    const character = normalizedText[index];
    const next = normalizedText[index + 1];

    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) rows.push(row);
  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((header) => header.trim());
  return { headers, rows: rows.slice(1) };
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function findHeader(headers: string[], aliases: string[]): number {
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const index = normalizedHeaders.indexOf(normalizeHeader(alias));
    if (index >= 0) return index;
  }
  return -1;
}

function tmwFieldMap(headers: string[]): FieldMap {
  const missing = TMW_REQUIRED_HEADERS.filter((header) => !headers.some((candidate) => normalizeHeader(candidate) === normalizeHeader(header)));
  if (missing.length > 0) {
    throw new Error(`TMW CSV is missing these columns: ${missing.join(', ')}`);
  }
  return {
    id: findHeader(headers, ['Log ID']),
    mediaType: findHeader(headers, ['Media Type']),
    mediaName: findHeader(headers, ['Media Name']),
    comment: findHeader(headers, ['Comment']),
    amount: findHeader(headers, ['Amount Logged']),
    points: findHeader(headers, ['Points Received']),
    date: findHeader(headers, ['Log Date']),
  };
}

function genericFieldMap(headers: string[]): FieldMap {
  const map: FieldMap = {
    id: findHeader(headers, GENERIC_ALIASES.id),
    mediaType: findHeader(headers, GENERIC_ALIASES.mediaType),
    mediaName: findHeader(headers, GENERIC_ALIASES.mediaName),
    comment: findHeader(headers, GENERIC_ALIASES.comment),
    amount: findHeader(headers, GENERIC_ALIASES.amount),
    points: findHeader(headers, GENERIC_ALIASES.points),
    date: findHeader(headers, GENERIC_ALIASES.date),
  };
  if (map.mediaType < 0 || map.amount < 0 || map.date < 0) {
    throw new Error('Generic CSV must contain date, media type, and amount columns.');
  }
  return map;
}

function parseNumber(value: string): number {
  return Number(value.replace(/,/g, '').trim());
}

function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  const datePart = trimmed.split(/[T ]/)[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const parsed = new Date(`${datePart}T12:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function fingerprint(values: string[]): string {
  return crypto.createHash('sha256').update(values.join('\u001f')).digest('hex');
}

function hashRow(values: string[]): string {
  return crypto.createHash('sha256').update(values.join('\u001f')).digest('hex').slice(0, 12);
}

function pointsFor(kind: ImmersionKind, amount: number, immersionMinutes: number): number {
  if (kind === 'anime') return amount * 13;
  return (immersionMinutes / 60) * 40.2;
}

function rowRecord(headers: string[], cells: string[]): Record<string, string> {
  return Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? '').trim()]));
}

export function deriveCsvRows(
  rawCsv: string,
  format: CsvFormatId,
  conversions: CsvConversionConfig,
): CsvDerivation {
  const table = parseTable(rawCsv);
  if (table.rows.length === 0) return { rows: [], invalid: 0 };

  const fields = format === 'tmw' ? tmwFieldMap(table.headers) : genericFieldMap(table.headers);
  const rows: CsvDerivedRow[] = [];
  let invalid = 0;

  table.rows.forEach((cells, index) => {
    const get = (field: number): string => (field >= 0 ? (cells[field] ?? '').trim() : '');
    const raw = rowRecord(table.headers, cells);
    const mediaType = get(fields.mediaType);
    const amount = parseNumber(get(fields.amount));
    const date = parseDate(get(fields.date));

    if (!mediaType || !Number.isFinite(amount) || !date) {
      invalid += 1;
      return;
    }

    const kind = canonicalMediaType(mediaType);
    const metric = metricForKind(kind);
    const immersionMinutes = immersionMinutesFor(amount, kind, conversions);
    const parsedPoints = parseNumber(get(fields.points));
    const points = Number.isFinite(parsedPoints) && parsedPoints > 0
      ? parsedPoints
      : pointsFor(kind, amount, immersionMinutes);

    const explicitId = parseNumber(get(fields.id));
    const hasExplicitId = Number.isInteger(explicitId) && explicitId > 0;
    if (format === 'tmw' && !hasExplicitId) {
      invalid += 1;
      return;
    }
    const fallbackId = Number.parseInt(hashRow([format, String(index), ...Object.values(raw)]).slice(0, 9), 16) + 1;
    const sourceRecordId = String(hasExplicitId ? explicitId : fallbackId);
    const mediaName = get(fields.mediaName) || 'N/A';
    const comment = get(fields.comment) || 'No comment';

    rows.push({
      sourceRecordId,
      mediaType,
      mediaName,
      comment,
      amount,
      points,
      date,
      kind,
      metric: metric.metric,
      unit: metric.unit,
      immersionMinutes,
      raw,
      // Keep the original TMW fingerprint so previously imported rows still dedupe.
      fingerprint: format === 'tmw'
        ? fingerprint([get(fields.id), get(fields.mediaType), get(fields.amount), get(fields.date)])
        : fingerprint(['generic', String(index), ...Object.values(raw)]),
    });
  });

  return { rows, invalid };
}
