import { redirect } from "next/navigation";

/** The command center opens on the Jarvis assistant (the orb). */
export default function Home() {
  redirect("/jarvis");
}
