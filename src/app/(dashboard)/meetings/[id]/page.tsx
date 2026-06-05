import prisma from "@/lib/db/prisma";
import { notFound, redirect } from "next/navigation";

// Essa rota redireciona para /meetings com o parâmetro de abertura do drawer
// (O Drawer agora é client-side via state, então redirecionamos para a listagem)
export default async function MeetingDetailPage({ params }: { params: { id: string } }) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: params.id }
  });

  if (!meeting) notFound();

  // Redirecionar para a lista de meetings com query param para abrir o drawer
  redirect(`/meetings?open=${params.id}`);
}
