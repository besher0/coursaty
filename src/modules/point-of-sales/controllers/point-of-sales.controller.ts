import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { PointOfSalesService } from '../services/point-of-sales.service';
import { CreatePointOfSaleDto } from '../dtos/create-point-of-sale.dto';
import { UpdatePointOfSaleDto } from '../dtos/update-point-of-sale.dto';

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

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.pointOfSalesService.findOne(BigInt(id));
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePointOfSaleDto: UpdatePointOfSaleDto,
  ) {
    return this.pointOfSalesService.update(BigInt(id), updatePointOfSaleDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.pointOfSalesService.remove(BigInt(id));
  }
}
