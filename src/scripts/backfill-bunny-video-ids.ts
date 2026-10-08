import { PrismaClient } from '@prisma/client';
import { BunnyService } from '@/shared/bunny/bunny.service';

const prisma = new PrismaClient();
const bunny = new BunnyService({
  get: (key: string) => process.env[key],
} as any);

async function main() {
  const videos = await prisma.video.findMany({
    where: { bunnyVideoId: null },
    select: { id: true, videoName: true, videoUrl: true },
    orderBy: { id: 'asc' },
  });

  let updated = 0;
  let skippedNoGuid = 0;
  let skippedDuplicate = 0;

  for (const video of videos) {
    const bunnyVideoId = bunny.extractBunnyVideoId(video.videoUrl);
    if (!bunnyVideoId) {
      skippedNoGuid += 1;
      continue;
    }

    const existing = await prisma.video.findFirst({
      where: {
        bunnyVideoId,
        NOT: { id: video.id },
      },
      select: { id: true },
    });
    if (existing) {
      skippedDuplicate += 1;
      console.warn(
        `SKIP_DUPLICATE videoId=${video.id} extractedBunnyVideoId=${bunnyVideoId} existingVideoId=${existing.id}`,
      );
      continue;
    }

    await prisma.video.update({
      where: { id: video.id },
      data: { bunnyVideoId },
    });
    updated += 1;
    console.log(`UPDATED videoId=${video.id} bunnyVideoId=${bunnyVideoId}`);
  }

  console.log(
    JSON.stringify(
      {
        scannedNullBunnyVideoId: videos.length,
        updated,
        skippedNoGuid,
        skippedDuplicate,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
