import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

/**
 * Ensures user role is in allowed list.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles?.length) return true;
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as { role?: string };
    if (!user?.role || !roles.includes(user.role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
