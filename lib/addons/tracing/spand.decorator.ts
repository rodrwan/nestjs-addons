/**
 * copied from https://github.com/DoNewsCode/nestjs-tracing/blob/master/lib/decorator/spand.decorator.ts
 */
import { FORMAT_TEXT_MAP, Span, Tags } from 'opentracing';
import { TracingModule } from './tracing.module';
import { MapService } from '../in-memory-db';
import { TRACER_CARRIER_INFO } from '../../constants';

export function SpanD(name: string): MethodDecorator {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<any>,
  ) => {
    const original = descriptor.value;

    descriptor.value = function (...args: any[]) {
      let context: any;
      try {
        context = MapService.getInstance().get(TRACER_CARRIER_INFO);
      } catch (err) {
        return original.apply(this, args);
      }

      if (!context) {
        context = {};
        MapService.getInstance().set(TRACER_CARRIER_INFO, context);
      }

      const tracer = TracingModule.tracer;
      const ctx = tracer.extract(FORMAT_TEXT_MAP, context);

      let span: Span;
      if (ctx) {
        span = tracer.startSpan(name, { childOf: ctx });
      } else {
        span = tracer.startSpan(name);
      }

      const result = original.apply(this, args);

      if (result.then) {
        result
          .then(() => {
            tracer.inject(span, FORMAT_TEXT_MAP, context);
            span.finish();
          })
          .catch((err) => {
            tracer.inject(span, FORMAT_TEXT_MAP, context);
            span.setTag(Tags.ERROR, true);
            span.log({
              'err.stack': err.stack,
              statusCode: 500,
            });
            span.finish();
          });
      } else {
        span.finish();
      }

      return result;
    };
  };
}
