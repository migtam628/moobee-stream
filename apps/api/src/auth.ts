import type { FastifyRequest } from 'fastify';
import { config } from './config.js';
import { matchesApiKey } from './credentials.js';

function unauthorized(): Error & { statusCode: number } {
  return Object.assign(new Error('Unauthorized'), { statusCode: 401 });
}

// Existing owner-only operations retain their separate upload/delete admin key.
export async function requireAdmin(request: FastifyRequest): Promise<void> {
  const key = request.headers['x-api-key'];
  if (typeof key !== 'string' || key !== config.adminApiKey) throw unauthorized();
}

// Only trusted internal MooBee IPTV backends may read normalized catalog
// metadata or request signed playback paths. Never send this key to StreamBoss.
export async function requireService(request: FastifyRequest): Promise<void> {
  if (!matchesApiKey(request.headers['x-service-key'], config.serviceApiKey)) {
    throw unauthorized();
  }
}
