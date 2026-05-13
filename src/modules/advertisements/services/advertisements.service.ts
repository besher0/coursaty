import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateAdvertisementDto } from '../dtos/create-advertisement.dto';
import { UpdateAdvertisementDto } from '../dtos/update-advertisement.dto';

@Injectable()
export class AdvertisementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAdvertisementDto) {
    // Validate that at least one or none of the targeting fields are provided
    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({ where: { id: String(dto.departmentId) } });
      if (!department) throw new NotFoundException('القسم غير موجود');
    } else if (dto.collegeId) {
      const college = await this.prisma.college.findUnique({ where: { id: String(dto.collegeId) } });
      if (!college) throw new NotFoundException('الكلية غير موجودة');
    } else if (dto.universityId) {
      const university = await this.prisma.university.findUnique({ where: { id: String(dto.universityId) } });
      if (!university) throw new NotFoundException('الجامعة غير موجودة');
    }

    return this.prisma.advertisement.create({
      data: {
        universityId: dto.universityId ? String(dto.universityId) : null,
        collegeId: dto.collegeId ? String(dto.collegeId) : null,
        departmentId: dto.departmentId ? String(dto.departmentId) : null,
        title: dto.title,
        imageUrl: dto.imageUrl,
        helperLink: dto.helperLink,
      },
      include: {
        university: true,
        college: {
          include: {
            university: true,
          },
        },
        department: {
          include: {
            college: {
              include: {
                university: true,
              },
            },
          },
        },
      },
    });
  }

  findAll(filters?: { universityId?: string }) {
    const universityId = filters?.universityId ? String(filters.universityId) : undefined;

    return this.prisma.advertisement.findMany({
      where: universityId
        ? {
            OR: [
              { universityId },
              { college: { universityId } },
              { department: { college: { universityId } } },
            ],
          }
        : undefined,
      include: {
        university: true,
        college: {
          include: {
            university: true,
          },
        },
        department: {
          include: {
            college: {
              include: {
                university: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByCollege(collegeId: string) {
    return this.prisma.advertisement.findMany({
      where: { collegeId: String(collegeId) },
      include: {
        university: true,
        college: {
          include: {
            university: true,
          },
        },
        department: {
          include: {
            college: {
              include: {
                university: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const ad = await this.prisma.advertisement.findUnique({
      where: { id: String(id) },
      include: {
        university: true,
        college: {
          include: {
            university: true,
          },
        },
        department: {
          include: {
            college: {
              include: {
                university: true,
              },
            },
          },
        },
      },
    });
    if (!ad) throw new NotFoundException('الإعلان غير موجود');
    return ad;
  }

  async update(id: string, dto: UpdateAdvertisementDto) {
    const ad = await this.prisma.advertisement.findUnique({ where: { id: String(id) } });
    if (!ad) throw new NotFoundException('الإعلان غير موجود');

    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({ where: { id: String(dto.departmentId) } });
      if (!department) throw new BadRequestException('القسم غير موجود');
    } else if (dto.collegeId) {
      const college = await this.prisma.college.findUnique({ where: { id: String(dto.collegeId) } });
      if (!college) throw new BadRequestException('الكلية غير موجودة');
    } else if (dto.universityId) {
      const university = await this.prisma.university.findUnique({ where: { id: String(dto.universityId) } });
      if (!university) throw new BadRequestException('الجامعة غير موجودة');
    }

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.helperLink !== undefined) data.helperLink = dto.helperLink || null;
    if ('universityId' in dto) data.universityId = dto.universityId ? String(dto.universityId) : null;
    if ('collegeId' in dto) data.collegeId = dto.collegeId ? String(dto.collegeId) : null;
    if ('departmentId' in dto) data.departmentId = dto.departmentId ? String(dto.departmentId) : null;

    return this.prisma.advertisement.update({
      where: { id: String(id) },
      data,
      include: {
        university: true,
        college: {
          include: {
            university: true,
          },
        },
        department: {
          include: {
            college: {
              include: {
                university: true,
              },
            },
          },
        },
      },
    });
  }

  async remove(id: string) {
    const ad = await this.prisma.advertisement.findUnique({ where: { id: String(id) } });
    if (!ad) throw new NotFoundException('الإعلان غير موجود');

    return this.prisma.advertisement.delete({
      where: { id: String(id) },
    });
  }
}
