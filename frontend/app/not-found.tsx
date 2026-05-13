import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <h1 className="text-3xl font-semibold">Not found</h1>
      <p className="text-muted-foreground mt-2">The page you were looking for doesn't exist.</p>
      <Link href="/" className="mt-4 underline">Back to dashboard</Link>
    </div>
  );
}
