import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AcademicsService } from '../services/academics.service';
import { CreateDepartmentDto } from '../dtos/create-department.dto';
import { UpdateDepartmentDto } from '../dtos/update-department.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@ApiTags('academics')
@ApiBearerAuth()
@Controller('academics/departments')
export class DepartmentsController {
  constructor(private readonly academics: AcademicsService) {}

  @Post()
  @ApiOperation({ summary: 'Create department' })
  @ApiOkResponse({ description: 'Department created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() body: CreateDepartmentDto) {
    return this.academics.createDepartment(body.collegeId, body.name);
  }

  @Get()
  @ApiOperation({ summary: 'List departments' })
  @ApiQuery({ name: 'collegeId', required: false })
  list(@Query('collegeId') collegeId?: string) {
    return this.academics.listDepartments(collegeId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update department' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() body: UpdateDepartmentDto) {
    return this.academics.updateDepartment(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete department' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.academics.deleteDepartment(id);
  }
}
