# Sports Commentary Agent Demo

This is a minimal end‑to‑end demo that:

- embeds a YouTube match in a single‑page UI (Vercel‑hosted)
- plays synchronized, autonomous tactical commentary (Google TTS)
- uses a long‑running worker to detect highlight windows via Gemini Vision

The UI polls for highlight events and auto‑seeks the YouTube player to the right timestamps, then plays the TTS audio alongside the video.

## Architecture

- **Web UI (Vercel)**: Next.js app in `web/`
- **Worker (long‑running)**: Node script in `worker/`
- **Storage + events**: Supabase (Postgres + Storage)

## Supabase Setup

1. Create a Supabase project.
2. Create a public Storage bucket named `commentary`.
3. Run the SQL below in the SQL editor:

```sql
create extension if not exists pgcrypto;

create table if not exists highlights (
  id uuid primary key default gen_random_uuid(),
  video_id text not null,
  start_sec numeric not null,
  end_sec numeric not null,
  text text not null,
  audio_url text not null,
  created_at timestamptz default now()
);

create index if not exists highlights_video_id_idx on highlights (video_id, created_at);

alter table highlights enable row level security;

create policy "public read highlights" on highlights
  for select
  using (true);
```

## Web App (Vercel)

### Environment variables

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_YOUTUBE_URL=https://www.youtube.com/watch?v=Rfylh5wwReI&t=6486s
```

### Run locally

```bash
cd web
npm install
npm run dev
```

## Worker

### Requirements

- `yt-dlp` installed and available in PATH
- `ffmpeg` installed and available in PATH
- Node.js 18+

### Environment variables

```
GEMINI_API_KEY=...
TTS_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_BUCKET=commentary
VIDEO_URL=https://www.youtube.com/watch?v=Rfylh5wwReI&t=6486s
```

### Run

```bash
cd worker
npm install
npm run start
```

The worker analyzes the match, chooses the top highlight windows, generates commentary, uploads TTS audio, and inserts highlight rows into Supabase.

## Notes

- Browsers often block autoplaying audio. The UI shows an **Enable Audio** button if needed.
- Highlight windows are intentionally short to keep the commentary in sync.
- The demo does not re‑encode or re‑stream the YouTube video; it overlays audio in the client.
