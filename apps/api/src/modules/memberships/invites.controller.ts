import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../common/context/request-context.js';
import { AcceptInviteDto } from './dto/membership.dto.js';
import { MembershipsService } from './memberships.service.js';

@ApiTags('members')
@ApiBearerAuth()
@Controller('invites')
export class InvitesController {
  constructor(private readonly memberships: MembershipsService) {}

  @Post('accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept a workspace invitation as the signed-in user' })
  async accept(@CurrentUser() user: RequestUser, @Body() dto: AcceptInviteDto): Promise<{ workspaceId: string }> {
    return this.memberships.acceptInvite(dto.token, { id: user.id, email: user.email });
  }
}
