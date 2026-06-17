import { redirect } from "next/navigation";

/** The command center opens on Today. */
export default function Home() {
  redirect("/today");
}
