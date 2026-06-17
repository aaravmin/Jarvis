import {
  Sparkles,
  Home,
  Mail,
  CalendarDays,
  Mic,
  Users,
  Compass,
  CheckSquare,
  Target,
  Inbox,
  Plug,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** One line describing the section — shown in empty states and the drawer. */
  description: string;
  /** Which roadmap phase / agent delivers the real functionality for this section. */
  deliveredBy: string;
};

/**
 * Single source of truth for navigation. Tabs are named to reflect the agent that powers them
 * (Email · Calendar · Meetings · Contacts · Opportunities), plus the core surfaces.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    label: "Jarvis",
    href: "/jarvis",
    icon: Sparkles,
    description: "Ask Jarvis anything — it searches the web and reads your files.",
    deliveredBy: "Assistant",
  },
  {
    label: "Today",
    href: "/today",
    icon: Home,
    description: "Your daily home — today's tasks, today's events, and anything overdue.",
    deliveredBy: "Phase 1 · P1-T3",
  },
  {
    label: "Email",
    href: "/email",
    icon: Mail,
    description: "The Email agent: triage Gmail into sourced tasks, replies, and follow-ups.",
    deliveredBy: "Email agent · needs Gmail connected",
  },
  {
    label: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    description: "The Calendar agent: events from your calendar and meetings proposed from email.",
    deliveredBy: "Calendar agent · needs Google connected",
  },
  {
    label: "Meetings",
    href: "/meetings",
    icon: Mic,
    description: "The Meeting agent: turn transcripts into sourced action items.",
    deliveredBy: "Meeting agent · paste a transcript",
  },
  {
    label: "Contacts",
    href: "/people",
    icon: Users,
    description: "The Contact agent: who to follow up with, why they matter, AI-drafted outreach.",
    deliveredBy: "Contact agent",
  },
  {
    label: "Opportunities",
    href: "/opportunities",
    icon: Compass,
    description: "The Opportunity agent: programs, jobs, hackathons — found and tracked with deadlines.",
    deliveredBy: "Opportunity agent",
  },
  {
    label: "Tasks",
    href: "/tasks",
    icon: CheckSquare,
    description: "Everything you've committed to, each with a link back to its source.",
    deliveredBy: "Phase 1 · P1-T1",
  },
  {
    label: "Goals",
    href: "/goals",
    icon: Target,
    description: "What you're working toward; tasks and people roll up to your goals.",
    deliveredBy: "Phase 1 · P1-T2",
  },
  {
    label: "Review",
    href: "/review",
    icon: Inbox,
    description: "Suggestions awaiting your approval before they become real items.",
    deliveredBy: "Phase 1 · P1-T4",
  },
  {
    label: "Connections",
    href: "/connections",
    icon: Plug,
    description: "Connect Google (read-only) so agents can use your Drive, Sheets, Gmail and Calendar.",
    deliveredBy: "Google connector",
  },
];

/** Find the nav item whose route matches the current pathname (longest prefix wins). */
export function activeNavItem(pathname: string): NavItem | undefined {
  return (
    NAV_ITEMS.find((item) => pathname === item.href) ??
    NAV_ITEMS.filter((item) => pathname.startsWith(item.href)).sort(
      (a, b) => b.href.length - a.href.length,
    )[0]
  );
}
