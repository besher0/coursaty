import { Injectable } from '@nestjs/common';
import { UpdateUniversityDto } from '../dtos/update-university.dto';
import { UpdateCollegeDto } from '../dtos/update-college.dto';
import { UpdateDepartmentDto } from '../dtos/update-department.dto';
import { UpdateSubjectDto } from '../dtos/update-subject.dto';
import { UpdateYearDto } from '../dtos/update-year.dto';
import { UpdateSeasonDto } from '../dtos/update-season.dto';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class AcademicsService {
  constructor(private readonly prisma: PrismaService) {}

  // Universities
  createUniversity(name: string) {
    return this.prisma.university.create({ data: { name } });
  }
  listUniversities() {
    return this.prisma.university.findMany();
  }

  updateUniversity(id: number, dto: UpdateUniversityDto) {
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
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
  createSubject(collegeId: number, subjectName: string, departmentId?: number) {
    return this.prisma.subject.create({
      data: {
        collegeId: BigInt(collegeId),
        departmentId: departmentId ? BigInt(departmentId) : undefined,
        subjectName,
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
    const data: any = {};
    if (dto.subjectName !== undefined) data.subjectName = dto.subjectName;
    return this.prisma.subject.update({ where: { id: BigInt(id) }, data });
  }

  deleteSubject(id: number) {
    return this.prisma.subject.delete({ where: { id: BigInt(id) } });
  }

  // Years
  createYear(collegeId: number, yearName: string, yearNumber: number, departmentId?: number) {
    return this.prisma.year.create({
      data: {
        collegeId: BigInt(collegeId),
        departmentId: departmentId ? BigInt(departmentId) : undefined,
        yearName,
        yearNumber,
      },
    });
  }
  listYears(collegeId: number, departmentId?: number) {
    return this.prisma.year.findMany({
      where: {
        collegeId: BigInt(collegeId),
        departmentId: departmentId ? BigInt(departmentId) : undefined,
      },
    });
  }

  updateYear(id: number, dto: UpdateYearDto) {
    const data: any = {};
    if (dto.yearName !== undefined) data.yearName = dto.yearName;
    if (dto.yearNumber !== undefined) data.yearNumber = dto.yearNumber;
    return this.prisma.year.update({ where: { id: BigInt(id) }, data });
  }

  deleteYear(id: number) {
    return this.prisma.year.delete({ where: { id: BigInt(id) } });
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
