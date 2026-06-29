import { revalidatePath, revalidateTag } from "next/cache";
import { PUBLIC_CONTENT_CACHE_TAG } from "@/lib/db/publicCache";

const PUBLIC_STATIC_PATHS = ["/", "/meetings", "/topics"];

export function revalidatePublicContent(paths: string[] = []) {
  revalidateTag(PUBLIC_CONTENT_CACHE_TAG, { expire: 0 });

  for (const path of [...PUBLIC_STATIC_PATHS, ...paths]) {
    revalidatePath(path);
  }

  revalidatePath("/topics/[category]", "page");
  revalidatePath("/meetings/[id]", "page");
}
