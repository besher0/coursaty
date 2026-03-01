import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FinancialsService } from '../services/financials.service';
import { $Enums } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CreateCodeDto } from '../dtos/create-code.dto';
import { UpdateCodeDto } from '../dtos/update-code.dto';
import { CreateBulkCodesDto } from '../dtos/create-bulk-codes.dto';

@ApiTags('financials')
@ApiBearerAuth()
@Controller('financials/codes')
export class CodesController {
  constructor(private readonly financials: FinancialsService) {}

  @Post()
  @ApiOperation({ summary: 'Create code' })
  @ApiOkResponse({ description: 'Code created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() body: CreateCodeDto) {
    return this.financials.createCode(
      body.codeGroupId,
      body.codeValue,
      body.allowedUniversityNumber,
      body.usageLimit,
      body.validForDays,
      body.validUntil,
    );
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Create codes in bulk' })
  @ApiOkResponse({ description: 'Codes generated' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  createBulk(@Body() body: CreateBulkCodesDto) {
    return this.financials.createBulkCodes(body);
  }

  @Get()
  @ApiOperation({ summary: 'List codes' })
  @ApiQuery({ name: 'codeGroupId', required: false })
  list(@Query('codeGroupId') codeGroupId?: string) {
    return this.financials.listCodes(codeGroupId ? Number(codeGroupId) : undefined);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update code status' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCodeDto) {
    return this.financials.updateCode(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete code' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.financials.deleteCode(id);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate code' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.financials.activateCode(id);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate code' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.financials.deactivateCode(id);
  }
}
