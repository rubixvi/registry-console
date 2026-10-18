# Registry Console (Docker Registry UI)

Registry Console is a self-hosted workspace for browsing and managing container images across private registries and Docker Hub. It brings repositories, tags, image metadata, build history and vulnerability reports into one interface, with separate admin and viewer accounts.

Connect an existing registry or deploy a Distribution registry alongside the console. Registry Console stores connection settings and security data in SQLite, while image manifests and layers remain in the connected registries. Docker clients continue to push and pull directly from those registries.

<img width="1912" height="914" alt="image" src="https://github.com/user-attachments/assets/6d4d8836-2bee-45ce-8d5d-89b7f710efb0" />

<img width="1912" height="914" alt="image" src="https://github.com/user-attachments/assets/6bb9c87f-e351-435a-b171-5f1b76714240" />

<img width="1912" height="914" alt="image" src="https://github.com/user-attachments/assets/e3ed9b7e-9169-4b18-8243-a095b6e0ae46" />

## What you can do

- Browse multiple registries, search repositories and filter images by architecture. Distribution registries support namespace trees and flat lists; Docker Hub uses a namespace list.
- Inspect tags and immutable digests, multi-platform manifests, image configuration, labels, layer sizes and readable build history. Copy pull commands using each connection's public address.
- Scan eligible images with Trivy, inspect findings by severity and platform, and see installed and fixed package versions. Build attestations and private Docker Hub repositories are excluded.
- Preview manifest deletions, group tags that share a digest, and confirm individual or bulk deletions with an audit trail.
- Use local passwords or LDAP authentication, optional authenticator codes and recovery codes, and passkeys for local accounts.
- Manage workspace branding, registry connections and an admin audit log without editing the deployment configuration for every change.

## Container image

