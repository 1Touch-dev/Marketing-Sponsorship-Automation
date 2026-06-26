import type { Metadata } from "next";
import "./globals.css";
import { ToasterProvider } from "@/components/ui/toaster";
import { AppShell } from "@/components/shared/app-shell";
import { LangProvider } from "@/lib/i18n/lang-context";

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
        <LangProvider>
          <ToasterProvider>
            <AppShell>{children}</AppShell>
          </ToasterProvider>
        </LangProvider>
      </body>
    </html>
  );
}
