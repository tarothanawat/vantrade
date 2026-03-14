import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { JwtPayload } from '@vantrade/types';
import { ExtractJwt, Strategy } from 'passport-jwt';

const AUTH_COOKIE_NAME = 'vantrade_auth';

function extractJwtFromCookie(req: { headers?: { cookie?: string } }): string | null {
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map((part) => part.trim());
  const pair = cookies.find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!pair) return null;

  const rawValue = pair.slice(`${AUTH_COOKIE_NAME}=`.length);
  return decodeURIComponent(rawValue);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        extractJwtFromCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'changeme-in-production',
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
