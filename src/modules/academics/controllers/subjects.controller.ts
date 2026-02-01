import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AcademicsService } from '../services/academics.service';
import { CreateSubjectDto } from '../dtos/create-subject.dto';
import { UpdateSubjectDto } from '../dtos/update-subject.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@ApiTags('academics')
@ApiBearerAuth()
@Controller('academics/subjects')
export class SubjectsController {
  constructor(private readonly academics: AcademicsService) {}

  @Post()
  @ApiOperation({ summary: 'Create subject' })
  @ApiOkResponse({ description: 'Subject created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() body: CreateSubjectDto) {
    return this.academics.createSubject(body.collegeId, body.subjectName, body.departmentId);
  }

  @Get()
  @ApiOperation({ summary: 'List subjects' })
  @ApiQuery({ name: 'collegeId', required: true })
  @ApiQuery({ name: 'departmentId', required: false })
  list(@Query('collegeId') collegeId?: string, @Query('departmentId') departmentId?: string) {
    return this.academics.listSubjects(Number(collegeId), departmentId ? Number(departmentId) : undefined);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update subject' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateSubjectDto) {
    return this.academics.updateSubject(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete subject' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteSubject(id);
  }
}
