# Registry Console (Docker Registry UI)

A self-hosted interface for Docker Registry v2/v3 and OCI registries, built with Next.js. Browse repositories, inspect tags and manifests, and manage registry connections from one workspace.

## Features

- Multiple registry connections with encrypted credentials and a registry selector.
- Docker Hub namespace browsing, repository search, and architecture filters.
- Optional LDAP sign-in with LDAPS or StartTLS.
- Optional Trivy vulnerability reports on tags and image details.
- Theme-aware Sonner notifications for operation results.
- Repository and tag browsing, readable image history, and multi-platform manifests.
- Bulk manifest deletion with digest previews and individual results.
- Administrator and viewer accounts, with read-only connection controls.
- Password sign-in, passkeys, and optional authenticator app verification.
- Workspace branding with a custom name, footer, accent colour, and PNG logo upload.
- Persistent SQLite storage and an administrator audit log with search and filters.
- Responsive navigation using shadcn Select controls on mobile.
- Docker images for Linux AMD64 and ARM64.

## Local development

Use Node.js 24 and the pnpm version specified in `package.json`.

```sh
corepack enable
pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env`. Generate a password hash and encryption key.

```sh
pnpm run password:hash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Set `AUTH_PASSWORD_HASH` to the complete generated hash and `ENCRYPTION_KEY` to the generated key. Keep the hash single quoted so Docker Compose does not interpret its dollar signs.

Set `REGISTRY_ALLOWED_ORIGINS` to the registry origins you intend to connect to, then start the application.

```sh
pnpm run dev
```

Open `http://localhost:3000`. Local data is stored in `./data` unless `DATA_DIR` is set.

## Docker deployment

Copy `docker-compose.yml` and `.env.example` to the deployment host. Rename `.env.example` to `.env` and configure the values below.

| Variable | Value |
| --- | --- |
| `REGISTRY_CONSOLE_IMAGE` | Your published image reference, including a tag or digest. |
| `APP_ORIGIN` | The exact public application origin, without a trailing slash or path. |
| `AUTH_USERNAME` | The administrator username when using the single-account configuration. |
| `AUTH_PASSWORD_HASH` | The complete, single-quoted scrypt password hash. |
| `ENCRYPTION_KEY` | A separate 32-byte encryption key encoded as 64 hexadecimal characters. |
| `REGISTRY_ALLOWED_ORIGINS` | A comma-separated list of approved registry origins. |

To generate credentials without installing Node.js on the host, use the published image's utilities. Replace the image reference with your own.

```sh
docker run --rm -it --entrypoint node ghcr.io/your-owner/registry-console:1.0.0 scripts/password-hash.mjs
docker run --rm --entrypoint node ghcr.io/your-owner/registry-console:1.0.0 -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Start the application.

```sh
docker compose pull
docker compose up -d
```

The example Compose configuration publishes the application on `127.0.0.1:3000` and stores data in the `registry-data` named volume. It runs as UID/GID 1000 with a read-only root filesystem and a writable data volume and temporary directory. A reverse proxy in another container can connect to `app:3000` when both share a Docker network.

Use an HTTPS `APP_ORIGIN` for production and terminate TLS at the reverse proxy. Production also permits HTTP on localhost and loopback addresses for local use. Recreate the container after changing environment variables.

```sh
docker compose up -d --force-recreate
```

## Optional configuration

Omitted values use the defaults below.

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTH_USERS_JSON` | Unset | A single-quoted JSON array of accounts. Overrides `AUTH_USERNAME` and `AUTH_PASSWORD_HASH`. |
| `AUTH_USER_ID` | Unset | An optional immutable UUID for the single-account configuration. |
| `DATA_DIR` | `./data` | Local storage directory. Compose sets this to `/app/data`. |
| `TAGLIST_ORDER` | `natural-asc` | Default tag ordering. Accepts `natural-asc`, `natural-desc`, `alpha-asc`, or `alpha-desc`. |
| `HISTORY_CUSTOM_LABELS` | Empty | Up to 32 additional image-config label keys, separated by commas. |
| `PULL_URL` | Empty | Default public origin for copied pull commands. Each connection can override this. |
| `REGISTRY_TOKEN_ORIGINS` | Empty | Approved external token-service origins for registry authentication. |
| `ALLOW_HTTP_REGISTRIES` | `false` | Allows approved registries to use HTTP. |
| `TRUST_PROXY` | `false` | Enables client-IP throttling using trusted forwarded addresses. |
| `SESSION_HOURS` | `8` | Session lifetime in hours, from 1 to 24. |
| `BRAND_NAME` | `Registry Console` | Initial workspace name and the name used for passkey and authenticator registration. |

