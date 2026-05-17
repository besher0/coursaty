import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FinancialsService } from '../services/financials.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CreateCodeGroupDto } from '../dtos/create-code-group.dto';
import { UpdateCodeGroupDto } from '../dtos/update-code-group.dto';

@ApiTags('financials')
@ApiBearerAuth()
@Controller('financials/code-groups')
export class CodeGroupsController {
  constructor(private readonly financials: FinancialsService) {}

  @Post()
  @ApiOperation({ summary: 'Create code group' })
  @ApiOkResponse({ description: 'Code group created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() body: CreateCodeGroupDto) {
    return this.financials.createCodeGroup(
      body.courseId,
      body.batchName,
      body.discountPercentage,
      body.isForPrinting,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List code groups' })
  @ApiQuery({ name: 'courseId', required: false })
  list(@Query('courseId') courseId?: string) {
    return this.financials.listCodeGroups(courseId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update code group' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateCodeGroupDto,
  ) {
    return this.financials.updateCodeGroup(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete code group' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.financials.deleteCodeGroup(id);
  }
}
