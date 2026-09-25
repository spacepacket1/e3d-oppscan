"use client";

import Link from "next/link";

import { trackMetaPixelEvent } from "@/lib/meta-pixel";

export function ConsultationCta({
  href,
  label,
  pixelId,
}: {
  href: string;
  label: string;
  pixelId?: string;
}) {
  return (
    <Link
      className="button button--primary"
      href={href}
      onClick={() => {
        if (!pixelId) return;
        trackMetaPixelEvent("Schedule", { custom: true });
      }}
    >
      {label}
    </Link>
  );
}
