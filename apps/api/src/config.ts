function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL'),
  adminApiKey: required('ADMIN_API_KEY'),
  // Missing key fails closed for internal catalog and playback routes.
  // Only the MooBee IPTV backend should possess this secret.
  serviceApiKey: process.env.STREAM_SERVICE_API_KEY ?? '',
  streamSigningSecret: required('STREAM_SIGNING_SECRET'),
  streamTokenTtlSeconds: Number(process.env.STREAM_TOKEN_TTL_SECONDS ?? 7200),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 20 * 1024 * 1024 * 1024),
  storageRoot: process.env.STORAGE_ROOT ?? '/storage',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  publicEmbedBaseUrl: (process.env.PUBLIC_EMBED_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '')
};
