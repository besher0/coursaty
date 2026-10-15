import { ForbiddenException } from "@nestjs/common";
import { AdminsService } from "../admins/services/admins.service";
import { UsersController } from "./controllers/users.controller";
import { UsersService } from "./services/users.service";

/** Password hashes and other users' accounts must never leak. */
describe("admin student profile", () => {
  it("neither reads nor returns the password hash", async () => {
    const prisma: any = {
      student: {
        findFirst: jest.fn().mockResolvedValue({
          id: "student-1",
          name: "Student",
          createdAt: new Date(),
          enrollments: [],
          subscriptions: [],
        }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: "user-1",
          phone: "0999999999",
          status: "active",
          createdAt: new Date(),
        }),
      },
    };
    const admins = Object.create(AdminsService.prototype) as AdminsService;
    (admins as any).prisma = prisma;
    jest.spyOn(admins as any, "getCourseDurationsMap").mockResolvedValue(new Map());

    const profile: any = await admins.getStudentProfile("student-1");

    expect(prisma.user.findFirst.mock.calls[0][0].select).not.toHaveProperty("password");
    expect(profile.student).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(profile)).not.toMatch(/\$2[aby]\$/); // bcrypt hash
  });
});

describe("FCM token update", () => {
  it("returns only the id and token, not the user row", async () => {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "user-1" }),
        update: jest.fn().mockResolvedValue({ id: "user-1", fcmToken: "t" }),
      },
    };
    const users = new UsersService(prisma, {} as any);

    await users.updateFcmToken("user-1", "t");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { fcmToken: "t" },
      select: { id: true, fcmToken: true },
    });
  });

  it("lets a user change only their own token", async () => {
    const users = { updateFcmToken: jest.fn().mockResolvedValue({}) };
    const controller = new UsersController(users as any);
    const self = { user: { userId: "user-1", type: "STUDENT" } };

    await controller.updateFcm("user-1", { fcmToken: "t" } as any, self);
    await expect(
      controller.updateFcm("user-2", { fcmToken: "t" } as any, self),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await controller.updateFcm("user-2", { fcmToken: "t" } as any, {
      user: { userId: "admin-1", type: "ADMIN" },
    });

    expect(users.updateFcmToken).toHaveBeenCalledTimes(2);
  });
});
