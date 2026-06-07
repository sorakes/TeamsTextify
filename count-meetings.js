const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.meeting.count().then(c => {
  console.log('COUNT=', c);
  return prisma.$disconnect();
});
