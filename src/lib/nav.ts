import {
  Home,
  Mail,
  CalendarDays,
  Mic,
  CheckSquare,
  Target,
  Inbox,
  Plug,
  Rocket,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** One line describing the section, shown in empty states and the drawer. */
  description: string;
  /** Which part of the system delivers this section. */
  deliveredBy: string;
};

/**
 * Single source of truth for navigation. GOTT is a goal-grounded attention engine:
 * it checks email, meetings, Notion, and calendar, and surfaces what matters most.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    label: "Today",
    href: "/today",
    icon: Home,
    description: "Everything on your plate, in order of importance.",
    deliveredBy: "Priority engine",
  },
  {
    label: "Review",
    href: "/review",
    icon: Inbox,
    description: "Suggestions awaiting your approval before they become real items.",
    deliveredBy: "Extraction engine",
  },
  {
    label: "Goals",
    href: "/goals",
    icon: Target,
    description: "Goals and sub-goals; items relevant to them are prioritized.",
    deliveredBy: "Goals",
  },
  {
    label: "Tasks",
    href: "/tasks",
    icon: CheckSquare,
    description: "Everything you've committed to, each with a link back to its source.",
    deliveredBy: "Task loop",
  },
  {
    label: "Meetings",
    href: "/meetings",
    icon: Mic,
    description: "Meeting notes and transcripts, turned into sourced action items.",
    deliveredBy: "Extraction engine",
  },
  {
    label: "Email",
    href: "/email",
    icon: Mail,
    description: "Synced Gmail, triaged into sourced tasks and follow-ups.",
    deliveredBy: "Google connector",
  },
  {
    label: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    description: "Events from your calendar, with meeting topics surfaced.",
    deliveredBy: "Google connector",
  },
  {
    label: "Connections",
    href: "/connections",
    icon: Plug,
    description: "Connect Google and Notion so GOTT can read your email, calendar, and notes.",
    deliveredBy: "Connectors",
  },
  {
    label: "Set up",
    href: "/onboard",
    icon: Rocket,
    description: "Tell GOTT who you are, set goals, and connect your accounts.",
    deliveredBy: "Onboarding",
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
