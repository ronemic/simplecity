import "@/lib/env/bootstrap";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

async function main() {
  const supabase = createServiceSupabaseClient();

  const { error } = await supabase.from("announcements").insert({
    title: "Sample announcement for local development",
    body: "This sample is clearly labeled and can be deleted from the admin portal after real scraper data is available.",
    type: "info",
    is_published: true
  });

  if (error) throw error;
  console.log("Inserted clearly labeled sample announcement.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
