import { PrismaClient, Prisma, EmailStatus } from '@prisma/client';
import { EmailProvider } from '../email/provider.js';

export async function handleSendFCDigest(
  payload: { emailOutboxId: string },
  prisma: PrismaClient,
  emailProvider: EmailProvider
) {
  const { emailOutboxId } = payload;
  const outbox = await prisma.emailOutbox.findUnique({
    where: { id: emailOutboxId }
  });

  if (!outbox) {
    throw new Error(`EmailOutbox record '${emailOutboxId}' not found`);
  }

  // Idempotent: do not resend if already sent
  if (outbox.status === EmailStatus.SENT) {
    return {
      emailOutboxId,
      status: 'ALREADY_SENT',
      providerMessageId: outbox.providerMessageId
    };
  }

  // Mark SENDING
  await prisma.emailOutbox.update({
    where: { id: emailOutboxId },
    data: {
      status: EmailStatus.SENDING,
      attempts: { increment: 1 }
    }
  });

  try {
    const { providerMessageId } = await emailProvider.send({
      to: outbox.recipient,
      subject: outbox.subject,
      html: outbox.htmlBody,
      text: outbox.textBody,
      idempotencyKey: outbox.idempotencyKey
    });

    await prisma.emailOutbox.update({
      where: { id: emailOutboxId },
      data: {
        status: EmailStatus.SENT,
        providerMessageId,
        sentAt: new Date(),
        lastError: Prisma.DbNull
      }
    });

    return {
      emailOutboxId,
      status: 'SENT',
      providerMessageId
    };
  } catch (err: any) {
    console.error(`[Worker] Email delivery failed for ${emailOutboxId}:`, err);

    await prisma.emailOutbox.update({
      where: { id: emailOutboxId },
      data: {
        status: EmailStatus.FAILED,
        lastError: {
          message: err.message || String(err),
          failedAt: new Date().toISOString()
        }
      }
    });

    throw err;
  }
}
