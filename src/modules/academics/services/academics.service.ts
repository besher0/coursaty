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
  async createUniversity(name: string, provinceId: number) {
    const province = await this.prisma.province.findUnique({ where: { id: BigInt(provinceId) } });
    if (!province) throw new NotFoundException('Province not found');

    return this.prisma.university.create({
      data: { name, provinceId: BigInt(provinceId) },
    });
  }
  listUniversities() {
    return this.prisma.university.findMany({ include: { province: true } });
  }

  async updateUniversity(id: number, dto: UpdateUniversityDto) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.provinceId !== undefined) {
      const province = await this.prisma.province.findUnique({ where: { id: BigInt(dto.provinceId) } });
      if (!province) throw new NotFoundException('Province not found');
      data.provinceId = BigInt(dto.provinceId);
    }
    return this.prisma.university.update({ where: { id: BigInt(id) }, data });
  }

  deleteUniversity(id: number) {
    return this.prisma.university.delete({ where: { id: BigInt(id) } });
  }

  // Colleges
  createCollege(universityId: number, name: string) {
    return this.prisma.college.create({ data: { universityId: BigInt(universityId), name } });
  }
  listColleges(universityId?: number) {
    return this.prisma.college.findMany({ where: universityId ? { universityId: BigInt(universityId) } : undefined });
  }

  updateCollege(id: number, dto: UpdateCollegeDto) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    return this.prisma.college.update({ where: { id: BigInt(id) }, data });
  }

  deleteCollege(id: number) {
    return this.prisma.college.delete({ where: { id: BigInt(id) } });
  }

  // Departments
  createDepartment(collegeId: number, name: string) {
    return this.prisma.department.create({ data: { collegeId: BigInt(collegeId), name } });
  }
  listDepartments(collegeId?: number) {
    return this.prisma.department.findMany({ where: collegeId ? { collegeId: BigInt(collegeId) } : undefined });
  }

  updateDepartment(id: number, dto: UpdateDepartmentDto) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    return this.prisma.department.update({ where: { id: BigInt(id) }, data });
  }

  deleteDepartment(id: number) {
    return this.prisma.department.delete({ where: { id: BigInt(id) } });
  }

  // Subjects
  createSubject(
    collegeId: number,
    collegeYearId: number,
    seasonId: number,
    subjectName: string,
    departmentId?: number,
    isProgram?: boolean,
  ) {
    return this.prisma.subject.create({
      data: {
        collegeId: BigInt(collegeId),
        collegeYearId: BigInt(collegeYearId),
        seasonId: BigInt(seasonId),
        departmentId: departmentId ? BigInt(departmentId) : undefined,
        subjectName,
        isProgram: isProgram ?? false,
      },
    });
  }
  listSubjects(collegeId: number, departmentId?: number) {
    return this.prisma.subject.findMany({
      where: {
        collegeId: BigInt(collegeId),
        departmentId: departmentId ? BigInt(departmentId) : undefined,
      },
    });
  }

  updateSubject(id: number, dto: UpdateSubjectDto) {
    const raw = dto as Record<string, unknown>;
    if (raw.collegeId !== undefined || raw.collegeYearId !== undefined || raw.seasonId !== undefined) {
      throw new DomainException();
    }
    const data: any = {};
    if (dto.subjectName !== undefined) data.subjectName = dto.subjectName;
    if (dto.departmentId !== undefined) data.departmentId = dto.departmentId ? BigInt(dto.departmentId) : null;
    if (dto.isProgram !== undefined) data.isProgram = dto.isProgram;
    return this.prisma.subject.update({ where: { id: BigInt(id) }, data });
  }

  deleteSubject(id: number) {
    return this.prisma.subject.delete({ where: { id: BigInt(id) } });
  }

  // Years
  createYear(collegeId: number, academicYearId: number, departmentId?: number, isActive?: boolean) {
    return this.prisma.collegeYear.create({
      data: {
        collegeId: BigInt(collegeId),
        academicYearId: BigInt(academicYearId),
        departmentId: departmentId ? BigInt(departmentId) : undefined,
        isActive: isActive ?? true,
      },
    });
  }
  listYears(collegeId: number, departmentId?: number) {
    return this.prisma.collegeYear.findMany({
      where: {
        collegeId: BigInt(collegeId),
        departmentId: departmentId ? BigInt(departmentId) : undefined,
      },
      include: { academicYear: true },
      orderBy: { academicYear: { yearNumber: 'asc' } },
    });
  }

  updateYear(id: number, dto: UpdateYearDto) {
    const data: any = {};
    if (dto.academicYearId !== undefined) data.academicYearId = BigInt(dto.academicYearId);
    if (dto.departmentId !== undefined) data.departmentId = dto.departmentId ? BigInt(dto.departmentId) : null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.collegeYear.update({ where: { id: BigInt(id) }, data });
  }

  deleteYear(id: number) {
    return this.prisma.collegeYear.delete({ where: { id: BigInt(id) } });
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

  updateAcademicYear(id: number, dto: UpdateAcademicYearDto) {
    const data: any = {};
    if (dto.yearName !== undefined) data.yearName = dto.yearName;
    if (dto.yearNumber !== undefined) data.yearNumber = dto.yearNumber;
    return this.prisma.academicYear.update({ where: { id: BigInt(id) }, data });
  }

  deleteAcademicYear(id: number) {
    return this.prisma.academicYear.delete({ where: { id: BigInt(id) } });
  }

  // Seasons
  createSeason(seasonName: string, seasonNumber: number) {
    return this.prisma.season.create({ data: { seasonName, seasonNumber } });
  }
  listSeasons() {
    return this.prisma.season.findMany();
  }

  updateSeason(id: number, dto: UpdateSeasonDto) {
    const data: any = {};
    if (dto.seasonName !== undefined) data.seasonName = dto.seasonName;
    if (dto.seasonNumber !== undefined) data.seasonNumber = dto.seasonNumber;
    return this.prisma.season.update({ where: { id: BigInt(id) }, data });
  }

  deleteSeason(id: number) {
    return this.prisma.season.delete({ where: { id: BigInt(id) } });
  }
}
