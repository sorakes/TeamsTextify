import React from "react";
import prisma from "@/lib/db/prisma";
import { MeetingListClient } from "./MeetingListClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MeetingsPage() {
  const meetings = await prisma.meeting.findMany({
    orderBy: { createdAt: 'desc' }
  });

  return <MeetingListClient initialMeetings={meetings} />;
}
