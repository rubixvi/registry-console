# Registry Console

Registry Console is a self-hosted interface for Docker and OCI registries, including Docker Hub and GitHub Container Registry. It lets you browse repositories, filter and sort tags, inspect manifests and build history, review Trivy reports, and delete manifests with a preview of the affected tags.

The console connects to your existing registries. Images stay in those registries; Docker clients continue to push and pull directly. Connection settings, accounts' security state, scan reports and audit events are stored in SQLite. Admin, member and viewer accounts share the configured connections, with private repositories restricted to admins and members.

<img width="1912" height="914" alt="Registry browsing" src="https://github.com/user-attachments/assets/6d4d8836-2bee-45ce-8d5d-89b7f710efb0" />

<img width="1912" height="914" alt="Image details" src="https://github.com/user-attachments/assets/6bb9c87f-e351-435a-b171-5f1b76714240" />

<img width="1912" height="914" alt="Image history" src="https://github.com/user-attachments/assets/e3ed9b7e-9169-4b18-8243-a095b6e0ae46" />

## Features

- Multiple registry connections, repository search, tag filters and date sorting with newest first by default. Distribution and GitHub registries support namespace trees; Docker Hub uses a flat namespace list.
- Docker schema v2 and OCI manifests, multi-platform images, configuration, labels, layer sizes and build history. Public pull addresses can differ from internal connection addresses.
- Trivy vulnerability reports for immutable digests, without a Docker socket. Build attestations and private Docker Hub repositories are excluded.
- Individual and bulk manifest deletion with typed confirmation, a preview of all tags sharing each digest, and an audit trail.
- Local passwords, LDAP with account provisioning and group roles, or SSO through Authentik, GitHub, Google, Zitadel and Keycloak. Local accounts can use passkeys; password and SSO logins can require authenticator or recovery codes.
- Admin, member and viewer roles, encrypted registry credentials, configurable branding and an admin audit view.

## Published image

