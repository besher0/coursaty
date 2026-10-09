import { INestApplication } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { configureApp } from "./app.setup";
import { AuthController } from "./modules/auth/controllers/auth.controller";
import { AuthService } from "./modules/auth/services/auth.service";
import { InternalVideoEdgeController } from "./modules/videos/videos.controller";
import { VideosService } from "./modules/videos/videos.service";
import { AllExceptionsFilter } from "./shared/filters/all-exceptions.filter";
import { LoggerService } from "./shared/logger/logger.service";

/**
 * The app API lives under /v2. Unversioned paths are retired so app builds
 * from before /v2 stop working with an "update the app" answer, while the
 * edge gateway's server-to-server route keeps its path.
 */
describe("API routes", () => {
  let app: INestApplication;
  const auth = { login: jest.fn().mockResolvedValue({ accessToken: "token" }) };
  const videos = {
    authorizeEdgeRequest: jest
      .fn()
      .mockResolvedValue({ allowed: true, sourceUrl: "https://origin" }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, InternalVideoEdgeController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: VideosService, useValue: videos },
        { provide: LoggerService, useValue: { error: jest.fn() } },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const credentials = { phone: "0999999999", password: "password123" };

  it("serves the app under /v2 and passes the device header to login", async () => {
    await request(app.getHttpServer())
      .post("/v2/auth/login")
      .set("X-Coursaty-Device", "device-A")
      .send(credentials)
      .expect(201, { accessToken: "token" });

    expect(auth.login).toHaveBeenCalledWith(
      expect.objectContaining(credentials),
      "device-A",
    );
  });

  it("answers old app builds on the retired paths with an update message", async () => {
    auth.login.mockClear();

    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .set("User-Agent", "device OS:Android , application version: 1.0.0")
      .send(credentials)
      .expect(426);

    expect(response.body).toMatchObject({
      errorCode: "APP_UPDATE_REQUIRED",
      message: "يرجى تحديث التطبيق إلى آخر إصدار من المتجر لمتابعة الاستخدام",
    });
    expect(auth.login).not.toHaveBeenCalled();
  });

  it("keeps a plain 404 for unknown /v2 routes", async () => {
    const response = await request(app.getHttpServer())
      .get("/v2/does-not-exist")
      .expect(404);

    expect(response.body.errorCode).not.toBe("APP_UPDATE_REQUIRED");
  });

  it("keeps the edge gateway's internal route unversioned", async () => {
    await request(app.getHttpServer())
      .post("/internal/video-edge/authorize")
      .set("X-Edge-Auth", "secret")
      .send({ sessionToken: "t", bunnyVideoId: "guid", path: "/guid/playlist.m3u8" })
      .expect(201);

    expect(videos.authorizeEdgeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ edgeSecret: "secret", sessionToken: "t" }),
    );
  });
});
