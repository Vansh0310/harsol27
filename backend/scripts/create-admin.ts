/**
 * Creates (or resets the password/role of) an admin_users row. This is the
 * ONLY way an admin account comes into existence - there is deliberately no
 * public registration endpoint (see the plan doc's Admin Dashboard section
 * and README "Admin auth (Phase 6)"). Run from the backend/ directory:
 *
 *   npx tsx scripts/create-admin.ts --email you@example.com --password 'a strong passphrase' [--role admin|viewer]
 *
 * The password is read from the command line or the ADMIN_PASSWORD env var
 * (useful to avoid it landing in shell history) - never hardcode one here.
 *
 * The 12-character minimum below is skipped only with --allow-weak-password,
 * for local dev throwaway accounts you intend to reset before this goes
 * anywhere real. It's a separate, explicit flag rather than a lowered
 * default specifically so a weak password never happens by accident - if
 * you're reusing this exact command later against production, that flag
 * being present is your reminder to drop it and use a real passphrase.
 */
import { z } from 'zod';
import { hashPassword } from '../src/utils/password';
import { upsertAdmin } from '../src/repositories/adminRepository';
import { prisma } from '../src/lib/prisma';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token?.startsWith('--')) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith('--')) {
        args[key] = value;
        i += 1;
      }
    }
  }
  return args;
}

function buildInputSchema(allowWeakPassword: boolean) {
  return z.object({
    email: z.string().trim().toLowerCase().pipe(z.email('--email must be a valid email address.')),
    // No composition rules beyond length - length is what actually matters
    // for brute-force resistance, and this is typed once by a human, not
    // exposed on any public form.
    password: allowWeakPassword
      ? z.string().min(1, '--password is required.')
      : z
          .string()
          .min(12, '--password must be at least 12 characters (or pass --allow-weak-password).'),
    role: z.enum(['admin', 'viewer']).default('admin'),
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const allowWeakPassword =
    'allow-weak-password' in args || process.argv.includes('--allow-weak-password');
  const parsed = buildInputSchema(allowWeakPassword).safeParse({
    email: args.email,
    password: args.password ?? process.env.ADMIN_PASSWORD,
    role: args.role,
  });

  if (allowWeakPassword) {
    console.error(
      'WARNING: --allow-weak-password is set - skipping the minimum-length check. Do not use this for a real deployment.',
    );
  }

  if (!parsed.success) {
    console.error('Invalid input:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.message}`);
    }
    console.error(
      "\nUsage: npx tsx scripts/create-admin.ts --email you@example.com --password '...' [--role admin|viewer]",
    );
    process.exitCode = 1;
    return;
  }

  const { email, password, role } = parsed.data;
  const passwordHash = await hashPassword(password);
  const admin = await upsertAdmin({ email, passwordHash, role });

  console.error(`Admin user ready: ${admin.email} (role: ${admin.role}, id: ${admin.id})`);
  console.error(
    'The password was hashed with bcrypt before storage - it was not logged or saved anywhere in plain text.',
  );
}

main()
  .catch((err: unknown) => {
    console.error('Failed to create admin user:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
