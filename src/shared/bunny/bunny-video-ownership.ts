import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

export const BUNNY_VIDEO_GUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export function requireBunnyVideoGuid(value?: string | null): string {
  const guid = String(value ?? "").trim();
  if (!BUNNY_VIDEO_GUID_PATTERN.test(guid)) {
    throw new BadRequestException("videoId يجب أن يكون Bunny Stream GUID صالح");
  }
  return guid;
}

/**
 * Bunny GUIDs are visible to clients (lecture metadata, playback sessions), so
 * the TUS endpoints that accept a GUID must not let one teacher re-sign an
 * upload over, or pull signed playback links for, another teacher's video.
 *
 * A GUID that is not yet attached to any Video row is a fresh upload and is
 * allowed; once it is attached, only the owning teacher (or an admin) may use it.
 */
export async function assertBunnyVideoWritableBy(
  prisma: PrismaService,
  bunnyVideoId: string,
  user?: { userId: string | number; type: string },
) {
  // Same convention as assertCourseOwnership: no user = trusted internal call
  // (controllers always pass the JWT user).
  if (!user || user.type === "ADMIN") return;

  const attached = await prisma.video.findFirst({
    where: {
      OR: [
        { bunnyVideoId },
        { bunnyVideoId: null, videoUrl: { contains: bunnyVideoId } },
      ],
    },
    select: { lecture: { select: { course: { select: { teacherId: true } } } } },
  });
  if (!attached) return;

  const dbUser = user
    ? await prisma.user.findUnique({
        where: { id: String(user.userId) },
        select: { userableId: true, userableType: true },
      })
    : null;
  if (
    !dbUser ||
    dbUser.userableType !== "TEACHER" ||
    attached.lecture.course.teacherId !== dbUser.userableId
  ) {
    throw new ForbiddenException("لا تملك صلاحية على هذا الفيديو");
  }
}
