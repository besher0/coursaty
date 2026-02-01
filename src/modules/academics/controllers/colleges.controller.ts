import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AcademicsService } from '../services/academics.service';
import { CreateCollegeDto } from '../dtos/create-college.dto';
import { UpdateCollegeDto } from '../dtos/update-college.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@ApiTags('academics')
@ApiBearerAuth()
@Controller('academics/colleges')
export class CollegesController {
  constructor(private readonly academics: AcademicsService) {}

  @Post()
  @ApiOperation({ summary: 'Create college' })
  @ApiOkResponse({ description: 'College created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() body: CreateCollegeDto) {
    return this.academics.createCollege(body.universityId, body.name);
  }

  @Get()
  @ApiOperation({ summary: 'List colleges' })
  @ApiQuery({ name: 'universityId', required: false })
  list(@Query('universityId') universityId?: string) {
    return this.academics.listColleges(universityId ? Number(universityId) : undefined);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update college' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCollegeDto) {
    return this.academics.updateCollege(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete college' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.academics.deleteCollege(id);
  }
}