Only enable `TRUST_PROXY` behind a proxy that overwrites `X-Forwarded-For` with a valid client IP and blocks direct access to the application. Otherwise, forwarded headers are ignored. Account and challenge limits still apply, alongside short server-capacity protection. Throttled responses include `Retry-After`.

An initial registry connection can also be configured through the variables below. It is imported once; subsequent connection changes are saved through the interface.

| Variable | Default | Purpose |
| --- | --- | --- |
| `REGISTRY_URL` | Unset | Enables the initial connection import when supplied. |
| `REGISTRY_NAME` | `Primary registry` | Connection name. |
| `REGISTRY_USERNAME` | Empty | Registry username. |
| `REGISTRY_PASSWORD_ENCRYPTED` | Empty | Registry password encrypted with `ENCRYPTION_KEY`. |
| `REGISTRY_READ_ONLY` | `false` | Prevents manifest deletion through this connection. |

Generate an encrypted registry password with the hidden password prompt.

```sh
pnpm run secret:encrypt
```

## Accounts and access

Accounts are configured through environment variables. The single-account configuration creates an administrator using `AUTH_USERNAME` and `AUTH_PASSWORD_HASH`.

For multiple accounts, set `AUTH_USERS_JSON` to a single-quoted JSON array. Each account requires `username`, `passwordHash`, and `role`; an optional `id` accepts an immutable UUID. At least one account must have the `admin` role. Use a complete generated password hash for every account.

```dotenv
AUTH_USERS_JSON='[{"username":"admin","passwordHash":"REPLACE_WITH_ADMIN_SCRYPT_HASH","role":"admin"},{"username":"reader","passwordHash":"REPLACE_WITH_VIEWER_SCRYPT_HASH","role":"viewer"}]'
```

| Role | Access |
| --- | --- |
| `admin` | Manage registry connections, branding, and manifest deletion; browse all connections. |
| `viewer` | Browse and inspect all configured connections. |

All accounts share the same registry workspace. A read-only connection prevents deletion for everyone. Each user manages their own sign-in methods through **Account security**.

Password and role changes invalidate existing sessions and pending verifications while preserving enrolled passkeys and authenticators. Keep an account's explicit UUID stable for the same person. Changing that identifier replaces the account and removes its security methods. Removing an account from configuration also removes its security data at startup.

## Passkeys and authenticator apps

Verify your password in **Account security** before changing sign-in methods. If an authenticator is enabled, also provide a current authenticator code or an unused recovery code. This verification is valid for five minutes and is bound to the current session.

Passkeys require device verification through a fingerprint, face recognition, device PIN, or compatible security key. Passkey sign-in replaces the password and does not require a separate authenticator code. Use HTTPS with a stable hostname in production, or `localhost` for local browser development.

Authenticator apps provide six-digit codes that rotate every 30 seconds. After scanning the QR code or entering the manual setup key, confirm a code to enable the authenticator. Password sign-in then requires an authenticator or recovery code before a session is created.

Save the ten recovery codes displayed after setup. Each can be used once and cannot be displayed again. Authenticator codes also cannot be reused after successful verification; wait for the next code if necessary.

Enabling an authenticator revokes existing sessions and gives the current browser a fresh session. Disabling it signs out every session. Removing a passkey prevents future sign-in using that credential.

### Lost sign-in methods

An operator can reset one account's security methods from the deployment host.

```sh
docker compose exec app node scripts/reset-security.mjs admin
```

For a local installation with `.env` configured, use the package script.

```sh
pnpm run security:reset admin
```

Replace `admin` with the account's username. The reset removes its passkeys, authenticator, recovery codes, pending verifications, and sessions, and records an audit event. The user must enroll their security methods again. Changing only the password hash does not bypass authenticator verification.

## Audit log

