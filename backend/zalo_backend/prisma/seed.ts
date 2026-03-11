/**
 * Prisma Seed Script — Admin User
 *
 * Seeds the initial admin account using credentials from environment variables.
 * Designed to be run via `npx prisma db seed` after `prisma migrate deploy`.
 *
 * Required env vars (loaded from .env or CI/CD):
 *   SEED_ADMIN_PHONE     — Admin phone number (e.g. "0900000001")
 *   SEED_ADMIN_PASSWORD  — Admin plain-text password (will be bcrypt-hashed)
 *   SEED_ADMIN_NAME      — Admin display name (default: "Administrator")
 *   DATABASE_URL         — Prisma DB connection string
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
      // ── Validate required env vars ─────────────────────────────────────────
      const phone = process.env.SEED_ADMIN_PHONE;
      const password = process.env.SEED_ADMIN_PASSWORD;
      const displayName = process.env.SEED_ADMIN_NAME ?? 'Administrator';

      if (!phone || !password) {
            throw new Error(
                  '[seed] Missing required env vars: SEED_ADMIN_PHONE, SEED_ADMIN_PASSWORD',
            );
      }

      // ── Fetch ADMIN role (seeded by migration 20260311000001_seed_roles) ───
      const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
      if (!adminRole) {
            throw new Error(
                  '[seed] ADMIN role not found — ensure migration 20260311000001_seed_roles has been applied.',
            );
      }

      // ── Hash password (same logic as UsersService.getHashPassword) ─────────
      const salt = bcrypt.genSaltSync(10);
      const passwordHash = bcrypt.hashSync(password, salt);

      // ── Upsert admin user (idempotent — safe to run multiple times) ─────────
      const admin = await prisma.user.upsert({
            where: { phoneNumber: phone },
            update: {
                  // Update password and role on re-run in case they changed in SSM
                  passwordHash,
                  roleId: adminRole.id,
                  displayName,
            },
            create: {
                  phoneNumber: phone,
                  displayName,
                  passwordHash,
                  roleId: adminRole.id,
            },
      });

      // ── Ensure PrivacySettings row exists (required by app logic) ───────────
      await prisma.privacySettings.upsert({
            where: { userId: admin.id },
            update: {},
            create: { userId: admin.id },
      });

      console.log(`[seed] ✅ Admin user ready: ${admin.phoneNumber} (id: ${admin.id})`);
}

main()
      .catch((e) => {
            console.error('[seed] ❌ Seed failed:', e);
            process.exit(1);
      })
      .finally(() => prisma.$disconnect());
