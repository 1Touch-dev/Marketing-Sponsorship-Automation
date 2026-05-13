import type { Metadata } from "next";
import "./globals.css";
import { Sidebar, MobileNav } from "@/components/shared/sidebar";
import { ToasterProvider } from "@/components/ui/toaster";

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
        <ToasterProvider>
          <div className="flex min-h-screen flex-col md:flex-row">
            <Sidebar />
            <div className="flex flex-1 flex-col min-w-0">
              <MobileNav />
              <main className="flex-1 overflow-x-hidden">
                <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8">{children}</div>
              </main>
            </div>
          </div>
        </ToasterProvider>
      </body>
    </html>
  );
}
