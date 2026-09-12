import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateWorkspaceDto {
  @ApiProperty({ minLength: 2, maxLength: 80 })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ description: 'Optional custom slug; generated from name if omitted.' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9؀-ۿ-]+$/u, { message: 'Slug may contain letters, digits and hyphens only.' })
  @MaxLength(80)
  slug?: string;

  @ApiPropertyOptional({ enum: ['en', 'ar'] })
  @IsOptional()
  @IsIn(['en', 'ar'])
  defaultLocale?: 'en' | 'ar';
}

class WorkspaceSettingsDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsHexColor()
  primaryColor?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsHexColor()
  secondaryColor?: string | null;

  @ApiPropertyOptional({ enum: ['en', 'ar'] })
  @IsOptional()
  @IsIn(['en', 'ar'])
  defaultLocale?: 'en' | 'ar';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowConcurrentTimers?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  clientsSeeFinance?: boolean;
}

export class UpdateWorkspaceDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 80 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ type: WorkspaceSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkspaceSettingsDto)
  settings?: WorkspaceSettingsDto;
}
