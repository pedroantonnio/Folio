export const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  maxToolCalls: 20,
  maxListItems: 200,
  maxFileSizeKb: 300,
  maxTotalBytes: 2 * 1024 * 1024,
  maxListDepth: 3,
  reminderUserMessages: 8,
  reminderApproxTokens: 6000,
  largeDirs: [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "coverage",
    ".cache",
    "vendor"
  ],
  sensitiveNamePatterns: [
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "id_rsa",
    "id_ed25519",
    "credentials.json",
    "secrets.json",
    "service-account*.json",
    "firebase-adminsdk*.json",
    ".npmrc",
    ".pypirc",
    ".netrc"
  ],
  sensitiveContentPatterns: [
    "API_KEY",
    "SECRET",
    "TOKEN",
    "PASSWORD",
    "PRIVATE_KEY",
    "DATABASE_URL",
    "AWS_ACCESS_KEY_ID",
    "BEGIN PRIVATE KEY"
  ]
});

export function normalizeSettings(raw = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    maxToolCalls: toPositiveInt(raw.maxToolCalls, DEFAULT_SETTINGS.maxToolCalls),
    maxListItems: toPositiveInt(raw.maxListItems, DEFAULT_SETTINGS.maxListItems),
    maxFileSizeKb: toPositiveInt(raw.maxFileSizeKb, DEFAULT_SETTINGS.maxFileSizeKb),
    maxTotalBytes: toPositiveInt(raw.maxTotalBytes, DEFAULT_SETTINGS.maxTotalBytes),
    maxListDepth: toPositiveInt(raw.maxListDepth, DEFAULT_SETTINGS.maxListDepth),
    reminderUserMessages: toPositiveInt(raw.reminderUserMessages, DEFAULT_SETTINGS.reminderUserMessages),
    reminderApproxTokens: toPositiveInt(raw.reminderApproxTokens, DEFAULT_SETTINGS.reminderApproxTokens),
    largeDirs: toStringArray(raw.largeDirs, DEFAULT_SETTINGS.largeDirs),
    sensitiveNamePatterns: toStringArray(raw.sensitiveNamePatterns, DEFAULT_SETTINGS.sensitiveNamePatterns),
    sensitiveContentPatterns: toStringArray(raw.sensitiveContentPatterns, DEFAULT_SETTINGS.sensitiveContentPatterns)
  };
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function toStringArray(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value.map((item) => String(item).trim()).filter(Boolean);
  return cleaned.length ? cleaned : fallback;
}
