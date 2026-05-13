import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/shared/sidebar";

export const metadata: Metadata = {
  title: "Market Sponsorship Automation",
  description: "AI-powered sponsorship proposal & campaign workflow.",
};

// All routes need server-side rendering (Supabase queries depend on env at runtime).
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-x-hidden">
            <div className="px-6 py-6 lg:px-10 lg:py-8">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
