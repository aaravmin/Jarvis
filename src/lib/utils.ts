import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names with Tailwind conflict resolution. The shadcn/ui `cn` helper. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
