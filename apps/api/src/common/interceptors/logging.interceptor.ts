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
}

interface HttpResponse {
  statusCode: number;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<HttpRequest>();
    const { method, path } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<HttpResponse>();
          this.logger.log(`${method} ${path} ${res.statusCode} +${Date.now() - start}ms`);
        },
        error: (err: { status?: number }) => {
          const status = err?.status ?? 500;
          this.logger.warn(`${method} ${path} ${status} +${Date.now() - start}ms`);
        },
      }),
    );
  }
}
