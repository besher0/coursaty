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
    if (!province) throw new NotFoundException('Province not found');

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
      if (!province) throw new NotFoundException('Province not found');
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
    return this.prisma.college.findMany({ where: universityId ? { universityId } : undefined });
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
    return this.prisma.department.findMany({ where: collegeId ? { collegeId } : undefined });
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
  ) {
    return this.prisma.subject.create({
      data: {
        collegeId,
        collegeYearId,
        seasonId,
        departmentId: departmentId || undefined,
        subjectName,
        isProgram: isProgram ?? false,
      },
    });
  }
  listSubjects(collegeId: string, departmentId?: string) {
    return this.prisma.subject.findMany({
      where: {
        collegeId,
        departmentId: departmentId || undefined,
      },
    });
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

  updateAcademicYear(id: number, dto: UpdateAcademicYearDto) {
    const data: any = {};
    if (dto.yearName !== undefined) data.yearName = dto.yearName;
    if (dto.yearNumber !== undefined) data.yearNumber = dto.yearNumber;
    return this.prisma.academicYear.update({ where: { id: String(id) }, data });
  }

  deleteAcademicYear(id: number) {
    return this.prisma.academicYear.delete({ where: { id: String(id) } });
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
    return this.prisma.season.update({ where: { id: String(id) }, data });
  }

  deleteSeason(id: number) {
    return this.prisma.season.delete({ where: { id: String(id) } });
  }
}
