import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type ImmersionKind = 'reading' | 'listening' | 'anime' | 'manga' | 'other';

export interface ImmersionLog {
  logId: number;
  mediaType: string;
  canonicalType: ImmersionKind;
  amount: number;
  points: number;
  date: Date;
  logDayKey: string;
  mediaName: string;
  comment: string;
}

export interface CsvImportResult {
  batchId: number;
  imported: number;
  duplicates: number;
  invalid: number;
  fileName: string;
}

export interface AnkiReviewInput {
  reviewId: string;
  deck: string;
  reviewedAt: string;
  timeMs: number;
  rating?: number;
  cardId?: string;
}

const dataDir = path.resolve(process.env.RISU_DATA_DIR ?? 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'risu-tracker.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    source TEXT NOT NULL,
    file_name TEXT NOT NULL,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    imported_count INTEGER NOT NULL DEFAULT 0,
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    invalid_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS activity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    import_batch_id INTEGER REFERENCES import_batches(id),
    activity_type TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    title TEXT,
    notes TEXT,
    points REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL,
    source_record_id TEXT,
    fingerprint TEXT NOT NULL,
    raw_data TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, fingerprint)
  );

  CREATE INDEX IF NOT EXISTS activity_events_user_date
    ON activity_events (user_id, occurred_at);
`);

const DEFAULT_USER_ID = process.env.RISU_USER_ID ?? 'local-user';
const defaultUser = db.prepare('SELECT id FROM users WHERE id = ?').get(DEFAULT_USER_ID);
if (!defaultUser) {
  db.prepare('INSERT INTO users (id, display_name) VALUES (?, ?)').run(DEFAULT_USER_ID, 'Local user');
}

// Repair older imports that were parsed as local midnight and could move to
// the previous UTC day. The original CSV date is retained in raw_data.
db.prepare(`
  UPDATE activity_events
     SET occurred_at = substr(json_extract(raw_data, '$."Log Date"'), 1, 10) || 'T12:00:00.000Z'
   WHERE user_id = ?
     AND activity_type = 'immersion'
     AND json_extract(raw_data, '$."Log Date"') IS NOT NULL
`).run(DEFAULT_USER_ID);

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function normalizeMediaType(mediaType: string): ImmersionKind {
  const normalized = mediaType.toLowerCase();
  if (normalized === 'reading time') return 'reading';
  if (normalized === 'listening time') return 'listening';
  if (normalized === 'anime') return 'anime';
  if (normalized === 'manga') return 'manga';
  return 'other';
}

function metricFor(kind: ImmersionKind): { metric: string; unit: string } {
  if (kind === 'anime') return { metric: 'episodes', unit: 'episodes' };
  if (kind === 'manga') return { metric: 'pages', unit: 'pages' };
  return { metric: 'time', unit: 'minutes' };
}

function parseDate(value: string): Date | null {
  // Treat CSV dates as calendar dates, not local timestamps. UTC noon keeps
  // the date stable when the value is converted to an ISO string.
  const datePart = value.trim().split(/[T ]/)[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const parsed = new Date(`${datePart}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function fingerprint(values: string[]): string {
  return crypto.createHash('sha256').update(values.join('\u001f')).digest('hex');
}

interface ParsedCsvRow {
  logId: number;
  mediaType: string;
  mediaName: string;
  comment: string;
  amount: number;
  points: number;
  date: Date;
  raw: Record<string, string>;
  fingerprint: string;
}

function parseCsv(rawCsv: string): { rows: ParsedCsvRow[]; invalid: number } {
  const lines = rawCsv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return { rows: [], invalid: 0 };

  const headers = splitCsvLine(lines[0]);
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
  const required = ['Log ID', 'Media Type', 'Media Name', 'Comment', 'Amount Logged', 'Points Received', 'Log Date'];
  if (required.some((header) => indexes[header] === undefined)) {
    throw new Error(`CSV must contain these columns: ${required.join(', ')}`);
  }

  const rows: ParsedCsvRow[] = [];
  let invalid = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const get = (header: string) => cells[indexes[header]] ?? '';
    const logId = Number(get('Log ID'));
    const amount = Number(get('Amount Logged'));
    const points = Number(get('Points Received'));
    const date = parseDate(get('Log Date'));
    if (!Number.isInteger(logId) || logId <= 0 || !Number.isFinite(amount) || !Number.isFinite(points) || !date) {
      invalid += 1;
      continue;
    }

    const raw = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
    rows.push({
      logId,
      mediaType: get('Media Type'),
      mediaName: get('Media Name') || 'N/A',
      comment: get('Comment') || 'No comment',
      amount,
      points,
      date,
      raw,
      fingerprint: fingerprint([get('Log ID'), get('Media Type'), get('Amount Logged'), get('Log Date')]),
    });
  }

  return { rows, invalid };
}

