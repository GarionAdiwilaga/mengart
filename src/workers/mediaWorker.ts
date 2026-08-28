import { Worker, Job } from "bullmq";
import { redisConnection, MEDIA_QUEUE_NAME, ProcessMediaJobData } from "@/lib/queue";
import { processArtworkMediaJob } from "@/lib/mediaProcessor";

const concurrency = parseInt(process.env.WORKER_CONCURRENCY || "2", 10);
console.log(`🚀 Starting Mengart Media Processing Worker (Concurrency: ${concurrency})...`);

export const mediaWorker = new Worker<ProcessMediaJobData>(
  MEDIA_QUEUE_NAME,
  async (job: Job<ProcessMediaJobData>) => {
    console.log(`[Job ${job.id}] Processing artwork: ${job.data.artworkId} (${job.data.mediaType})`);
    return await processArtworkMediaJob(job.data);
  },
  {
    connection: redisConnection,
    concurrency,
  }
);

mediaWorker.on("completed", (job) => {
  console.log(`[Job ${job.id}] Completed successfully.`);
});

mediaWorker.on("failed", (job, err) => {
  console.error(`[Job ${job?.id}] Failed with error:`, err);
});
