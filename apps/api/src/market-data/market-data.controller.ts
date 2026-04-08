import { Controller, Get, Query, UsePipes } from '@nestjs/common';
import {
    type MarketDataBarsQueryDto,
    MarketDataBarsQuerySchema,
} from '@vantrade/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MarketDataService } from './market-data.service';

@Controller('market-data')
export class MarketDataController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Get('bars')
  @UsePipes(new ZodValidationPipe(MarketDataBarsQuerySchema))
  getBars(@Query() query: MarketDataBarsQueryDto) {
    return this.marketDataService.getBars(query);
  }
}
