export const CSV_FORMAT_IDS = ['tmw', 'generic'] as const;
export type CsvFormatId = (typeof CSV_FORMAT_IDS)[number];

export interface CsvConversionConfig {
  /** Minutes of immersion per anime episode. */
  animeMinutesPerEpisode: number;
  /** Manga pages that equal one hour of immersion. */
  mangaPagesPerHour: number;
  /** Book pages that equal one hour of immersion. */
  bookPagesPerHour: number;
  /** Visual novel characters that equal one hour of immersion. */
  visualNovelCharactersPerHour: number;
  /** Characters read that equal one hour of immersion. */
  readingCharactersPerHour: number;
}

export interface CsvFormatConfig {
  conversions: CsvConversionConfig;
}

export interface CsvImportConfig {
  format: CsvFormatId;
  formats: Record<CsvFormatId, CsvFormatConfig>;
}

export interface CsvImportConfigInput {
  format?: unknown;
  formats?: Partial<Record<CsvFormatId, { conversions?: Partial<CsvConversionConfig> } | undefined>>;
}

export interface CsvFormatDefinition {
  id: CsvFormatId;
  label: string;
  description: string;
  columns: string;
}

export interface CsvConversionField {
  key: keyof CsvConversionConfig;
  label: string;
  unit: string;
  description: string;
  min: number;
  step: number;
}

export const CSV_FORMATS: CsvFormatDefinition[] = [
  {
    id: 'tmw',
    label: 'TMW immersion logs',
    description: 'Exported from the TMW Discord immersion bot. Includes anime, manga, books, visual novels, reading, and time-based logs.',
    columns: 'Log ID, Media Type, Media Name, Comment, Amount Logged, Points Received, Log Date',
  },
  {
    id: 'generic',
    label: 'Generic immersion CSV',
    description: 'Flexible CSV for other tools. Column names are matched case-insensitively.',
    columns: 'date, media type, amount, points (optional), name (optional), comment (optional), id (optional)',
  },
];

export const CSV_CONVERSION_FIELDS: CsvConversionField[] = [
  {
    key: 'animeMinutesPerEpisode',
    label: 'Anime minutes per episode',
    unit: 'min / episode',
    description: 'Anime episodes are multiplied by this duration.',
    min: 1,
    step: 1,
  },
  {
    key: 'mangaPagesPerHour',
    label: 'Manga pages per hour',
    unit: 'pages / hour',
    description: 'How many manga pages equal one hour of immersion.',
    min: 1,
    step: 1,
  },
  {
    key: 'bookPagesPerHour',
    label: 'Book pages per hour',
    unit: 'pages / hour',
    description: 'How many book pages equal one hour of immersion.',
    min: 1,
    step: 1,
  },
  {
    key: 'visualNovelCharactersPerHour',
    label: 'Visual novel characters per hour',
    unit: 'chars / hour',
    description: 'Reading speed used for visual novel character counts.',
    min: 1,
    step: 100,
  },
  {
    key: 'readingCharactersPerHour',
    label: 'Reading characters per hour',
    unit: 'chars / hour',
    description: 'Reading speed used for the Reading media type.',
    min: 1,
    step: 100,
  },
];

export const DEFAULT_CSV_CONVERSIONS: CsvConversionConfig = {
  animeMinutesPerEpisode: 20,
  mangaPagesPerHour: 160,
  bookPagesPerHour: 40,
  visualNovelCharactersPerHour: 14000,
  readingCharactersPerHour: 14000,
};

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isCsvFormatId(value: unknown): value is CsvFormatId {
  return typeof value === 'string' && (CSV_FORMAT_IDS as readonly string[]).includes(value);
}

function resolveConversions(input?: Partial<CsvConversionConfig>): CsvConversionConfig {
  return {
    animeMinutesPerEpisode: positiveNumber(input?.animeMinutesPerEpisode, DEFAULT_CSV_CONVERSIONS.animeMinutesPerEpisode),
    mangaPagesPerHour: positiveNumber(input?.mangaPagesPerHour, DEFAULT_CSV_CONVERSIONS.mangaPagesPerHour),
    bookPagesPerHour: positiveNumber(input?.bookPagesPerHour, DEFAULT_CSV_CONVERSIONS.bookPagesPerHour),
    visualNovelCharactersPerHour: positiveNumber(
      input?.visualNovelCharactersPerHour,
      DEFAULT_CSV_CONVERSIONS.visualNovelCharactersPerHour,
    ),
    readingCharactersPerHour: positiveNumber(
      input?.readingCharactersPerHour,
      DEFAULT_CSV_CONVERSIONS.readingCharactersPerHour,
    ),
  };
}

export function resolveCsvImportConfig(input?: CsvImportConfigInput): CsvImportConfig {
  const format = isCsvFormatId(input?.format) ? input.format : 'tmw';
  const formats = Object.fromEntries(
    CSV_FORMAT_IDS.map((id) => [id, { conversions: resolveConversions(input?.formats?.[id]?.conversions) }]),
  ) as Record<CsvFormatId, CsvFormatConfig>;

  return { format, formats };
}

export const DEFAULT_CSV_IMPORT_CONFIG: CsvImportConfig = resolveCsvImportConfig();
