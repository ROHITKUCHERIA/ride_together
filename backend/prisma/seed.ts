/**
 * Development seed. Run with `npm run db:seed` (or `npx prisma db seed`).
 * Idempotent — safe to run repeatedly. Uses upserts keyed by stable emails.
 */
import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { MemberRole, TripStatus } from '../generated/prisma/enums';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://ridetogether:ridetogether@localhost:5433/ridetogether?schema=public';

const DEMO_PASSWORD = 'Demo1234!';

const DEMO_USERS = [
  {
    email: 'demo@ridetogether.app',
    name: 'Demo Rider',
  },
  {
    email: 'alice@ridetogether.app',
    name: 'Alice',
  },
  {
    email: 'bob@ridetogether.app',
    name: 'Bob',
  },
  {
    email: 'carol@ridetogether.app',
    name: 'Carol',
  },
];

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // 1) Users (upsert by unique email).
  const users = new Map<string, string>();
  for (const u of DEMO_USERS) {
    const created = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name },
      create: { email: u.email, name: u.name, passwordHash },
      select: { id: true, email: true },
    });
    users.set(created.email, created.id);
  }

  const demoId = users.get('demo@ridetogether.app')!;
  const aliceId = users.get('alice@ridetogether.app')!;
  const bobId = users.get('bob@ridetogether.app')!;
  const carolId = users.get('carol@ridetogether.app')!;

  // 2) Trips + memberships.
  const seedTrips = [
    {
      key: 'planned-coast',
      name: 'Goa Coastal Ride',
      description: 'Weekend ride along the coast.',
      destination: 'Goa',
      startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000),
      status: TripStatus.PLANNED,
      inviteCode: 'PLNCOAST',
      members: [
        { userId: demoId, role: MemberRole.OWNER },
        { userId: aliceId, role: MemberRole.ADMIN },
        { userId: bobId, role: MemberRole.MEMBER },
      ],
    },
    {
      key: 'active-hills',
      name: 'Western Ghats Climb',
      description: 'Active ride through the hills.',
      destination: 'Mahabaleshwar',
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      status: TripStatus.ACTIVE,
      inviteCode: 'ACTGHATS',
      members: [
        { userId: aliceId, role: MemberRole.OWNER },
        { userId: demoId, role: MemberRole.MEMBER },
        { userId: carolId, role: MemberRole.MEMBER },
      ],
    },
  ];

  for (const t of seedTrips) {
    const trip = await prisma.trip.upsert({
      where: { inviteCode: t.inviteCode },
      update: {
        name: t.name,
        description: t.description,
        destination: t.destination,
        startDate: t.startDate,
        endDate: t.endDate,
        status: t.status,
      },
      create: {
        name: t.name,
        description: t.description,
        destination: t.destination,
        startDate: t.startDate,
        endDate: t.endDate,
        status: t.status,
        inviteCode: t.inviteCode,
        createdBy: t.members[0].userId,
      },
      select: { id: true, createdBy: true },
    });

    for (const m of t.members) {
      await prisma.tripMember.upsert({
        where: {
          tripId_userId: { tripId: trip.id, userId: m.userId },
        },
        update: { role: m.role },
        create: { tripId: trip.id, userId: m.userId, role: m.role },
      });
    }
  }

  console.log(
    `Seeded ${DEMO_USERS.length} users, ${seedTrips.length} trips. ` +
      `Demo login: demo@ridetogether.app / ${DEMO_PASSWORD}`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
