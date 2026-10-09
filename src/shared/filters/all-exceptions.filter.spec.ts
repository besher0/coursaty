import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AllExceptionsFilter } from "./all-exceptions.filter";
import {
  VideoErrorCode,
  videoConflict,
  videoForbidden,
} from "@/modules/videos/video-errors";

describe("AllExceptionsFilter response contract", () => {
  function run(exception: unknown) {
    const logger = { error: jest.fn() };
    const filter = new AllExceptionsFilter(logger as any);
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host: any = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: "/videos/x/playback-session", headers: {} }),
      }),
    };
    filter.catch(exception, host);
    return {
      status: (status.mock.calls[0] as unknown[])[0],
      body: (json.mock.calls[0] as unknown[])[0] as any,
      logger,
    };
  }

  it("puts video error codes in errorCode, which the mobile app matches on", () => {
    const { status, body } = run(
      videoForbidden(
        VideoErrorCode.DEVICE_LIMIT_EXCEEDED_REPLACEMENT_REQUIRED,
        "هذا الحساب مرتبط بجهاز آخر",
      ),
    );

    expect(status).toBe(403);
    expect(body.errorCode).toBe("VIDEO_DEVICE_LIMIT_EXCEEDED_REPLACEMENT_REQUIRED");
    expect(body.message).toBe("هذا الحساب مرتبط بجهاز آخر");
  });

  it("uses 409 for a key mismatch", () => {
    const { status, body } = run(
      videoConflict(
        VideoErrorCode.DEVICE_KEY_MISMATCH_REPLACEMENT_REQUIRED,
        "m",
      ),
    );

    expect(status).toBe(409);
    expect(body.errorCode).toBe("VIDEO_DEVICE_KEY_MISMATCH_REPLACEMENT_REQUIRED");
  });

  it("documents the legacy shape: plain string exceptions put the text in message", () => {
    const { body } = run(new ForbiddenException("SOME_CODE"));

    expect(body.errorCode).toBe("Forbidden");
    expect(body.message).toBe("SOME_CODE");
  });

  it("does not expose Prisma internals to clients but logs them", () => {
    const internal =
      "Invalid `prisma.video.create()` invocation in /app/dist/modules/x.js:12:3\nUnique constraint failed on the fields: (`bunnyVideoId`)";
    const { status, body, logger } = run(
      new Prisma.PrismaClientKnownRequestError(internal, {
        code: "P2002",
        clientVersion: "5.22.0",
        meta: { target: ["bunnyVideoId"] },
      }),
    );

    expect(status).toBe(409);
    expect(body.errorCode).toBe("P2002");
    expect(body.message).not.toContain("/app/dist");
    expect(body.message).not.toContain("prisma.");
    expect(logger.error).toHaveBeenCalledWith(
      internal,
      expect.anything(),
      undefined,
    );
  });
});
