export const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  maxToolCalls: 30,
  maxListItems: 300,
  maxFileSizeKb: 300,
  maxTotalBytes: 2 * 1024 * 1024,
  maxListDepth: 3,
  maxSearchResults: 80,
  maxGrepResults: 80,
  maxGrepFileSizeKb: 1024,
  maxAttachSizeKb: 10240,
  reminderUserMessages: 8,
  reminderApproxTokens: 6000,
  hideTechnicalMessages: true,
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
    enabled: Boolean(raw.enabled),
    maxToolCalls: toPositiveInt(raw.maxToolCalls, DEFAULT_SETTINGS.maxToolCalls),
    maxListItems: toPositiveInt(raw.maxListItems, DEFAULT_SETTINGS.maxListItems),
    maxFileSizeKb: toPositiveInt(raw.maxFileSizeKb, DEFAULT_SETTINGS.maxFileSizeKb),
    maxTotalBytes: toPositiveInt(raw.maxTotalBytes, DEFAULT_SETTINGS.maxTotalBytes),
    maxListDepth: toPositiveInt(raw.maxListDepth, DEFAULT_SETTINGS.maxListDepth),
    maxSearchResults: toPositiveInt(raw.maxSearchResults, DEFAULT_SETTINGS.maxSearchResults),
    maxGrepResults: toPositiveInt(raw.maxGrepResults, DEFAULT_SETTINGS.maxGrepResults),
    maxGrepFileSizeKb: toPositiveInt(raw.maxGrepFileSizeKb, DEFAULT_SETTINGS.maxGrepFileSizeKb),
    maxAttachSizeKb: toPositiveInt(raw.maxAttachSizeKb, DEFAULT_SETTINGS.maxAttachSizeKb),
    reminderUserMessages: toPositiveInt(raw.reminderUserMessages, DEFAULT_SETTINGS.reminderUserMessages),
    reminderApproxTokens: toPositiveInt(raw.reminderApproxTokens, DEFAULT_SETTINGS.reminderApproxTokens),
    hideTechnicalMessages: raw.hideTechnicalMessages !== false,
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
