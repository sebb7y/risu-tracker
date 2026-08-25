import crypto from 'node:crypto';
import { DEFAULT_HELLO_TALK_CONFIG, type HelloTalkConfig } from './hello-talk-config';
export { DEFAULT_HELLO_TALK_CONFIG } from './hello-talk-config';
export type { HelloTalkConfig } from './hello-talk-config';

export interface HelloTalkImportInput {
  messagesCsv?: string;
  callsCsv?: string;
  messagesFileName?: string;
  callsFileName?: string;
  userId: string;
  config?: Partial<HelloTalkConfig>;
}

export interface HelloTalkImportPreview {
  messageRows: number;
  callRows: number;
  connectedCalls: number;
  effectiveCallMinutes: number;
  excludedSystemMessages: number;
  excludedShortMessages: number;
  excludedNonTargetMessages: number;
  sentCharacters: number;
  receivedCharacters: number;
  outputTextMinutes: number;
  readingTextMinutes: number;
}

export interface HelloTalkDerivedEvent {
  activityType: string;
  metric: string;
  value: number;
  unit: string;
  occurredAt: string;
  title: string;
  notes: string;
  sourceRecordId: string;
  rawData: Record<string, unknown>;
}

export interface HelloTalkDerivation {
  events: HelloTalkDerivedEvent[];
  preview: HelloTalkImportPreview;
  rawRows: { messages: Record<string, string>[]; calls: Record<string, string>[] };
  config: HelloTalkConfig;
}

export function resolveHelloTalkConfig(input?: Partial<HelloTalkConfig>): HelloTalkConfig {
  const legacyReading = input?.reading as (Partial<HelloTalkConfig['reading']> & { charactersPerMinute?: number }) | undefined;
  const legacyWriting = input?.writing as (Partial<HelloTalkConfig['writing']> & { charactersPerMinute?: number }) | undefined;
  return {
    calls: { ...DEFAULT_HELLO_TALK_CONFIG.calls, ...(input?.calls ?? {}) },
    messages: { ...DEFAULT_HELLO_TALK_CONFIG.messages, ...(input?.messages ?? {}) },
    reading: {
      ...DEFAULT_HELLO_TALK_CONFIG.reading,
      ...(input?.reading ?? {}),
      ...(legacyReading?.charactersPerMinute ? { charactersPerHour: legacyReading.charactersPerMinute * 60 } : {}),
    },
    writing: {
      ...DEFAULT_HELLO_TALK_CONFIG.writing,
      ...(input?.writing ?? {}),
      ...(legacyWriting?.charactersPerMinute ? { charactersPerHour: legacyWriting.charactersPerMinute * 60 } : {}),
    },
  };
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
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
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);

  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function parseTimestamp(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDuration(value: string): number {
  const parts = value.trim().split(':').map(Number);
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  // Return minutes. The extractor uses MM:SS for short calls and H:MM:SS
  // for longer calls.
  return parts[0] * 60 + parts[1] + parts[2] / 60;
}

function japaneseCharacters(value: string): string {
  return [...value].filter((character) => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/u.test(character)).join('');
}

function stableId(row: Record<string, string>, fallback: string): string {
  return row.msg_id || crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0, 24) || fallback;
}

function clampPercent(value: number): number {
  return Math.min(Math.max(Number(value) || 0, 0), 100);
}

function isSystemMessage(row: Record<string, string>): boolean {
  const type = row.msg_type.toLowerCase();
  const nickname = row.from_nickname.toLowerCase();
  return ['voice_room', 'roominvite', 'wish_list_notice', 'news'].includes(type)
    || ['hellotalk', 'hellotalk team'].includes(nickname)
    || row.from_id === '10086';
}

export function deriveHelloTalk(input: HelloTalkImportInput): HelloTalkDerivation {
  const config = resolveHelloTalkConfig(input.config);
  const messages = input.messagesCsv ? parseCsv(input.messagesCsv) : [];
  const calls = input.callsCsv ? parseCsv(input.callsCsv) : [];
  const events: HelloTalkDerivedEvent[] = [];
  const callFraction = clampPercent(config.calls.immersionPercent) / 100;
  const messageFraction = clampPercent(config.messages.immersionPercent) / 100;
  const readSpeed = Math.max(Number(config.reading.charactersPerHour) || 1, 1);
  const writeSpeed = Math.max(Number(config.writing.charactersPerHour) || 1, 1);
  let connectedCalls = 0;
  let effectiveCallMinutes = 0;
  let excludedSystemMessages = 0;
  let excludedShortMessages = 0;
  let excludedNonTargetMessages = 0;
  let sentCharacters = 0;
  let receivedCharacters = 0;

  for (const row of calls) {
    const date = parseTimestamp(row.timestamp_utc);
    const durationMinutes = parseDuration(row.duration);
    if (!date || durationMinutes <= 0 || !config.calls.connectedStatuses.includes(row.voip_status)) continue;
    const effectiveMinutes = durationMinutes * callFraction;
    connectedCalls += 1;
    effectiveCallMinutes += effectiveMinutes;
    events.push({
      activityType: 'hellotalk', metric: 'output_calls', value: effectiveMinutes, unit: 'minutes',
      occurredAt: date.toISOString(), title: 'HelloTalk calls', notes: `${row.duration} call · ${row.voip_status} status`,
      sourceRecordId: stableId(row, `call-${connectedCalls}`),
      rawData: { ...row, rawDurationMinutes: durationMinutes, effectiveMinutes },
    });
  }

  for (const row of messages) {
    if (config.messages.excludeSystemMessages && isSystemMessage(row)) {
      excludedSystemMessages += 1;
      continue;
    }
    const date = parseTimestamp(row.timestamp_utc);
    if (!date || !row.text.trim()) {
      excludedShortMessages += 1;
      continue;
    }
    const filteredText = config.messages.targetLanguageFilter ? japaneseCharacters(row.text) : row.text;
    if (config.messages.targetLanguageFilter && filteredText.length === 0) excludedNonTargetMessages += 1;
    const characterCount = [...filteredText].length;
    if (characterCount < Math.max(0, Number(config.messages.minimumCharacters) || 0)) {
      excludedShortMessages += 1;
      continue;
    }
    const effectiveCharacters = characterCount * messageFraction;
    const sent = row.from_id === input.userId;
    if (sent) sentCharacters += effectiveCharacters;
    else receivedCharacters += effectiveCharacters;
    const minutes = (effectiveCharacters / (sent ? writeSpeed : readSpeed)) * 60;
    events.push({
      activityType: 'hellotalk', metric: sent ? 'output_text' : 'reading_text', value: minutes, unit: 'minutes',
      occurredAt: date.toISOString(), title: sent ? 'HelloTalk output (text)' : 'HelloTalk reading (text)',
      notes: `${characterCount} filtered characters · ${sent ? 'sent' : 'received'}`,
      sourceRecordId: stableId(row, `message-${events.length}`),
      rawData: { ...row, direction: sent ? 'sent' : 'received', filteredText, characterCount, effectiveCharacters },
    });
  }

  const preview: HelloTalkImportPreview = {
    messageRows: messages.length, callRows: calls.length, connectedCalls, effectiveCallMinutes,
    excludedSystemMessages, excludedShortMessages, excludedNonTargetMessages, sentCharacters, receivedCharacters,
    outputTextMinutes: events.filter((event) => event.metric === 'output_text').reduce((sum, event) => sum + event.value, 0),
    readingTextMinutes: events.filter((event) => event.metric === 'reading_text').reduce((sum, event) => sum + event.value, 0),
  };
  return { events, preview, rawRows: { messages, calls }, config };
}
