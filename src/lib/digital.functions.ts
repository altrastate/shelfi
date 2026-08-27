import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReadAccess = { url: string; title: string; format: string };

/**
 * Returns a short-lived signed URL for a digital book file.
 *
 * Authorization is decided in the database by `can_open_digital_resource`,
 * executed through the caller's own session (so RLS/role helpers apply).
 * The service-role client is used only afterwards, to mint the signed URL —
 * it never decides who is allowed in, and never reaches the browser.
 */
export const getDigitalReadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { resourceId: string }) => {
    const resourceId = String(data?.resourceId ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(resourceId)) throw new Error("Unknown resource.");
    return { resourceId };
  })
  .handler(async ({ data, context }): Promise<ReadAccess> => {
    const { data: allowed, error: rpcError } = await context.supabase.rpc(
      "can_open_digital_resource",
      { _resource_id: data.resourceId },
    );
    if (rpcError) throw new Error("We couldn't check your access to this book.");
    if (!allowed) throw new Error("You don't have access to this book.");

    // Metadata read still goes through the caller's session (RLS applies).
    const { data: resource, error } = await context.supabase
      .from("digital_resources")
      .select("id, title, format, storage_path")
      .eq("id", data.resourceId)
      .maybeSingle();

    if (error || !resource?.storage_path) {
      throw new Error("This book's file is unavailable.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("digital-books")
      .createSignedUrl(resource.storage_path, 900);

    if (signError || !signed?.signedUrl) {
      throw new Error("This book's file is unavailable.");
    }

    return {
      url: signed.signedUrl,
      title: resource.title,
      format: resource.format ?? "pdf",
    };
  });
