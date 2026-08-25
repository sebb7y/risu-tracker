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
