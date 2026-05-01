import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateUniversityDto } from '../dtos/update-university.dto';
import { UpdateCollegeDto } from '../dtos/update-college.dto';
import { UpdateDepartmentDto } from '../dtos/update-department.dto';
import { UpdateSubjectDto } from '../dtos/update-subject.dto';
import { UpdateYearDto } from '../dtos/update-year.dto';
import { UpdateAcademicYearDto } from '../dtos/update-academic-year.dto';
import { UpdateSeasonDto } from '../dtos/update-season.dto';
import { PrismaService } from '@/prisma/prisma.service';
import { DomainException } from '@/common/errors/domain.exception';

@Injectable()
export class AcademicsService {
  constructor(private readonly prisma: PrismaService) {}

  // Universities
    async createUniversity(name: string, provinceId: string) {
    const province = await this.prisma.province.findUnique({ where: { id: provinceId } });
    if (!province) throw new NotFoundException('المحافظة غير موجودة');

    return this.prisma.university.create({
      data: { name, provinceId },
    });
  }
  listUniversities() {
    return this.prisma.university.findMany({ include: { province: true } });
  }

  async updateUniversity(id: string, dto: UpdateUniversityDto) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.provinceId !== undefined) {
      const province = await this.prisma.province.findUnique({ where: { id: dto.provinceId } });
      if (!province) throw new NotFoundException('المحافظة غير موجودة');
      data.provinceId = dto.provinceId;
    }
    return this.prisma.university.update({ where: { id }, data });
  }

  deleteUniversity(id: string) {
    return this.prisma.university.delete({ where: { id } });
  }

  // Colleges
  createCollege(universityId: string, name: string) {
    return this.prisma.college.create({ data: { universityId, name } });
  }
  listColleges(universityId?: string) {
    return this.prisma.college.findMany({
      where: universityId ? { universityId } : undefined,
      include: {
        _count: {
          select: {
            departments: true,
          },
        },
      },
    }).then(async (colleges) => {
      const collegeIds = colleges.map((college) => college.id);
      const [subjectCounts, programCounts, teacherAffiliations] = await Promise.all([
        this.prisma.subject.groupBy({
          by: ['collegeId'],
          where: { collegeId: { in: collegeIds }, isProgram: false },
          _count: { _all: true },
        }),
        this.prisma.subject.groupBy({
          by: ['collegeId'],
          where: { collegeId: { in: collegeIds }, isProgram: true },
          _count: { _all: true },
        }),
        this.prisma.teacherAffiliation.findMany({
          where: { collegeId: { in: collegeIds } },
          select: { collegeId: true, teacherId: true },
        }),
      ]);

      const subjectsByCollege = new Map(subjectCounts.map((item) => [item.collegeId, item._count._all]));
      const programsByCollege = new Map(programCounts.map((item) => [item.collegeId, item._count._all]));
      const teachersByCollege = new Map<string, Set<string>>();
      for (const affiliation of teacherAffiliations) {
        const set = teachersByCollege.get(affiliation.collegeId) ?? new Set<string>();
        set.add(affiliation.teacherId);
        teachersByCollege.set(affiliation.collegeId, set);
      }

      return colleges.map((college) => ({
        ...college,
        counts: {
          subjects: subjectsByCollege.get(college.id) ?? 0,
          programs: programsByCollege.get(college.id) ?? 0,
          departments: college._count.departments,
          teachers: teachersByCollege.get(college.id)?.size ?? 0,
        },
      }));
    });
  }

  updateCollege(id: string, dto: UpdateCollegeDto) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    return this.prisma.college.update({ where: { id }, data });
  }

  deleteCollege(id: string) {
    return this.prisma.college.delete({ where: { id } });
  }

  // Departments
  createDepartment(collegeId: string, name: string) {
    return this.prisma.department.create({ data: { collegeId, name } });
  }
  listDepartments(collegeId?: string) {
    return this.prisma.department.findMany({ where: collegeId ? { collegeId } : undefined }).then(async (departments) => {
      const departmentIds = departments.map((department) => department.id);
      const [subjectCounts, programCounts, teacherAffiliations] = await Promise.all([
        this.prisma.subject.groupBy({
          by: ['departmentId'],
          where: { departmentId: { in: departmentIds }, isProgram: false },
          _count: { _all: true },
        }),
        this.prisma.subject.groupBy({
          by: ['departmentId'],
          where: { departmentId: { in: departmentIds }, isProgram: true },
          _count: { _all: true },
        }),
        this.prisma.teacherAffiliation.findMany({
          where: { departmentId: { in: departmentIds } },
          select: { departmentId: true, teacherId: true },
        }),
      ]);

      const subjectsByDepartment = new Map(
        subjectCounts
          .filter((item) => item.departmentId)
          .map((item) => [item.departmentId as string, item._count._all]),
      );
      const programsByDepartment = new Map(
        programCounts
          .filter((item) => item.departmentId)
          .map((item) => [item.departmentId as string, item._count._all]),
      );
      const teachersByDepartment = new Map<string, Set<string>>();
      for (const affiliation of teacherAffiliations) {
        if (!affiliation.departmentId) continue;
        const set = teachersByDepartment.get(affiliation.departmentId) ?? new Set<string>();
        set.add(affiliation.teacherId);
        teachersByDepartment.set(affiliation.departmentId, set);
      }

      return departments.map((department) => ({
        ...department,
        counts: {
          subjects: subjectsByDepartment.get(department.id) ?? 0,
          programs: programsByDepartment.get(department.id) ?? 0,
          teachers: teachersByDepartment.get(department.id)?.size ?? 0,
        },
      }));
    });
  }

  updateDepartment(id: string, dto: UpdateDepartmentDto) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    return this.prisma.department.update({ where: { id }, data });
  }

  deleteDepartment(id: string) {
    return this.prisma.department.delete({ where: { id } });
  }

  // Subjects
  createSubject(
    collegeId: string,
    collegeYearId: string,
    seasonId: string,
    subjectName: string,
    departmentId?: string,
    isProgram?: boolean,
    imageUrl?: string,
  ) {
    return this.prisma.subject.create({
      data: {
        collegeId,
        collegeYearId,
        seasonId,
        departmentId: departmentId || undefined,
        subjectName,
        isProgram: isProgram ?? false,
        imageUrl: imageUrl || undefined,
      },
    });
  }
  async listSubjects(collegeId: string, departmentId?: string) {
    const subjects = await this.prisma.subject.findMany({
      where: {
        collegeId,
        departmentId: departmentId || undefined,
      },
      include: {
        collegeYear: {
          include: {
            academicYear: {
              select: {
                id: true,
                yearName: true,
                yearNumber: true,
              },
            },
          },
        },
        season: {
          select: {
            id: true,
            seasonName: true,
            seasonNumber: true,
          },
        },
      },
      orderBy: [
        { collegeYear: { academicYear: { yearNumber: 'asc' } } },
        { season: { seasonNumber: 'asc' } },
        { subjectName: 'asc' },
      ],
    });

    return subjects.map((subject) => ({
      ...subject,
      yearName: subject.collegeYear?.academicYear?.yearName ?? null,
      seasonName: subject.season?.seasonName ?? null,
      year: subject.collegeYear?.academicYear
        ? {
            id: subject.collegeYear.academicYear.id,
            name: subject.collegeYear.academicYear.yearName,
            number: subject.collegeYear.academicYear.yearNumber,
          }
        : null,
      season: subject.season
        ? {
            id: subject.season.id,
            name: subject.season.seasonName,
            number: subject.season.seasonNumber,
          }
        : null,
    }));
  }

  updateSubject(id: string, dto: UpdateSubjectDto) {
    const raw = dto as Record<string, unknown>;
    if (raw.collegeId !== undefined || raw.collegeYearId !== undefined || raw.seasonId !== undefined) {
      throw new DomainException();
    }
    const data: any = {};
    if (dto.subjectName !== undefined) data.subjectName = dto.subjectName;
    if (dto.departmentId !== undefined) data.departmentId = dto.departmentId || null;
    if (dto.isProgram !== undefined) data.isProgram = dto.isProgram;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl || null;
    return this.prisma.subject.update({ where: { id }, data });
  }

  deleteSubject(id: string) {
    return this.prisma.subject.delete({ where: { id } });
  }

  // Years
  createYear(collegeId: string, academicYearId: string, departmentId?: string, isActive?: boolean) {
    return this.prisma.collegeYear.create({
      data: {
        collegeId,
        academicYearId,
        departmentId: departmentId || undefined,
        isActive: isActive ?? true,
      },
    });
  }
  listYears(collegeId: string, departmentId?: string) {
    return this.prisma.collegeYear.findMany({
      where: {
        collegeId,
        departmentId: departmentId || undefined,
      },
      include: { academicYear: true },
      orderBy: { academicYear: { yearNumber: 'asc' } },
    });
  }

  updateYear(id: string, dto: UpdateYearDto) {
    const data: any = {};
    if (dto.academicYearId !== undefined) data.academicYearId = dto.academicYearId;
    if (dto.departmentId !== undefined) data.departmentId = dto.departmentId || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.collegeYear.update({ where: { id }, data });
  }

  deleteYear(id: string) {
    return this.prisma.collegeYear.delete({ where: { id } });
  }

  // Academic Years
  createAcademicYear(yearName: string, yearNumber: number) {
    return this.prisma.academicYear.create({
      data: { yearName, yearNumber },
    });
  }
  listAcademicYears() {
    return this.prisma.academicYear.findMany({ orderBy: { yearNumber: 'asc' } });
  }

  updateAcademicYear(id: string, dto: UpdateAcademicYearDto) {
    const data: any = {};
    if (dto.yearName !== undefined) data.yearName = dto.yearName;
    if (dto.yearNumber !== undefined) data.yearNumber = dto.yearNumber;
    return this.prisma.academicYear.update({ where: { id }, data });
  }

  deleteAcademicYear(id: string) {
    return this.prisma.academicYear.delete({ where: { id } });
  }

  // Seasons
  createSeason(seasonName: string, seasonNumber: number) {
    return this.prisma.season.create({ data: { seasonName, seasonNumber } });
  }
  listSeasons() {
    return this.prisma.season.findMany({
      orderBy: { seasonNumber: 'asc' },
    });
  }

  updateSeason(id: string, dto: UpdateSeasonDto) {
    const data: any = {};
    if (dto.seasonName !== undefined) data.seasonName = dto.seasonName;
    if (dto.seasonNumber !== undefined) data.seasonNumber = dto.seasonNumber;
    return this.prisma.season.update({ where: { id }, data });
  }

  deleteSeason(id: string) {
    return this.prisma.season.delete({ where: { id } });
  }

  async setHomeActiveSeason(id: string) {
    const season = await this.prisma.season.findUnique({ where: { id } });
    if (!season) throw new NotFoundException('الفصل غير موجود');

    await this.prisma.$transaction([
      this.prisma.season.updateMany({ data: { isHomeActive: false } }),
      this.prisma.season.update({
        where: { id },
        data: { isHomeActive: true },
      }),
    ]);

    return this.prisma.season.findUnique({ where: { id } });
  }

  async clearHomeActiveSeason() {
    await this.prisma.season.updateMany({ data: { isHomeActive: false } });
    return { success: true };
  }
}
