import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { UploadsService } from "@/modules/uploads/uploads.service";
import {
  assertBunnyVideoWritableBy,
  requireBunnyVideoGuid,
} from "./bunny-video-ownership";

describe("Bunny GUID ownership for TUS endpoints", () => {
  const guid = "11111111-1111-4111-8111-111111111111";
  const teacher = { userId: "teacher-user-1", type: "TEACHER" };

  function prismaWith(attached: any, userableId = "teacher-1") {
    return {
      video: { findFirst: jest.fn().mockResolvedValue(attached) },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ userableId, userableType: "TEACHER" }),
      },
    } as any;
  }

  const ownedBy = (teacherId: string) => ({
    lecture: { course: { teacherId } },
  });

  it("allows a GUID that is not attached to any video yet (fresh upload)", async () => {
    await expect(
      assertBunnyVideoWritableBy(prismaWith(null), guid, teacher),
    ).resolves.toBeUndefined();
  });

  it("allows the owning teacher", async () => {
    await expect(
      assertBunnyVideoWritableBy(prismaWith(ownedBy("teacher-1")), guid, teacher),
    ).resolves.toBeUndefined();
  });

  it("rejects another teacher's video, including legacy rows matched by URL", async () => {
    const prisma = prismaWith(ownedBy("teacher-2"));

    await expect(
      assertBunnyVideoWritableBy(prisma, guid, teacher),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.video.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { bunnyVideoId: guid },
            { bunnyVideoId: null, videoUrl: { contains: guid } },
          ],
        },
      }),
    );
  });

  it("lets admins through without a lookup", async () => {
    const prisma = prismaWith(ownedBy("teacher-2"));

    await assertBunnyVideoWritableBy(prisma, guid, {
      userId: "admin",
      type: "ADMIN",
    });
    expect(prisma.video.findFirst).not.toHaveBeenCalled();
  });

  it("validates GUID format", () => {
    expect(requireBunnyVideoGuid(` ${guid} `)).toBe(guid);
    expect(() => requireBunnyVideoGuid("nullplay_")).toThrow(BadRequestException);
  });

  describe("UploadsService endpoints", () => {
    const bunny = {
      signTusUpload: jest.fn().mockReturnValue({
        tusEndpoint: "https://video.bunnycdn.com/tusupload",
        libraryId: "123",
        authorizationExpire: 1,
        authorizationSignature: "sig",
        headers: {},
      }),
      getStreamPlaybackPayload: jest.fn().mockResolvedValue({
        streamPlayUrl: `https://video.bunnycdn.com/play/123/${guid}`,
        streamEmbedUrl: `https://player.mediadelivery.net/embed/123/${guid}`,
        streamMasterPlaylistUrl: "https://vz-test.b-cdn.net/bcdn_token=x/playlist.m3u8",
      }),
    };

    beforeEach(() => jest.clearAllMocks());

    it("will not re-sign a TUS upload over another teacher's video", async () => {
      const service = new UploadsService(
        bunny as any,
        prismaWith(ownedBy("teacher-2")),
      );

      await expect(
        service.refreshTusVideoUpload({ videoId: guid }, teacher),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(bunny.signTusUpload).not.toHaveBeenCalled();
    });

    it("will not hand signed playback links for another teacher's video", async () => {
      const service = new UploadsService(
        bunny as any,
        prismaWith(ownedBy("teacher-2")),
      );

      await expect(
        service.completeTusVideoUpload({ videoId: guid }, teacher),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(bunny.getStreamPlaybackPayload).not.toHaveBeenCalled();
    });

    it("rejects a malformed GUID on refresh", async () => {
      const service = new UploadsService(bunny as any, prismaWith(null));

      await expect(
        service.refreshTusVideoUpload({ videoId: "not-a-guid" }, teacher),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("still refreshes the teacher's own in-flight upload", async () => {
      const service = new UploadsService(bunny as any, prismaWith(null));

      await expect(
        service.refreshTusVideoUpload({ videoId: guid }, teacher),
      ).resolves.toMatchObject({ upload: { videoId: guid } });
    });
  });
});
