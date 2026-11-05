import type { Metadata } from "next";
import { NOINDEX_METADATA } from "@/lib/seo/noindex";

export const metadata: Metadata = {
  title: "Portal do Patrocinador",
  description: "Acompanhe suas propostas e contratos de patrocínio com o Coritiba FC.",
  ...NOINDEX_METADATA,
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
