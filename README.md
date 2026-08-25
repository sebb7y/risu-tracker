# Risu Tracker

A personal Japanese immersion tracker built with Astro and Svelte.

The app reads the latest CSV snapshot from `public/csvs/`, renders the
immersion dashboard, and lets you add a new reading, listening, or anime log.
Each submission creates a new CSV snapshot that can be reverted or cleaned up
from the log dialog.

## Development

```sh
npm install
npm run dev
```

The dashboard is available at `/japanese`; the root route redirects there.

## Direction

The next major step is a unified event model for Japanese activity. It should
support multiple sources—immersion, Anki reviews and time, and input/output
from services such as HelloTalk, LINE, and KakaoTalk—while preserving source
metadata and allowing each metric to be toggled independently on a shared
timeline.

Before adding integrations, replace the CSV snapshot flow with a small
versioned data store and importers for manually exported data. Astro + Svelte
remains a reasonable fit for the dashboard and interactive charts; the
storage/import layer should stay separate from the UI.

## Anki

The dashboard can optionally sync review history from a locally running Anki
through [AnkiConnect](https://ankiweb.net/shared/info/2055492159). Install the
plugin, keep Anki open, and use **Sync Anki** on the dashboard. The gear beside
the button configures the AnkiConnect URL and remembers it in the browser. The
self-hosted server proxies the request, so CORS is not needed when Risu Tracker
and Anki run on the same machine. Syncs are repeatable:
previously seen
reviews are skipped, and new events retain their deck and review timing.
