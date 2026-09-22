import type { FastifyRequest } from 'fastify';
import { config } from './config.js';

export async function requireAdmin(request: FastifyRequest): Promise<void> {
  const key = request.headers['x-api-key'];
  if (typeof key !== 'string' || key !== config.adminApiKey) {
    const error = new Error('Unauthorized') as Error & { statusCode?: number };
    error.statusCode = 401;
    throw error;
  }
}
