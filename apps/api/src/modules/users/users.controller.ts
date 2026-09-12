import { Body, Controller, Delete, Get, HttpCode, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '@flowdesk/types';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from './users.service.js';

interface MulterFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current user profile' })
  async me(@CurrentUser('id') userId: string): Promise<AuthUser> {
    const user = await this.users.getByIdOrThrow(userId);
    return this.users.toAuthUser(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the current user profile' })
  async updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto): Promise<AuthUser> {
    const user = await this.users.updateProfile(userId, dto);
    return this.users.toAuthUser(user);
  }

  @Post('me/avatar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload / replace the current user’s avatar' })
  async uploadAvatar(@CurrentUser('id') userId: string, @UploadedFile() file: MulterFile): Promise<AuthUser> {
    const user = await this.users.setAvatar(userId, file);
    return this.users.toAuthUser(user);
  }

  @Delete('me/avatar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove the current user’s avatar' })
  async removeAvatar(@CurrentUser('id') userId: string): Promise<AuthUser> {
    const user = await this.users.removeAvatar(userId);
    return this.users.toAuthUser(user);
  }
}
