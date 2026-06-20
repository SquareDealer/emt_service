import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { USER_ROLES, UserRole } from '../entities/user.entity';
import { UsersService } from './users.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser, CurrentUserData } from '../auth/current-user.decorator';

class CreateUserDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(3)
  login: string;

  @IsString()
  @MinLength(4)
  password: string;

  @IsIn(USER_ROLES)
  role: UserRole;
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsIn(USER_ROLES)
  role?: UserRole;

  @IsOptional()
  @IsString()
  @MinLength(4)
  password?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

@UseGuards(RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Owner manages staff; receptionist needs the list to pick a master.
  @Roles('owner', 'master_receptionist')
  @Get()
  findAll() {
    return this.users.findAllSafe();
  }

  @Roles('owner')
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.createUser(dto);
  }

  @Roles('owner')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: CurrentUserData,
  ) {
    return this.users.updateUser(id, dto, actor.id);
  }

  @Roles('owner')
  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: CurrentUserData,
  ) {
    return this.users.deleteUser(id, actor.id);
  }
}