The current published image is [`rubixvi/registry-console:edge`](https://hub.docker.com/r/rubixvi/registry-console). The examples use this tag. Switch `REGISTRY_CONSOLE_IMAGE` to `rubixvi/registry-console:latest` when that release tag is published, or pin a verified image digest for a reproducible deployment.

The application image includes Node.js, the console, its operator utilities and Trivy. Scanning is disabled until `TRIVY_ENABLED=true`. Deploying the console does not require cloning this repository or building an image.

## Deploy with Docker Compose

This deployment runs the console, a local Distribution registry and the optional Trivy initializer using Docker Compose directly. It starts on loopback addresses so you can verify it before configuring public HTTPS access. Dokploy has its own [deployment instructions](#deploy-with-dokploy) below.

Install Docker Engine and the Docker Compose plugin on the deployment host. The shell commands below use a POSIX shell, such as Bash on Linux or WSL. Create a directory for the deployment files.

```sh
mkdir -p registry-console/auth
cd registry-console
chmod 700 auth
```

The example below deploys three services.

| Service | Responsibility |
| --- | --- |
| `registry-ui` | Runs the console on port 3000 and stores its state in `console-data`. |
| `registry` | Runs a password-protected Distribution registry on port 5000 and stores images in `registry-data`. |
| `trivy-init` | Copies a selected Trivy release and its CA bundle into `trivy-bin`, then exits. The console mounts this volume read only. |

The separate Trivy initializer lets you select a scanner version independently of the console image. It replaces the bundled executable for this deployment; it is not a scan server. See [Trivy scanning](#trivy-scanning) to use the bundled executable instead.

### 1. Generate the console credentials

Run the password utility on a trusted machine with Docker. It prompts without displaying the password and returns a complete scrypt hash. Use a password of at least 14 characters.

```sh
docker run --rm -it --entrypoint node \
  rubixvi/registry-console:edge scripts/password-hash.mjs
```

Generate the console encryption key.

```sh
docker run --rm --entrypoint node rubixvi/registry-console:edge \
  -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Run the key command again to generate a separate value for `REGISTRY_HTTP_SECRET`. Keep the console encryption key unchanged across restarts and upgrades, and retain a secure backup. The registry HTTP secret belongs to the registry service and is independent of the console key.

### 2. Prepare the registry account

The registry account is separate from the console login. Generate a bcrypt htpasswd entry for a registry user.

```sh
docker run --rm -it --entrypoint htpasswd \
  httpd:2.4-alpine -nB registry-user
```

Save the resulting `registry-user:$2...` line in `auth/registry.password` inside your deployment directory. Copy only the account entry, without the password prompts. Keep this file out of source control. It must exist before starting the registry and be readable by the registry process.

Use this registry username and its original password when adding the connection in the console. The scrypt hash used for the console login cannot be used as a registry htpasswd entry.

### 3. Set the deployment environment

Create a file named `.env` in the deployment directory with these values, replacing every placeholder with the values you generated. Use a text editor so secrets do not need to appear in shell command arguments.

```dotenv
REGISTRY_CONSOLE_IMAGE=rubixvi/registry-console:edge
APP_ORIGIN=http://localhost:3000
AUTH_USERNAME=admin
AUTH_PASSWORD_HASH='REPLACE_WITH_COMPLETE_SCRYPT_HASH'
ENCRYPTION_KEY=REPLACE_WITH_64_HEX_CHARACTERS
REGISTRY_HTTP_SECRET=REPLACE_WITH_A_DIFFERENT_RANDOM_SECRET
REGISTRY_ALLOWED_ORIGINS=http://registry:5000
ALLOW_HTTP_REGISTRIES=true
PULL_URL=http://localhost:5000
TRUST_PROXY=false
TRIVY_VERSION=0.76.0
```

`APP_ORIGIN` is the browser-facing console origin. `REGISTRY_ALLOWED_ORIGINS` contains the address the console will contact inside Docker. `PULL_URL` is the registry address used in copied pull commands. These loopback values are for access from the deployment host; replace the browser and pull origins with public HTTPS addresses when configuring remote access.

Restrict access to the environment file.

```sh
chmod 600 .env
```

Keep the complete password hash single quoted in a Compose `.env` file so its dollar signs are preserved. If placing a hash directly in Compose YAML, escape each literal `$` as `$$`. Do not double the dollar signs in the actual container environment. Docker documents these rules in its [interpolation guide](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

### 4. Add the Compose configuration

Save the following as `compose.yaml` beside `.env`. The `auth` directory must be beside these files too. Docker Compose reads `.env` for interpolation, while the explicit `environment` entries pass the selected settings into the console.

```yaml
services:
  registry-ui:
    image: ${REGISTRY_CONSOLE_IMAGE:?Set REGISTRY_CONSOLE_IMAGE}
    pull_policy: always
    restart: always
    init: true
    ports:
      - '127.0.0.1:3000:3000'
    environment:
      NODE_ENV: production
      HOSTNAME: 0.0.0.0
      PORT: '3000'
      DATA_DIR: /app/data
      NEXT_TELEMETRY_DISABLED: '1'
      APP_ORIGIN: ${APP_ORIGIN:?Set APP_ORIGIN}
      AUTH_USERNAME: ${AUTH_USERNAME:-admin}
      AUTH_PASSWORD_HASH: ${AUTH_PASSWORD_HASH:-}
      AUTH_USERS_JSON: ${AUTH_USERS_JSON:-}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY:?Set ENCRYPTION_KEY}
      SESSION_HOURS: ${SESSION_HOURS:-8}
      TRUST_PROXY: ${TRUST_PROXY:-false}
      BRAND_NAME: ${BRAND_NAME:-Registry Console}
      REGISTRY_ALLOWED_ORIGINS: ${REGISTRY_ALLOWED_ORIGINS:?Set REGISTRY_ALLOWED_ORIGINS}
      REGISTRY_TOKEN_ORIGINS: ${REGISTRY_TOKEN_ORIGINS:-}
      REGISTRY_BLOB_ORIGINS: ${REGISTRY_BLOB_ORIGINS:-}
      ALLOW_HTTP_REGISTRIES: ${ALLOW_HTTP_REGISTRIES:-false}
      PULL_URL: ${PULL_URL:-}
      TAGLIST_ORDER: ${TAGLIST_ORDER:-natural-asc}
      HISTORY_CUSTOM_LABELS: ${HISTORY_CUSTOM_LABELS:-}
      TRIVY_ENABLED: 'true'
      TRIVY_PATH: /opt/trivy/trivy
      TRIVY_TIMEOUT_SECONDS: ${TRIVY_TIMEOUT_SECONDS:-180}
      TRIVY_SCANS_PER_HOUR: ${TRIVY_SCANS_PER_HOUR:-16}
      SSL_CERT_FILE: /opt/trivy/ca-certificates.crt
      TMPDIR: /app/data
    volumes:
      - console-data:/app/data
      - trivy-bin:/opt/trivy:ro
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    networks:
      - backend
    depends_on:
      registry:
        condition: service_started
      trivy-init:
        condition: service_completed_successfully

  registry:
    image: registry:3.1.2
    restart: always
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
      - registry-data:/var/lib/registry
    networks:
      - backend

  trivy-init:
    image: aquasec/trivy:${TRIVY_VERSION:-0.76.0}
    restart: 'no'
    entrypoint:
      - /bin/sh
      - -ec
    command:
      - |
        cp /usr/local/bin/trivy /trivy/trivy.tmp
        chmod 0755 /trivy/trivy.tmp
        cp /etc/ssl/certs/ca-certificates.crt /trivy/ca-certificates.crt.tmp
        chmod 0644 /trivy/ca-certificates.crt.tmp
        mv -f /trivy/ca-certificates.crt.tmp /trivy/ca-certificates.crt
        mv -f /trivy/trivy.tmp /trivy/trivy
    volumes:
      - trivy-bin:/trivy
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true

volumes:
  registry-data:
  console-data:
  trivy-bin:

networks:
  backend:
```

The console runs as the image's `node` user, UID/GID 1000. Its data volume remains writable with a read-only root filesystem. If replacing the named volume with a bind mount, give that user write access to the directory. Keep `DATA_DIR`, the writable mount and `TMPDIR` aligned when changing paths.

The port mappings bind to the host's loopback interface. Other containers on `backend` can still contact the services directly using their service names and container ports. Keep unrelated workloads off this network.

### 5. Start and verify the deployment

Run these commands from the directory containing `compose.yaml` and `.env`.

```sh
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps -a
docker compose logs --tail=100 registry-ui registry trivy-init
```

`trivy-init` should exit successfully, `registry` should remain running and `registry-ui` should become healthy. Verify the console's database-readiness endpoint.

```sh
curl --fail http://localhost:3000/api/health
```

Open [http://localhost:3000](http://localhost:3000) on the deployment host and sign in with the console username and original console password. Add a **Distribution** connection with URL `http://registry:5000` and the separate registry account created earlier. Confirm that repositories and image details load. A newly created registry is empty until you push images to it. The health endpoint checks the console database, so a healthy container does not prove that registry authentication or scanning works.

To stop the stack while keeping its data, run `docker compose down`. Do not add `--volumes` unless you intend to remove the persistent console and registry data.

### 6. Configure production HTTPS access

For remote access, configure DNS and an HTTPS reverse proxy for the console and, if clients need it, the registry. A reverse proxy running directly on the Docker host can use these upstreams.

| Public origin | Proxy upstream | Console setting |
| --- | --- | --- |
| `https://console.example.com` | `http://127.0.0.1:3000` | `APP_ORIGIN=https://console.example.com` |
| `https://registry.example.com` | `http://127.0.0.1:5000` | `PULL_URL=https://registry.example.com` |

The registry's htpasswd authentication must remain in effect on its public route. Configure the registry proxy for the upload sizes and timeouts your image pushes require. Keep the internal registry origin in `REGISTRY_ALLOWED_ORIGINS`; changing its public route does not change the console's Docker-network destination.

If your reverse proxy runs in a container, attach it to a network shared with the services and use `registry-ui:3000` and `registry:5000` as upstreams. `127.0.0.1` inside the proxy container refers to that container itself. Publish only the proxy's intended HTTPS entry points; the application services do not need public host-port bindings.

After updating `.env`, recreate the console so it uses the new origin and pull address.

```sh
docker compose up -d --force-recreate registry-ui
```

The internal HTTP registry connection sends credentials and image data without transport encryption across the Docker network. Use an HTTPS registry endpoint if that network is outside your trust boundary.

Leave `TRUST_PROXY=false` until you have verified that the reverse proxy overwrites client-supplied `X-Forwarded-For` values and that clients cannot bypass it to reach the console. Then enable it if you need client-IP-based sign-in protection behind the proxy.

### Using an existing registry

Omit the `registry` service, its `depends_on` entry, `registry-data` volume and `REGISTRY_HTTP_SECRET` environment-file entry. You do not need a local htpasswd file. Add the existing registry's exact origin to `REGISTRY_ALLOWED_ORIGINS`, set `PULL_URL` to its client-facing address, and create the connection in the console. Leave `ALLOW_HTTP_REGISTRIES=false` for an HTTPS registry. Keep the Trivy initializer dependency if using the separate scanner volume.

## Deploy with Dokploy

Use the same image and Compose configuration with the following Dokploy-specific changes.

1. Create a **Docker Compose** service with the **Raw** provider and paste the Compose configuration above.
2. Replace both `ports` entries with `expose` entries for the relevant container ports, as shown below. Dokploy's reverse proxy handles public routing.
3. Generate the console credentials and a registry htpasswd entry using the earlier instructions. Provision the registry password file through **Advanced → Mounts** in the persistent `../files/auth/registry.password` location. Change its Compose mount to `../files/auth/registry.password:/auth/registry.password:ro`.
4. Copy the deployment environment values into Dokploy's **Environment** tab. Set `APP_ORIGIN=https://console.example.com` and `PULL_URL=https://registry.example.com` using your actual domains. Keep `REGISTRY_ALLOWED_ORIGINS=http://registry:5000` and `ALLOW_HTTP_REGISTRIES=true` for the internal registry connection.
5. In **Domains**, route the console hostname to `registry-ui`, container port `3000`, with HTTPS enabled. If publishing the registry, add a separate HTTPS domain for `registry`, container port `5000`.
6. Use **Preview Compose** to verify the resulting networks and routes, then deploy. Check that `trivy-init` completes successfully and the console becomes healthy before signing in and adding the registry connection.

For `registry-ui`, replace its `ports` block with this block.

```yaml
expose:
  - '3000'
```

For `registry`, replace its `ports` block with this block.

```yaml
expose:
  - '5000'
```

Keep each block at the same indentation as the service's other settings. `expose` does not publish a host port or isolate the service from other containers on its network. The explicit `backend` network preserves console-to-registry connectivity when Dokploy adds its proxy network. Retain the persistent named volumes across redeployments.

Dokploy manages Traefik routing through its [Domains feature](https://docs.dokploy.com/docs/core/docker-compose/domains). Adding a domain does not set `APP_ORIGIN` or `PULL_URL` for you. Keep those values aligned with the configured public routes, and enable `TRUST_PROXY` only after verifying the proxy trust conditions described above.

## Configuration reference

Environment changes require recreating the console container. Docker Compose reads `.env` for interpolation; settings reach the container through the Compose `environment` entries. Add optional settings to `registry-ui.environment` when enabling them. Dokploy uses its **Environment** tab for the same interpolation step, as described in its [Compose environment documentation](https://docs.dokploy.com/docs/core/docker-compose#environment).

### Application and accounts

| Variable | Default | Behaviour |
| --- | --- | --- |
| `APP_ORIGIN` | Required | Public console origin, including scheme and any nonstandard port. Production requires HTTPS except on loopback hosts. Used for request-origin checks, secure cookies and passkeys. |
| `ENCRYPTION_KEY` | Required | 32 random bytes encoded as 64 hexadecimal characters. Encrypts registry and LDAP bind passwords and authenticator secrets. |
| `AUTH_USERNAME` | None | Single local admin username when `AUTH_USERS_JSON` is not set. The Compose example defaults this to `admin`. |
| `AUTH_PASSWORD_HASH` | None | Complete scrypt hash for that local admin. Required unless accounts are provided through `AUTH_USERS_JSON`. |
| `AUTH_USER_ID` | Unset | Optional stable UUID for the single account. Omit the variable when unused rather than passing an empty string. |
| `AUTH_USERS_JSON` | Unset | JSON array of 1–50 local or LDAP accounts. Overrides the single-account settings and must include at least one admin. |
| `SESSION_HOURS` | `8` | Local account session lifetime, from 1 to 24 hours. LDAP accounts use their separate minute-based lifetime. |
| `TRUST_PROXY` | `false` | Trust forwarded client addresses for sign-in protection. Requires a trusted proxy and blocked direct access. |
| `DATA_DIR` | `/app/data` in the image | Persistent console storage. Direct execution outside the image defaults to `./data`. |
| `BRAND_NAME` | `Registry Console` | Initial workspace name and the name used when registering security methods. Saved workspace branding takes precedence over the initial name. |

The image listens on `0.0.0.0:3000`. `HOSTNAME` and `PORT` control that listener; `APP_ORIGIN` describes the public address behind the proxy. Keep `PORT=3000` with the supplied image health check, which probes port 3000.

### Registry access and display

| Variable | Default | Behaviour |
| --- | --- | --- |
| `REGISTRY_ALLOWED_ORIGINS` | Empty | Comma-separated exact HTTP(S) origins approved for custom registry connections. Include the scheme and port. Built-in Docker Hub destinations are trusted separately. |
| `REGISTRY_TOKEN_ORIGINS` | Empty | Additional exact origins permitted for external Bearer token services. A token service at the registry's own origin is already permitted. |
| `REGISTRY_BLOB_ORIGINS` | Empty | Additional exact HTTPS origins permitted for configuration-blob redirects, such as a registry's object-storage or CDN endpoint. |
| `ALLOW_HTTP_REGISTRIES` | `false` | Allows HTTP for otherwise approved registry and token endpoints. Does not relax the console's production HTTPS requirement. |
| `PULL_URL` | Empty | Default public HTTP(S) origin used to format copied pull commands. A connection can override it. Does not change API or scan destinations. |
| `TAGLIST_ORDER` | `natural-asc` | Default ordering, one of `natural-asc`, `natural-desc`, `alpha-asc` or `alpha-desc`. A saved browser preference overrides it. |
| `HISTORY_CUSTOM_LABELS` | Empty | Up to 32 additional image-config label keys, separated by commas, to display with image history. |

Origins cannot contain credentials, repository paths, query strings or fragments. Approving `https://registry.example.com` does not approve `http://registry.example.com`, another port, or subdomains. Wildcards are not supported.

### Initial connection import

These optional variables seed one Distribution connection when `REGISTRY_URL` is supplied. Import happens once per console database. Later edits belong in the interface; changing the seed environment does not update an imported connection, and removing a connection does not repeat the import.

| Variable | Default | Behaviour |
| --- | --- | --- |
| `REGISTRY_URL` | Unset | Approved registry origin that enables the initial import. |
| `REGISTRY_NAME` | `Primary registry` | Initial connection name. |
| `REGISTRY_USERNAME` | Empty | Registry account username. |
| `REGISTRY_PASSWORD_ENCRYPTED` | Empty | Registry password encrypted using the console's encryption key. |
| `REGISTRY_READ_ONLY` | `false` | Prevents deletion through the imported connection. |

To generate an encrypted password, export `ENCRYPTION_KEY` in a trusted shell and run the hidden prompt. The command also works for an LDAP search account password.

```sh
docker run --rm -it --env ENCRYPTION_KEY --entrypoint node \
  rubixvi/registry-console:edge scripts/encrypt-secret.mjs
```

## Accounts and sign-in

The single-account configuration creates a local admin. For multiple accounts, set `AUTH_USERS_JSON` to a JSON array with a username, role and authentication settings for each person. Use a generated password hash for every local account. For example, in the Compose environment file or Dokploy environment editor, replace both placeholders below with complete hashes.

```dotenv
AUTH_USERS_JSON='[{"username":"admin","passwordHash":"REPLACE_WITH_ADMIN_SCRYPT_HASH","role":"admin"},{"username":"reader","passwordHash":"REPLACE_WITH_VIEWER_SCRYPT_HASH","role":"viewer"}]'
```

An account can include an optional `id` containing an immutable UUID. Keep it stable for the same person. The JSON configuration overrides `AUTH_USERNAME`, `AUTH_PASSWORD_HASH` and `AUTH_USER_ID`.

| Capability | Admin | Viewer |
| --- | --- | --- |
| Browse every configured connection and inspect image metadata | Yes | Yes |
| Read existing vulnerability reports | Yes | Yes |
| Start scans and override the console's scan budget | Yes | No |
| Add, edit or remove registry connections | Yes | No |
| Delete manifests through writable connections | Yes | No |
| Change branding and read the audit log | Yes | No |
| Manage their own permitted sign-in methods | Yes | Yes |

All accounts share one workspace. There are no per-user registry assignments. A viewer can inspect private repositories accessible through a saved connection, even if that viewer has no personal account on the upstream registry.

Password and role changes invalidate existing sessions and pending verifications while retaining enrolled security methods. Removing an account and restarting clears its security data. Changing an existing account's explicit UUID replaces its identity and clears its enrolled methods. Do not reuse an identity for a different person.

### Passkeys and authenticator codes

Use **Account security** to manage your sign-in methods. Changing them requires recent password verification and, when enabled, an authenticator or recovery code. Verification is bound to the current session and lasts five minutes.

Local accounts can register passkeys that require device verification. Passkey sign-in replaces the password and the separate authenticator step. Use a stable HTTPS hostname in production; changing the hostname can affect existing passkeys.

Authenticator setup displays a QR code and requires a valid code before activation. Password sign-in then requires an authenticator code or a recovery code. Save the ten recovery codes when shown; each is usable once and they cannot be displayed again. LDAP accounts can use authenticator verification, but cannot register or sign in with passkeys.

An operator with container access can reset a user's security methods.

```sh
docker compose exec registry-ui node scripts/reset-security.mjs admin
```

Replace `admin` with the username. In Dokploy, run the same Node command from the `registry-ui` terminal. It removes that account's sessions, pending verifications, passkeys, authenticator setup and recovery codes, and records an audit event. It does not change the configured password. Changing only a password hash does not bypass an enrolled authenticator.

### LDAP

LDAP is optional and disabled by default. Directory users must be listed explicitly in `AUTH_USERS_JSON` with `authProvider` set to `ldap` and a configured role. Omit `passwordHash` for those accounts. Directory membership does not grant console access or an admin role automatically. Retain a local admin for recovery.

```dotenv
AUTH_USERS_JSON='[{"username":"admin","passwordHash":"REPLACE_WITH_ADMIN_SCRYPT_HASH","role":"admin"},{"username":"directory.reader","authProvider":"ldap","role":"viewer"}]'
LDAP_ENABLED=true
LDAP_URL=ldaps://directory.example.com:636
LDAP_STARTTLS=false
LDAP_BASE_DN=ou=People,dc=example,dc=com
LDAP_BIND_DN=cn=registry-search,ou=ServiceAccounts,dc=example,dc=com
LDAP_BIND_PASSWORD_ENCRYPTED=REPLACE_WITH_ENCRYPTED_SEARCH_PASSWORD
LDAP_USER_FILTER=(uid={username})
LDAP_SESSION_MINUTES=15
```

Pass the LDAP variables through `registry-ui.environment` as well as defining them in Dokploy. Encrypt the search password using `scripts/encrypt-secret.mjs` and the existing console key. Give that search account only the directory permissions required to find users in `LDAP_BASE_DN`.

| Variable | Default | Behaviour |
| --- | --- | --- |
| `LDAP_ENABLED` | `false` | Enables directory password verification for configured LDAP users. |
| `LDAP_URL` | Empty | Required directory origin when enabled, using `ldaps://` or `ldap://` with StartTLS. |
| `LDAP_STARTTLS` | `false` | Must be `true` for an `ldap://` URL. Plaintext binds are rejected. |
| `LDAP_BASE_DN` | Empty | Required base for user searches. |
| `LDAP_BIND_DN` | Empty | Required search account distinguished name. |
| `LDAP_BIND_PASSWORD_ENCRYPTED` | Empty | Required search password encrypted using `ENCRYPTION_KEY`. |
| `LDAP_USER_FILTER` | `(uid={username})` | Search filter with exactly one `{username}` placeholder. Username values are escaped before insertion. |
| `LDAP_SESSION_MINUTES` | `15` | LDAP session lifetime, from 5 to 60 minutes. |

For Active Directory, a suitable filter may be `(&(objectClass=user)(sAMAccountName={username}))`. Adapt it and the base DN to your directory. Searches must resolve exactly one user. TLS certificates are verified; LDAPS or StartTLS is required before sending credentials.

Directory password changes and account disablement prevent future directory logins. An existing console session remains valid until its short expiry. To revoke console access immediately, remove the user from the application configuration and recreate the container.

## Registry connections

Admins create connections through the interface. Use a dedicated upstream account with the narrowest permissions needed. Stored credentials are shared by console operations for that connection; they are not each signed-in user's upstream identity.

### Distribution registries

Use the registry origin without `/v2` or a repository path. Repository discovery requires the Distribution catalogue and tag APIs. Basic and Bearer authentication are supported. A registry that requires vendor-specific project discovery may expose images correctly while still being incompatible with catalogue browsing.

The inspector supports SHA-256 Docker schema v2 and OCI image manifests and indexes. It displays runnable platforms separately from build attestations. Original manifest and configuration JSON are available alongside the rendered metadata and history.

Set a connection's **Pull URL** when its public address differs from the internal API address. The per-connection value overrides `PULL_URL`. For example, the console can contact `http://registry:5000` while copied commands use `registry.example.com`. This setting does not configure DNS, a reverse proxy, TLS or Docker client trust.

### Docker Hub

Choose **Docker Hub** and enter a user or organisation namespace, such as `rubixvi` or `library`. Repository and tag discovery use the Hub API; manifests and image configuration use the registry API. Public browsing can use empty credentials. For private access, use a Docker username and a token permitted to access the required repositories.

The application recognises Docker Hub's registry at `https://registry-1.docker.io`, its Hub API, its `https://auth.docker.io/token` endpoint and known HTTPS configuration-blob CDN destinations. These built-in destinations do not need to be repeated in the custom origin lists. Additional redirect destinations still require explicit approval.

Docker Hub connections are not forced to be read only. Deletion remains subject to the connection's read-only setting, the upstream credentials and the registry endpoint's support. The console deletes manifests by digest through the Distribution API; it does not implement Docker Hub's separate tag-removal API. Do not assume a Hub tag can be removed merely because its account permits other write operations.

Docker Hub defaults copied pull commands to `docker.io`, independently of the global `PULL_URL`. A connection-specific Pull URL can override this.

### Manifest deletion

Deletion requires an admin, a writable connection and registry-side deletion support. The example enables deletion on the Distribution service. A connection marked read only prevents deletion through the console for everyone, including admins.

Bulk deletion supports up to 100 selected tags on the visible page. The preview resolves tags to unique digests and requires typed confirmation. A preview belongs to the current admin session, expires after five minutes and can be used once. Each digest has an individual result.

Deleting a manifest can invalidate every tag pointing to its digest, including unselected tags. Removing a connection only removes console settings. Manifest deletion does not run registry garbage collection; storage reclamation is a separate registry operation. See the [Distribution configuration guide](https://distribution.github.io/distribution/about/configuration/) for registry authentication and deletion settings.

## Trivy scanning

Set `TRIVY_ENABLED=true` to enable scanning globally. The console automatically discovers and queues eligible references, and browsing an image can queue its immutable digest. There is no separate per-connection scan switch. Admins can also start a scan from the image inspector; viewers can read reports.

Only runnable images are scanned. Build attestations and other non-runnable references are excluded. Multi-platform images are scanned per runnable platform, up to eight platforms per image. Private Docker Hub repositories are excluded even when saved credentials can read them. If Docker Hub cannot confirm that a repository is public, its scan does not start. Private self-hosted registry images can be scanned using their connection credentials.

Reports include severity totals, affected packages, installed and fixed versions, and platform details. Detail tables retain up to 1,000 findings while totals include all returned findings. Counts are per platform, so the same vulnerability can appear on multiple platforms.

Completed reports are reused for the same immutable digest and connection identity, including matching tags. They do not automatically refresh when Trivy's vulnerability database changes. Check the report's scan timestamp when interpreting its findings; a stored report is not a continuously updated security assessment.

| Variable | Default | Behaviour |
| --- | --- | --- |
| `TRIVY_ENABLED` | `false` | Enables automatic discovery, queued scans and admin scan actions. The deployment example enables it. |
| `TRIVY_PATH` | `/usr/local/bin/trivy` | Absolute executable path. The initializer example uses `/opt/trivy/trivy` instead. |
| `TRIVY_TIMEOUT_SECONDS` | `180` | Total image-scan deadline, from 30 to 600 seconds, shared across its platforms. |
| `TRIVY_SCANS_PER_HOUR` | `16` | Shared scan-start budget, from 1 to 60 per hour, with spacing between starts. Failed attempts also consume budget. |

One scan job runs at a time. Automatic work waits for the shared budget; an admin can choose **Override scan limit** to bypass that budget, with an audit event. The override does not bypass the single-job constraint, image eligibility or an upstream registry's restrictions.

The vulnerability database and analysis cache live under `DATA_DIR/trivy-cache`; scan workspaces live under `DATA_DIR/trivy-tmp`. The application sets the cache path explicitly. Setting `TRIVY_CACHE_DIR` does not relocate it. Allow sufficient persistent disk, memory and scan time for your images and the initial database download.

To use the executable already bundled in the console image, remove `trivy-init`, its `depends_on` entry and the `trivy-bin` volume and mount. Set `TRIVY_PATH=/usr/local/bin/trivy` and remove the `/opt/trivy` `SSL_CERT_FILE` override. Keep `TRIVY_ENABLED=true` and the writable data volume. No Docker socket is needed for either arrangement.

## Trust boundaries

### Browser, proxy and console

Expose the console through HTTPS at its configured `APP_ORIGIN`. State-changing API requests are checked against that origin. Session cookies are HttpOnly and SameSite Strict, and use Secure when the configured origin is HTTPS. The proxy must preserve the intended public origin and enforce the access boundary around the service.

`TRUST_PROXY` makes forwarded client addresses trusted input for sign-in protection. It does not enable proxy authentication or replace the console's own accounts. Password, authenticator and passkey attempt limits remain active for admins as well as viewers. Ordinary authenticated browsing does not have a per-user request quota.

### Console and upstream services

Registry, token and blob origin lists constrain the console's HTTP client. Approving a token-service origin allows authentication exchanges with that service and may disclose registry credentials to it. Approve only destinations you control or trust. Blob redirects require approved HTTPS destinations, and registry Authorization headers are stripped before following them. Registry API redirects are not followed as arbitrary new API destinations.

These lists are application controls, not a network firewall. They do not isolate internal services, enforce safe DNS resolution, or constrain unrelated processes. Use deployment-level network policy when outbound destinations must be restricted. Enabling HTTP permits cleartext credentials and content on otherwise approved HTTP registry and token connections.

The connection's read-only setting blocks console deletion actions. It does not reduce the permissions of its saved upstream credentials or stop those credentials being used outside the console. Enforce least privilege at the registry too.

Image labels, configuration and build history come from registry content. They can contain sensitive values that the console does not semantically redact. Grant viewer access with that visibility in mind.

### Scanner process and network

Trivy runs as a subprocess inside the console container, with the same operating-system user and network access. A read-only scanner volume prevents the console from modifying that executable; it does not sandbox the scanner away from the console's writable data.

The application supplies a temporary Docker credential file scoped to the selected registry, a minimal child environment, bounded output and a timeout. Temporary credentials and workspaces are removed after the scan finishes or fails. It does not execute the scanned image as a container.

Trivy makes its own requests for images, authentication, layers and vulnerability databases. The console's origin allowlists do not govern those requests. Enforce scanner egress restrictions at the container or host network boundary if required. Changing `PULL_URL` does not change the scan target.

For internal certificate authorities, mount the required CA files and configure Node's `NODE_EXTRA_CA_CERTS` for the console and LDAP client. Configure `SSL_CERT_FILE` or `SSL_CERT_DIR` for Trivy separately. The mounted CA bundle in the example contains the selected Trivy image's public trust roots; it does not automatically include your private CA. Keep certificate verification enabled.

### Data and operators

Registry passwords, LDAP bind passwords and authenticator secrets are encrypted with AES-256-GCM using `ENCRYPTION_KEY`. Local passwords use scrypt hashes and recovery codes are hashed. The entire SQLite database is not encrypted; metadata, audit events and vulnerability reports remain sensitive.

An operator with access to the container host, deployment secrets or backup material can access or change console state and run account recovery commands. Encryption at rest does not protect credentials from a compromised running console that has both the database and its key.

Workspace branding and the uploaded logo are visible before sign-in. Avoid confidential content in them. Admins can change the name, footer and accent colour, and upload a validated PNG logo through **Settings**.

## Operations and recovery

### Persistent data and backups

Run one console instance per persistent data directory and keep its SQLite data on storage suitable for local database locking. `console-data` contains `console.sqlite`, account security state, registry connections, branding, audit records, scan queues and reports, plus the Trivy cache and temporary workspaces. `registry-data` holds the registry's image content. `trivy-bin` contains replaceable scanner files.

Back up the console volume, registry data, registry htpasswd file and deployment configuration. Store the encryption key securely with a recovery procedure, preferably separately from the data backup. Losing or casually replacing the key makes existing encrypted secrets unreadable.

Stop `registry-ui` before taking a filesystem copy of its data, or use a consistent SQLite backup method that accounts for its write-ahead log. Do not copy only a live `console.sqlite` file and assume the backup is complete. Coordinate registry backups with registry writes as well. Test restoring both data and secrets before relying on a backup.

### Updates

Back up persistent data and secrets, then set `REGISTRY_CONSOLE_IMAGE` in `.env` to the desired tag or digest. For a direct Docker Compose deployment, update the console from the deployment directory.

```sh
docker compose pull registry-ui
docker compose up -d --no-deps --force-recreate registry-ui
docker compose ps -a
docker compose logs --tail=100 registry-ui
```

In Dokploy, update the image variable in **Environment** and redeploy. `pull_policy: always` retrieves the selected image during deployment; it does not continuously update a running container. Keep the existing data volume and encryption key. Database migrations run when the application opens its database.

When changing the separately managed Trivy version, stop the console and recreate `trivy-init` so the binary volume is refreshed before starting the console again. Pulling a new initializer image alone does not replace files already stored in that volume. A database migration can make rollback require restoring the matching pre-upgrade backup.

### Health, audit and troubleshooting

`GET /api/health` returns a minimal database-readiness result without sign-in. It is used by the image health check and does not test an upstream registry, LDAP availability or Trivy. Admins can review **Audit** for connection changes, deletion results, scan actions and security events. The log retains up to 10,000 events; it is not an immutable external audit archive.

| Symptom | What to check |
| --- | --- |
| Sign-in or passkeys fail behind a proxy | Match `APP_ORIGIN` to the browser's HTTPS origin, check the proxy route and inspect whether cookies are being sent. |
| A registry origin is rejected | Use its server-reachable origin without `/v2`, approve that exact origin, and enable HTTP only if deliberately using it. |
| Token authentication or image configuration fails | Check the external token or blob destination and approve the correct origin in its respective list. Do not broadly allow unrelated hosts. |
| Docker Hub returns a rate-limit message | Check upstream credentials and Docker Hub's response. Admin requests bypass the console's cached upstream cooldown, but cannot bypass Docker Hub's actual limits. |
| A scan is waiting for capacity | Check the shared scan budget and whether a job is running. An admin can override the budget from the inspector. |
| A Docker Hub image cannot be scanned | The repository must be confirmed public. Private repositories and unverified privacy are excluded. Attestations are also excluded. |
| Trivy fails to start or download its database | Check executable permissions, the initializer's exit status, writable data storage, outbound access, certificate trust and available resources. |
| Deletion is unavailable or rejected | Check the console role, connection read-only setting, upstream permissions and endpoint support. Docker Hub tag removal is a separate API. |
| Data disappears after redeployment | Confirm that `/app/data` uses the same persistent volume and that the original encryption key is still configured. |

## Licence

Registry Console is licensed under the GNU Affero General Public License, version 3 or any later version (`AGPL-3.0-or-later`). See [LICENSE](LICENSE) and [NOTICE](NOTICE). Bundled third-party components retain their own licences, including Trivy's licence in the container at `/usr/share/licenses/trivy/LICENSE`.

## Support

For support or inquiries:

- LinkedIn: [rubixvi](https://www.linkedin.com/in/rubixvi/)
- Website: [Rubix Studios](https://rubixstudios.com.au)

## Author

Rubix Studios

[https://rubixstudios.com.au](https://rubixstudios.com.au)
