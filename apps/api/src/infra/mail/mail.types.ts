export type MailTemplate =
  | { template: 'verify_email'; to: string; data: { name: string; verifyUrl: string } }
  | { template: 'reset_password'; to: string; data: { name: string; resetUrl: string } }
  | { template: 'workspace_invite'; to: string; data: { inviterName: string; workspaceName: string; acceptUrl: string } }
  | { template: 'generic'; to: string; data: { subject: string; heading: string; body: string; ctaLabel?: string; ctaUrl?: string } };

export interface RenderedMail {
  subject: string;
  html: string;
  text: string;
}
