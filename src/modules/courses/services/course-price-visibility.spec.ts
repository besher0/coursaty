import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateCourseDto } from "../dtos/create-course.dto";
import { UpdateCourseDto } from "../dtos/update-course.dto";
import { CourseService } from "./course.service";
import { DashboardService } from "@/modules/academics/services/dashboard.service";
import { CourseInterestsService } from "@/modules/students/services/course-interests.service";

const systemSettings = { getPaymentQrUrl: jest.fn().mockResolvedValue(null) };

function createPrisma() {
  return {
    user: { findUnique: jest.fn().mockResolvedValue({ userableId: "teacher-1" }) },
    courseCategory: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: "category-1", requiresAcademicLinks: false }),
    },
    university: { findUnique: jest.fn().mockResolvedValue({ id: "university-1" }) },
    college: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: "college-1", universityId: "university-1" }),
    },
    teacherAffiliation: {
      findFirst: jest.fn().mockResolvedValue({ id: "affiliation-1" }),
    },
    course: { create: jest.fn().mockResolvedValue({ id: "course-1" }) },
  };
}

const baseCreateDto = {
  name: "Course",
  categoryId: "category-1",
  universityId: "university-1",
  collegeId: "college-1",
  price: 400,
};

function detailsCourse(overrides: Record<string, unknown> = {}) {
  return {
    id: "course-a",
    imageUrl: null,
    name: "Course A",
    price: 100,
    courseDiscountPercentage: 0,
    isFree: false,
    isCompleted: false,
    expiresAt: null,
    subjectId: null,
    universityId: null,
    collegeId: null,
    departmentId: null,
    categoryId: null,
    introVideoUrl: null,
    discussionGroupUrl: null,
    telegramUrl: null,
    teacherId: "teacher-1",
    teacher: {
      id: "teacher-1",
      name: "Teacher One",
      image: null,
      instagramUrl: null,
      isVisibleToStudents: true,
    },
    collegeYear: null,
    season: null,
    lectures: [],
    codeGroups: [],
    _count: { subscriptions: 0, lectures: 0 },
    ...overrides,
  };
}

describe("Course price visibility", () => {
  describe("DTO", () => {
    it("accepts a boolean on create and update", async () => {
      const onField = (errors: { property: string }[]) =>
        errors.filter((e) => e.property === "isPriceVisible");
      expect(
        onField(
          await validate(
            plainToInstance(CreateCourseDto, { ...baseCreateDto, isPriceVisible: false }),
          ),
        ),
      ).toEqual([]);
      expect(
        await validate(plainToInstance(UpdateCourseDto, { isPriceVisible: true })),
      ).toEqual([]);
    });

    it("rejects a non-boolean value", async () => {
      const errors = await validate(
        plainToInstance(UpdateCourseDto, { isPriceVisible: "no" }),
      );
      expect(errors.map((e) => e.property)).toContain("isPriceVisible");
    });
  });

  describe("create / update", () => {
    it("defaults to visible when create omits it", async () => {
      const prisma = createPrisma();
      const service = new CourseService(prisma as any, {} as any, {} as any, systemSettings as any);

      await service.createCourse(baseCreateDto as any, { userId: "user-1", type: "TEACHER" });

      expect(prisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isPriceVisible: true }) }),
      );
    });

    it("stores a hidden price on create", async () => {
      const prisma = createPrisma();
      const service = new CourseService(prisma as any, {} as any, {} as any, systemSettings as any);

      await service.createCourse(
        { ...baseCreateDto, isPriceVisible: false } as any,
        { userId: "user-1", type: "TEACHER" },
      );

      expect(prisma.course.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isPriceVisible: false }) }),
      );
    });

    it("updates only the visibility when that is all that changes", async () => {
      const tx = {
        course: { update: jest.fn().mockResolvedValue({ id: "course-1" }) },
        studentSubscription: { updateMany: jest.fn() },
      };
      const prisma = { $transaction: jest.fn((callback) => callback(tx)) } as any;
      const service = new CourseService(prisma, {} as any, {} as any, systemSettings as any);
      jest.spyOn(service as any, "assertCourseOwnership").mockResolvedValue(undefined);
      jest.spyOn(service, "getCourseDetails").mockResolvedValue({} as any);

      await service.updateCourse("course-1", { isPriceVisible: false } as any, {
        userId: "teacher-user-1",
        type: "TEACHER",
      });

      expect(tx.course.update).toHaveBeenCalledWith({
        where: { id: "course-1" },
        data: { isPriceVisible: false },
      });
    });

    it("leaves visibility untouched when an update does not send it", async () => {
      const tx = {
        course: { update: jest.fn().mockResolvedValue({ id: "course-1" }) },
        studentSubscription: { updateMany: jest.fn() },
      };
      const prisma = { $transaction: jest.fn((callback) => callback(tx)) } as any;
      const service = new CourseService(prisma, {} as any, {} as any, systemSettings as any);
      jest.spyOn(service as any, "assertCourseOwnership").mockResolvedValue(undefined);
      jest.spyOn(service, "getCourseDetails").mockResolvedValue({} as any);

      await service.updateCourse("course-1", { name: "Renamed" } as any, {
        userId: "admin-1",
        type: "ADMIN",
      });

      expect(tx.course.update.mock.calls[0][0].data).not.toHaveProperty("isPriceVisible");
    });
  });

  describe("responses", () => {
    function detailsService(course: Record<string, unknown>) {
      const prisma: any = {
        course: { findUnique: jest.fn().mockResolvedValue(course) },
        lecture: { findMany: jest.fn().mockResolvedValue([]) },
      };
      return new CourseService(prisma, {} as any, {} as any, systemSettings as any);
    }

    it("course details expose the flag next to the prices", async () => {
      const result: any = await detailsService(
        detailsCourse({ isPriceVisible: false }),
      ).getCourseDetails("course-a");

      expect(result.course.isPriceVisible).toBe(false);
      // Prices stay in the payload: subscriptions still need them.
      expect(result.course.basePrice).toBe(100);
    });

    it("rows saved before the column existed read as visible", async () => {
      const result: any = await detailsService(detailsCourse()).getCourseDetails(
        "course-a",
      );

      expect(result.course.isPriceVisible).toBe(true);
    });

    it("course cards carry the flag", () => {
      const dashboard = new DashboardService({} as any);
      const card = (dashboard as any).buildCourseCard({
        id: "c",
        name: "n",
        price: 10,
        isPriceVisible: false,
      });

      expect(card).toMatchObject({ price: 10, isPriceVisible: false });
    });

    it("course interests (payment info) carry the flag", () => {
      const interests = new CourseInterestsService({} as any, {} as any);
      const mapped = (interests as any).mapCourse(
        { id: "c", name: "n", price: 10, isPriceVisible: false },
        null,
      );

      expect(mapped).toMatchObject({ basePrice: 10, isPriceVisible: false });
    });
  });
});
