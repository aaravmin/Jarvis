import { redirect } from "next/navigation";

/** Jarvis opens on Today: everything on your plate, in order of importance. */
export default function Home() {
  redirect("/today");
}
