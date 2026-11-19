import Link from "next/link";
import { Crest } from "@/components/brand/crest";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Crest size={96} />
      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-primary">404</p>
      <h1 className="mt-1 text-3xl font-semibold">Página não encontrada / Not found</h1>
      <p className="text-muted-foreground mt-2">
        A página que você procura não existe. / The page you were looking for doesn&apos;t exist.
      </p>
      <Link href="/" className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        Voltar ao painel / Back to dashboard
      </Link>
    </div>
  );
}
