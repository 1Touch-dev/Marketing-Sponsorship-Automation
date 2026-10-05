import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
  titleClassName,
  layout = "inline",
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  /** Override h1 sizing/clamping — e.g. for pages whose title is long, free-text content rather than a short page name. */
  titleClassName?: string;
  /** `stacked` puts actions on their own wrapping row. Default stays one row from the sm breakpoint. */
  layout?: "inline" | "stacked";
}) {
  const stacked = layout === "stacked";
  return (
    <div className={cn(
      "mb-6",
      stacked ? "flex flex-col gap-3" : "flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between",
      className,
    )}>
      <div className="min-w-0">
        <h1 title={titleClassName ? title : undefined} className={titleClassName ?? "text-2xl font-semibold tracking-tight"}>{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? (
        <div className={cn("flex flex-wrap gap-2", stacked ? "w-full min-w-0" : "shrink-0")}>{actions}</div>
      ) : null}
    </div>
  );
}
