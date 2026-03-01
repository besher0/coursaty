import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AcademicsService } from '../services/academics.service';
import { CreateAcademicYearDto } from '../dtos/create-academic-year.dto';
import { UpdateAcademicYearDto } from '../dtos/update-academic-year.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@ApiTags('academics')
@ApiBearerAuth()
@Controller('academics/academic-years')
export class AcademicYearsController {
  constructor(private readonly academics: AcademicsService) {}

  @Post()
  @ApiOperation({ summary: 'Create academic year' })
  @ApiOkResponse({ description: 'Academic year created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() body: CreateAcademicYearDto) {
    return this.academics.createAcademicYear(body.yearName, body.yearNumber);
  }

  @Get()
  @ApiOperation({ summary: 'List academic years' })
  list() {
    return this.academics.listAcademicYears();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update academic year' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateAcademicYearDto,
  ) {
    return this.academics.updateAcademicYear(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete academic year' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteAcademicYear(id);
  }
}
