import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AcademicsService } from '../services/academics.service';
import { CreateSeasonDto } from '../dtos/create-season.dto';
import { UpdateSeasonDto } from '../dtos/update-season.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@ApiTags('academics')
@ApiBearerAuth()
@Controller('academics/seasons')
export class SeasonsController {
  constructor(private readonly academics: AcademicsService) {}

  @Post()
  @ApiOperation({ summary: 'Create season' })
  @ApiOkResponse({ description: 'Season created' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  create(@Body() body: CreateSeasonDto) {
    return this.academics.createSeason(body.seasonName, body.seasonNumber);
  }

  @Get()
  @ApiOperation({ summary: 'List seasons' })
  list() {
    return this.academics.listSeasons();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update season' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateSeasonDto,
  ) {
    return this.academics.updateSeason(id, body);
  }

  @Patch(':id/home-active')
  @ApiOperation({ summary: 'Set season as active for homepage filtering' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  setHomeActiveSeason(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.academics.setHomeActiveSeason(id);
  }

  @Patch('home-active/clear')
  @ApiOperation({ summary: 'Clear homepage active season filter' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  clearHomeActiveSeason() {
    return this.academics.clearHomeActiveSeason();
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete season' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.academics.deleteSeason(id);
  }
}
