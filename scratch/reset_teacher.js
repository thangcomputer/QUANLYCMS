import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const teacher = await prisma.teacher.update({
    where: { phone: '020304' },
    data: { 
      status: 'Pending',
      testStatus: 'pending',
      testScore: 0,
      lockReason: null
    }
  });
  console.log('Teacher reset:', teacher);
}

main().catch(console.error).finally(() => prisma.$disconnect());
