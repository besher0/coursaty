import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { RegisterCompleteDto } from '../dtos/register-complete.dto';
import { OptionalJwtAuthGuard } from '../guards/optional-jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiBearerAuth()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Register user for an existing profile (legacy)' })
  @ApiOkResponse({ description: 'User registered' })
  async register(@Body() dto: RegisterDto, @Req() req: any) {
    return this.auth.register(dto, req.user);
  }

  @Post('register-complete')
  @ApiBearerAuth()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Create account and student, teacher, or admin profile in one transaction' })
  @ApiOkResponse({ description: 'Account and profile created' })
  async registerComplete(@Body() dto: RegisterCompleteDto, @Req() req: any) {
    return this.auth.registerComplete(dto, req.user);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login and get JWT' })
  @ApiOkResponse({ description: 'JWT token returned' })
  async login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
}
