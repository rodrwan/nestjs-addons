import { DynamicModule, Global, Module } from '@nestjs/common';
import { DBPROVIDER } from '../../constants';

export class MapService {
  private static _instance: MapService;
  private records: Map<any, any>;

  constructor() {
    if (MapService._instance) {
      return MapService._instance;
    }

    this.records = new Map();
    MapService._instance = this;
  }

  public set(key: any, val: any) {
    this.records.set(key, val);
  }

  public get(key: any) {
    return this.records.get(key);
  }

  static getInstance() {
    return MapService._instance;
  }
}

@Global()
@Module({
  providers: [MapService],
  exports: [MapService],
})
export class InMemoryDBModule {
  public static forRoot(): DynamicModule {
    const provider = {
      provide: DBPROVIDER,
      useFactory: () => new MapService(),
    };
    return {
      module: InMemoryDBModule,
      providers: [provider],
      exports: [provider],
    };
  }
}
