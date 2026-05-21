// Conservative redaction policy: scrub auth/session headers if anyone ever logs
// a request or headers object. PII (user ids, admin emails) is fine to log —
// this is an internal 10-20-user app. Magic-link URLs are only emitted by the
// devLog adapter (dev-only) so we don't redact them globally.

export const serverRedactPaths = [
  'headers.authorization',
  'headers.cookie',
  'headers["set-cookie"]',
  '*.headers.authorization',
  '*.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',
]
