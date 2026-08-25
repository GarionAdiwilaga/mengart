import { Worker, Job } from "bullmq";
import { redisConnection, MEDIA_QUEUE_NAME, ProcessMediaJobData } from "@/lib/queue";
import { processArtworkMediaJob } from "@/lib/mediaProcessor";

console.log("🚀 Starting Mengart Media Processing Worker...");

export const mediaWorker = new Worker<ProcessMediaJobData>(
  MEDIA_QUEUE_NAME,
  async (job: Job<ProcessMediaJobData>) => {
    console.log(`[Job ${job.id}] Processing artwork: ${job.data.artworkId} (${job.data.mediaType})`);
    return await processArtworkMediaJob(job.data);
  },
  {
    connection: redisConnection,
    concurrency: 4, // Utilizing our 14 GiB available RAM with 4 parallel threads
  }
);

mediaWorker.on("completed", (job) => {
  console.log(`[Job ${job.id}] Completed successfully.`);
});

mediaWorker.on("failed", (job, err) => {
  console.error(`[Job ${job?.id}] Failed with error:`, err);
});
