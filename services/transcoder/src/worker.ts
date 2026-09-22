import path from 'node:path';
import pg from 'pg';
import IORedis from 'ioredis';
import { Worker, type Job } from 'bullmq';
import { extractPoster, probeVideo, transcodeToHls } from './media.js';

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
const storageRoot = process.env.STORAGE_ROOT ?? '/storage';
if (!databaseUrl || !redisUrl) throw new Error('DATABASE_URL and REDIS_URL are required');

const { Pool } = pg;
const db = new Pool({ connectionString: databaseUrl });
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

type Video = { id: string; source_path: string };

async function updateVideo(videoId: string, values: { status?: string; progress?: number; stage?: string; error?: string | null; hlsPath?: string; posterPath?: string; width?: number; height?: number; duration?: number }): Promise<void> {
  await db.query(
    `UPDATE videos SET
      status = COALESCE($2, status),
      processing_progress = COALESCE($3, processing_progress),
      processing_stage = COALESCE($4, processing_stage),
      error_message = $5,
      hls_path = COALESCE($6, hls_path),
      poster_path = COALESCE($7, poster_path),
      width = COALESCE($8, width),
      height = COALESCE($9, height),
      duration_seconds = COALESCE($10, duration_seconds),
      updated_at = NOW()
     WHERE id = $1`,
    [videoId, values.status ?? null, values.progress ?? null, values.stage ?? null, values.error ?? null, values.hlsPath ?? null, values.posterPath ?? null, values.width ?? null, values.height ?? null, values.duration ?? null]
  );
}

const worker = new Worker(
  'video-transcode',
  async (job: Job<{ videoId: string }>) => {
    const { videoId } = job.data;
    const result = await db.query<Video>('SELECT id, source_path FROM videos WHERE id = $1 LIMIT 1', [videoId]);
    if (!result.rowCount) throw new Error(`Video ${videoId} no longer exists`);
    const video = result.rows[0];
    const outputRoot = path.join(storageRoot, 'videos', videoId);
    const posterPath = path.join(storageRoot, 'posters', `${videoId}.webp`);

    try {
      await updateVideo(videoId, { status: 'processing', progress: 2, stage: 'probing', error: null });
      const probe = await probeVideo(video.source_path);
      await updateVideo(videoId, { width: probe.width, height: probe.height, duration: probe.durationSeconds, progress: 5, stage: 'poster' });

      await extractPoster(video.source_path, posterPath);
      await updateVideo(videoId, { posterPath, progress: 8, stage: 'transcoding' });

      await transcodeToHls(video.source_path, outputRoot, probe.height, async (completed, total, stage) => {
        const progress = 8 + Math.floor((completed / Math.max(total, 1)) * 88);
        await job.updateProgress(progress);
        await updateVideo(videoId, { progress, stage });
      });

      await updateVideo(videoId, {
        status: 'ready',
        progress: 100,
        stage: 'ready',
        hlsPath: path.join(outputRoot, 'master.m3u8'),
        posterPath,
        error: null
      });
      return { videoId, status: 'ready' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateVideo(videoId, { status: 'failed', stage: 'failed', error: message.slice(0, 4000) });
      throw error;
    }
  },
  { connection, concurrency: Number(process.env.TRANSCODER_CONCURRENCY ?? 1) }
);

worker.on('completed', job => console.log(`Completed transcode job ${job.id}`));
worker.on('failed', (job, err) => console.error(`Failed transcode job ${job?.id}:`, err));

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; shutting down worker`);
  await worker.close();
  await connection.quit();
  await db.end();
  process.exit(0);
}

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
