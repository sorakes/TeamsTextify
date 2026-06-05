import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Iniciando Limpeza Total do Banco...");

  await prisma.knowledgeNodeTag.deleteMany();
  await prisma.knowledgeEdge.deleteMany();
  await prisma.knowledgeNode.deleteMany();
  await prisma.knowledgeTag.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.orgSettings.deleteMany();
  await prisma.organization.deleteMany();

  console.log("✅ Banco purificado. Nenhum dado fake restante.");
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
