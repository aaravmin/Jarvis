import {
  Home,
  CheckSquare,
  CalendarDays,
  Target,
  Users,
  Briefcase,
  Inbox,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** One line describing the section — shown in the top bar and empty states. */
  description: string;
  /** Which roadmap phase delivers the real functionality for this section. */
  deliveredBy: string;
};

/**
 * Single source of truth for the primary navigation.
 * Order matches the roadmap's dashboard nav: Today · Tasks · Calendar · Goals · People · Jobs · Review.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    label: "Today",
    href: "/today",
    icon: Home,
    description: "Your daily home — today's tasks, today's events, and anything overdue.",
    deliveredBy: "Phase 1 · P1-T3",
  },
  {
    label: "Tasks",
    href: "/tasks",
    icon: CheckSquare,
    description: "Everything you've committed to, each with a link back to its source.",
    deliveredBy: "Phase 1 · P1-T1",
  },
  {
    label: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    description: "Events from your calendar and meetings proposed from your email.",
    deliveredBy: "Phase 3",
  },
  {
    label: "Goals",
    href: "/goals",
    icon: Target,
    description: "What you're working toward; tasks and people roll up to your goals.",
    deliveredBy: "Phase 1 · P1-T2",
  },
  {
    label: "People",
    href: "/people",
    icon: Users,
    description: "Who you owe a follow-up, why they matter, and AI-drafted outreach.",
    deliveredBy: "Phase 6",
  },
  {
    label: "Jobs",
    href: "/jobs",
    icon: Briefcase,
    description: "Job applications that track themselves from your inbox.",
    deliveredBy: "Phase 7",
  },
  {
    label: "Review",
    href: "/review",
    icon: Inbox,
    description: "Suggestions awaiting your approval before they become real items.",
    deliveredBy: "Phase 1 · P1-T4 (filled in Phase 2)",
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