const insertEvent = db.prepare(`
  INSERT OR IGNORE INTO activity_events
    (user_id, import_batch_id, activity_type, metric, value, unit, occurred_at, title, notes, points, source, source_record_id, fingerprint, raw_data)
  VALUES (@userId, @batchId, 'immersion', @metric, @value, @unit, @occurredAt, @title, @notes, @points, @source, @sourceRecordId, @fingerprint, @rawData)
`);

const insertAnkiEvent = db.prepare(`
  INSERT OR IGNORE INTO activity_events
    (user_id, import_batch_id, activity_type, metric, value, unit, occurred_at, title, notes, points, source, source_record_id, fingerprint, raw_data)
  VALUES (@userId, @batchId, 'anki', @metric, @value, @unit, @occurredAt, @title, @notes, @points, @source, @sourceRecordId, @fingerprint, @rawData)
`);

export function importImmersionCsv(rawCsv: string, fileName: string, userId = DEFAULT_USER_ID, source = 'csv-import'): CsvImportResult {
  const parsed = parseCsv(rawCsv);
  const createBatch = db.prepare('INSERT INTO import_batches (user_id, source, file_name, invalid_count) VALUES (?, ?, ?, ?)');
  const updateBatch = db.prepare('UPDATE import_batches SET imported_count = ?, duplicate_count = ? WHERE id = ?');
  const run = db.transaction(() => {
    const batch = createBatch.run(userId, source, fileName, parsed.invalid);
    let imported = 0;
    let duplicates = 0;
    for (const row of parsed.rows) {
      const kind = normalizeMediaType(row.mediaType);
      const metric = metricFor(kind);
      const result = insertEvent.run({
        userId,
        batchId: batch.lastInsertRowid,
        metric: metric.metric,
        value: row.amount,
        unit: metric.unit,
        occurredAt: row.date.toISOString(),
        title: row.mediaName,
        notes: row.comment,
        points: row.points,
        source,
        sourceRecordId: String(row.logId),
        fingerprint: row.fingerprint,
        rawData: JSON.stringify(row.raw),
      });
      if (result.changes === 1) imported += 1;
      else duplicates += 1;
    }
    updateBatch.run(imported, duplicates, batch.lastInsertRowid);
    return { batchId: Number(batch.lastInsertRowid), imported, duplicates, invalid: parsed.invalid, fileName };
  });

  return run();
}

