import type { Metadata } from "next";
import { Geist, Geist_Mono, Baloo_2 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The homey wordmark face - a friendly, rounded display font used ONLY for the "Otto" brand. Body
// text stays the clean Geist sans; this is loaded as its own CSS variable so nothing else inherits it.
const ottoWordmark = Baloo_2({
  variable: "--font-otto",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Otto",
  description:
    "Otto reads your email, meeting notes, Notion, and calendar, turns them into tasks and follow-ups with due dates, and orders everything by what matters most to your goals, with a source link for every item.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} ${ottoWordmark.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
