import { Mic } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function MeetingsPage() {
  return (
    <EmptyState
      icon={Mic}
      title="No meetings yet"
      description="The Meeting agent turns transcripts into sourced action items — paste a transcript (from any transcriber) and it extracts the commitments, each linked to the exact moment it was said. Live capture comes later; paste works first."
      deliveredBy="Meeting agent · paste a transcript"
    />
  );
}
