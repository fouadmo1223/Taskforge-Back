import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EXPENSE_STATUSES, type ExpenseStatus } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { CloudinaryService } from '../../infra/cloudinary/cloudinary.service.js';
import { FinanceService, type BudgetView, type ExpenseView, type FinanceSummary } from './finance.service.js';

interface MulterFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

class BudgetCategoryDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsNumber() @Min(0) amount!: number;
}

class SetBudgetDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(3) currency?: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => BudgetCategoryDto)
  categories?: BudgetCategoryDto[];
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

class CreateExpenseDto {
  @IsMongoId() projectId!: string;
  @IsOptional() @IsMongoId() taskId?: string;
  @IsString() @MinLength(1) @MaxLength(240) description!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(3) currency?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsDateString() spentAt!: string;
  @IsOptional() @IsBoolean() billable?: boolean;
}

class UpdateExpenseDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) description?: string;
  @IsOptional() @IsNumber() @Min(0.01) amount?: number;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(3) currency?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsDateString() spentAt?: string;
  @IsOptional() @IsBoolean() billable?: boolean;
  @IsOptional() @IsMongoId() taskId?: string | null;
}

class ReviewExpenseDto {
  @IsIn(['approve', 'reject', 'reimburse']) decision!: 'approve' | 'reject' | 'reimburse';
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  @Get('projects/:projectId/budget')
  @RequirePermissions('finance.read')
  @ApiOperation({ summary: 'Get a project budget' })
  getBudget(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
  ): Promise<BudgetView> {
    return this.finance.getBudget(w, projectId);
  }

  @Put('projects/:projectId/budget')
  @RequirePermissions('finance.manage')
  @ApiOperation({ summary: 'Create or update a project budget' })
  setBudget(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SetBudgetDto,
  ): Promise<BudgetView> {
    return this.finance.setBudget(w, projectId, userId, dto);
  }

  @Get('projects/:projectId/finance-summary')
  @RequirePermissions('finance.read')
  @ApiOperation({ summary: 'Budget vs. spend summary for a project' })
  summary(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('projectId', ParseObjectIdPipe) projectId: string,
  ): Promise<FinanceSummary> {
    return this.finance.summary(w, projectId);
  }

  @Get('expenses')
  @RequirePermissions('finance.read')
  @ApiOperation({ summary: 'List expenses' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('projectId') projectId?: string,
    @Query('status') status?: ExpenseStatus,
  ): Promise<ExpenseView[]> {
    const rows = await this.finance.list(w, {
      projectId,
      status: status && EXPENSE_STATUSES.includes(status) ? status : undefined,
    });
    return rows.map((e) => this.finance.expenseView(e));
  }

  @Post('expenses')
  @RequirePermissions('finance.read')
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(FileInterceptor('receipt', { limits: { fileSize: 15 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Record an expense (optionally with a receipt file)' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateExpenseDto,
    @UploadedFile() receipt?: MulterFile,
  ): Promise<ExpenseView> {
    let asset = undefined;
    if (receipt?.buffer) {
      asset = {
        ...(await this.cloudinary.upload({
          buffer: receipt.buffer,
          mimetype: receipt.mimetype,
          originalname: receipt.originalname,
          size: receipt.size,
          uploaderUserId: userId,
          folder: `workspaces/${w}/expenses`,
        })),
        uploadedBy: userId,
      } as never;
    }
    return this.finance.expenseView(await this.finance.create(w, userId, { ...dto, receipt: asset }));
  }

  @Patch('expenses/:expenseId')
  @RequirePermissions('finance.read')
  @ApiOperation({ summary: 'Edit a draft/rejected expense' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('expenseId', ParseObjectIdPipe) expenseId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateExpenseDto,
  ): Promise<ExpenseView> {
    return this.finance.expenseView(await this.finance.update(w, expenseId, userId, dto));
  }

  @Post('expenses/:expenseId/submit')
  @RequirePermissions('finance.read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit an expense for review' })
  async submit(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('expenseId', ParseObjectIdPipe) expenseId: string,
    @CurrentUser('id') userId: string,
  ): Promise<ExpenseView> {
    return this.finance.expenseView(await this.finance.submit(w, expenseId, userId));
  }

  @Post('expenses/:expenseId/review')
  @RequirePermissions('finance.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve / reject / mark reimbursed' })
  async review(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('expenseId', ParseObjectIdPipe) expenseId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReviewExpenseDto,
  ): Promise<ExpenseView> {
    return this.finance.expenseView(await this.finance.review(w, expenseId, userId, dto.decision, dto.note));
  }

  @Delete('expenses/:expenseId')
  @RequirePermissions('finance.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete an expense' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('expenseId', ParseObjectIdPipe) expenseId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.finance.remove(w, expenseId, userId);
    return { message: 'Expense deleted.' };
  }
}
