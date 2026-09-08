import React from "react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { TimestampWITA } from "../atoms/TimestampWITA";
import { AtelierBadge } from "../atoms/AtelierBadge";

export interface MetadataRowProps {
  artist: {
    id?: string;
    name: string;
    slug?: string | null;
    avatarUrl?: string | null;
  };
  createdAt?: Date | string | null;
  softwareUsed?: string[] | null;
  className?: string;
  avatarSize?: "sm" | "md";
  rightElement?: React.ReactNode;
}

export function MetadataRow({
  artist,
  createdAt,
  softwareUsed,
  className,
  avatarSize = "md",
  rightElement,
}: MetadataRowProps) {
  const sizeStyles = {
    sm: "h-7 w-7 text-xs",
    md: "h-9 w-9 text-sm",
  };

  const initials = artist.name
    ? artist.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "A";

  const artistHref = artist.slug ? `/artists/${artist.slug}` : undefined;

  const ArtistInfo = (
    <div className="flex items-center gap-2.5 min-w-0">
      <div
        className={cn(
          "relative shrink-0 rounded-full overflow-hidden bg-white/10 border border-white/10 flex items-center justify-center font-sans font-medium text-zinc-300",
          sizeStyles[avatarSize]
        )}
      >
        {artist.avatarUrl ? (
          <Image
            src={artist.avatarUrl}
            alt={artist.name}
            fill
            sizes="36px"
            className="object-cover"
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="font-sans font-medium text-sm text-[#f6f2e9] truncate hover:text-amber-300 transition-colors">
          {artist.name}
        </span>
        {createdAt && (
          <TimestampWITA date={createdAt} includeTime={false} className="text-[11px]" />
        )}
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 py-1",
        className
      )}
    >
      {artistHref ? (
        <Link href={artistHref} className="min-w-0 group">
          {ArtistInfo}
        </Link>
      ) : (
        ArtistInfo
      )}

      <div className="flex items-center gap-2 shrink-0">
        {softwareUsed && softwareUsed.length > 0 && (
          <div className="flex items-center gap-1 overflow-hidden">
            {softwareUsed.slice(0, 3).map((sw) => (
              <AtelierBadge key={sw} variant="muted" size="sm">
                {sw}
              </AtelierBadge>
            ))}
            {softwareUsed.length > 3 && (
              <span className="text-[10px] font-mono text-zinc-500">
                +{softwareUsed.length - 3}
              </span>
            )}
          </div>
        )}

        {rightElement}
      </div>
    </div>
  );
}
