import { redirect } from "next/navigation";

export default async function CategoryRedirectPage({
  params,
  searchParams
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ category }, query] = await Promise.all([params, searchParams]);
  const paramsString = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      value.forEach((item) => paramsString.append(key, item));
    } else if (value) {
      paramsString.set(key, value);
    }
  }

  const suffix = paramsString.toString();
  redirect(`/topics/${category}${suffix ? `?${suffix}` : ""}`);
}
