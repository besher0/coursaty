import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PointOfSalesService } from '../services/point-of-sales.service';
import { CreatePointOfSaleDto } from '../dtos/create-point-of-sale.dto';
import { UpdatePointOfSaleDto } from '../dtos/update-point-of-sale.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@ApiTags('point-of-sales')
@Controller('point-of-sales')
export class PointOfSalesController {
  constructor(private readonly pointOfSalesService: PointOfSalesService) {}

  @Post()
  create(@Body() createPointOfSaleDto: CreatePointOfSaleDto) {
    return this.pointOfSalesService.create(createPointOfSaleDto);
  }

  @Get()
  findAll() {
    return this.pointOfSalesService.findAll();
  }

  @Get('university/:universityId')
  findByUniversity(@Param('universityId', ParseIntPipe) universityId: number) {
    return this.pointOfSalesService.findByUniversity(String(universityId));
  }

  @Get('university')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get point of sales for student university' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  findByStudentUniversity(@Req() req: any) {
    return this.pointOfSalesService.findByStudentToken(req.user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.pointOfSalesService.findOne(String(id));
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePointOfSaleDto: UpdatePointOfSaleDto,
  ) {
    return this.pointOfSalesService.update(String(id), updatePointOfSaleDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.pointOfSalesService.remove(String(id));
  }
}
