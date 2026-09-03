import { Queue } from "bullmq";
import IORedis from "ioredis";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const redisUrl = process.env.REDIS_URL;
if (!redisUrl && process.env.NODE_ENV === "production") {
  throw new Error("FATAL: REDIS_URL must be configured in production environment.");
}

const finalRedisUrl = redisUrl || "redis://localhost:6379";

// Shared Redis connection instance
export const redisConnection = new IORedis(finalRedisUrl, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

export const MEDIA_QUEUE_NAME = "artwork-media-processing";

export interface ProcessMediaJobData {
  artworkId: string;
  versionId: string;
  tempFilename: string;
  mediaType: "image" | "video";
  originalFilename: string;
  userId: string;
}

// BullMQ Queue instance for dispatching media tasks
export const mediaQueue = new Queue<ProcessMediaJobData>(MEDIA_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 3000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
