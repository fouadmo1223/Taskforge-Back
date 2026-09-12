import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsMongoId, IsOptional, IsString, MinLength } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ description: 'Role to assign; defaults to the workspace default role.' })
  @IsOptional()
  @IsMongoId()
  roleId?: string;

  @ApiPropertyOptional({ description: 'Invite as an external client-portal user.' })
  @IsOptional()
  @IsBoolean()
  isClient?: boolean;
}

export class AcceptInviteDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  token!: string;
}

export class ChangeMemberRoleDto {
  @ApiProperty()
  @IsMongoId()
  roleId!: string;
}

export class SetMemberStatusDto {
  @ApiProperty({ enum: ['active', 'suspended'] })
  @IsIn(['active', 'suspended'])
  status!: 'active' | 'suspended';
}
