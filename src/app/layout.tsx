import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrialRoom — Synthetic product studies",
  description: "Watch four independent product testers turn journeys into evidence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
