import { SetMetadata } from '@nestjs/common';
import type { Role } from '@vantrade/types';

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