function latestLegacyCsv(): string | null {
  const directory = path.resolve('public/csvs');
  try {
    const files = fs.readdirSync(directory)
      .filter((file) => file.toLowerCase().endsWith('.csv'))
      .map((file) => ({ file, mtime: fs.statSync(path.join(directory, file)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files[0] ? path.join(directory, files[0].file) : null;
  } catch {
    return null;
  }
}

function ensureLegacyImport(): void {
  const count = db.prepare("SELECT COUNT(*) AS count FROM activity_events WHERE user_id = ? AND activity_type = 'immersion'").get(DEFAULT_USER_ID) as { count: number };
  if (count.count > 0) return;
  const file = latestLegacyCsv();
  if (!file) return;
  importImmersionCsv(fs.readFileSync(file, 'utf8'), path.basename(file), DEFAULT_USER_ID, 'legacy-csv');
}

export function getImmersionLogs(userId = DEFAULT_USER_ID): ImmersionLog[] {
  ensureLegacyImport();
  const rows = db.prepare(`
    SELECT source_record_id AS logId, title AS mediaName, notes AS comment, metric, value, points, occurred_at AS occurredAt,
           json_extract(raw_data, '$."Media Type"') AS mediaType
      FROM activity_events
     WHERE user_id = ? AND activity_type = 'immersion'
     ORDER BY occurred_at ASC, id ASC
  `).all(userId) as Array<{ logId: string; mediaName: string; comment: string; metric: string; value: number; points: number; occurredAt: string; mediaType: string }>;

  return rows.map((row) => {
    const date = new Date(row.occurredAt);
    const mediaType = row.mediaType || (row.metric === 'episodes' ? 'Anime' : 'Reading Time');
    return {
      logId: Number(row.logId),
      mediaType,
      canonicalType: normalizeMediaType(mediaType),
      amount: row.value,
      points: row.points,
      date,
      logDayKey: date.toISOString().slice(0, 10),
      mediaName: row.mediaName || 'N/A',
      comment: row.comment || 'No comment',
    };
  });
}

export function addImmersionLog(input: {
  logId: number;
  kind: 'reading' | 'listening' | 'anime';
  amount: number;
  mediaName: string;
  comment: string;
  date: Date;
}, userId = DEFAULT_USER_ID): void {
  const mediaType = input.kind === 'reading' ? 'Reading Time' : input.kind === 'listening' ? 'Listening Time' : 'Anime';
  const points = input.kind === 'anime' ? input.amount * 13 : (input.amount / 60) * 40.2;
  const metric = metricFor(normalizeMediaType(mediaType));
  insertEvent.run({
    userId,
    batchId: null,
    metric: metric.metric,
    value: input.amount,
    unit: metric.unit,
    occurredAt: input.date.toISOString(),
    title: input.mediaName,
    notes: input.comment,
    points,
    source: 'manual',
    sourceRecordId: String(input.logId),
    fingerprint: fingerprint([String(input.logId), mediaType, String(input.amount), input.date.toISOString(), input.mediaName, input.comment]),
    rawData: JSON.stringify({ 'Log ID': input.logId, 'Media Type': mediaType }),
  });
}

export function importAnkiReviews(reviews: AnkiReviewInput[], userId = DEFAULT_USER_ID): { imported: number; duplicates: number; batchId: number } {
  const createBatch = db.prepare("INSERT INTO import_batches (user_id, source, file_name) VALUES (?, 'anki-connect', 'AnkiConnect sync')");
  const updateBatch = db.prepare('UPDATE import_batches SET imported_count = ?, duplicate_count = ? WHERE id = ?');
  const run = db.transaction(() => {
    const batch = createBatch.run(userId);
    let imported = 0;
    let duplicates = 0;

    for (const review of reviews) {
      const date = new Date(review.reviewedAt);
      if (!review.reviewId || !review.deck || Number.isNaN(date.getTime())) continue;
      const base = {
        userId,
        batchId: batch.lastInsertRowid,
        occurredAt: date.toISOString(),
        title: review.deck,
        notes: review.rating ? `Rating ${review.rating}` : null,
        source: 'anki-connect',
        rawData: JSON.stringify(review),
      };

      const reviewResult = insertAnkiEvent.run({
        ...base,
        metric: 'reviews',
        value: 1,
        unit: 'reviews',
        points: 1,
        sourceRecordId: `${review.reviewId}:reviews`,
        fingerprint: fingerprint(['anki', review.reviewId, 'reviews']),
      });
      if (reviewResult.changes === 1) imported += 1;
      else duplicates += 1;

      if (Number.isFinite(review.timeMs) && review.timeMs > 0) {
        const timeResult = insertAnkiEvent.run({
          ...base,
          metric: 'time',
          value: review.timeMs / 60000,
          unit: 'minutes',
          points: review.timeMs / 60000,
          sourceRecordId: `${review.reviewId}:time`,
          fingerprint: fingerprint(['anki', review.reviewId, 'time']),
        });
        if (timeResult.changes === 1) imported += 1;
        else duplicates += 1;
      }
    }

    updateBatch.run(imported, duplicates, batch.lastInsertRowid);
    return { imported, duplicates, batchId: Number(batch.lastInsertRowid) };
  });
  return run();
}

export function getNextLogId(userId = DEFAULT_USER_ID): number {
  const row = db.prepare("SELECT MAX(CAST(source_record_id AS INTEGER)) AS maxId FROM activity_events WHERE user_id = ? AND activity_type = 'immersion'").get(userId) as { maxId: number | null };
  return (row.maxId ?? 0) + 1;
}

export function getDailyActivityMetrics(userId = DEFAULT_USER_ID): Array<{ day: string; activityType: string; metric: string; title: string; value: number; points: number }> {
  return db.prepare(`
    SELECT substr(occurred_at, 1, 10) AS day, activity_type AS activityType, metric, COALESCE(title, '') AS title,
           SUM(value) AS value, SUM(points) AS points
      FROM activity_events
     WHERE user_id = ?
     GROUP BY day, activity_type, metric
     ORDER BY day ASC
  `).all(userId) as Array<{ day: string; activityType: string; metric: string; title: string; value: number; points: number }>;
}
