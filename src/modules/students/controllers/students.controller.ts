import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StudentsService } from '../services/students.service';
import { CreateStudentDto } from '../dtos/create-student.dto';

@ApiTags('students')
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create student profile (public)' })
  @ApiCreatedResponse({ description: 'Student created' })
  async create(@Body() dto: CreateStudentDto) {
    return this.students.create(dto);
  }
}