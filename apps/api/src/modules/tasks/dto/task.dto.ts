import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SEVERITIES, TASK_PRIORITIES, type Severity, type TaskPriority } from '@flowdesk/types';

export class CreateTaskDto {
  @ApiProperty() @IsMongoId() projectId!: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() boardId?: string;
  @ApiPropertyOptional() @IsOptional() @IsMongoId() columnId?: string;

  @ApiProperty({ minLength: 1, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50_000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) type?: string;
  @ApiPropertyOptional({ enum: TASK_PRIORITIES }) @IsOptional() @IsIn(TASK_PRIORITIES as unknown as string[]) priority?: TaskPriority;
  @ApiPropertyOptional({ enum: SEVERITIES, nullable: true }) @IsOptional() @IsIn(SEVERITIES as unknown as string[]) severity?: Severity;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsMongoId({ each: true }) assigneeUserIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsMongoId({ each: true }) labelIds?: string[];
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() startDate?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() dueDate?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber() @Min(0) estimateHours?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsMongoId() parentTaskId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsMongoId() milestoneId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() clientVisible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() atTop?: boolean;
}

export class UpdateTaskDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(300) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50_000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) type?: string;
  @ApiPropertyOptional({ enum: TASK_PRIORITIES }) @IsOptional() @IsIn(TASK_PRIORITIES as unknown as string[]) priority?: TaskPriority;
  @ApiPropertyOptional({ enum: SEVERITIES, nullable: true }) @IsOptional() @IsIn([...SEVERITIES, null] as unknown as string[]) severity?: Severity | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsMongoId({ each: true }) assigneeUserIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsMongoId({ each: true }) followerUserIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsMongoId({ each: true }) labelIds?: string[];
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() startDate?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() dueDate?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber() @Min(0) estimateHours?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsMongoId() milestoneId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() clientVisible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsObject() customFields?: Record<string, unknown>;
}

export class MoveTaskDto {
  @ApiProperty() @IsMongoId() columnId!: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsMongoId() beforeTaskId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsMongoId() afterTaskId?: string | null;
}

export class ReparentTaskDto {
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsMongoId() parentTaskId?: string | null;
}

export class ArchiveTaskDto {
  @ApiProperty() @IsBoolean() archived!: boolean;
}

export class SetCompletedDto {
  @ApiProperty() @IsBoolean() completed!: boolean;
}

export class ChecklistTitleDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) title!: string;
}
export class ChecklistItemTextDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) text!: string;
}
export class ToggleChecklistItemDto {
  @ApiProperty() @IsBoolean() done!: boolean;
}
