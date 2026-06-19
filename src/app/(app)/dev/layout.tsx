import { notFound } from "next/navigation";

/**
 * The /dev Component Lab is a development-only surface (the P0-T5 source-chip / guardrail demo). This
 * server-side guard makes the whole route segment return 404 in production, so it can't be reached by
 * navigating directly to /dev even though the page itself is a client component.
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <>{children}</>;
}
