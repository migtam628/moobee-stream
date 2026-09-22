import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;
export const db = new Pool({ connectionString: config.databaseUrl });

export type VideoRow = {
  id: string;
  slug: string;
  title: string;
  media_type: 'video' | 'movie' | 'tv';
  tmdb_id: string | null;
  imdb_id: string | null;
  season: number | null;
  episode: number | null;
  source_filename: string;
  source_path: string;
  hls_path: string | null;
  poster_path: string | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  status: string;
  processing_progress: number;
  processing_stage: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};
