const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando limpeza do banco...');

  // Deletar na ordem para respeitar foreign keys
  await prisma.auditLog.deleteMany({});
  console.log('✅ AuditLog limpo');

  await prisma.knowledgeEdge.deleteMany({});
  console.log('✅ KnowledgeEdge limpo');

  await prisma.knowledgeNodeTag.deleteMany({});
  console.log('✅ KnowledgeNodeTag limpo');

  await prisma.knowledgeNode.deleteMany({});
  console.log('✅ KnowledgeNode limpo');

  await prisma.knowledgeTag.deleteMany({});
  console.log('✅ KnowledgeTag limpo');

  await prisma.meeting.deleteMany({});
  console.log('✅ Meeting limpo');

  console.log('Limpeza concluída! SystemSettings e OrgSettings foram mantidos.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
