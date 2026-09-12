import { Body, Controller, Get, HttpCode, Ip, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator.js';
import { FormsService, type PublicFormView } from './forms.service.js';

class SubmitFormDto {
  @IsObject() answers!: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(160) submitterName?: string;
  @IsOptional() @IsEmail() submitterEmail?: string;
}

@ApiTags('public')
@Controller('public/forms')
export class PublicFormsController {
  constructor(private readonly forms: FormsService) {}

  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'Fetch a published form by slug (unauthenticated)' })
  async getBySlug(@Param('slug') slug: string): Promise<PublicFormView> {
    return this.forms.toPublicView(await this.forms.publicBySlug(slug));
  }

  @Post(':slug/submit')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit a published form (unauthenticated)' })
  async submit(
    @Param('slug') slug: string,
    @Body() dto: SubmitFormDto,
    @Ip() ip: string,
  ): Promise<{ message: string }> {
    const { message } = await this.forms.submit(slug, dto, { ip, userId: null });
    return { message };
  }
}
