import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/;
const PASSWORD_MSG = 'Password must be at least 10 characters and include an uppercase letter, a lowercase letter, and a digit.';

export class RegisterDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG })
  password!: string;

  @ApiPropertyOptional({ enum: ['en', 'ar'] })
  @IsOptional()
  @IsIn(['en', 'ar'])
  locale?: 'en' | 'ar';
}

export class LoginDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  password!: string;
}

export class VerifyEmailDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  token!: string;
}

export class ResendVerificationDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  token!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG })
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG })
  newPassword!: string;
}
