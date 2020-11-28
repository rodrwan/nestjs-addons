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
import {
  FORMAT_TEXT_MAP,
  FORMAT_HTTP_HEADERS,
  Span,
  Tracer,
  Tags,
  SpanContext,
} from 'opentracing';

import { TRACER, TRACER_CARRIER_INFO } from '../../constants';
import { MapService } from '../in-memory-db';

@Injectable()
export class GRPCTracerInterceptor<T> implements NestInterceptor<T, any> {
  private readonly logger = new Logger('TracerInterceptor');

  constructor(
    @Inject(TRACER) private readonly tracer: Tracer,
    private dbService: MapService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const handler = context.getHandler().name;
    const controller = context.getClass().name;

    const data = JSON.parse(context.switchToRpc().getData());
    const incommingCarrier = data?.carrier;

    const tracingContext = this.getTracingContext([incommingCarrier]);

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

    span.setTag('controller', controller);
    span.setTag('method', context.getType());
    span.log({ handler: handler });

    this.dbService.set(TRACER_CARRIER_INFO, carrier);

    return next.handle().pipe(
      tap(() => {
        span.setTag(Tags.HTTP_STATUS_CODE, 200);
        span.finish();
        this.logger.log(`Tracer ${controller}.${handler} finish`);
      }),
      catchError((error: any) => {
        span.setTag(Tags.ERROR, true);
        span.log({
          'err.stack': error.stack,
          statusCode: 500,
        });
        span.finish();
        return throwError(error);
      }),
    );
  }

  private getTracingContext(
    req: any,
  ): null | { carrier: any; spanContext: SpanContext } {
    // console.log('req', req);
    const carrier = this.getTracingCarrier(req);
    // console.log('carrier', carrier);
    const spanContext = this.tracer.extract(FORMAT_HTTP_HEADERS, carrier);
    // console.log(isSpanContext(spanContext));
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
  // console.log('span', span);
  return span && (span as any).isValid;
}
