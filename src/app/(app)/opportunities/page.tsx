import { Compass } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function OpportunitiesPage() {
  return (
    <EmptyState
      icon={Compass}
      title="No opportunities yet"
      description="Programs, jobs, hackathons, and more — found and tracked in one place. The Opportunity agent will let you say 'find me biotech hackathons with upcoming deadlines' and surface each one with its deadline, how to apply, requirements, location/dates, and required skills — every field sourced. Goes live once the database migrations are applied."
      deliveredBy="Opportunity agent"
    />
  );
}
