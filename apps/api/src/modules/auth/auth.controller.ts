import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser, LoginResult, SessionView, WorkspaceMembershipView } from '@flowdesk/types';
import type { AppConfig } from '../../config/configuration.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { RequestUser } from '../../common/context/request-context.js';
import { MembershipsService } from '../memberships/memberships.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie, type RefreshCookieConfig } from './auth.cookie.js';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly memberships: MembershipsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private meta(req: Request): { userAgent: string | null; ip: string | null } {
    return {
      userAgent: req.headers['user-agent'] ?? null,
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? null,
    };
  }

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(202)
  @ApiOperation({ summary: 'Create an account and send a verification email' })
  async register(@Body() dto: RegisterDto): Promise<{ message: string }> {
    await this.auth.register(dto);
    return { message: 'Account created. Check your email to verify your address.' };
  }

  @Post('verify-email')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify an email address with a token' })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ message: string }> {
    await this.auth.verifyEmail(dto.token);
    return { message: 'Email verified. You can sign in now.' };
  }

  @Post('resend-verification')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(202)
  @ApiOperation({ summary: 'Resend the verification email' })
  async resend(@Body() dto: ResendVerificationDto): Promise<{ message: string }> {
    await this.auth.resendVerification(dto.email);
    return { message: 'If that address needs verification, a new email is on its way.' };
  }

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign in with email and password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResult> {
    const result = await this.auth.login(dto.email, dto.password, this.meta(req));
    setRefreshCookie(res, this.appConfig(), result.session.refreshCookie, result.session.refreshMaxAgeMs);
    return { user: result.user, tokens: result.tokens, memberships: result.memberships };
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ accessToken: string; expiresIn: number }> {
    const cookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const issued = await this.auth.refresh(cookie, this.meta(req));
    setRefreshCookie(res, this.appConfig(), issued.refreshCookie, issued.refreshMaxAgeMs);
    return issued.tokens;
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign out of the current session' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ message: string }> {
    const cookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.auth.logout(cookie);
    clearRefreshCookie(res, this.appConfig());
    return { message: 'Signed out.' };
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke every session for the current user' })
  async logoutAll(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.auth.logoutAll(user.id);
    clearRefreshCookie(res, this.appConfig());
    return { message: 'Signed out of all sessions.' };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user with workspace memberships (bootstrap)' })
  async me(@CurrentUser('id') userId: string): Promise<{ user: AuthUser; memberships: WorkspaceMembershipView[] }> {
    const user = await this.users.getByIdOrThrow(userId);
    return { user: this.users.toAuthUser(user), memberships: await this.memberships.listForUser(userId) };
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions for the current user' })
  sessions(@CurrentUser() user: RequestUser): Promise<SessionView[]> {
    return this.auth.listSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:family')
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoke one session' })
  async revokeSession(@CurrentUser('id') userId: string, @Param('family') family: string): Promise<{ message: string }> {
    await this.auth.revokeSession(userId, family);
    return { message: 'Session revoked.' };
  }

  @Post('forgot-password')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(202)
  @ApiOperation({ summary: 'Send a password reset email' })
  async forgot(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.auth.forgotPassword(dto.email);
    return { message: 'If that address has an account, a reset link is on its way.' };
  }

  @Post('reset-password')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Set a new password with a reset token' })
  async reset(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    await this.auth.resetPassword(dto.token, dto.password);
    return { message: 'Password updated. Sign in with your new password.' };
  }

  @Post('change-password')
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Change the password for the signed-in user' })
  async change(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto): Promise<{ message: string }> {
    await this.auth.changePassword(userId, dto.currentPassword, dto.newPassword);
    return { message: 'Password changed. Other sessions have been signed out.' };
  }

  private appConfig(): RefreshCookieConfig {
    return {
      globalPrefix: this.config.get('http.globalPrefix', { infer: true }),
      cookieDomain: this.config.get('jwt.cookieDomain', { infer: true }),
      cookieSecure: this.config.get('jwt.cookieSecure', { infer: true }),
      cookieSameSite: this.config.get('jwt.cookieSameSite', { infer: true }),
    };
  }
}
