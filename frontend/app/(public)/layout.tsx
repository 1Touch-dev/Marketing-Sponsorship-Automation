import type { Metadata } from "next";
import "../globals.css";
import { ToasterProvider } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Proposta de Patrocínio",
  description: "Proposta de patrocínio esportivo gerada por IA.",
};

export const dynamic = "force-dynamic";

/**
 * Public proposal share layout — no sidebar, no navigation, full-screen.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-white antialiased">
        <ToasterProvider>{children}</ToasterProvider>
      </body>
    </html>
  );
}
