import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { OffsetPageQueryDto } from '../../../common/dto/pagination.dto.js';

export class AdminListUsersQueryDto extends OffsetPageQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or email' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: ['all', 'verified', 'unverified'] })
  @IsOptional()
  @IsIn(['all', 'verified', 'unverified'])
  verification?: 'all' | 'verified' | 'unverified';

  @ApiPropertyOptional({ enum: ['all', 'active', 'banned'] })
  @IsOptional()
  @IsIn(['all', 'active', 'banned'])
  status?: 'all' | 'active' | 'banned';
}

export class BanUserDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminListProjectsQueryDto extends OffsetPageQueryDto {
  @ApiPropertyOptional({ description: 'Search by project name or key' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: ['planning', 'active', 'on_hold', 'completed', 'archived'] })
  @IsOptional()
  @IsIn(['planning', 'active', 'on_hold', 'completed', 'archived'])
  status?: string;

  @ApiPropertyOptional({ enum: ['workspace', 'team', 'private'] })
  @IsOptional()
  @IsIn(['workspace', 'team', 'private'])
  visibility?: string;

  @ApiPropertyOptional({ description: 'Filter to one workspace' })
  @IsOptional()
  @IsMongoId()
  workspaceId?: string;
}

export class AdminListWorkspacesQueryDto extends OffsetPageQueryDto {
  @ApiPropertyOptional({ description: 'Search by workspace name or slug' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
