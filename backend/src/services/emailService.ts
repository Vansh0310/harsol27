import { Resend } from 'resend';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { BUSINESS_CATEGORY_VALUES } from '../validators/lead';

export interface LeadNotificationData {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  businessCategory: (typeof BUSINESS_CATEGORY_VALUES)[number];
  createdAt: Date;
}

const BUSINESS_CATEGORY_LABELS: Record<LeadNotificationData['businessCategory'], string> = {
  manufacturing: 'Manufacturing',
  wholesale: 'Wholesale',
  retail: 'Retail',
  services: 'Services',
  trading: 'Trading',
  others: 'Others',
};

// Lazily constructed so importing this module never fails just because
// EMAIL_API_KEY happens to be unset in a context that never sends mail
// (e.g. a script that only imports the app for its types/tests that mock
// this module entirely).
let client: Resend | undefined;
function getClient(): Resend {
  if (!client) {
    client = new Resend(env.EMAIL_API_KEY);
  }
  return client;
}

// A single send attempt is capped so a hung connection to the email
// provider can never leave a background job running indefinitely.
const SEND_TIMEOUT_MS = 10_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

interface EmailContent {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

function buildAdminAlertEmail(lead: LeadNotificationData): EmailContent {
  const categoryLabel = BUSINESS_CATEGORY_LABELS[lead.businessCategory];
  const rows: Array<[string, string]> = [
    ['Name', lead.fullName],
    ['Phone', lead.phoneNumber],
    ['Email', lead.email],
    ['Business category', categoryLabel],
    ['Submitted', formatTimestamp(lead.createdAt)],
    ['Lead ID', lead.id],
  ];

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a;">
      <h2 style="margin: 0 0 16px;">New lead submitted</h2>
      <table style="border-collapse: collapse;">
        ${rows
          .map(
            ([label, value]) => `
          <tr>
            <td style="padding: 4px 12px 4px 0; color: #555; white-space: nowrap;">${escapeHtml(label)}</td>
            <td style="padding: 4px 0; font-weight: 600;">${escapeHtml(value)}</td>
          </tr>`,
          )
          .join('')}
      </table>
    </div>
  `.trim();

  const text = [
    'New lead submitted',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
  ].join('\n');

  return {
    to: env.ADMIN_NOTIFICATION_EMAIL,
    subject: `New lead: ${lead.fullName} (${categoryLabel})`,
    html,
    text,
  };
}

function buildSubmitterConfirmationEmail(lead: LeadNotificationData): EmailContent {
  const firstName = lead.fullName.trim().split(/\s+/)[0] ?? lead.fullName;

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a; max-width: 480px;">
      <h2 style="margin: 0 0 16px;">Thanks, ${escapeHtml(firstName)} - we've got your details</h2>
      <p>We received your submission and someone from our team will reach out to you shortly.</p>
      <p style="color: #777; font-size: 13px; margin-top: 32px;">
        If you didn't submit this request, you can safely ignore this email.
      </p>
    </div>
  `.trim();

  const text = [
    `Thanks, ${firstName} - we've got your details.`,
    '',
    'We received your submission and someone from our team will reach out to you shortly.',
    '',
    "If you didn't submit this request, you can safely ignore this email.",
  ].join('\n');

  return {
    to: lead.email,
    subject: "We've received your details",
    html,
    text,
  };
}

/**
 * Sends one email via the configured provider. Never throws: a failure here
 * must never surface as an API error or an unhandled rejection - it's logged
 * and swallowed, because losing a notification email is recoverable (the
 * lead is already safely persisted) while a false 500 to the submitter isn't.
 */
async function sendEmail(
  content: EmailContent,
  context: { leadId: string; kind: string },
): Promise<void> {
  try {
    const { data, error } = await withTimeout(
      getClient().emails.send({
        from: env.EMAIL_FROM,
        to: content.to,
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
      SEND_TIMEOUT_MS,
      `${context.kind} email`,
    );

    if (error) {
      logger.warn(
        { leadId: context.leadId, kind: context.kind, resendError: error },
        'Email provider rejected a notification email',
      );
      return;
    }

    logger.debug(
      { leadId: context.leadId, kind: context.kind, messageId: data?.id },
      'Notification email sent',
    );
  } catch (err) {
    logger.warn(
      { err, leadId: context.leadId, kind: context.kind },
      'Failed to send notification email',
    );
  }
}

/**
 * Fires the two Phase 5 notification emails for a freshly created lead: an
 * internal alert to the sales inbox and a confirmation to the submitter. The
 * two are independent - one failing never blocks or affects the other, and
 * this function itself never throws or rejects (see sendEmail above), so it
 * is always safe to call without awaiting the result on the request path.
 *
 * NOTE: while EMAIL_FROM is Resend's shared test domain (onboarding@resend.dev),
 * Resend rejects ANY `to` address other than the address the Resend account
 * itself was signed up with - this applies equally to the admin alert and
 * the submitter confirmation, regardless of what ADMIN_NOTIFICATION_EMAIL is
 * set to. See README "Email (Phase 5)" for how to verify this is wired up
 * correctly before a real sending domain exists. This resolves itself for
 * both emails the moment EMAIL_FROM points at a domain verified in the
 * Resend dashboard; no code change is required.
 */
export async function notifyNewLead(lead: LeadNotificationData): Promise<void> {
  await Promise.all([
    sendEmail(buildAdminAlertEmail(lead), { leadId: lead.id, kind: 'admin_alert' }),
    sendEmail(buildSubmitterConfirmationEmail(lead), {
      leadId: lead.id,
      kind: 'submitter_confirmation',
    }),
  ]);
}
