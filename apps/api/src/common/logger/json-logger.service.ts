import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';

interface LogEntry {
  timestamp: string;
  level: string;
  context?: string;
  message: string;
  [key: string]: unknown;
}

/**
 * Structured JSON logger. Replaces NestJS's default coloured text output with
 * newline-delimited JSON records suitable for log aggregation (Datadog, CloudWatch, etc.).
 *
 * Enable by passing it to NestFactory.create():
 *   const app = await NestFactory.create(AppModule, { logger: new JsonLoggerService() });
 */
@Injectable()
export class JsonLoggerService extends ConsoleLogger {
  protected formatMessage(
    level: LogLevel,
    message: unknown,
    _pidMessage: string,
    _formattedLogLevel: string,
    contextMessage: string,
    _timestampDiff: string,
  ): string {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: contextMessage.replace(/[\[\]]/g, '').trim() || undefined,
      message: typeof message === 'string' ? message : JSON.stringify(message),
    };
    return JSON.stringify(entry) + '\n';
  }

  log(message: unknown, context?: string) {
    this.printJson('log', message, context);
  }

  error(message: unknown, stack?: string, context?: string) {
    this.printJson('error', message, context, { stack });
  }

  warn(message: unknown, context?: string) {
    this.printJson('warn', message, context);
  }

  debug(message: unknown, context?: string) {
    this.printJson('debug', message, context);
  }

  verbose(message: unknown, context?: string) {
    this.printJson('verbose', message, context);
  }

  private printJson(level: LogLevel, message: unknown, context?: string, extra?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      ...(context ? { context } : {}),
      message: typeof message === 'string' ? message : JSON.stringify(message),
      ...extra,
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
  }
}
