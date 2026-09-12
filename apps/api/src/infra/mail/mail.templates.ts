import type { MailTemplate, RenderedMail } from './mail.types.js';

const shell = (heading: string, bodyHtml: string, cta?: { label: string; url: string }): string => `
<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <div style="background:#fff;border-radius:14px;padding:32px;border:1px solid #e4e6ea">
      <div style="font-weight:700;font-size:18px;color:#4f46e5;margin-bottom:20px">FlowDesk</div>
      <h1 style="font-size:20px;margin:0 0 12px;color:#1a1c22">${heading}</h1>
      <div style="font-size:14px;line-height:1.6;color:#43454d">${bodyHtml}</div>
      ${
        cta
          ? `<a href="${cta.url}" style="display:inline-block;margin-top:24px;background:#4f46e5;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-size:14px;font-weight:600">${cta.label}</a>
             <p style="font-size:12px;color:#8a8d96;margin-top:20px;word-break:break-all">Or paste this link: ${cta.url}</p>`
          : ''
      }
    </div>
    <p style="font-size:12px;color:#9aa0a6;text-align:center;margin-top:20px">You received this because someone used this address on FlowDesk.</p>
  </div>
</body></html>`;

export function renderMail(msg: MailTemplate): RenderedMail {
  switch (msg.template) {
    case 'verify_email':
      return {
        subject: 'Confirm your email address',
        html: shell(
          `Welcome, ${msg.data.name}`,
          `<p>Confirm this email address to activate your FlowDesk account. This link expires in 24 hours.</p>`,
          { label: 'Confirm email', url: msg.data.verifyUrl },
        ),
        text: `Welcome, ${msg.data.name}. Confirm your email: ${msg.data.verifyUrl}`,
      };
    case 'reset_password':
      return {
        subject: 'Reset your password',
        html: shell(
          'Reset your password',
          `<p>Hi ${msg.data.name}, we received a request to reset your password. This link expires in 1 hour. If you didn't ask for this, ignore this email.</p>`,
          { label: 'Choose a new password', url: msg.data.resetUrl },
        ),
        text: `Reset your password: ${msg.data.resetUrl}`,
      };
    case 'workspace_invite':
      return {
        subject: `${msg.data.inviterName} invited you to ${msg.data.workspaceName}`,
        html: shell(
          `Join ${msg.data.workspaceName}`,
          `<p>${msg.data.inviterName} invited you to collaborate in the <strong>${msg.data.workspaceName}</strong> workspace on FlowDesk.</p>`,
          { label: 'Accept invitation', url: msg.data.acceptUrl },
        ),
        text: `${msg.data.inviterName} invited you to ${msg.data.workspaceName}: ${msg.data.acceptUrl}`,
      };
    case 'generic':
      return {
        subject: msg.data.subject,
        html: shell(
          msg.data.heading,
          `<p>${msg.data.body}</p>`,
          msg.data.ctaLabel && msg.data.ctaUrl ? { label: msg.data.ctaLabel, url: msg.data.ctaUrl } : undefined,
        ),
        text: `${msg.data.heading}\n\n${msg.data.body}${msg.data.ctaUrl ? `\n\n${msg.data.ctaUrl}` : ''}`,
      };
  }
}
