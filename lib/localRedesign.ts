import { cache } from "react";
import { headers } from "next/headers";
import { BETA_REQUEST_HEADER } from "@/lib/betaRoutes";

export const isBetaRequest = cache(async function isBetaRequest() {
  return (await headers()).get(BETA_REQUEST_HEADER) === "1";
});
