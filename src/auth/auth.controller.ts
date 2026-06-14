import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { AuthService } from './auth.service';
import { Public } from '../common/public.decorator';

class LoginDto {
  @IsString()
  @IsNotEmpty()
  login: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.login, dto.password);
  }

  @Get('me')
  me(@Req() req: any) {
    return req.user;
  }
}
