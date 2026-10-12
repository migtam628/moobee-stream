import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { db, type VideoRow } from './db.js';
import { requireAdmin, requireService } from './auth.js';
import { transcodeQueue } from './queue.js';
import { createSignedStreamPath } from './signer.js';

const app = Fastify({ logger: true, trustProxy: true });

await app.register(cors, {
  origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map(v => v.trim())
});

await app.register(multipart, {
  limits: {
    fileSize: config.maxUploadBytes,
    files: 1,
    fields: 12
  }
});

app.get('/health', async () => {
  await db.query('SELECT 1');
  return { ok: true, service: 'moobee-stream-api' };
});

app.get('/v1/videos', { preHandler: requireAdmin }, async () => {
  const result = await db.query<VideoRow>('SELECT * FROM videos ORDER BY created_at DESC LIMIT 200');
  return { videos: result.rows };
});

app.get<{ Params: { id: string } }>('/v1/videos/:id', { preHandler: requireAdmin }, async (request, reply) => {
  const result = await db.query<VideoRow>('SELECT * FROM videos WHERE id = $1 OR slug = $1 LIMIT 1', [request.params.id]);
  if (!result.rowCount) return reply.code(404).send({ error: 'Video not found' });
  return result.rows[0];
});

app.get<{ Params: { id: string } }>('/v1/videos/:id/playback', { preHandler: requireService }, async (request, reply) => {
  const result = await db.query<VideoRow>(
    `SELECT * FROM videos WHERE (id = $1 OR slug = $1) AND status = 'ready' LIMIT 1`,
    [request.params.id]
  );
  if (!result.rowCount) return reply.code(404).send({ error: 'Video is not ready or does not exist' });

  const video = result.rows[0];
  const signed = createSignedStreamPath(video.id);
  reply.header('Cache-Control', 'private, no-store');
  return {
    id: video.id,
    slug: video.slug,
    title: video.title,
    stream: signed.path,
    expiresAt: signed.expiresAt,
    poster: video.poster_path ? `/media/posters/${path.basename(video.poster_path)}` : null,
    width: video.width,
    height: video.height,
    durationSeconds: video.duration_seconds
  };
});

app.get<{ Params: { tmdbId: string } }>('/v1/movie/:tmdbId', { preHandler: requireService }, async (request, reply) => {
  const result = await db.query<VideoRow>(
    `SELECT * FROM videos WHERE media_type = 'movie' AND tmdb_id = $1 AND status = 'ready' LIMIT 1`,
    [request.params.tmdbId]
  );
  if (!result.rowCount) return reply.code(404).send({ error: 'Movie not found' });
  const video = result.rows[0];
  return {
    type: 'movie',
    tmdbId: video.tmdb_id,
    videoId: video.id,
    embed: `${config.publicEmbedBaseUrl}/movie/${encodeURIComponent(request.params.tmdbId)}`
  };
});

app.get<{ Params: { tmdbId: string; season: string; episode: string } }>(
  '/v1/tv/:tmdbId/:season/:episode',
  { preHandler: requireService },
  async (request, reply) => {
    const season = Number(request.params.season);
    const episode = Number(request.params.episode);
    if (!Number.isInteger(season) || !Number.isInteger(episode)) {
      return reply.code(400).send({ error: 'Season and episode must be integers' });
    }
    const result = await db.query<VideoRow>(
      `SELECT * FROM videos
       WHERE media_type = 'tv' AND tmdb_id = $1 AND season = $2 AND episode = $3 AND status = 'ready'
       LIMIT 1`,
      [request.params.tmdbId, season, episode]
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'Episode not found' });
    const video = result.rows[0];
    return {
      type: 'tv',
      tmdbId: video.tmdb_id,
      season,
      episode,
      videoId: video.id,
      embed: `${config.publicEmbedBaseUrl}/tv/${encodeURIComponent(request.params.tmdbId)}/${season}/${episode}`
    };
  }
);


// Minimal read-only catalog for a trusted service. No source paths, API keys,
// signing secrets, error messages or upload metadata leave this boundary.
// UUID-ordered pagination avoids silently truncating large catalogs at 200.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function publicVideo(row: VideoRow) {
  return {
    id: row.id, title: row.title, mediaType: row.media_type,
    tmdbId: row.tmdb_id, season: row.season, episode: row.episode,
    status: row.status, durationSeconds: row.duration_seconds,
    width: row.width, height: row.height
  };
}

