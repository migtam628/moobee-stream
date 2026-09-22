import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from './config.js';

const connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
export const transcodeQueue = new Queue('video-transcode', { connection });
