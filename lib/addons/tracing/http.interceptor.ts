import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Logger,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import {
  FORMAT_TEXT_MAP,
  FORMAT_HTTP_HEADERS,
  Span,
  Tracer,
  Tags,
  // SpanContext,
} from 'opentracing';
import SpanContext from 'opentracing/src/span_context';

import { TRACER, TRACER_CARRIER_INFO } from '../../constants';
import { MapService } from '../in-memory-db';

@Injectable()
export class HTTPTracerInterceptor<T>
  implements NestInterceptor<T, Response<T>> {
  private readonly logger = new Logger('TracerInterceptor');

  constructor(
    @Inject(TRACER) private readonly tracer: Tracer,
    private dbService: MapService,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const request: Request = context.switchToHttp().getRequest<Request>();
    const response: Response = context.switchToHttp().getResponse<Response>();
    const handler = context.getHandler().name;
    const controller = context.getClass().name;

    const tracingContext = this.getTracingContext(request);

    let span: Span;
    if (tracingContext && tracingContext.spanContext) {
      this.logger.log(`Tracer ${controller}.${handler} start`);
      span = this.tracer.startSpan(`${controller}.${handler}`, {
        childOf: tracingContext.spanContext,
      });
    } else {
      this.logger.log(`New tracer ${controller}.${handler} start`);
      span = this.tracer.startSpan(`${controller}.${handler}`);
    }

    const carrier: any = tracingContext?.carrier ? tracingContext.carrier : {};
    this.tracer.inject(span, FORMAT_TEXT_MAP, carrier);

    span.setTag('path', request.path);
    span.setTag('method', request.method);
    span.log({ url: request.url });

    this.dbService.set(TRACER_CARRIER_INFO, carrier);

    return next.handle().pipe(
      tap(() => {
        span.setTag(Tags.HTTP_STATUS_CODE, response.statusCode);
        span.finish();
        this.logger.log(`Tracer ${controller}.${handler} finish`);
      }),
      catchError((error: any) => {
        span.setTag(Tags.ERROR, true);
        span.log({
          'err.stack': error.stack,
          statusCode: response.statusCode,
        });
        span.finish();
        return throwError(error);
      }),
    );
  }

  private getTracingContext(
    req: Request,
  ): null | { carrier: any; spanContext: SpanContext } {
    const carrier = this.getTracingCarrier([req.headers, req.query]);
    const spanContext = this.tracer.extract(FORMAT_HTTP_HEADERS, carrier);

    if (isSpanContext(spanContext)) {
      return { carrier, spanContext };
    }

    return null;
  }

  getTracingCarrier(carrierList: Record<string, any>[]): Record<string, any> {
    const carrierEnd: Record<string, any> = {};

    const contextKey = 'uber-trace-id';
    const baggagePrefix = 'uberctx-';

    for (const carrier of carrierList) {
      const keys = Object.keys(carrier);
      for (const key of keys) {
        const lowKey = key.toLowerCase();
        if (lowKey === contextKey) {
          carrierEnd[key] = carrier[key];
        }
        if (lowKey.startsWith(baggagePrefix)) {
          carrierEnd[key] = carrier[key];
        }
      }
    }

    return carrierEnd;
  }
}

/**
 * Created by Rain on 2020/7/21
 */
export function isSpanContext(span: SpanContext | null): span is SpanContext {
  return span && (span as any).isValid;
}
