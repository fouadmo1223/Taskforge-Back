import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsHexColor,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PROJECT_STATUSES, PROJECT_VISIBILITY, type ProjectVisibility } from '@flowdesk/types';

export class CreateProjectDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ description: '2–6 uppercase letters; auto-generated if omitted.' })
  @IsOptional()
  @Matches(/^[A-Za-z]{2,6}$/, { message: 'Project key must be 2–6 letters.' })
  key?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  leadUserId?: string;

  @ApiPropertyOptional({ enum: PROJECT_VISIBILITY })
  @IsOptional()
  @IsIn(PROJECT_VISIBILITY as unknown as string[])
  visibility?: ProjectVisibility;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  teamIds?: string[];
}

export class SetProjectAccessDto {
  @ApiPropertyOptional({ enum: PROJECT_VISIBILITY })
  @IsOptional()
  @IsIn(PROJECT_VISIBILITY as unknown as string[])
  visibility?: ProjectVisibility;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  teamIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  memberUserIds?: string[];
}

export class UpdateProjectDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ enum: PROJECT_STATUSES }) @IsOptional() @IsIn(PROJECT_STATUSES as unknown as string[]) status?: (typeof PROJECT_STATUSES)[number];
  @ApiPropertyOptional() @IsOptional() @IsHexColor() color?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsMongoId() leadUserId?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsMongoId({ each: true }) memberUserIds?: string[];
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() startDate?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() endDate?: string | null;
}

export class ArchiveProjectDto {
  @ApiProperty()
  @IsBoolean()
  archived!: boolean;
}
