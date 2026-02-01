import { Body, Controller, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { UpdateFcmDto } from '../dtos/update-fcm.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch(':id/fcm-token')
  @ApiOperation({ summary: 'Update user FCM token' })
  @ApiOkResponse({ description: 'FCM token updated' })
  async updateFcm(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateFcmDto,
  ) {
    return this.users.updateFcmToken(id, body.fcmToken);
  }
}
