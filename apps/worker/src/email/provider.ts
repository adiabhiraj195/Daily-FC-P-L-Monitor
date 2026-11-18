import { Resend } from 'resend';
import nodemailer from 'nodemailer';

export interface EmailSendInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}

export interface EmailProvider {
  send(input: EmailSendInput): Promise<{ providerMessageId: string | null }>;
  name: string;
}

/**
 * Resend Email Provider (Default)
 */
export class ResendEmailProvider implements EmailProvider {
  name = 'resend';
  private resend: Resend;
  private from: string;

  constructor(apiKey: string, from = 'Prozo Margin Monitor <alerts@example.com>') {
    this.resend = new Resend(apiKey);
    this.from = from;
  }

  async send(input: EmailSendInput): Promise<{ providerMessageId: string | null }> {
    const response = await this.resend.emails.send({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers: {
        'X-Entity-Ref-ID': input.idempotencyKey
      }
    });

    if (response.error) {
      throw new Error(`Resend provider error: ${response.error.message}`);
    }

    return {
      providerMessageId: response.data?.id || null
    };
  }
}

/**
 * Nodemailer SMTP Alternative
 */
export class NodemailerEmailProvider implements EmailProvider {
  name = 'smtp';
  private transporter: nodemailer.Transporter;
  private from: string;

  constructor(options: {
    host: string;
    port: number;
    secure?: boolean;
    user?: string;
    pass?: string;
    from?: string;
  }) {
    this.from = options.from || 'Prozo Margin Monitor <alerts@example.com>';
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure || false,
      auth:
        options.user && options.pass
          ? {
              user: options.user,
              pass: options.pass
            }
          : undefined
    });
  }

  async send(input: EmailSendInput): Promise<{ providerMessageId: string | null }> {
    const info = await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      messageId: `<${input.idempotencyKey}@prozo.internal>`
    });

    return {
      providerMessageId: info.messageId || null
    };
  }
}

/**
 * Test Email Provider (Captures messages without sending for hermetic testing & dev)
 */
export class TestEmailProvider implements EmailProvider {
  name = 'test';
  public sentMessages: EmailSendInput[] = [];

  async send(input: EmailSendInput): Promise<{ providerMessageId: string | null }> {
    this.sentMessages.push(input);
    const mockMessageId = `test-msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    return {
      providerMessageId: mockMessageId
    };
  }

  clear() {
    this.sentMessages = [];
  }
}

export function getEmailProvider(): EmailProvider {
  const providerType = process.env.EMAIL_PROVIDER || 'test';

  if (providerType === 'resend' && process.env.RESEND_API_KEY) {
    return new ResendEmailProvider(process.env.RESEND_API_KEY, process.env.EMAIL_FROM);
  }

  if (providerType === 'smtp' && process.env.SMTP_HOST) {
    return new NodemailerEmailProvider({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.EMAIL_FROM
    });
  }

  return new TestEmailProvider();
}
