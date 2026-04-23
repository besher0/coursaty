import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const universities = await prisma.university.findMany({
    select: { id: true, provinceId: true },
  });

  for (const uni of universities) {
    await prisma.student.updateMany({
      where: { universityId: uni.id, provinceId: { not: uni.provinceId } },
      data: { provinceId: uni.provinceId },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
