import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig } from '../../config/configuration.js';
import { renderMail } from './mail.templates.js';
import type { MailTemplate } from './mail.types.js';

/**
 * Sends transactional email. On serverless there is no queue worker, so delivery
 * is inline but fire-and-forget — a failure is logged and never blocks the
 * request. In dev (`MAIL_TRANSPORT=console`) it just logs the message.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('MailService');
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private getTransporter(): Transporter | null {
    const mail = this.config.get('mail', { infer: true });
    if (mail.transport === 'console') return null;
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: mail.smtp.host,
        port: mail.smtp.port ?? 587,
        secure: (mail.smtp.port ?? 587) === 465,
        auth: mail.smtp.user ? { user: mail.smtp.user, pass: mail.smtp.pass } : undefined,
      });
    }
    return this.transporter;
  }

  /**
   * Renders + sends. Awaited by every call site — on a serverless deployment
   * (Vercel) the function's container freezes the instant the HTTP response
   * goes out, killing any unfinished background work, so delivery cannot be
   * truly fire-and-forget here. A failure is logged and swallowed rather than
   * thrown, so a broken mail provider never turns into a 500 for the caller.
   */
  async send(message: MailTemplate): Promise<void> {
    await this.deliver(message).catch((err: unknown) =>
      this.logger.error(`mail "${message.template}" to ${message.to} failed: ${String(err)}`),
    );
  }

  private async deliver(message: MailTemplate): Promise<void> {
    const rendered = renderMail(message);
    const from = this.config.get('mail.from', { infer: true });
    const transporter = this.getTransporter();
    if (!transporter) {
      this.logger.log(`[console mail] to=${message.to} subject=${JSON.stringify(rendered.subject)}\n${rendered.text}`);
      return;
    }
    await transporter.sendMail({ from, to: message.to, subject: rendered.subject, html: rendered.html, text: rendered.text });
    this.logger.log(`Sent "${rendered.subject}" to ${message.to}`);
  }
}
