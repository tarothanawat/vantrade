import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

interface HttpRequest {
  method: string;
  path: string;
  ip: string;
}

interface HttpResponse {
  statusCode: number;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<HttpRequest>();
    const { method, path, ip } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<HttpResponse>();
          const durationMs = Date.now() - start;
          this.logger.log(
            JSON.stringify({ method, path, statusCode: res.statusCode, durationMs, ip }),
          );
        },
        error: (err: { status?: number }) => {
          const statusCode = err?.status ?? 500;
          const durationMs = Date.now() - start;
          this.logger.warn(
            JSON.stringify({ method, path, statusCode, durationMs, ip }),
          );
        },
      }),
    );
  }
}
