import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TeachersService } from '../services/teachers.service';
import { CreateTeacherDto } from '../dtos/create-teacher.dto';

@ApiTags('teachers')
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Post()
  @ApiOperation({ summary: 'Create teacher profile (public)' })
  @ApiCreatedResponse({ description: 'Teacher created' })
  async create(@Body() dto: CreateTeacherDto) {
    return this.teachers.create(dto);
  }
}
