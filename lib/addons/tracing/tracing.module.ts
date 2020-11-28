import {
  DynamicModule,
  Global,
  Module,
  Provider,
  OnApplicationShutdown,
} from '@nestjs/common';
import { initTracerFromEnv } from 'jaeger-client';
import { Tracer } from 'opentracing';

import { TRACER } from '../../constants';

@Global()
@Module({})
export class TracingModule implements OnApplicationShutdown {
  static tracer: Tracer;

  public static forRoot(config: any): DynamicModule {
    const providers: Provider[] = [];

    const provider = {
      provide: TRACER,
      useFactory() {
        const tracer: Tracer = initTracerFromEnv(
          config.tracingConfig,
          config.tracingOption,
        );

        TracingModule.tracer = tracer;
        return tracer;
      },
    };
    providers.push(provider);

    return {
      module: TracingModule,
      providers,
      exports: [provider],
    };
  }

  onApplicationShutdown(signal?: string): any {
    (TracingModule.tracer as any).close();
  }
}
