import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
  titleClassName,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** Override h1 sizing/clamping — e.g. for pages whose title is long, free-text content rather than a short page name. */
  titleClassName?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-6", className)}>
      <div className="min-w-0">
        <h1 title={titleClassName ? title : undefined} className={titleClassName ?? "text-2xl font-semibold tracking-tight"}>{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}
