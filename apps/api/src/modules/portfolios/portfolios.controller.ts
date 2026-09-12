import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsHexColor, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { PortfoliosService, type PortfolioRollup, type PortfolioView } from './portfolios.service.js';

class CreatePortfolioDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) projectIds?: string[];
  @IsOptional() @IsMongoId() ownerUserId?: string;
}
class UpdatePortfolioDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) projectIds?: string[];
  @IsOptional() @IsMongoId() ownerUserId?: string | null;
  @IsOptional() @IsBoolean() archived?: boolean;
}

@ApiTags('portfolios')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/portfolios')
export class PortfoliosController {
  constructor(private readonly portfolios: PortfoliosService) {}

  @Get()
  @RequirePermissions('project.read')
  @ApiOperation({ summary: 'List portfolios' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<PortfolioView[]> {
    return (await this.portfolios.list(w, includeArchived === 'true')).map((p) => this.portfolios.toView(p));
  }

  @Get(':portfolioId/rollup')
  @RequirePermissions('project.read')
  @ApiOperation({ summary: 'Portfolio with per-project progress rollup' })
  rollup(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('portfolioId', ParseObjectIdPipe) portfolioId: string,
  ): Promise<PortfolioRollup> {
    return this.portfolios.rollup(w, portfolioId);
  }

  @Post()
  @RequirePermissions('portfolio.manage')
  @ApiOperation({ summary: 'Create a portfolio' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePortfolioDto,
  ): Promise<PortfolioView> {
    return this.portfolios.toView(await this.portfolios.create(w, userId, dto));
  }

  @Patch(':portfolioId')
  @RequirePermissions('portfolio.manage')
  @ApiOperation({ summary: 'Update a portfolio' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('portfolioId', ParseObjectIdPipe) portfolioId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdatePortfolioDto,
  ): Promise<PortfolioView> {
    return this.portfolios.toView(await this.portfolios.update(w, portfolioId, userId, dto));
  }

  @Delete(':portfolioId')
  @RequirePermissions('portfolio.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a portfolio' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('portfolioId', ParseObjectIdPipe) portfolioId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.portfolios.remove(w, portfolioId, userId);
    return { message: 'Portfolio deleted.' };
  }
}
