import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AcademicsService } from '../services/academics.service';
import { CreateYearDto } from '../dtos/create-year.dto';
import { UpdateYearDto } from '../dtos/update-year.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@ApiTags('academics')
@ApiBearerAuth()
@Controller('academics/years')
export class YearsController {
  constructor(private readonly academics: AcademicsService) {}

  @Post()
  @ApiOperation({ summary: 'Create college year' })
  @ApiOkResponse({ description: 'College year created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() body: CreateYearDto) {
    return this.academics.createYear(body.collegeId, body.academicYearId, body.departmentId, body.isActive);
  }

  @Get()
  @ApiOperation({ summary: 'List college years' })
  @ApiQuery({ name: 'collegeId', required: true })
  @ApiQuery({ name: 'departmentId', required: false })
  list(@Query('collegeId') collegeId?: string, @Query('departmentId') departmentId?: string) {
    return this.academics.listYears(collegeId as string, departmentId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update college year' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(
    @Param('id') id: string,
    @Body() body: UpdateYearDto,
  ) {
    return this.academics.updateYear(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete college year' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id') id: string) {
    return this.academics.deleteYear(id);
  }
}
