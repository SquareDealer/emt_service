import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../entities/user.entity';

/** The authenticated principal as populated by JwtStrategy.validate(). */
export interface CurrentUserData {
  id: string;
  login: string;
  name: string;
  role: UserRole;
}

/** Injects the authenticated user (req.user) into a controller handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserData => {
    return ctx.switchToHttp().getRequest().user;
  },
);
