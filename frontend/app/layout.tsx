import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cutmark — browser video editor",
  description: "Trim video, detect scene changes, and generate captions locally in your browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="bg-paper text-ink font-body antialiased">{children}</body></html>;
}
