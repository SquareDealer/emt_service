import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { User } from '../entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async validateUser(login: string, password: string): Promise<User> {
    const user = await this.users.findByLogin(login);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    if (!user.is_active) {
      throw new UnauthorizedException('Учётная запись деактивирована');
    }
    return user;
  }

  async login(login: string, password: string) {
    const user = await this.validateUser(login, password);
    const payload = { sub: user.id, login: user.login, role: user.role };
    return {
      access_token: await this.jwt.signAsync(payload),
      user: { id: user.id, name: user.name, login: user.login, role: user.role },
    };
  }
}
