import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';

export const prerender = false;

interface CsvFileInfo {
  fullPath: string;
  fileName: string;
  mtimeMs: number;
}

const CSV_SEARCH_DIRS = ['src/data/csvs', 'public/csvs', 'public/svgs'];

async function getCsvFiles() {
  const candidates: CsvFileInfo[] = [];

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
      // Missing directories are fine.
    }
  }

  candidates.sort((a, b) => a.mtimeMs - b.mtimeMs || a.fileName.localeCompare(b.fileName));
  return candidates;
}

async function readKeepFileName(request: Request): Promise<string | null> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => null)) as { keepFileName?: unknown } | null;
    const keepFileName = typeof body?.keepFileName === 'string' ? body.keepFileName.trim() : '';
    return keepFileName || null;
  }

  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const keepFileName = String(formData.get('keepFileName') ?? '').trim();
    return keepFileName || null;
  }

  return null;
}

export const POST: APIRoute = async ({ request }) => {
  const keepFileName = await readKeepFileName(request);
  const csvFiles = await getCsvFiles();

  if (csvFiles.length === 0) {
    return Response.json({ deletedCount: 0, keptFile: null, deletedFiles: [] });
  }

  const keepIndex = keepFileName
    ? csvFiles.findIndex((file) => file.fileName === keepFileName)
    : csvFiles.length - 1;

  if (keepIndex < 0) {
    return Response.json({ error: 'Requested CSV snapshot was not found.' }, { status: 404 });
  }

  const deletedFiles: string[] = [];
  const filesToDelete = keepFileName ? csvFiles.slice(keepIndex + 1) : csvFiles.slice(0, keepIndex);

  for (const file of filesToDelete) {
    try {
      await fs.unlink(file.fullPath);
      deletedFiles.push(file.fileName);
    } catch {
      // Ignore files that can't be removed.
    }
  }

  return Response.json({
    deletedCount: deletedFiles.length,
    keptFile: csvFiles[keepIndex].fileName,
    deletedFiles,
  });
};
