import crypto from 'node:crypto';
import { config } from './config.js';

export function createSignedStreamPath(videoId: string): { path: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + config.streamTokenTtlSeconds;
  const payload = `${expiresAt}${videoId} ${config.streamSigningSecret}`;
  const token = crypto.createHash('md5').update(payload).digest('base64url');
  return {
    path: `/hls/${encodeURIComponent(videoId)}/${expiresAt}/${token}/master.m3u8`,
    expiresAt
  };
}
