import { revalidatePath, revalidateTag } from "next/cache";
import { PUBLIC_CONTENT_CACHE_TAG } from "@/lib/db/publicCache";

const PUBLIC_STATIC_PATHS = ["/", "/meetings", "/categories"];

export function revalidatePublicContent(paths: string[] = []) {
  revalidateTag(PUBLIC_CONTENT_CACHE_TAG);

  for (const path of [...PUBLIC_STATIC_PATHS, ...paths]) {
    revalidatePath(path);
  }

  revalidatePath("/categories/[category]", "page");
  revalidatePath("/meetings/[id]", "page");
}