Use [`rubixvi/registry-console:edge`](https://hub.docker.com/r/rubixvi/registry-console). The image includes the console, operator utilities and Trivy. You do not need to clone or build the source to deploy it. Set `REGISTRY_CONSOLE_IMAGE` to another published tag or a verified digest when upgrading. The `latest` tag will be used once released.

## Deploy with Docker Compose

Install Docker Engine and its Compose plugin. Save the following as `docker-compose.yml` in a deployment directory. It runs the console and a separate scanner using the same image. The console listens on host loopback port 3000; registry connections are added through the interface.

```yaml
name: registry-console

services:
  app:
    image: ${REGISTRY_CONSOLE_IMAGE:-rubixvi/registry-console:edge}
    pull_policy: always
    user: '1000:1000'
    init: true
    restart: unless-stopped
    env_file:
      - .env
    environment:
      NODE_ENV: production
      HOSTNAME: 0.0.0.0
      PORT: '3000'
      DATA_DIR: /app/data
      NEXT_TELEMETRY_DISABLED: '1'
      TRIVY_RUNNER_URL: http://scanner:3001
    ports:
      - '127.0.0.1:3000:3000'
    volumes:
      - registry-data:/app/data
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    pids_limit: 160
    mem_limit: 512m
    cpus: 1.5
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
      interval: 30s
      timeout: 5s
      start_period: 20s
      retries: 3

  scanner:
    image: ${REGISTRY_CONSOLE_IMAGE:-rubixvi/registry-console:edge}
    pull_policy: always
    user: '1001:1001'
    init: true
    restart: unless-stopped
    entrypoint: ['node', 'scripts/scanner.mjs']
    environment:
      NODE_ENV: production
      SCANNER_DIR: /app/scanner
      TRIVY_PATH: /usr/local/bin/trivy
      TRIVY_RUNNER_TOKEN: ${TRIVY_RUNNER_TOKEN:?Set TRIVY_RUNNER_TOKEN}
      REGISTRY_ALLOWED_ORIGINS: ${REGISTRY_ALLOWED_ORIGINS:-}
      ALLOW_HTTP_REGISTRIES: ${ALLOW_HTTP_REGISTRIES:-false}
      TRIVY_TIMEOUT_SECONDS: ${TRIVY_TIMEOUT_SECONDS:-180}
    expose:
      - '3001'
    volumes:
      - scanner-data:/app/scanner
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    pids_limit: 96
    mem_limit: 2g
    cpus: 2
    healthcheck:
      test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3

volumes:
  registry-data:
  scanner-data:
```

### Generate secrets

Generate a console password hash interactively. Use a password of at least 14 characters.

```sh
docker run --rm -it --entrypoint node \
  rubixvi/registry-console:edge scripts/password-hash.mjs
```

Run this command twice, saving two different values for `ENCRYPTION_KEY` and `TRIVY_RUNNER_TOKEN`:

```sh
docker run --rm --entrypoint node rubixvi/registry-console:edge \
  -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Create `.env` beside the Compose file:

```dotenv
REGISTRY_CONSOLE_IMAGE=rubixvi/registry-console:edge
APP_ORIGIN=http://localhost:3000
AUTH_USERNAME=admin
AUTH_EMAIL=admin@example.com
AUTH_PASSWORD_HASH='REPLACE_WITH_COMPLETE_SCRYPT_HASH'
ENCRYPTION_KEY=REPLACE_WITH_64_RANDOM_HEX_CHARACTERS
ENCRYPTION_KEY_ID=main
TRIVY_RUNNER_TOKEN=REPLACE_WITH_A_DIFFERENT_64_RANDOM_HEX_VALUE
TRIVY_ENABLED=true
REGISTRY_ALLOWED_ORIGINS=https://registry.example.com
TRUST_PROXY=false
```

Replace every placeholder. `AUTH_EMAIL` is optional unless the account will use SSO. Keep hashes single quoted in Compose `.env` files to preserve dollar signs. When writing a hash directly in YAML, escape each literal `$` as `$$`; do not double dollar signs in the single-quoted `.env` value.

```sh
chmod 600 .env
docker compose up -d
docker compose ps
docker compose logs --tail=100 app scanner
```

Open `http://localhost:3000` on the deployment host. For remote use, configure an HTTPS reverse proxy and change `APP_ORIGIN` to the exact public origin, such as `https://console.example.com`. `APP_ORIGIN` has no path. Do not expose the scanner's port publicly.

The scanner uses UID 1001 and its own volume. The console uses UID 1000 and owns its database volume. Keep these volumes separate and retain their ownership when restoring backups. If scanning is disabled, the scanner service can be omitted and `TRIVY_RUNNER_URL` removed from the app configuration.

### Optional Distribution registry

For a new registry, create an `auth` directory and generate a separate registry account:

```sh
mkdir -p auth
chmod 700 auth
docker run --rm -it --entrypoint htpasswd httpd:2.4-alpine -nB registry-user
```

Save only the resulting `registry-user:$2...` entry in `auth/registry.password`. This bcrypt registry credential is separate from the console's scrypt login hash. Generate another independent random secret as `REGISTRY_HTTP_SECRET` in `.env`.

Add this service under `services` and its volume under `volumes`:

```yaml
services:
  registry:
    image: registry:3.1.2
    restart: unless-stopped
    ports:
      - '127.0.0.1:5000:5000'
    environment:
      REGISTRY_STORAGE_DELETE_ENABLED: 'true'
      REGISTRY_HEALTH_STORAGEDRIVER_ENABLED: 'false'
      REGISTRY_HTTP_SECRET: ${REGISTRY_HTTP_SECRET:?Set REGISTRY_HTTP_SECRET}
      REGISTRY_AUTH: htpasswd
      REGISTRY_AUTH_HTPASSWD_REALM: Registry Realm
      REGISTRY_AUTH_HTPASSWD_PATH: /auth/registry.password
    volumes:
      - ./auth/registry.password:/auth/registry.password:ro
      - image-data:/var/lib/registry

volumes:
  image-data:
```

Set `REGISTRY_ALLOWED_ORIGINS=http://registry:5000` and `ALLOW_HTTP_REGISTRIES=true`, then recreate the services. Add `http://registry:5000` as the console connection, using the registry username and its original password. Set its Pull URL to `http://localhost:5000` for clients on this host, or its public HTTPS address for remote clients. Configure registry TLS and external exposure separately.

## Deploy with Dokploy

Create a Compose application and use the same app and scanner services above. Enter deployment variables in Dokploy's **Environment**. Either provide the referenced `.env` file or replace `app.env_file` with explicit `app.environment` mappings for every console variable you use. Defining a variable in Dokploy does not pass it into a container unless the Compose configuration references it.

Remove the app's `ports` mapping and use `expose: ['3000']`. Add a Dokploy domain targeting service `app`, container port 3000, with HTTPS enabled. Set `APP_ORIGIN` to that domain's exact HTTPS origin. Leave the scanner on the private Compose network, with no domain and no host port.

Keep the named data volumes across redeployments. The optional registry can be added to the same application; use a Dokploy file mount for its htpasswd file if no repository-relative file exists. Its internal address remains `http://registry:5000`. Set the connection's Pull URL to the registry's own public HTTPS domain, not the console's domain.

Enable `TRUST_PROXY=true` only after verifying the proxy overwrites `X-Forwarded-For` and prevents direct access to the console. With proxy trust disabled, the proxy's socket IP is the source for login limits, so users behind that proxy share its per-IP allowance.

## Configuration

Restart or recreate the console after changing environment configuration. The supplied Compose file passes `.env` to the app; the scanner receives only the explicit variables in its own service definition.

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ORIGIN` | Required | Browser-facing origin used for request checks, cookies, passkeys and SSO callbacks. Production requires HTTPS except on loopback. |
| `DATA_DIR` | `./data`; `/app/data` in Compose | Console database and branding storage. Use one console instance per data directory. |
| `ENCRYPTION_KEY` | Required | 32 random bytes encoded as 64 hex characters. Protect and back up this key. |
| `ENCRYPTION_KEY_ID` | `main` | Active key name, 1–32 letters, digits, underscores or hyphens. |
| `ENCRYPTION_KEYS_JSON` | `{}` | Previous key IDs and hex keys retained for decryption during rotation. |
| `AUTH_USERNAME`, `AUTH_PASSWORD_HASH` | Required for single-account mode | Local admin username and generated scrypt hash. |
| `AUTH_EMAIL`, `AUTH_USER_ID` | Empty | Optional normalized account email and explicit immutable account UUID. |
| `AUTH_USERS_JSON` | Empty | Explicit local and SSO account list; replaces single-account configuration. |
| `GITHUB_ID`, `GITHUB_SECRET` | Empty | Enable GitHub sign-in when both are set. |
| `GOOGLE_ID`, `GOOGLE_SECRET` | Empty | Enable Google sign-in when both are set. |
| `AUTHENTIK_ID`, `AUTHENTIK_SECRET`, `AUTHENTIK_ISSUER` | Empty | Enable Authentik sign-in with the exact provider issuer. |
| `ZITADEL_ID`, `ZITADEL_SECRET`, `ZITADEL_ISSUER` | Empty | Enable Zitadel sign-in with the exact instance issuer. |
| `KEYCLOAK_ID`, `KEYCLOAK_SECRET`, `KEYCLOAK_ISSUER` | Empty | Enable Keycloak sign-in with the exact realm issuer. |
| `SESSION_HOURS` | `8` | Local and SSO session lifetime, 1–24 hours. |
| `TRUST_PROXY` | `false` | Trust the rightmost forwarded IP from a controlled proxy. |
| `AUDIT_RETENTION_DAYS` | `90` | Audit retention by age, 1–3650 days. Older events are pruned on subsequent audit writes. |
| `BRAND_NAME` | `Registry Console` | Initial branding and passkey display name. Branding can also be saved through Settings. |
| `REGISTRY_ALLOWED_ORIGINS` | Empty | Comma-separated exact registry origins the console may contact. |
| `REGISTRY_TOKEN_ORIGINS` | Empty | Approved external Bearer token-service origins. |
| `REGISTRY_BLOB_ORIGINS` | Empty | Approved HTTPS blob/CDN origins. Authorization is stripped on redirects. |
| `ALLOW_HTTP_REGISTRIES` | `false` | Allows cleartext access to otherwise approved HTTP registry and token origins. |
| `PULL_URL` | Empty | Default public address for copied pull commands. Each connection can override it. |
| `TAGLIST_ORDER` | `date-desc` | `date-desc`, `date-asc`, `natural-asc`, `natural-desc`, `alpha-asc` or `alpha-desc`. |
| `HISTORY_CUSTOM_LABELS` | Empty | Comma-separated configuration label names to display, up to 32. |

Optional initial connection variables are `REGISTRY_URL`, `REGISTRY_NAME`, `REGISTRY_USERNAME`, `REGISTRY_PASSWORD_ENCRYPTED` and `REGISTRY_READ_ONLY`. The connection is seeded once at startup; subsequent environment edits do not overwrite saved connection settings. Generate encrypted values with the existing active console key:

```sh
docker compose run --rm -it --no-deps --entrypoint node app scripts/encrypt-secret.mjs
```

## Accounts and access

All accounts share one workspace and its configured connections. Admins and members can read private repositories using saved registry credentials. Viewers can access only repositories confirmed to be public. Repository visibility is enforced in catalogue and search results, direct image and metadata requests, scan reports and server-rendered pages. Unknown visibility is denied. There are no per-user registry assignments.

| Action | Admin | Member | Viewer |
| --- | --- | --- | --- |
| Browse public repositories and inspect public images | Yes | Yes | Yes |
| Browse private repositories and inspect private images | Yes | Yes | No |
| Read reports for accessible images | Yes | Yes | Yes |
| Add or change connections, delete manifests, start or override scans | Yes | No | No |
| Change workspace branding and read audit events | Yes | No | No |
| Manage permitted personal sign-in methods | Yes | Yes | Yes |

Existing viewer accounts now have public access only. Change an account's role to `member` if it should retain read access to private repositories. This applies to local accounts, SSO accounts and LDAP group mappings.

Use `AUTH_USERS_JSON` for multiple local or SSO accounts. Each username and each nonempty email must be unique. Emails are trimmed and lowercased. At least one configured admin is required.

```dotenv
AUTH_USERS_JSON='[{"id":"00000000-0000-4000-8000-000000000001","username":"admin","email":"admin@example.com","passwordHash":"REPLACE_WITH_ADMIN_SCRYPT_HASH","role":"admin"},{"id":"00000000-0000-4000-8000-000000000002","username":"reader","email":"reader@example.com","authProvider":"sso","role":"viewer"}]'
```

`authProvider` defaults to `local`, which requires a password hash. `sso` requires an email and has no local password. LDAP accounts are provisioned separately from directory groups and must not be listed in this JSON. A local account with an email can also use SSO. LDAP accounts do not link through SSO.

Existing accounts can add an email without replacing enrolled security methods. A username change with the same email preserves the stored account identity and factors, and revokes old sessions. Password, email, role and authentication configuration changes invalidate existing sessions. Removing an account clears its security state at startup. Changing its explicit UUID replaces its identity and clears enrolled methods and SSO bindings; do not reuse an identity for a different person.

### SSO

Supported providers are Authentik, GitHub, Google, Zitadel and Keycloak. Configure an authorization-code client with PKCE; use a confidential web client with a client secret. Register the exact callback URL shown below, substituting your `APP_ORIGIN`.

| Provider ID | Issuer | Callback path |
| --- | --- | --- |
| `authentik` | Provider's exact OpenID issuer, commonly `https://auth.example.com/application/o/console/` | `/api/auth/sso/authentik/callback` |
| `github` | Fixed to `https://github.com`; uses an OAuth App | `/api/auth/sso/github/callback` |
| `google` | Fixed to `https://accounts.google.com`; use a Web application client | `/api/auth/sso/google/callback` |
| `zitadel` | Your instance's exact HTTPS issuer | `/api/auth/sso/zitadel/callback` |
| `keycloak` | `https://identity.example.com/realms/YOUR_REALM` | `/api/auth/sso/keycloak/callback` |

For example, the Google redirect URI for `APP_ORIGIN=https://console.example.com` is `https://console.example.com/api/auth/sso/google/callback`. Do not register wildcard callbacks. Enable the standard authorization-code flow and the `openid`, `profile` and `email` scopes for OIDC clients. GitHub uses `read:user` and `user:email`; it requires the account's verified primary email.

Configure only the providers you use. Set both the client ID and secret to enable a provider. Leave both empty to disable it. Incomplete credentials stop startup with a configuration error. Authentik, Zitadel and Keycloak also require their issuer.

```dotenv
GITHUB_ID=REPLACE
GITHUB_SECRET=REPLACE

GOOGLE_ID=REPLACE
GOOGLE_SECRET=REPLACE

AUTHENTIK_ID=REPLACE
AUTHENTIK_SECRET=REPLACE
AUTHENTIK_ISSUER=https://auth.example.com/application/o/console/

ZITADEL_ID=REPLACE
ZITADEL_SECRET=REPLACE
ZITADEL_ISSUER=https://identity.example.com
ZITADEL_AUTH_METHOD=basic

KEYCLOAK_ID=REPLACE
KEYCLOAK_SECRET=REPLACE
KEYCLOAK_ISSUER=https://identity.example.com/realms/console
```

These variables replace `SSO_PROVIDERS_JSON`. Move each existing provider's credentials and options to its own variables, remove the JSON setting and recreate the console. Provider IDs and callback paths stay the same, so existing identity bindings are retained.

Use the issuer reported by your provider's discovery document, including its path and trailing slash. GitHub and Google use fixed issuers. Optional settings use the same provider prefix, such as `ZITADEL_NAME`, `ZITADEL_AUTH_METHOD` and `ZITADEL_ORIGINS`.

| Suffix | Default | Purpose |
| --- | --- | --- |
| `_NAME` | Provider name | Label shown on the sign-in button. |
| `_AUTH_METHOD` | `post` | Token-endpoint client-secret authentication, either `post` or `basic`. |
| `_ORIGINS` | Empty | Comma-separated exact HTTPS origins for trusted endpoints outside the issuer origin, up to eight. |

For Zitadel, select the matching client-secret authentication method when creating its Web application. For Authentik and Keycloak, ensure the email scope exposes `email` and a truthful boolean `email_verified`. A provider that cannot verify the email is rejected.

Discovery, token, user-info and signing-key requests require HTTPS and cannot follow redirects. Endpoints must share the issuer origin, apart from the built-in Google and GitHub destinations. If your trusted provider publishes an endpoint on another host, set its exact origin, for example `AUTHENTIK_ORIGINS=https://keys.example.com`. These origins are security-sensitive because they can receive credentials or supply identity data.

The supplied Compose file reads these settings from `.env`. For a deployment that lists environment variables individually, pass the chosen provider's ID, secret and issuer through to the app service. Keep SSO credentials out of the scanner service. GitHub sign-in credentials are separate from a registry connection's package access token.

The first successful sign-in matches the verified provider email to an explicitly configured console account. It then binds that account to the provider's immutable subject and issuer. Subsequent logins must match both the binding and configured email. An email is a matching attribute, not an immutable identity: a reassigned email or changed provider subject cannot silently take over an existing binding. No accounts or admin roles are created from provider claims. Provider access tokens and client secrets are never returned to the browser or stored as console sessions.

Keep a local recovery admin. Disabling a user at an identity provider stops future sign-ins; existing console sessions remain until expiry or application-side revocation. Provider logout does not revoke console sessions. Session length is controlled by `SESSION_HOURS`, not the provider's token lifetime.

### Passkeys, authenticator codes and recovery

Local accounts can enroll passkeys with device verification. Passkeys replace the password and separate authenticator step at sign-in. A stable HTTPS hostname is required for production passkeys. LDAP and SSO-only accounts cannot enroll or sign in with passkeys.

Authenticator setup must be confirmed with a valid code before activation. Password and SSO sign-ins then require an authenticator or recovery code. Save the ten recovery codes when displayed; each can be used once. Security changes require recent password or SSO verification tied to the current session, plus the configured second factor. Verification lasts five minutes.

To reset one account's enrolled security methods and SSO bindings:

```sh
docker compose exec app node scripts/reset-security.mjs admin
```

This clears sessions, pending verifications, passkeys, authenticator setup, recovery codes and SSO links, and records an audit event. It does not change the configured password or email. A subsequent SSO login can establish a new binding, so use this command only after verifying the user's identity.

### LDAP

LDAP users do not need entries in `AUTH_USERS_JSON`. After a successful directory password check, the console creates a local account record and assigns a role from configured directory groups. Unmatched groups deny access. A directory account cannot replace a configured local or SSO account, including through a matching email. Keep a configured recovery admin for directory outages.

```dotenv
LDAP_ENABLED=true
LDAP_URL=ldaps://directory.example.com:636
LDAP_STARTTLS=false
LDAP_BASE_DN=ou=People,dc=example,dc=com
LDAP_BIND_DN=cn=registry-search,ou=ServiceAccounts,dc=example,dc=com
LDAP_BIND_PASSWORD_ENCRYPTED=REPLACE_WITH_ENCRYPTED_SEARCH_PASSWORD
LDAP_USER_FILTER=(uid={username})
LDAP_ID_ATTRIBUTE=entryUUID
LDAP_USERNAME_ATTRIBUTE=uid
LDAP_EMAIL_ATTRIBUTE=mail
LDAP_GROUP_ATTRIBUTE=memberOf
LDAP_ADMIN_GROUPS=cn=registry-admins,ou=Groups,dc=example,dc=com
LDAP_MEMBER_GROUPS=cn=registry-members,ou=Groups,dc=example,dc=com
LDAP_VIEWER_GROUPS=cn=registry-viewers,ou=Groups,dc=example,dc=com
LDAP_CHECK_SECONDS=60
LDAP_SESSION_MINUTES=15
```

Encrypt the search password with `scripts/encrypt-secret.mjs` and the active console key. Use a search account permitted to read the configured identity, group and account-status attributes. Verified LDAPS or `ldap://` with `LDAP_STARTTLS=true` is required before either bind. Referrals, ambiguous results and missing immutable identifiers are rejected. Passwords are not stored.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LDAP_ID_ATTRIBUTE` | `entryUUID` | Immutable directory identifier. Use `objectGUID` for Active Directory; binary GUIDs are preserved. Never use a username or email as the immutable identifier. |
| `LDAP_USERNAME_ATTRIBUTE` | `uid` | Canonical username returned by the directory. |
| `LDAP_EMAIL_ATTRIBUTE` | `mail` | Optional account email. It does not replace the immutable identity. |
| `LDAP_GROUP_ATTRIBUTE` | `memberOf` | Attribute containing the user's group memberships. |
| `LDAP_ADMIN_GROUPS` | Empty | Group values allowed to manage the console. |
| `LDAP_MEMBER_GROUPS` | Empty | Group values allowed to read public and private repositories. |
| `LDAP_VIEWER_GROUPS` | Empty | Group values allowed to read public repositories only. |
| `LDAP_GROUP_BASE_DN` | Empty | Optional group search base for directories without a suitable membership attribute. |
| `LDAP_GROUP_FILTER` | `(member={dn})` | Group search filter. Supports escaped `{dn}` and `{username}` placeholders. |
| `LDAP_ACCESS_FILTER` | Empty | Additional user search condition for directory-specific access and enabled-account rules. |
| `LDAP_CHECK_SECONDS` | `60` | Recheck active directory access after 15–300 seconds. |
| `LDAP_SESSION_MINUTES` | `15` | Maximum directory session lifetime, 5–60 minutes. |

At least one role group is required when LDAP is enabled. Multiple group values use semicolons or newlines; commas remain part of a distinguished name. Matching compares the complete trimmed group value without case sensitivity. The highest matching role wins, in the order `admin`, `member`, `viewer`. Nested groups are not expanded automatically. Configure a directory-supported group search if transitive membership is required.

The user filter must contain exactly one `{username}` placeholder. `LDAP_ACCESS_FILTER` is combined with it and with later immutable-ID searches. For Active Directory, use `LDAP_USERNAME_ATTRIBUTE=sAMAccountName`, `LDAP_ID_ATTRIBUTE=objectGUID` and a matching user filter. Disabled and expired AD accounts, computed AD lockouts and permanent OpenLDAP locks are checked when their status attributes are returned. Use the access filter to enforce any additional rules required by your directory, and ensure the search account can read those attributes.

Active requests revalidate group membership and access after the configured check interval. Removing all allowed groups or an account revokes its sessions; role, email and canonical username changes also revoke existing sessions. Directory outages deny access once a check is due, while local recovery accounts remain usable. No background sync is required. Password changes do not directly revoke a console session, which remains bounded by its lifetime and access checks.

A rename preserves security methods only when the immutable directory identity stays the same. A reassigned username creates a new account identity and clears the previous account's security methods. Configuration changes invalidate directory sessions; changing the directory URL, base DN or identifier attribute changes its identity scope. LDAP users cannot use local passkeys to bypass directory access.

For an existing deployment, remove entries with `authProvider: "ldap"` from `AUTH_USERS_JSON`, configure group mappings and restart. Legacy LDAP accounts must sign in again and re-enrol their console security methods. Local and SSO accounts remain configured through their existing settings.

## Registry connections and deletion

Use a registry origin without `/v2` or a repository path. Distribution discovery requires its catalogue and tag APIs; vendor-specific project discovery is not implemented. Basic and Bearer authentication are supported. A dedicated registry account should have only the permissions the console needs.

Viewer visibility uses Docker Hub's explicit privacy flag and GitHub Packages' `public` visibility. For Distribution registries, the console verifies anonymous repository pull access through the tag API without saved credentials. A registry that requires authentication for all repositories is private to viewers. Failed visibility checks hide the repository. Checks are shared within one request, and catalogue cursors are encrypted to avoid exposing hidden repository names. Shared credential and manifest caches cannot bypass the visibility check.


Docker Hub connections use a user or organisation namespace, such as `rubixvi` or `library`. Public browsing can use empty credentials; private browsing needs a Docker username and suitable token. Docker Hub's registry, Hub API, token endpoint and recognised HTTPS blob CDN destinations are built in. Other destinations require explicit approval. Docker Hub defaults copied pull commands to `docker.io`; a connection can override it.

Docker Hub is not forced to be read only. Deletion still depends on the connection setting, upstream permission and endpoint support. The console uses manifest deletion by digest through the Distribution API; it does not implement Docker Hub's separate tag-removal API. Upstream rate limits can still apply to admins. The console's browsing cache is reused unless an explicit refresh is requested; admin capacity is reserved in shared request and search queues.

Choose **GitHub Container** to connect to `https://ghcr.io`. Set the namespace to the GitHub user or organisation that owns the packages. Provide your GitHub username and a separate personal access token (classic) with `read:packages`. For organisations that enforce SSO, authorise the token for that organisation. The console lists container packages through GitHub's API and reads tags, manifests and configuration through GHCR. Your own private user packages use the authenticated-user API; a different user's namespace uses GitHub's public package endpoints.

GitHub connections can allow deletion. This requires `read:packages`, `delete:packages` and admin permission on the package. The console resolves the immutable digest to its active GitHub package version and deletes that version through the Packages API. Every tag attached to the version is affected. GitHub may refuse deletion, including for public versions with more than 5,000 downloads. The existing preview and confirmation steps apply.

The fixed GHCR origin, GitHub Packages API and `pkg-containers.githubusercontent.com` blob origin are built in for GitHub connections. Redirected blob requests do not carry registry credentials. A GitHub connection's package token is stored encrypted with the other registry credentials and shared by console accounts with access to the workspace. It is independent of `GITHUB_ID` and `GITHUB_SECRET`, which configure console sign-in. The scanner receives only the selected connection's package credentials for a scan.


Bulk deletion accepts up to 100 selected tags on the visible page. The preview resolves every repository tag to list all aliases of each selected digest, including unselected tags. If it cannot resolve the complete preview, deletion is not offered from that incomplete result. The plan belongs to the current admin session, lasts five minutes and can be used once. Tags can still change upstream after preview; concurrent registry writes are outside the console's transaction boundary.

Deleting a manifest can invalidate every tag pointing to it. It does not run registry garbage collection. Removing a connection clears its console settings, scan records and deletion plans; it does not remove upstream images. See the [Distribution configuration guide](https://distribution.github.io/distribution/about/configuration/) for registry-side deletion and storage management.

## Trivy scanning

`TRIVY_ENABLED=true` enables scanning globally, including discovery and queued image references. Only runnable immutable digests are scanned. Build attestations are excluded; multi-platform images are scanned for up to eight runnable platforms. Private Docker Hub repositories are excluded even when saved credentials can read them. Unconfirmed Docker Hub privacy also prevents a scan. Private Distribution and GitHub images can be scanned using connection credentials.

One scan runs at a time. Other jobs remain queued and the inspector displays the current scanner actor and lease deadline. The deadline is a timeout, not a completion estimate. Queued and running states poll every three seconds. Requesting the same running digest returns its existing state. Admins can choose **Override scan limit**, including for queued work; this bypasses the hourly budget and spacing, but preserves single-job execution and eligibility checks.

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRIVY_ENABLED` | `false` | Global scanning switch in the console. |
| `TRIVY_RUNNER_URL` | Empty; `http://scanner:3001` in Compose | Private worker origin. Required for production scanning. |
| `TRIVY_RUNNER_TOKEN` | Required when using the worker | Independent 32-byte random hex bearer secret, shared only by app and worker. |
| `TRIVY_PATH` | `/usr/local/bin/trivy` | Scanner executable in the worker. |
| `TRIVY_TIMEOUT_SECONDS` | `180` | Total deadline, 30–600 seconds, across an image's platforms. Set consistently on app and worker. |
| `TRIVY_SCANS_PER_HOUR` | `16` | Shared automatic scan-start budget, 1–60 per hour, with spacing. Failed starts consume budget. |
| `SCANNER_DIR` | `/app/scanner` | Worker's private writable cache and temporary workspaces. |
| `SCANNER_PORT`, `SCANNER_HOST` | `3001`, `0.0.0.0` | Worker listener; keep it private. |

Reports are reused for the same immutable digest and connection identity. They do not refresh automatically when the vulnerability database changes. Severity totals include all returned findings; detail tables retain up to 1,000. Counts are per platform. The scanner needs outbound access to registry authentication, image layers and Trivy databases, plus sufficient cache storage and memory for the images being scanned.

## Trust boundaries

### Browser and proxy

Use HTTPS and an exact `APP_ORIGIN`. State-changing requests require the expected origin. Cookies are HttpOnly and Secure on HTTPS. Normal local sessions use SameSite Strict; SSO state, SSO verification and SSO sessions use SameSite Lax to support top-level identity-provider callbacks. SSO state, PKCE and nonces are validated, signed OIDC ID tokens are checked against provider keys, and callback state is single-use.

The supplied Node launcher signs the actual socket peer internally and overwrites any client-supplied peer header. Keep `node --import ./scripts/peer.mjs server.js` when using a custom standalone launcher. Without this hook, production sign-in fails closed when proxy trust is disabled. The included image and package start scripts already load it.

`TRUST_PROXY=true` uses the rightmost IP in `X-Forwarded-For`. Your final trusted proxy must overwrite that header with the actual client address and block direct access. An arbitrary multi-proxy chain is not inferred. Never enable this setting for a publicly reachable untrusted backend. Login protection applies per IP and per username plus IP; admin login verification has reserved capacity. Browsing privileges do not bypass authentication attempt limits.

### Console, providers and registries

Allowlists constrain the console's registry requests, not DNS resolution or every process on the network. Token origins can receive registry credentials. SSO origins can receive provider client credentials and supply identity proofs. Configure only trusted services and use deployment egress policy when network isolation is required. HTTP registry access exposes credentials and content on that connection.

Read-only connection settings prevent deletion through the console; they do not reduce upstream credential permissions. Image metadata can contain sensitive labels or build arguments. Members and admins can read that metadata from accessible private repositories; viewers can read metadata only from confirmed public repositories.

### Scanner

The scanner runs under a separate UID with its own writable volume. It has no console database mount, encryption key, account hashes or SSO secrets in the supplied deployment. Do not mount the console volume into it or copy the app's entire environment into it. The worker receives only the selected registry credentials for each scan, uses a minimal subprocess environment, bounds output and runtime, and removes temporary credentials after completion or failure. It reads image contents without executing the image.

The worker bearer token authenticates scan requests; it does not encrypt them. The example trusts the private Docker network. Use a protected network or a TLS endpoint for a worker on another host. Do not expose this endpoint to browsers or the public Internet. A compromised scanner still has access to its cache, current scan credentials and allowed network destinations.

The worker validates the initial registry origin against its own `REGISTRY_ALLOWED_ORIGINS`. Trivy follows registry authentication and database requests itself; console token and blob allowlists do not govern Trivy's internal network traffic. Restrict scanner egress independently. For private certificate authorities, mount CA files into each service: use `NODE_EXTRA_CA_CERTS` for the console and `SSL_CERT_FILE` or `SSL_CERT_DIR` for Trivy. Keep TLS verification enabled.

### Data and operators

Registry passwords, LDAP bind passwords and authenticator secrets use AES-256-GCM envelopes with key IDs and authenticated version/key metadata. Local passwords use scrypt; recovery codes are hashed. SQLite itself is not encrypted. Metadata, emails, identity bindings, reports and audit entries remain sensitive.

Host operators and anyone with deployment secrets or backups can access or change state. Encryption does not protect secrets from a running console compromise with both its database and key. Branding is visible before sign-in; keep it free of confidential information. Audit retention is age-based, not immutable or protected against an operator with database access. Export important events to external storage when required.

## Operations

### Backups and upgrades

The `registry-data` volume in the supplied Compose file holds console SQLite state and branding; `scanner-data` holds replaceable scanner cache. The optional registry's `image-data` contains image content. Back up console data, registry content, htpasswd, deployment configuration and encryption keys. Retain a tested recovery procedure with keys stored separately from data backups.

Stop the app before filesystem backups, or use a SQLite backup method that includes the live write-ahead log correctly. Do not copy only a live `console.sqlite` file. Run one console instance per data volume on storage with reliable local SQLite locking.

```sh
docker compose stop app
docker compose up -d app
```

After backing up, change `REGISTRY_CONSOLE_IMAGE` if needed and update both services:

```sh
docker compose pull app scanner
docker compose up -d --force-recreate app scanner
docker compose logs --tail=100 app scanner
```

The image supplies the scanner executable, so updating both services updates both components. Database migrations run at startup; a rollback may require the matching pre-upgrade backup. Existing deployments enabling scans must add the isolated worker and its independent token before upgrading. No database volume should be mounted in the worker.

### Encryption key rotation

Back up the database and existing keys first. Generate a new key and choose a new `ENCRYPTION_KEY_ID`. Put the old key in `ENCRYPTION_KEYS_JSON` under its previous ID, then set `ENCRYPTION_KEY` and `ENCRYPTION_KEY_ID` to the new values in `.env`. IDs cannot be reused with different keys.

```dotenv
ENCRYPTION_KEY_ID=second
ENCRYPTION_KEY=REPLACE_WITH_NEW_64_HEX_KEY
ENCRYPTION_KEYS_JSON='{"main":"REPLACE_WITH_PREVIOUS_64_HEX_KEY"}'
```

Stop the app and run the rotation utility using the updated environment:

```sh
docker compose stop app
docker compose run --rm --no-deps --entrypoint node app scripts/rotate-key.mjs
docker compose up -d --force-recreate app
```

The utility atomically re-encrypts saved registry passwords and authenticator secrets, and records an audit event. It supports legacy `v1` ciphertext while migrating to keyed `v2` envelopes. Invalid or unreadable data rolls back the whole operation. Rotation changes cache identities, so images with reports under older identities can be queued for a new scan. Re-encrypt externally configured values such as `LDAP_BIND_PASSWORD_ENCRYPTED` and `REGISTRY_PASSWORD_ENCRYPTED` separately with `scripts/encrypt-secret.mjs`, then recreate the app. Keep previous keys until all active ciphertext is migrated and you have a recovery plan for older backups. Removing a key too soon makes those secrets unreadable.

### Health and troubleshooting

`GET /api/health` checks console database readiness; it does not verify registries, identity providers or Trivy. The scanner's `/health` checks its listener, not a real image scan. Admins can inspect Audit for authentication failures, security changes, registry changes, scan starts and deletions. Events older than `AUDIT_RETENTION_DAYS` are pruned on audit writes.

| Symptom | Check |
| --- | --- |
| Sign-in fails behind a proxy | Exact `APP_ORIGIN`, HTTPS cookies, peer launcher and trusted forwarding configuration. |
| SSO is rejected | Exact callback URI and issuer, matching verified configured email, token authentication method, endpoint origins and an existing conflicting subject binding. |
| Registry or token access is rejected | Server-reachable approved origins, registry credentials and deliberate HTTP opt-in. |
| Docker Hub returns a rate-limit response | Its upstream quota and credentials. An admin cannot bypass Docker Hub's own limits. |
| A scan remains queued | Running job and lease deadline, hourly budget, worker health, token and origin configuration. |
| A Docker Hub image cannot be scanned | It must be confirmed public and runnable; private images and attestations are excluded. |
| Trivy cannot start or download its database | UID and volume ownership, executable, timeout, outbound network, certificates and memory. |
| Deletion fails | Admin role, connection read-only setting, upstream permissions and endpoint support. |
| State disappears on redeploy | Same persistent console volume and original key material. |

## Licence

Registry Console is licensed under the GNU Affero General Public License, version 3 or any later version (`AGPL-3.0-or-later`). See [LICENSE](LICENSE) and [NOTICE](NOTICE). Bundled third-party components retain their licences, including Trivy at `/usr/share/licenses/trivy/LICENSE` in the image.

## Support

For support or inquiries:

- LinkedIn: [rubixvi](https://www.linkedin.com/in/rubixvi/)
- Website: [Rubix Studios](https://rubixstudios.com.au)

## Author

Rubix Studios

[https://rubixstudios.com.au](https://rubixstudios.com.au)
