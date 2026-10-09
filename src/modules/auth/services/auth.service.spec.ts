import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { UserType } from "../dtos/register.dto";

describe("AuthService complete registration", () => {
  function createService() {
    const tx = {
      user: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: "user-1",
            ...data,
            createdAt: new Date(),
          }),
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const jwt = {
      signAsync: jest.fn().mockResolvedValue("token"),
    };
    const students = {
      create: jest.fn().mockResolvedValue({ id: "student-1", name: "Student" }),
    };
    const teachers = {
      create: jest.fn(),
    };
    const admins = {
      create: jest.fn().mockResolvedValue({ id: "admin-1", name: "Admin" }),
    };
    const enrollments = {
      createInitialEnrollment: jest
        .fn()
        .mockResolvedValue({ id: "enrollment-1" }),
      changeAcademicProfile: jest
        .fn()
        .mockResolvedValue({ id: "enrollment-1" }),
    };

    return {
      service: new AuthService(
        prisma as any,
        jwt as any,
        students as any,
        teachers as any,
        admins as any,
        enrollments as any,
      ),
      prisma,
      tx,
      jwt,
      students,
      admins,
    };
  }

  it("creates the profile and user in one transaction and returns a token for students", async () => {
    const { service, prisma, tx, jwt, students } = createService();
    const dto = {
      phone: "0999999999",
      password: "password123",
      userableType: UserType.STUDENT,
      student: {
        name: "Student",
        universityNumber: "100",
        universityId: "11111111-1111-4111-8111-111111111111",
        collegeId: "22222222-2222-4222-8222-222222222222",
        collegeYearId: "33333333-3333-4333-8333-333333333333",
      },
    };

    const result = await service.registerComplete(dto as any);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(students.create).toHaveBeenCalledWith(dto.student, tx);
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userableId: "student-1",
        userableType: UserType.STUDENT,
        status: "active",
      }),
    });
    expect(jwt.signAsync).toHaveBeenCalled();
    expect(result.accessToken).toBe("token");
  });

    describe("AuthService login guest preference migration", () => {
      function createLoginService(options: {
        guestPreference?: Record<string, unknown> | null;
        activeEnrollment?: Record<string, unknown> | null;
        user?: Record<string, unknown>;
      } = {}) {
        const guestPreferenceRepo = {
          findUnique: jest
            .fn()
            .mockResolvedValue(options.guestPreference ?? null),
          delete: jest.fn().mockResolvedValue({}),
        };
        const prisma = {
          user: {
            findUnique: jest.fn(),
          },
          guestPreference: guestPreferenceRepo,
          college: {
            findUnique: jest.fn().mockResolvedValue({
              id: "college-1",
              universityId: "university-1",
            }),
          },
          university: {
            findUnique: jest.fn().mockResolvedValue({ id: "university-1" }),
          },
          department: {
            findUnique: jest.fn().mockResolvedValue({
              id: "department-1",
              collegeId: "college-1",
            }),
          },
          collegeYear: {
            findUnique: jest.fn().mockResolvedValue({
              id: "year-1",
              collegeId: "college-1",
              departmentId: "department-1",
            }),
          },
        };
        const jwt = { signAsync: jest.fn().mockResolvedValue("access-token") };
        const enrollments = {
          getActiveEnrollment: jest
            .fn()
            .mockResolvedValue(options.activeEnrollment ?? null),
          changeAcademicProfile: jest
            .fn()
            .mockResolvedValue({ id: "new-enrollment" }),
        };
        const service = new AuthService(
          prisma as any,
          jwt as any,
          {} as any,
          {} as any,
          {} as any,
          enrollments as any,
        );
        jest.spyOn(service, "validateUser").mockResolvedValue(
          (options.user ?? {
            id: "user-1",
            userableId: "student-1",
            userableType: "STUDENT",
            password: "hashed",
            status: "active",
            loginDeviceId: "device-A",
          }) as any,
        );

        return { service, prisma, jwt, enrollments, guestPreferenceRepo };
      }

      const matchingPreference = {
        deviceId: "guest-device-1",
        collegeId: "college-1",
        departmentId: "department-1",
        collegeYearId: "year-1",
      };

      const matchingEnrollment = {
        universityId: "university-1",
        collegeId: "college-1",
        departmentId: "department-1",
        collegeYearId: "year-1",
        universityNumber: "100",
      };

      it("logs in and consumes a matching guest preference without changing the profile", async () => {
        const { service, enrollments, guestPreferenceRepo, jwt } =
          createLoginService({
            guestPreference: matchingPreference,
            activeEnrollment: matchingEnrollment,
          });

        const result = await service.login({
          phone: "0999999999",
          password: "password123",
          deviceId: "guest-device-1",
          loginDeviceId: "device-A",
        });

        expect(result.accessToken).toBe("access-token");
        expect(jwt.signAsync).toHaveBeenCalled();
        expect(enrollments.changeAcademicProfile).not.toHaveBeenCalled();
        expect(guestPreferenceRepo.delete).toHaveBeenCalledWith({
          where: { deviceId: "guest-device-1" },
        });
      });

      it("changes a different academic profile, consumes the preference, and logs in", async () => {
        const { service, enrollments, guestPreferenceRepo } = createLoginService({
          guestPreference: matchingPreference,
          activeEnrollment: {
            ...matchingEnrollment,
            collegeId: "college-2",
          },
        });

        const result = await service.login({
          phone: "0999999999",
          password: "password123",
          deviceId: "guest-device-1",
          loginDeviceId: "device-A",
        });

        expect(result.accessToken).toBe("access-token");
        expect(enrollments.changeAcademicProfile).toHaveBeenCalledWith(
          "student-1",
          {
            universityId: "university-1",
            collegeId: "college-1",
            departmentId: "department-1",
            collegeYearId: "year-1",
            universityNumber: "100",
          },
        );
        expect(guestPreferenceRepo.delete).toHaveBeenCalledWith({
          where: { deviceId: "guest-device-1" },
        });
      });

      it("logs in without changing academics when no guest preference exists", async () => {
        const { service, enrollments, guestPreferenceRepo } = createLoginService();

        const result = await service.login({
          phone: "0999999999",
          password: "password123",
          deviceId: "guest-device-1",
          loginDeviceId: "device-A",
        });

        expect(result.accessToken).toBe("access-token");
        expect(enrollments.getActiveEnrollment).not.toHaveBeenCalled();
        expect(enrollments.changeAcademicProfile).not.toHaveBeenCalled();
        expect(guestPreferenceRepo.delete).not.toHaveBeenCalled();
      });

      it("keeps invalid credentials unauthorized", async () => {
        const { service } = createLoginService();
        jest
          .spyOn(service, "validateUser")
          .mockRejectedValue(new UnauthorizedException("بيانات الدخول غير صحيحة"));

        await expect(
          service.login({
            phone: "0999999999",
            password: "wrong-password",
            deviceId: "guest-device-1",
          }),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      });
    });
  it("rejects mismatched profile data before opening a transaction", async () => {
    const { service, prisma } = createService();

    await expect(
      service.registerComplete({
        phone: "0999999999",
        password: "password123",
        userableType: UserType.STUDENT,
        teacher: { name: "Teacher" },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("requires an authenticated admin to create an admin account", async () => {
    const { service, prisma } = createService();

    await expect(
      service.registerComplete({
        phone: "0999999999",
        password: "password123",
        userableType: UserType.ADMIN,
        admin: { name: "Admin" },
      } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not return a token for an admin created by another admin", async () => {
    const { service, jwt } = createService();

    const result = await service.registerComplete(
      {
        phone: "0999999999",
        password: "password123",
        userableType: UserType.ADMIN,
        admin: { name: "Admin" },
      } as any,
      { userId: "admin-user", type: "ADMIN" },
    );

    expect(result.accessToken).toBeUndefined();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