Administrators can open **Audit** from the sidebar or mobile navigation. The view includes every retained event's timestamp, actor, action, and complete target details. Search records, filter by exact actor or action, and select an inclusive UTC date range. Results are paginated newest first. Up to 10,000 events are retained, and viewers cannot access the page or API.

## Registry connections

Use the registry selector to switch between connections without returning to the registry cards. On mobile, separate Select controls switch the current section and registry.

Administrators add and edit connections through the interface. Registry origins must match `REGISTRY_ALLOWED_ORIGINS` exactly. Credentials embedded in URLs, path prefixes, redirects, and unapproved destinations are rejected. Docker Basic and Bearer authentication are supported; external token services must also appear in `REGISTRY_TOKEN_ORIGINS`.

Set `PULL_URL` to the default public registry origin used in copied `docker pull` commands. A connection's **Pull URL** overrides that default. If neither is set, the connection address is used. These display addresses do not change the server's registry API destination or allowlist. For example, the server can connect to `http://registry:5000` while copied commands use `registry.example.com`.

Registry passwords and authenticator secrets are encrypted with AES-256-GCM using `ENCRYPTION_KEY`. Recovery codes are hashed. Back up the encryption key together with the persistent data volume.

HTTP registry connections require `ALLOW_HTTP_REGISTRIES=true` and an approved origin. Application HTTPS requirements and registry transport settings are separate.

Manifest deletion requires an administrator, a writable connection, typed confirmation, and registry-side deletion support. Deleting a manifest can invalidate every tag that refers to its digest. Removing a connection does not delete content from its registry. Registry garbage collection is managed separately.

Standard connections must expose the Distribution v2 catalogue and tag APIs. Docker Hub connections use the Hub API for namespace discovery and Distribution APIs for tags and manifests. SHA-256 schema v2 and OCI manifests are supported. Legacy schema v1 manifests, image uploads, other vendor-specific project APIs are not supported. Configuration-blob redirects require an explicitly approved HTTPS destination in `REGISTRY_BLOB_ORIGINS`; registry authorization headers are never forwarded to that destination.

### Namespace browsing and tag ordering

The catalogue opens as an expandable namespace tree. A repository such as `team/backend/api` appears under `team` and `backend`. Repositories that also contain child namespaces retain a separate action to open their own tags. Switch to **List** for a flat, paginated catalogue. Large tree branches reveal 100 entries at a time through **Show more**.

Catalogue searches and tag ordering cover the complete fetched listing, including upstream registry pages. Browsing supports up to 10,000 repositories per registry or 10,000 tags per repository, with a 200-page limit and a 60-second budget for starting upstream page requests. Exceeding a limit returns an error instead of displaying an incomplete tree or claiming to sort a partial result. Registry contents can change while pages are being fetched; **Refresh** retrieves the listing again.

Tag lists offer numeric ascending, numeric descending, alphabetical A–Z, and alphabetical Z–A ordering. Numeric ordering places `v2` before `v10`; it is natural sorting, not semantic-version precedence. `TAGLIST_ORDER` supplies the initial choice. A user's selection is saved in their browser and overrides the initial setting. Search and ordering apply before the display is divided into pages of 100 tags.

### Registry request caching

Successful catalogue pages, tag pages, and manifests requested by tag are cached in server memory for up to 15 seconds. Manifests and configuration blobs requested by SHA-256 digest are cached for up to five minutes. Registry health checks, failed requests, and deletion responses are not cached. Upstream `Cache-Control: no-store`, `no-cache`, and shorter `max-age` values are respected.

Cache keys include the connection identifier, registry address, configured credentials, request path and authentication scope. The cache holds at most 200 entries and 32 MiB of response data per application process, evicting expired entries and then the least recently used entries. Restarting the application clears it; it does not cache image layers on disk.

Changing or removing a connection clears its cached responses. A deletion attempt also clears that connection's cache, and an older in-flight response cannot repopulate it after invalidation. Bulk-deletion previews always resolve tags afresh. The catalogue and tag **Refresh** buttons bypass cached listing responses. API clients can also send `Cache-Control: no-cache` to the browse and image-detail endpoints to request fresh data. Application API responses retain `Cache-Control: no-store`; browser SWR caching remains separate from the server cache.

### Image history

