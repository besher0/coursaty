import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const universities = await prisma.university.findMany({
    select: { id: true, provinceId: true },
  });

  // Student.universityId was removed: students are linked to universities
  // through their active StudentEnrollment, so the link to sync is
  // enrollment.universityId → university.provinceId.
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { isActive: true },
    select: { studentId: true, universityId: true },
  });

  const provinceIdByUniversity = new Map(universities.map((u) => [u.id, u.provinceId]));

  for (const enrollment of enrollments) {
    const universityProvinceId = provinceIdByUniversity.get(enrollment.universityId);
    if (!universityProvinceId) continue;

    await prisma.student.updateMany({
      where: {
        id: enrollment.studentId,
        provinceId: { not: universityProvinceId },
      },
      data: { provinceId: universityProvinceId },
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
