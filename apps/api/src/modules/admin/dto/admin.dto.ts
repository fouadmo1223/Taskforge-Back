import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
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
