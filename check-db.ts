import prisma from './src/lib/db/prisma';

async function main() {
  const nodes = await prisma.knowledgeNode.findMany();
  console.log("Nodes in DB:", nodes.length);
  const meetings = await prisma.meeting.findMany({ select: { id: true, subject: true, status: true, knowledgeNode: { select: { id: true } } }});
  console.log("Meetings:", meetings);
  
  const tags = await prisma.knowledgeTag.findMany();
  console.log("Tags:", tags.length);
}

main().catch(console.error);
