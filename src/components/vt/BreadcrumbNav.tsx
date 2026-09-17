import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface BreadcrumbSegment {
  label: string;
  to?: string;
  params?: Record<string, string>;
}

export function BreadcrumbNav({ segments }: { segments: BreadcrumbSegment[] }) {
  if (segments.length === 0) return null;

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          return (
            <BreadcrumbItem key={`${seg.label}-${i}`}>
              {i > 0 ? (
                <BreadcrumbSeparator>
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                </BreadcrumbSeparator>
              ) : null}
              {isLast || !seg.to ? (
                <BreadcrumbPage className="text-xs font-medium">{seg.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={seg.to} params={seg.params} className="text-xs text-muted-foreground hover:text-foreground">
                    {seg.label}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
