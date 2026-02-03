import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminsService } from '../services/admins.service';
import { CreateAdminDto } from '../dtos/create-admin.dto';

@ApiTags('admins')
@Controller('admins')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Post()
  @ApiOperation({ summary: 'Create admin profile (public)' })
  @ApiCreatedResponse({ description: 'Admin created' })
  async create(@Body() dto: CreateAdminDto) {
    return this.admins.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List admins' })
  @ApiOkResponse({ description: 'Admins list' })
  async list() {
    return this.admins.list();
  }
}
