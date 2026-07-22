const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;
const SENSITIVE_QUERY_PARAMETER_PATTERN =
  /([?&](?:access_token|api_?key|authorization|auth|email|key|password|recipient|secret|signature|sig|token|user)=)[^&#\s]*/gi;
const SECRET_ENV_NAME_PATTERN =
  /(?:ANON_KEY|API_?KEY|AUTH|PASSWORD|SECRET|SERVICE_ROLE|TOKEN)/i;

function configuredSecretValues() {
  return Object.entries(process.env)
    .filter(([name, value]) => SECRET_ENV_NAME_PATTERN.test(name) && Boolean(value))
    .map(([, value]) => value as string)
    .filter((value) => value.length >= 8)
    .sort((left, right) => right.length - left.length);
}

export function redactPublicLogMessage(
  message: string,
  secretValues: Iterable<string> = configuredSecretValues()
) {
  let redacted = message;

  for (const secret of secretValues) {
    if (secret.length >= 8) redacted = redacted.split(secret).join("[redacted secret]");
  }

  return redacted
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, "$1[redacted credentials]@")
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, "$1 [redacted credential]")
    .replace(SENSITIVE_QUERY_PARAMETER_PATTERN, "$1[redacted]")
    .replace(EMAIL_PATTERN, "[redacted email]")
    .replace(PHONE_PATTERN, "[redacted phone]")
    .replace(/\/Users\/[^/\s]+/g, "/Users/[redacted]")
    .replace(/\/home\/[^/\s]+/g, "/home/[redacted]")
    .replace(/\b([A-Z]:\\Users\\)[^\\\s]+/gi, "$1[redacted]")
    .replace(/[\r\n]+/g, " ");
}

export function publicErrorMessage(error: unknown, fallback: string) {
  return redactPublicLogMessage(error instanceof Error ? error.message : fallback);
}
