CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'video' CHECK (media_type IN ('video', 'movie', 'tv')),
  tmdb_id TEXT,
  imdb_id TEXT,
  season INTEGER,
  episode INTEGER,
  source_filename TEXT NOT NULL,
  source_path TEXT NOT NULL,
  hls_path TEXT,
  poster_path TEXT,
  duration_seconds DOUBLE PRECISION,
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'queued', 'processing', 'ready', 'failed', 'disabled')),
  processing_progress INTEGER NOT NULL DEFAULT 0 CHECK (processing_progress >= 0 AND processing_progress <= 100),
  processing_stage TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS videos_movie_tmdb_unique
  ON videos (tmdb_id)
  WHERE media_type = 'movie' AND tmdb_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS videos_tv_tmdb_episode_unique
  ON videos (tmdb_id, season, episode)
  WHERE media_type = 'tv' AND tmdb_id IS NOT NULL AND season IS NOT NULL AND episode IS NOT NULL;

CREATE INDEX IF NOT EXISTS videos_status_idx ON videos (status);
CREATE INDEX IF NOT EXISTS videos_created_at_idx ON videos (created_at DESC);
