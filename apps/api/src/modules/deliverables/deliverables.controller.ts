import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { APPROVAL_STRATEGIES, type ApprovalStrategy } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { DeliverablesService, type DeliverableView } from './deliverables.service.js';
import { DELIVERABLE_STATUSES, type DeliverableStatus } from './schemas/deliverable.schema.js';

interface MulterFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

class CreateDeliverableDto {
  @IsMongoId() projectId!: string;
  @IsString() @MinLength(1) @MaxLength(240) title!: string;
  @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @IsOptional() @IsMongoId() milestoneId?: string;
  @IsOptional() @IsBoolean() clientVisible?: boolean;
  @IsOptional() @IsDateString() dueAt?: string;
}

class UpdateDeliverableDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(8000) description?: string;
  @IsOptional() @IsIn(DELIVERABLE_STATUSES as unknown as string[]) status?: DeliverableStatus;
  @IsOptional() @IsBoolean() clientVisible?: boolean;
  @IsOptional() @IsMongoId() milestoneId?: string | null;
  @IsOptional() @IsDateString() dueAt?: string | null;
}

class RequestApprovalDto {
  @IsArray() @ArrayNotEmpty() @IsMongoId({ each: true }) approverUserIds!: string[];
  @IsIn(APPROVAL_STRATEGIES as unknown as string[]) strategy!: ApprovalStrategy;
  @IsOptional() @IsInt() @Min(1) requiredCount?: number;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
}

@ApiTags('deliverables')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/deliverables')
export class DeliverablesController {
  constructor(private readonly deliverables: DeliverablesService) {}

  @Get()
  @RequirePermissions('project.read')
  @ApiOperation({ summary: 'List deliverables (optionally by project)' })
  async list(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Query('projectId') projectId?: string,
  ): Promise<DeliverableView[]> {
    return (await this.deliverables.list(w, { projectId })).map((d) => this.deliverables.toView(d));
  }

  @Get(':deliverableId')
  @RequirePermissions('project.read')
  @ApiOperation({ summary: 'Get one deliverable with its version history' })
  async getOne(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('deliverableId', ParseObjectIdPipe) deliverableId: string,
  ): Promise<DeliverableView> {
    return this.deliverables.toView(await this.deliverables.getOrThrow(w, deliverableId));
  }

  @Post()
  @RequirePermissions('project.update')
  @ApiOperation({ summary: 'Create a deliverable' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateDeliverableDto,
  ): Promise<DeliverableView> {
    return this.deliverables.toView(await this.deliverables.create(w, userId, dto));
  }

  @Patch(':deliverableId')
  @RequirePermissions('project.update')
  @ApiOperation({ summary: 'Update a deliverable' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('deliverableId', ParseObjectIdPipe) deliverableId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateDeliverableDto,
  ): Promise<DeliverableView> {
    return this.deliverables.toView(await this.deliverables.update(w, deliverableId, dto, userId));
  }

  @Post(':deliverableId/versions')
  @RequirePermissions('project.update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload a new version of a deliverable' })
  async addVersion(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('deliverableId', ParseObjectIdPipe) deliverableId: string,
    @CurrentUser('id') userId: string,
    @UploadedFile() file: MulterFile,
    @Body('note') note?: string,
  ): Promise<DeliverableView> {
    return this.deliverables.toView(await this.deliverables.addVersion(w, deliverableId, userId, file, note));
  }

  @Post(':deliverableId/versions/:versionId/request-approval')
  @RequirePermissions('approval.request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request approval on a specific deliverable version' })
  async requestApproval(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('deliverableId', ParseObjectIdPipe) deliverableId: string,
    @Param('versionId', ParseObjectIdPipe) versionId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RequestApprovalDto,
  ): Promise<DeliverableView> {
    return this.deliverables.toView(
      await this.deliverables.requestApproval(w, deliverableId, versionId, userId, dto),
    );
  }

  @Delete(':deliverableId')
  @RequirePermissions('project.update')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a deliverable' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('deliverableId', ParseObjectIdPipe) deliverableId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.deliverables.softDelete(w, deliverableId, userId);
    return { message: 'Deliverable deleted.' };
  }
}
