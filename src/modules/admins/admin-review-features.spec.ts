import { CourseService } from "../courses/services/course.service";
import { FinancialsService } from "../financials/services/financials.service";
import { VideosService } from "../videos/videos.service";

/**
 * Admin app needs: editing the teacher share of a course, the course name with
 * every code, and reviewing any video.
 */
describe("admin: teacher percentage of a course", () => {
  function service() {
    const tx = {
      course: { update: jest.fn().mockResolvedValue({ id: "course-1" }) },
      studentSubscription: { updateMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) } as any;
    const courses = new CourseService(prisma, {} as any, {} as any, {
      get: jest.fn(),
    } as any);
    jest.spyOn(courses as any, "assertCourseOwnership").mockResolvedValue(undefined);
    jest.spyOn(courses, "getCourseDetails").mockResolvedValue({} as any);
    return { courses, tx };
  }

  it("lets an admin change it (future subscriptions only)", async () => {
    const { courses, tx } = service();

    await courses.updateCourse("course-1", { teacherPercentage: 65 } as any, {
      userId: "admin-1",
      type: "ADMIN",
    });

    expect(tx.course.update).toHaveBeenCalledWith({
      where: { id: "course-1" },
      data: { teacherPercentage: 65 },
    });
  });

  it("never lets a teacher change their own share", async () => {
    const { courses, tx } = service();

    await expect(
      courses.updateCourse("course-1", { teacherPercentage: 100 } as any, {
        userId: "teacher-1",
        type: "TEACHER",
      }),
    ).rejects.toBeDefined();
    expect(tx.course.update).not.toHaveBeenCalled();
  });
});

describe("admin: codes list shows the course of each code", () => {
  it("adds the course id and name to every code", async () => {
    const prisma = {
      code: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "code-1",
            codeValue: "ABC123",
            codeGroup: {
              isForPrinting: true,
              course: { id: "course-1", name: "Anatomy 1" },
            },
          },
        ]),
      },
    };
    const financials = Object.create(FinancialsService.prototype) as FinancialsService;
    (financials as any).prisma = prisma;

    const [code] = await financials.listCodes("group-1");

    expect(code).toEqual({
      id: "code-1",
      codeValue: "ABC123",
      isForPrinting: true,
      courseId: "course-1",
      courseName: "Anatomy 1",
    });
  });
});

describe("admin: video review", () => {
  function videos(adminStatus = "active") {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ userableType: "ADMIN", status: adminStatus }),
      },
      video: {
        findUnique: jest.fn().mockResolvedValue({
          id: "video-1",
          videoUrl: null,
          bunnyVideoId: "11111111-1111-4111-8111-111111111111",
        }),
        update: jest.fn(),
      },
    };
    const bunny = {
      createSignedHlsPlaybackUrl: jest.fn().mockResolvedValue({
        url: "https://vz-test.b-cdn.net/bcdn_token=x/11111111-1111-4111-8111-111111111111/playlist.m3u8",
        expiresAt: new Date("2026-10-15T15:00:00.000Z"),
      }),
      extractBunnyVideoId: jest.fn(),
    };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const service = new VideosService(
      prisma as any,
      bunny as any,
      config as any,
      {} as any,
      { get: jest.fn(), set: jest.fn() } as any,
    );
    return { service, bunny, prisma };
  }

  it("gives an admin a signed playlist for any video, valid for a long review", async () => {
    const { service, bunny } = videos();

    const session = await service.createPlaybackSession(
      "video-1",
      { deviceId: "admin-device" } as any,
      { userId: "admin-user-1", type: "ADMIN" },
    );

    expect(session).toMatchObject({
      playbackUrl: expect.stringContaining("/playlist.m3u8"),
      videoId: "video-1",
      bunnyVideoId: "11111111-1111-4111-8111-111111111111",
    });
    expect(bunny.createSignedHlsPlaybackUrl).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      3 * 60 * 60,
    );
  });

  it("refuses an inactive admin account", async () => {
    const { service, bunny } = videos("blocked");

    await expect(
      service.createPlaybackSession("video-1", { deviceId: "d" } as any, {
        userId: "admin-user-1",
        type: "ADMIN",
      }),
    ).rejects.toBeDefined();
    expect(bunny.createSignedHlsPlaybackUrl).not.toHaveBeenCalled();
  });
});
