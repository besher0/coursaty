import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProvincesService } from './provinces.service';
import { CreateProvinceDto } from './dtos/create-province.dto';
import { UpdateProvinceDto } from './dtos/update-province.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('provinces')
@Controller('provinces')
export class ProvincesController {
  constructor(private readonly provinces: ProvincesService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create province' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() dto: CreateProvinceDto) {
    return this.provinces.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List provinces' })
  list() {
    return this.provinces.findAll();
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update province' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProvinceDto) {
    return this.provinces.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete province' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.provinces.remove(id);
  }
}