app.get<{ Querystring: { cursor?: string } }>('/v1/internal/videos',
  { preHandler: requireService }, async (request, reply) => {
    const cursor = request.query.cursor ?? null;
    if (cursor && !UUID.test(cursor)) return reply.code(400).send({ error: 'Invalid cursor' });
    const result = await db.query<VideoRow>(
      'SELECT * FROM videos WHERE ($1::uuid IS NULL OR id > $1::uuid) ORDER BY id LIMIT 101',
      [cursor]);
    const hasMore = result.rows.length > 100;
    const page = result.rows.slice(0, 100);
    reply.header('Cache-Control', 'private, no-store');
    return { videos: page.map(publicVideo), nextCursor: hasMore ? page[page.length - 1].id : null };
  });

app.get<{ Params: { id: string } }>('/v1/internal/videos/:id',
  { preHandler: requireService }, async (request, reply) => {
    if (!UUID.test(request.params.id)) return reply.code(400).send({ error: 'Invalid video UUID' });
    const result = await db.query<VideoRow>(
      'SELECT * FROM videos WHERE id = $1::uuid LIMIT 1', [request.params.id]);
    if (!result.rowCount) return reply.code(404).send({ error: 'Video not found' });
    reply.header('Cache-Control', 'private, no-store');
    return publicVideo(result.rows[0]);
  });

app.post('/v1/admin/videos', { preHandler: requireAdmin }, async (request, reply) => {
  const parts = request.parts();
  const fields: Record<string, string> = {};
  let sourceFilename = '';
  let sourcePath = '';
  const uploadId = crypto.randomUUID();
  const uploadDir = path.join(config.storageRoot, 'uploads', uploadId);
  await fs.promises.mkdir(uploadDir, { recursive: true });

  try {
    for await (const part of parts) {
      if (part.type === 'file') {
        if (sourcePath) {
          part.file.resume();
          return reply.code(400).send({ error: 'Only one video file is supported per request' });
        }
        sourceFilename = path.basename(part.filename || 'source.bin');
        const safeExt = path.extname(sourceFilename).slice(0, 12);
        sourcePath = path.join(uploadDir, `source${safeExt}`);
        await pipeline(part.file, fs.createWriteStream(sourcePath, { flags: 'wx' }));
      } else {
        fields[part.fieldname] = String(part.value ?? '').trim();
      }
    }

    if (!sourcePath) return reply.code(400).send({ error: 'Missing video file field' });
    if (!fields.title) return reply.code(400).send({ error: 'Missing title field' });

    const mediaType = fields.mediaType || 'video';
    if (!['video', 'movie', 'tv'].includes(mediaType)) {
      return reply.code(400).send({ error: 'mediaType must be video, movie, or tv' });
    }

    const season = fields.season ? Number(fields.season) : null;
    const episode = fields.episode ? Number(fields.episode) : null;
    if (mediaType === 'tv' && (!Number.isInteger(season) || !Number.isInteger(episode))) {
      return reply.code(400).send({ error: 'TV uploads require integer season and episode fields' });
    }

    const slug = fields.slug || uploadId;
    const inserted = await db.query<VideoRow>(
      `INSERT INTO videos
       (id, slug, title, media_type, tmdb_id, imdb_id, season, episode, source_filename, source_path, status, processing_stage)
       VALUES ($1, $2, $3, $4, NULLIF($5, ''), NULLIF($6, ''), $7, $8, $9, $10, 'queued', 'queued')
       RETURNING *`,
      [uploadId, slug, fields.title, mediaType, fields.tmdbId ?? '', fields.imdbId ?? '', season, episode, sourceFilename, sourcePath]
    );

    await transcodeQueue.add('transcode', { videoId: uploadId }, {
      jobId: uploadId,
      attempts: 2,
      removeOnComplete: 100,
      removeOnFail: 100
    });

    return reply.code(202).send({
      id: inserted.rows[0].id,
      slug: inserted.rows[0].slug,
      status: inserted.rows[0].status,
      statusUrl: `/api/v1/videos/${inserted.rows[0].id}`
    });
  } catch (error) {
    await fs.promises.rm(uploadDir, { recursive: true, force: true });
    throw error;
  }
});

app.delete<{ Params: { id: string } }>('/v1/admin/videos/:id', { preHandler: requireAdmin }, async (request, reply) => {
  const result = await db.query<VideoRow>('DELETE FROM videos WHERE id = $1 RETURNING *', [request.params.id]);
  if (!result.rowCount) return reply.code(404).send({ error: 'Video not found' });
  const video = result.rows[0];
  await Promise.allSettled([
    fs.promises.rm(path.join(config.storageRoot, 'videos', video.id), { recursive: true, force: true }),
    fs.promises.rm(path.dirname(video.source_path), { recursive: true, force: true })
  ]);
  return reply.code(204).send();
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const statusCode = (error as Error & { statusCode?: number }).statusCode ?? 500;
  reply.code(statusCode).send({ error: statusCode >= 500 ? 'Internal server error' : error.message });
});

await app.listen({ host: '0.0.0.0', port: config.port });