The image detail view lists build steps newest first, including commands, available timestamps, authors, comments, and compressed layer sizes. Metadata-only steps do not consume filesystem layers. For multi-platform images, select a platform manifest to inspect its history. Original manifest and configuration JSON remain available. Standard OCI image labels and `maintainer` appear alongside history when present. Set `HISTORY_CUSTOM_LABELS` to display additional keys from the image configuration’s `config.Labels` object. Missing and empty values are omitted, and values are displayed as text.

### Bulk deletion

Administrators can select up to 100 tags from the current page and choose **Delete selected**. Shift-click tag checkboxes to select or clear a contiguous range in the current display order. With a tag checkbox focused, Ctrl+A or Cmd+A selects every tag on the visible page. Filters, ordering changes, and page changes clear the effective selection; these shortcuts never select hidden tags or bypass confirmation.

The preview resolves tags to unique manifest digests without deleting anything. Multiple selected tags sharing a digest are grouped together. Type the repository name to confirm the displayed digests.

Deleting a digest affects every tag pointing to it, including unselected tags. Previews expire after five minutes, belong to the current administrator session, and can be used once. Connection changes require a new preview. Each digest is deleted at most once per batch, with failures reported individually and recorded in the audit log. Read-only connections prevent previews and deletion.

## Branding

Administrators can change the workspace name, footer, and accent colour in **Settings**. The sidebar and login branding panel use a darker shade of the assigned accent.

Upload a PNG logo through the branding form. Uploads are limited to 2 MB and 2048 × 2048 pixels, and file contents are validated on the server. SVG uploads are not supported. The saved logo is available on the login screen before sign-in.

## Build and publish

The GitHub Actions workflow checks the application, builds production output, runs HTTP/HTTPS integration tests, and tests a Docker image before publication. Published images support Linux AMD64 and ARM64, with provenance and an SBOM.

| Trigger | Result |
| --- | --- |
| Pull request | Verification only. |
| Push to `main` | Publishes a commit tag; default-branch builds also receive `edge`. |
| Version tag such as `v1.2.3` | Publishes `1.2.3`, `1.2`, `latest`, and a commit tag. |
| Prerelease tag such as `v1.2.3-beta.1` | Publishes the prerelease and commit tags without changing `latest`. |
| Manual workflow dispatch | Verifies and publishes the selected ref. |

Images are published to `ghcr.io/<repository-owner>/<repository-name>` by default using the workflow's `GITHUB_TOKEN`.

| GitHub Actions setting | Purpose |
| --- | --- |
| Variable `IMAGE_REGISTRY` | Overrides the default `ghcr.io` registry. |
| Variable `IMAGE_NAME` | Overrides the default GitHub repository image name. |
| Secret `REGISTRY_USERNAME` | Username for a registry other than GHCR. |
| Secret `REGISTRY_PASSWORD` | Password or access token for a registry other than GHCR. |

To publish a release, push a version tag.

```sh
git tag v1.0.0
git push origin v1.0.0
```

Manual image builds and publication use the supplied wrappers.

```sh
pnpm run image:build your-account/registry-console:1.0.0
pnpm run image:publish your-account/registry-console:1.0.0
```

Authenticate to the destination registry with `docker login` before publishing. Publication credentials are separate from the credentials used by the application to browse registry contents.

## Verification

```sh
pnpm run check
pnpm run build
pnpm run test:integration
```

Run the integration checks with HTTP loopback configuration as well.

```sh
INTEGRATION_HTTP=true pnpm run test:integration
```

In PowerShell, set and clear the variable explicitly.

```powershell
$env:INTEGRATION_HTTP = 'true'
pnpm run test:integration
Remove-Item Env:INTEGRATION_HTTP
```

Test a built image with the container smoke test.

```sh
pnpm run test:container your-account/registry-console:1.0.0
```

## Storage and licensing

Registry Console is licensed under the GNU Affero General Public License, version 3 or any later version (`AGPL-3.0-or-later`). See [LICENSE](LICENSE) for the full licence and [NOTICE](NOTICE) for the copyright and licence grant.


## Docker Hub

Add `https://registry-1.docker.io` and `https://hub.docker.com` to `REGISTRY_ALLOWED_ORIGINS`, preserving any existing approved origins. Add `https://auth.docker.io` to `REGISTRY_TOKEN_ORIGINS`.

