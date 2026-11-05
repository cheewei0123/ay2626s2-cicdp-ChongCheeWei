// Seeds one user and the brief's example bill. Safe to run more than once.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const chee = await prisma.user.upsert({
    where: { email: 'chee@example.com' },
    update: {},
    create: {
      email: 'chee@example.com',
      // Placeholder until auth (bcrypt) exists; this account cannot log in
      passwordHash: 'seed-placeholder-not-a-real-hash',
      displayName: 'Chee',
      paynowMobile: '+6591234567',
    },
  });

  // Delete the old demo bill so re-running gives a clean copy (cascades to its rows)
  await prisma.bill.deleteMany({ where: { shareToken: 'seed-demo-bill' } });

  const bill = await prisma.bill.create({
    data: {
      ownerId: chee.id,
      title: 'Dinner at Maxwell',
      merchant: 'Maxwell Food Centre',
      date: new Date('2026-11-01'),
      serviceBp: 1000,
      gstBp: 900,
      shareToken: 'seed-demo-bill',
      joinCode: 'SEED2',
      items: {
        create: [
          { name: 'Chicken Rice', unitPriceCents: 600 },
          { name: 'Laksa', unitPriceCents: 750 },
          { name: 'Tiger', unitPriceCents: 800, quantity: 2 },
        ],
      },
      participants: {
        create: [
          { displayName: 'Chee', userId: chee.id },
          { displayName: 'Ali' },
          { displayName: 'Ben' },
          { displayName: 'Dan' },
        ],
      },
    },
    include: { items: true, participants: true },
  });

  const item = (name: string) => bill.items.find((i) => i.name === name)!.id;
  const person = (name: string) =>
    bill.participants.find((p) => p.displayName === name)!.id;

  await prisma.claim.createMany({
    data: [
      { itemId: item('Chicken Rice'), participantId: person('Chee') },
      { itemId: item('Laksa'), participantId: person('Ali') },
      { itemId: item('Tiger'), participantId: person('Ben') },
      { itemId: item('Tiger'), participantId: person('Dan') },
    ],
  });

  console.log(`Seeded user ${chee.email} and bill "${bill.title}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
