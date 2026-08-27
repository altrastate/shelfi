import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function generateJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

/**
 * Platform administrators create schools. Insert goes through the user's own
 * session so the existing `is_system_admin()` RLS policy is the enforcement
 * point — no separate admin architecture.
 */
export const createSchool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string; city?: string; country?: string; contactEmail?: string }) => {
    const name = String(data?.name ?? "").trim();
    if (name.length < 2) throw new Error("Enter a school name.");
    return {
      name,
      city: String(data?.city ?? "").trim() || null,
      country: String(data?.country ?? "").trim() || null,
      contactEmail: String(data?.contactEmail ?? "").trim() || null,
    };
  })
  .handler(async ({ data, context }) => {
    const baseSlug = slugify(data.name) || "school";
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      const { data: school, error } = await context.supabase
        .from("schools")
        .insert({
          name: data.name,
          slug,
          city: data.city,
          country: data.country,
          contact_email: data.contactEmail,
          join_code: generateJoinCode(),
          is_active: true,
        })
        .select("id, name, slug, is_active, join_code")
        .single();

      if (!error) return school;
      if (error.code === "23505") continue; // slug collision — retry
      if (error.code === "42501" || /row-level security/i.test(error.message)) {
        throw new Error("Only platform administrators can create schools.");
      }
      throw new Error("Could not create the school. Please try again.");
    }
    throw new Error("Could not create the school. Please try again.");
  });
