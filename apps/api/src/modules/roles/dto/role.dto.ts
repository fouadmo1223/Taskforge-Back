import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PERMISSIONS, type Permission } from '@flowdesk/types';

export class CreateRoleDto {
  @ApiProperty({ minLength: 2, maxLength: 60 })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({ maxLength: 240 })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @ApiProperty({ isArray: true, enum: PERMISSIONS })
  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSIONS as unknown as string[], { each: true })
  permissions!: Permission[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 60 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ maxLength: 240 })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @ApiPropertyOptional({ isArray: true, enum: PERMISSIONS })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(PERMISSIONS as unknown as string[], { each: true })
  permissions?: Permission[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
