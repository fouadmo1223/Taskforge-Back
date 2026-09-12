import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { FORM_VISIBILITY, type FormVisibility } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../../common/decorators/workspace.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { WorkspaceGuard } from '../../common/guards/workspace.guard.js';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe.js';
import { FormsService, type FormFieldInput, type FormRoutingInput, type FormView } from './forms.service.js';

class CreateFormDto {
  @IsString() @MinLength(1) @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsIn(FORM_VISIBILITY as unknown as string[]) visibility?: FormVisibility;
  @IsOptional() @IsArray() fields?: FormFieldInput[];
  @IsOptional() @IsString() @MaxLength(500) successMessage?: string;
  @IsOptional() @IsObject() routing?: FormRoutingInput;
}

class UpdateFormDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() projectId?: string | null;
  @IsOptional() @IsIn(FORM_VISIBILITY as unknown as string[]) visibility?: FormVisibility;
  @IsOptional() @IsArray() fields?: FormFieldInput[];
  @IsOptional() @IsString() @MaxLength(500) successMessage?: string;
  @IsOptional() @IsObject() routing?: FormRoutingInput;
  @IsOptional() @IsIn(['draft', 'published', 'closed']) status?: 'draft' | 'published' | 'closed';
}

@ApiTags('forms')
@ApiBearerAuth()
@UseGuards(WorkspaceGuard, PermissionsGuard)
@Controller('workspaces/:workspaceId/forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Get()
  @RequirePermissions('form.read')
  @ApiOperation({ summary: 'List intake forms' })
  async list(@Param('workspaceId', ParseObjectIdPipe) w: string): Promise<FormView[]> {
    return (await this.forms.list(w)).map((f) => this.forms.toView(f));
  }

  @Get(':formId')
  @RequirePermissions('form.read')
  @ApiOperation({ summary: 'Get one form' })
  async getOne(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('formId', ParseObjectIdPipe) formId: string,
  ): Promise<FormView> {
    return this.forms.toView(await this.forms.getOrThrow(w, formId));
  }

  @Get(':formId/submissions')
  @RequirePermissions('form.read')
  @ApiOperation({ summary: 'List submissions for a form' })
  async submissions(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('formId', ParseObjectIdPipe) formId: string,
  ) {
    await this.forms.getOrThrow(w, formId);
    return (await this.forms.listSubmissions(w, formId)).map((s) => this.forms.submissionView(s));
  }

  @Post()
  @RequirePermissions('form.manage')
  @ApiOperation({ summary: 'Create a form' })
  async create(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateFormDto,
  ): Promise<FormView> {
    return this.forms.toView(await this.forms.create(w, userId, dto));
  }

  @Patch(':formId')
  @RequirePermissions('form.manage')
  @ApiOperation({ summary: 'Update a form (fields, routing, publish/close)' })
  async update(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('formId', ParseObjectIdPipe) formId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateFormDto,
  ): Promise<FormView> {
    return this.forms.toView(await this.forms.update(w, formId, dto, userId));
  }

  @Delete(':formId')
  @RequirePermissions('form.manage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a form' })
  async remove(
    @Param('workspaceId', ParseObjectIdPipe) w: string,
    @Param('formId', ParseObjectIdPipe) formId: string,
    @CurrentUser('id') userId: string,
  ): Promise<{ message: string }> {
    await this.forms.softDelete(w, formId, userId);
    return { message: 'Form deleted.' };
  }
}
