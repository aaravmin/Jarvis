import { redirect } from "next/navigation";

/**
 * Review was folded into Today: pending suggestions (status='review') now render inline in a
 * "Suggested" section at the end of the Today feed, still gated by an explicit Accept/Dismiss (L0,
 * hard rule #5). This route stays as a redirect so old bookmarks and links keep working.
 */
export default function ReviewPage() {
  redirect("/today");
}
