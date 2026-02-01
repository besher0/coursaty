import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
  @ApiOperation({ summary: 'Create year' })
  @ApiOkResponse({ description: 'Year created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() body: CreateYearDto) {
    return this.academics.createYear(body.collegeId, body.yearName, body.yearNumber, body.departmentId);
  }

  @Get()
  @ApiOperation({ summary: 'List years' })
  @ApiQuery({ name: 'collegeId', required: true })
  @ApiQuery({ name: 'departmentId', required: false })
  list(@Query('collegeId') collegeId?: string, @Query('departmentId') departmentId?: string) {
    return this.academics.listYears(Number(collegeId), departmentId ? Number(departmentId) : undefined);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update year' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateYearDto,
  ) {
    return this.academics.updateYear(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete year' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteYear(id);
  }
}
