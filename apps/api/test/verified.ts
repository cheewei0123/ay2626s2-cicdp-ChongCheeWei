import type { INestApplication } from '@nestjs/common';
import { PrismaService } from './../src/prisma/prisma.service.js';

// New accounts start unverified (KAN-77) and can't create bills or expenses.
// Most e2e tests are about something else, so this verifies their users straight
// in the database. verify-email.e2e-spec.ts tests the real email link.
export const markVerified = (app: INestApplication, ...emails: string[]) =>
  app.get(PrismaService).user.updateMany({
    where: { email: { in: emails } },
    data: { emailVerifiedAt: new Date() },
  });
