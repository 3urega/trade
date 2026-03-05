import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ExecuteTradeUseCase } from '../../application/use-cases/execute-trade.use-case.js';
import { GetPortfolioUseCase } from '../../application/use-cases/get-portfolio.use-case.js';
import { GetTradesUseCase } from '../../application/use-cases/get-trades.use-case.js';
import { CreateWalletUseCase } from '../../application/use-cases/create-wallet.use-case.js';
import { ExecuteTradeDto } from '../../application/dtos/execute-trade.dto.js';
import { TradeResponseDto } from '../../application/dtos/trade-response.dto.js';
import { PortfolioResponseDto } from '../../application/dtos/portfolio-response.dto.js';
import { TradingGateway } from '../ws/trading.gateway.js';

@ApiTags('trading')
@Controller('v1')
export class TradingController {
  constructor(
    private readonly executeTradeUseCase: ExecuteTradeUseCase,
    private readonly getPortfolioUseCase: GetPortfolioUseCase,
    private readonly getTradesUseCase: GetTradesUseCase,
    private readonly createWalletUseCase: CreateWalletUseCase,
    private readonly gateway: TradingGateway,
  ) {}

  @Post('wallets')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new paper trading wallet' })
  async createWallet(@Body() body: { ownerId: string; initialUsdtBalance?: number }) {
    return this.createWalletUseCase.execute(body);
  }

  @Post('trades')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Execute a simulated trade' })
  @ApiResponse({ type: TradeResponseDto })
  async executeTrade(@Body() dto: ExecuteTradeDto): Promise<TradeResponseDto> {
    const trade = await this.executeTradeUseCase.execute(dto);
    this.gateway.emitTradeExecuted(trade);

    const portfolio = await this.getPortfolioUseCase.execute(dto.walletId);
    this.gateway.emitPortfolioUpdate(portfolio);

    return trade;
  }

  @Get('trades')
  @ApiOperation({ summary: 'List trades (optionally filtered by wallet)' })
  @ApiResponse({ type: [TradeResponseDto] })
  async getTrades(
    @Query('walletId') walletId?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<TradeResponseDto[]> {
    return this.getTradesUseCase.execute({ walletId, limit, offset });
  }

  @Get('portfolio/:walletId')
  @ApiOperation({ summary: 'Get portfolio balances and P&L for a wallet' })
  @ApiResponse({ type: PortfolioResponseDto })
  async getPortfolio(@Param('walletId') walletId: string): Promise<PortfolioResponseDto> {
    return this.getPortfolioUseCase.execute(walletId);
  }
}
