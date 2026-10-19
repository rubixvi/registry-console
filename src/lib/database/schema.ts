export const DATABASE_SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    expires INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS session_expiry
    ON sessions (expires);

  CREATE TABLE IF NOT EXISTS auth_requests (
    id TEXT PRIMARY KEY,
    purpose TEXT NOT NULL,
    username TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    session_id TEXT NOT NULL,
    value TEXT NOT NULL,
    expires INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS auth_request_expiry
    ON auth_requests (expires);

  CREATE TABLE IF NOT EXISTS security_accounts (
    username TEXT PRIMARY KEY,
    account_id TEXT NOT NULL UNIQUE,
    configured_id TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS sso_links (
    provider TEXT NOT NULL,
    issuer TEXT NOT NULL,
    subject TEXT NOT NULL,
    account_id TEXT NOT NULL,
    PRIMARY KEY (provider, issuer, subject),
    UNIQUE (provider, account_id)
  );

  CREATE TABLE IF NOT EXISTS directory_users (
    id TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    subject TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
    policy TEXT NOT NULL,
    checked INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (source, subject)
  );

  CREATE TABLE IF NOT EXISTS passkeys (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    user_id TEXT NOT NULL,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL,
    transports TEXT NOT NULL,
    name TEXT NOT NULL,
    created TEXT NOT NULL,
    last_used TEXT
  );

  CREATE INDEX IF NOT EXISTS passkey_user
    ON passkeys (username, fingerprint);

  CREATE TABLE IF NOT EXISTS authenticators (
    username TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    secret TEXT NOT NULL,
    last_step INTEGER NOT NULL,
    recovery TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS registries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    pull_url TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    read_only INTEGER NOT NULL DEFAULT 0,
    revision TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT 'distribution',
    namespace TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS deletion_plans (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    registry_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    repository TEXT NOT NULL,
    value TEXT NOT NULL,
    expires INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS deletion_plan_expiry
    ON deletion_plans (expires);

  CREATE TABLE IF NOT EXISTS image_scans (
    id TEXT PRIMARY KEY,
    registry_id TEXT NOT NULL,
    status TEXT NOT NULL,
    value TEXT NOT NULL,
    expires INTEGER NOT NULL,
    updated INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS image_scan_expiry ON image_scans (expires);
  CREATE INDEX IF NOT EXISTS image_scan_running ON image_scans (status, expires);

  CREATE TABLE IF NOT EXISTS scan_queue (
    id TEXT PRIMARY KEY,
    registry_id TEXT NOT NULL,
    repository TEXT NOT NULL,
    digest TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'system:trivy',
    override INTEGER NOT NULL DEFAULT 0,
    available INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS scan_queue_pending ON scan_queue (available, updated);

  CREATE TABLE IF NOT EXISTS scan_attempts (
    id TEXT PRIMARY KEY,
    started INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS scan_attempt_started ON scan_attempts (started);

  CREATE TABLE IF NOT EXISTS scan_workers (
    id TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    expires INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scan_discovery (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    value TEXT NOT NULL,
    available INTEGER NOT NULL,
    updated INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS limits (
    id TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    expires INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY,
    at TEXT NOT NULL,
    actor TEXT NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    target TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS audit_time ON audit (at);
`
