export const CANONICAL_PRODUCTION_HOST = "simplecity.app";

export function isSimpleCityProductionHost(hostname: string | null | undefined) {
  const normalized = String(hostname || "").trim().toLowerCase();
  return normalized === CANONICAL_PRODUCTION_HOST || normalized.endsWith(`.${CANONICAL_PRODUCTION_HOST}`);
}
