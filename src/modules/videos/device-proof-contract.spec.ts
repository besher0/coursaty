import { createHash, generateKeyPairSync } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { VideosService } from "./videos.service";

const contract: {
  publicKey: string;
  cases: Array<{
    action: string;
    videoId: string;
    deviceId: string;
    timestamp: number;
    challenge: string;
    canonical: string;
    signature: string;
    requestHash: string;
  }>;
} = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "device-proof-contract.json"), "utf8"),
);

const licenseKeyPem = generateKeyPairSync("ed25519")
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();

/**
 * Cross-language contract. The same fixture is asserted by the Flutter test
 * `test/features/my_downloads/device_proof_contract_test.dart`, which checks
 * that the app builds byte-identical canonical payloads and request hashes.
 * This side checks the backend accepts that exact signature format
 * (SHA256withECDSA, DER, base64url) through the real session code path.
 */
describe("device proof contract (shared with Flutter)", () => {
  function serviceFor(action: string, publicKey = contract.publicKey) {
    const fixture = contract.cases.find((c) => c.action === action)!;
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user-1",
          userableId: "student-1",
          userableType: "STUDENT",
          status: "active",
        }),
      },
      student: { findUnique: jest.fn().mockResolvedValue({ id: "student-1" }) },
      video: {
        findUnique: jest.fn().mockResolvedValue({
          id: fixture.videoId,
          videoUrl: "https://video.bunnycdn.com/play/1/11111111-1111-4111-8111-111111111111",
          bunnyVideoId: "11111111-1111-4111-8111-111111111111",
          size: null,
          isFree: true,
          contentVersion: 1,
          offlineDownloadEnabled: true,
          lecture: {
            id: "lecture-1",
            courseId: "course-1",
            course: {
              id: "course-1",
              isFree: true,
              status: "APPROVED",
              expiresAt: null,
              teacher: { isVisibleToStudents: true },
            },
          },
        }),
        update: jest.fn(),
      },
      studentSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      studentDevice: {
        findUnique: jest.fn().mockResolvedValue({
          id: "row-1",
          deviceId: fixture.deviceId,
          revokedAt: null,
          videoPublicKey: publicKey,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      videoPlaybackChallenge: {
        findUnique: jest.fn().mockResolvedValue({
          id: "challenge-1",
          challengeHash: fixture.challenge,
          userId: "user-1",
          videoId: fixture.videoId,
          deviceId: fixture.deviceId,
          createdAt: new Date(fixture.timestamp),
          expiresAt: new Date(Date.now() + 60_000),
          usedAt: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      videoPlaybackSession: { create: jest.fn().mockResolvedValue({ id: "s" }) },
      offlineVideoLicense: { create: jest.fn().mockResolvedValue({ id: "l" }) },
    };
    const bunny: any = {
      extractBunnyVideoId: jest.fn(),
      createSignedHlsPlaybackUrl: jest.fn().mockResolvedValue({
        url: "https://vz-test.b-cdn.net/x/playlist.m3u8",
        expiresAt: new Date(),
      }),
    };
    const config: any = {
      get: (key: string) =>
        ({
          VIDEO_DEVICE_SIGNATURE_ENFORCE: "true",
          OFFLINE_LICENSE_PRIVATE_KEY_PEM: licenseKeyPem,
        })[key],
    };
    const cache: any = { get: jest.fn().mockResolvedValue(0), set: jest.fn() };
    const playIntegrity: any = { verify: jest.fn() };
    return {
      fixture,
      service: new VideosService(prisma, bunny, config, playIntegrity, cache),
    };
  }

  it("fixture request hash is sha256/base64url of the canonical payload", () => {
    for (const fixture of contract.cases) {
      expect(
        createHash("sha256").update(fixture.canonical, "utf8").digest("base64url"),
      ).toBe(fixture.requestHash);
    }
  });

  it("accepts the shared playback signature", async () => {
    const { service, fixture } = serviceFor("video_playback");

    await expect(
      service.createPlaybackSession(
        fixture.videoId,
        {
          deviceId: fixture.deviceId,
          challengeId: "challenge-1",
          deviceSignature: fixture.signature,
        },
        { userId: "user-1", type: "STUDENT" },
      ),
    ).resolves.toMatchObject({ videoId: fixture.videoId });
  });

  describe("signatures captured from a real Android Keystore", () => {
    // Produced by flutter/integration_test/keystore_signature_test.dart on a
    // physical phone (MainActivity.signVideoPayload, hardware-backed key).
    const capture: {
      device: string;
      publicKey: string;
      proofs: Array<{ action: string; canonical: string; signature: string }>;
    } = JSON.parse(
      readFileSync(
        join(__dirname, "__fixtures__", "android-keystore-proof.json"),
        "utf8",
      ),
    );

    it("signs the exact canonical payload the backend builds", () => {
      for (const proof of capture.proofs) {
        const fixture = contract.cases.find((c) => c.action === proof.action)!;
        expect(proof.canonical).toBe(fixture.canonical);
      }
    });

    it.each(["video_playback", "video_download"])(
      "backend verifies the device's %s signature",
      async (action) => {
        const { service, fixture } = serviceFor(action, capture.publicKey);
        const proof = capture.proofs.find((p) => p.action === action)!;
        const dto = {
          deviceId: fixture.deviceId,
          challengeId: "challenge-1",
          deviceSignature: proof.signature,
        };
        const student = { userId: "user-1", type: "STUDENT" };

        const result =
          action === "video_playback"
            ? service.createPlaybackSession(fixture.videoId, dto, student)
            : service.createDownloadSession(fixture.videoId, dto, student);
        await expect(result).resolves.toMatchObject({ videoId: fixture.videoId });
      },
    );

    it("rejects the device's playback signature when presented for a download", async () => {
      const { service, fixture } = serviceFor("video_download", capture.publicKey);
      const playback = capture.proofs.find((p) => p.action === "video_playback")!;

      await expect(
        service.createDownloadSession(
          fixture.videoId,
          {
            deviceId: fixture.deviceId,
            challengeId: "challenge-1",
            deviceSignature: playback.signature,
          },
          { userId: "user-1", type: "STUDENT" },
        ),
      ).rejects.toThrow("تعذر التحقق من توقيع الجهاز");
    });
  });

  it("accepts the shared download signature", async () => {
    const { service, fixture } = serviceFor("video_download");

    await expect(
      service.createDownloadSession(
        fixture.videoId,
        {
          deviceId: fixture.deviceId,
          challengeId: "challenge-1",
          deviceSignature: fixture.signature,
        },
        { userId: "user-1", type: "STUDENT" },
      ),
    ).resolves.toMatchObject({ videoId: fixture.videoId });
  });
});
