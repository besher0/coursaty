import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CodeManagementService } from '../services/code-management.service';
import {
  CreateCodeGroupDto,
  GenerateCodesDto,
  BulkGenerateCodesDto,
  BulkCodesResponseDto,
  UpdateCodeDto,
  CodeExportDto,
} from '../dtos/code-management.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { Roles } from '@/modules/auth/roles.decorator';

@ApiTags('admin/codes')
@Controller('admins/codes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class CodeManagementController {
  constructor(private readonly codeService: CodeManagementService) {}

  @Post('groups')
  @ApiOperation({ summary: 'Create a code group (batch)' })
  @ApiCreatedResponse({ description: 'Code group created' })
  async createCodeGroup(@Body() dto: CreateCodeGroupDto) {
    return this.codeService.createCodeGroup(dto);
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generate a single discount code' })
  @ApiCreatedResponse({ description: 'Code generated' })
  async generateSingleCode(@Body() dto: GenerateCodesDto) {
    return this.codeService.generateSingleCode(dto);
  }

  @Post('generate-bulk')
  @ApiOperation({
    summary: 'Generate multiple discount codes in bulk',
    description:
      'Generate up to 5000 codes at once. Returns codes in multiple formats for easy copying.',
  })
  @ApiCreatedResponse({
    type: BulkCodesResponseDto,
    description: 'Bulk codes generated with export formats',
  })
  async generateBulkCodes(@Body() dto: BulkGenerateCodesDto): Promise<BulkCodesResponseDto> {
    return this.codeService.generateBulkCodes(dto);
  }

  @Patch(':codeId')
  @ApiOperation({ summary: 'Update code status or settings' })
  @ApiOkResponse({ description: 'Code updated' })
  async updateCode(
    @Param('codeId', new ParseUUIDPipe({ version: '4' })) codeId: string,
    @Body() dto: UpdateCodeDto,
  ) {
    return this.codeService.updateCode(codeId, dto);
  }

  @Delete(':codeId')
  @ApiOperation({ summary: 'Delete an unused active code' })
  @ApiOkResponse({ description: 'Code deleted' })
  async deleteCode(@Param('codeId', new ParseUUIDPipe({ version: '4' })) codeId: string) {
    return this.codeService.deleteCode(codeId);
  }

  @Get('group/:groupId')
  @ApiOperation({ summary: 'Get code group details with all codes' })
  @ApiOkResponse({ description: 'Code group with details and statistics' })
  async getCodeGroupDetails(@Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string) {
    return this.codeService.getCodeGroupDetails(groupId);
  }

  @Get('group/:groupId/export')
  @ApiOperation({
    summary: 'Export codes from a group',
    description:
      'Get all codes in text and CSV formats ready for copying or importing',
  })
  @ApiOkResponse({
    type: CodeExportDto,
    description: 'Codes in multiple export formats',
  })
  async exportCodesByGroup(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Query('status') status?: 'ACTIVE' | 'USED' | 'INACTIVE',
  ): Promise<CodeExportDto> {
    return this.codeService.getCodesByGroup(groupId, status);
  }

  @Patch('group/:groupId/deactivate-all')
  @ApiOperation({ summary: 'Deactivate all active codes in a group' })
  @ApiOkResponse({ description: 'Codes deactivated' })
  async deactivateCodeGroup(@Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string) {
    return this.codeService.deactivateCodeGroup(groupId);
  }
}
