import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AcademicsService } from '../services/academics.service';
import { CreateUniversityDto } from '../dtos/create-university.dto';
import { UpdateUniversityDto } from '../dtos/update-university.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@ApiTags('academics')
@ApiBearerAuth()
@Controller('academics/universities')
export class UniversitiesController {
  constructor(private readonly academics: AcademicsService) {}

  @Post()
  @ApiOperation({ summary: 'Create university' })
  @ApiOkResponse({ description: 'University created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() dto: CreateUniversityDto) {
    return this.academics.createUniversity(dto.name, dto.provinceId);
  }

  @Get()
  @ApiOperation({ summary: 'List universities' })
  list() {
    return this.academics.listUniversities();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update university' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUniversityDto) {
    return this.academics.updateUniversity(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete university' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteUniversity(id);
  }
}