```dotenv
REGISTRY_ALLOWED_ORIGINS=https://registry.example.com,https://registry-1.docker.io,https://hub.docker.com
REGISTRY_TOKEN_ORIGINS=https://auth.docker.io
REGISTRY_BLOB_ORIGINS=https://production.cloudfront.docker.com
```

Docker Hub may serve configuration blobs through other CDN origins depending on the account and region. Approve the exact HTTPS origin used by your deployment in `REGISTRY_BLOB_ORIGINS`. Do not use wildcard hosts or disable certificate verification. See Docker's [published network allowlist](https://docs.docker.com/desktop/enterprise/allow-list/).

Select **Docker Hub** when creating a connection. Enter the user or organisation namespace to browse, such as `library` for official images. Leave both credential fields empty for public repositories. For private repositories, provide the Docker username and a personal access token with the required read permissions. The Hub API exchanges these credentials at `/v2/auth/token` using the [documented authentication flow](https://docs.docker.com/reference/api/hub/latest/operations/AuthCreateAccessToken/).

Docker Hub connections are read only. Copied pull commands default to `docker.io`, independently of a self-hosted registry's global `PULL_URL`; a connection-specific Pull URL can override this. This release supports repository discovery, tags, image metadata, pull commands, and optional scanning. It does not implement Docker Hub's separate deletion APIs. Private repository access must be verified with the permissions of the token you deploy.

## Repository search and architecture filters

The main **Registries** page includes repository-name search, a registry selector, and an architecture filter. Each registry and repository listing also has an architecture filter. A repository matches when at least one runnable tag supports the selected architecture; tag filtering uses that tag's verified image metadata. Build attestations are excluded.

Name matching is case insensitive. Architecture searches inspect up to 200 images per registry, with at most two concurrent searches per application process. Large or timed-out searches fail explicitly instead of returning incomplete architecture results. Narrow the name filter or open an individual repository when a limit is reached. Workspace architecture searches across more than five connections require selecting one registry. Connection failures are listed alongside successful workspace results.

## LDAP authentication

LDAP is disabled by default. Directory accounts must be explicitly listed in `AUTH_USERS_JSON` with `authProvider` set to `ldap`. Their role comes from this configuration; directory attributes never grant administrator access automatically. LDAP accounts must omit `passwordHash`. Existing local accounts continue to work.

```dotenv
LDAP_ENABLED=true
LDAP_URL=ldaps://directory.example.com:636
LDAP_STARTTLS=false
LDAP_BASE_DN=ou=People,dc=example,dc=com
LDAP_BIND_DN=cn=registry-search,ou=ServiceAccounts,dc=example,dc=com
LDAP_BIND_PASSWORD_ENCRYPTED=v1.IV.TAG.CIPHERTEXT
LDAP_USER_FILTER=(uid={username})
LDAP_SESSION_MINUTES=15
```

Use `pnpm run secret:encrypt` to encrypt the search account password with the existing encryption key. Assign the resulting encrypted value to `LDAP_BIND_PASSWORD_ENCRYPTED`. The search account should have permission only to find users within `LDAP_BASE_DN`.

To use StartTLS, set `LDAP_URL=ldap://directory.example.com:389` and `LDAP_STARTTLS=true`. The application upgrades the connection before transmitting either password. Plain LDAP without StartTLS is rejected. A StartTLS connection cannot silently reconnect and send a bind over cleartext; an interrupted connection must start a new authentication attempt. Certificates are always verified and TLS 1.2 or later is required. For an internal CA, provide a trusted CA using Node's `NODE_EXTRA_CA_CERTS` configuration and mount that certificate into the container.

Example account configuration, preserving a local administrator for recovery.

```dotenv
AUTH_USERS_JSON='[{"username":"admin","passwordHash":"REPLACE_WITH_ADMIN_SCRYPT_HASH","role":"admin"},{"username":"directory.reader","authProvider":"ldap","role":"viewer"}]'
```

`LDAP_USER_FILTER` must contain exactly one `{username}` placeholder. An Active Directory deployment can use `(&(objectClass=user)(sAMAccountName={username}))`; adapt the base DN and attribute to the directory. Username values are escaped using RFC 4515 rules, empty passwords are rejected, referrals are not followed, and searches must return exactly one user. Directory diagnostics and passwords are not returned to clients or recorded in audit events.

LDAP accounts can use the existing authenticator second factor. Passkey registration and sign-in are disabled for directory accounts so directory authentication remains required. LDAP sessions expire after `LDAP_SESSION_MINUTES`, from 5 to 60 minutes, with a default of 15. Directory password changes or account disablement block future logins; an already issued session remains valid until its short expiry. Removing the account from the application configuration and restarting revokes its access and enrolled factors.

## Optional Trivy scanning

Trivy is disabled by default and the standard application image does not include its executable. For a local installation, install a verified Trivy release and set its absolute executable path. A Docker image that includes Trivy can be built with the optional `Dockerfile.trivy` below. Enable the server setting and then enable **Trivy vulnerability scanning** on the required registry connection.

```dotenv
TRIVY_ENABLED=true
TRIVY_PATH=/usr/local/bin/trivy
TRIVY_TIMEOUT_SECONDS=180
```

An administrator starts a scan from the image inspector. Viewers can read existing reports. Tag rows show the last result for their current digest, including critical and high counts. The image inspector shows severity totals, packages, installed and fixed versions, and affected platforms. Scans are explicit so opening a repository cannot start an unbounded number of image downloads.

The scanner uses immutable SHA-256 references and scans every runnable platform, up to eight. It excludes attestations, runs one scan job at a time across the shared SQLite database, and enforces a subprocess deadline and 16 MiB output limit. Reports expire after 24 hours and at most 50 reports are retained. Detail tables retain up to 1,000 findings while severity totals count all returned findings. Counts are per platform and may include the same vulnerability on multiple platforms.

Scanning requires HTTPS registries with valid certificates. The process uses a private temporary directory and a Docker credential file scoped to the selected registry. Application secrets and inherited Trivy settings are not passed into its environment. Temporary credentials are removed after success or failure. Scanner diagnostics are not exposed to clients. The persistent Trivy database and analysis cache are stored beneath `DATA_DIR/trivy-cache`; retain this volume to avoid repeated database downloads.

Run the scanner in an appropriately sized deployment with outbound access to the approved registry, its blob storage, and Trivy's vulnerability databases. The sample 512 MiB application memory limit may be insufficient for large scans. Increase the container memory and temporary filesystem allowance for your image sizes. The application response allowlists protect its metadata requests; Trivy performs its own image and database requests, so enforce scanner egress controls at the deployment network boundary. No Docker socket is required or mounted.

### Building an optional scanner image

Choose verified, immutable image digests for your published console image and the official Trivy image. Build for the same architecture as the deployment.

```sh
docker build -f Dockerfile.trivy \
  --build-arg CONSOLE_IMAGE=YOUR_CONSOLE_IMAGE_AT_SHA256_DIGEST \
  --build-arg TRIVY_IMAGE=YOUR_VERIFIED_TRIVY_IMAGE_AT_SHA256_DIGEST \
  -t registry-console-with-trivy:local .
```

Configure `REGISTRY_CONSOLE_IMAGE` to the built image or its published digest. Trivy's [image command reference](https://trivy.dev/docs/latest/references/configuration/cli/trivy_image/) documents the required CLI options. Test the selected Trivy version against your private registry before production rollout.

## Upgrade notes

Back up the SQLite database and encryption key before applying the update. Install dependencies with `pnpm install --frozen-lockfile`, rebuild the application, and recreate the container. Database migrations preserve existing registry connections and add provider, namespace, scanner settings, and report storage automatically.

Connections now have persisted random revisions that change whenever they are saved. Cache identifiers and deletion-plan fingerprints use those revisions and public metadata, with domain-separated HMAC keys derived using HKDF. Registry password values never enter these hash operations. Local password verification continues to use scrypt. Pending deletion previews become invalid after this update and must be recreated. Existing local sessions, authenticators, and passkeys retain their account identity.

The console fixture now parses URL origins and checks an exact origin rather than testing for an embedded hostname substring. Sonner is wrapped in `src/components/ui/sonner.tsx`, follows the theme, and handles transient success and failure notifications. Confirmation dialogs, recovery-code displays, and persistent scan results remain visible in their respective views.
