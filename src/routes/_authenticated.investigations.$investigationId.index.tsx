import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/investigations/$investigationId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/investigations/$investigationId/$tab",
      params: { investigationId: params.investigationId, tab: "overview" },
    });
  },
});
