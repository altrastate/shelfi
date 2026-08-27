import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildReports,
  buildCsv,
  periodStart,
  requireStaffContext,
  type ReportPeriod,
  type LibraryReports,
} from "./reports.server";

const PERIODS: ReportPeriod[] = ["7d", "30d", "90d", "year", "all"];

function parsePeriod(value: unknown): ReportPeriod {
  const p = String(value ?? "30d") as ReportPeriod;
  return PERIODS.includes(p) ? p : "30d";
}

/**
 * Library intelligence for the caller's own school.
 *
 * Every read runs through the caller's Supabase session, so existing RLS
 * decides which rows are visible; the school is never taken from the client.
 */
export const getLibraryReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { period?: string } | undefined) => ({
    period: parsePeriod(data?.period),
  }))
  .handler(async ({ data, context }): Promise<LibraryReports> => {
    const staff = await requireStaffContext(context.supabase, context.userId);
    return buildReports(context.supabase, staff.schoolId, data.period);
  });

const EXPORTS = [
  "borrowings",
  "overdue",
  "physical-catalogue",
  "digital-catalogue",
  "reading-activity",
] as const;
export type ExportKind = (typeof EXPORTS)[number];

/** CSV export, scoped to the caller's school by the same session/RLS path. */
export const exportReportCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { kind?: string; period?: string }) => {
    const kind = String(data?.kind ?? "") as ExportKind;
    if (!EXPORTS.includes(kind)) throw new Error("Unknown report.");
    return { kind, period: parsePeriod(data?.period) };
  })
  .handler(async ({ data, context }): Promise<{ filename: string; csv: string }> => {
    const staff = await requireStaffContext(context.supabase, context.userId);
    const csv = await buildCsv(
      context.supabase,
      staff.schoolId,
      data.kind,
      periodStart(data.period),
    );
    return { filename: `shelfi-${data.kind}-${new Date().toISOString().slice(0, 10)}.csv`, csv };
  });
