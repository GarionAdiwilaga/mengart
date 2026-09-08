import React from "react";
import { cn } from "@/lib/utils";
import { formatWitaDate } from "@/lib/presentation/witaTime";
import { Clock } from "lucide-react";

export interface TimestampWITAProps extends React.HTMLAttributes<HTMLSpanElement> {
  date: Date | string | number | null | undefined;
  includeTime?: boolean;
  monthFormat?: "short" | "long" | "numeric";
  showIcon?: boolean;
  prefix?: string;
}

export function TimestampWITA({
  date,
  includeTime = true,
  monthFormat = "short",
  showIcon = false,
  prefix,
  className,
  ...props
}: TimestampWITAProps) {
  const formatted = formatWitaDate(date, { includeTime, monthFormat });

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-zinc-400 select-none",
        className
      )}
      {...props}
    >
      {showIcon && <Clock className="h-3 w-3 text-zinc-500 shrink-0" />}
      {prefix && <span className="text-zinc-500 font-sans">{prefix}</span>}
      <span>{formatted}</span>
    </span>
  );
}
