# Infrastructure

Where SplitLah runs in production, how it was set up, and the trade-offs. The pipeline that deploys to it is in `docs/pipeline.md`.

## The server

| Setting        | Value                                              | Why                                                              |
| -------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Cloud / region | AWS, **Asia Pacific (Singapore) `ap-southeast-1`** | Users are in Singapore; the database (RDS) is in the same region |
| Instance       | EC2 **t3.micro** (2 vCPU, 1 GB RAM), x86           | Free-tier eligible; x86 matches the image GitHub Actions builds  |
| OS             | **Ubuntu Server 24.04 LTS**                        | Long-term support; Docker publishes packages for it              |
| Disk           | 20 GB gp3                                          | Free tier allows up to 30 GB                                     |
| Swap           | 1 GB                                               | 1 GB of RAM is tight when pulling and starting Docker images     |
| Public address | `splitlah.duckdns.org` → `47.129.169.19`           | Free name for the HTTPS certificate (KAN-39)                     |

## Firewall (security group)

| Port | Open to                     | For                             |
| ---- | --------------------------- | ------------------------------- |
| 22   | **My home IP only** (`/32`) | SSH                             |
| 80   | Anywhere (`0.0.0.0/0`)      | HTTP (Caddy redirects to HTTPS) |
| 443  | Anywhere (`0.0.0.0/0`)      | HTTPS                           |

Postgres (5432) and the API (3000) are **never** opened. Only Caddy faces the internet; the API is reached through it.

## HTTPS (Caddy, KAN-39)

The site is **https://splitlah.duckdns.org**. The iPhone camera and installing the PWA both need HTTPS. Checked on 10 Nov: Let's Encrypt certificate valid to 8 Feb 2027, the same certificate after a restart, and the app opens on iPhone Safari without a warning.

- **DuckDNS** gives a free name (`splitlah.duckdns.org`) pointing at the server's IP.
- **Caddy** asks Let's Encrypt for a certificate the first time it starts and renews it by itself. `http://` is redirected to `https://`. The certificate is kept in the `caddy-data` volume, so a restart doesn't request a new one.
- **One web container:** the `splitlah-web` image is Caddy with the built React files inside. It serves the app and passes `/api/*` to the API at `api:3000` on Docker's internal network. The ticket suggested a separate `web` (static server) container behind Caddy; one container means one less hop and one less image to update.
- The **Caddyfile** (`apps/web/Caddyfile`) is baked into the image, so CI builds and checks it on every PR, and a release always runs with the Caddyfile from the same commit.
- Like the API, it runs as a **non-root user** (`caddy`). The Caddy binary is already allowed to use ports 80 and 443 without root.
- `deploy.sh` checks the API **inside its container**, so a slow certificate can't roll back a good release. The deploy job then checks `https://splitlah.duckdns.org/api/health` from the internet, which also fails if the certificate is wrong.

## The database (Amazon RDS, KAN-75)

| Setting             | Value                                                         | Why                                                         |
| ------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Engine              | **PostgreSQL 18.3**                                           | Same major version as local Docker and CI (dev/prod parity) |
| Instance            | `db.t4g.micro` (ARM), Single-AZ, Free tier template           | Free tier                                                   |
| Storage             | 20 GB, autoscaling **off**, encrypted                         | Free tier limit; autoscaling could quietly grow the bill    |
| **Public access**   | **No**                                                        | The endpoint resolves to a private `172.31.x.x` address     |
| Security group      | `rds-sg`: port 5432 **only from the server's security group** | Not from any IP, so even a new server IP needs no change    |
| Backups             | Automated, kept **1 day** (what the Free tier template set)   | Restore to any minute in the last day                       |
| Deletion protection | **On**                                                        | One wrong click can't delete the database                   |
| Credentials         | Self managed (not Secrets Manager)                            | Secrets Manager costs US$0.40 a month                       |

**Two database users.** The master user `postgres` is only used by me, to create the app user; its password is only in my password manager. The API logs in as `app`, which owns the `splitlah` database and nothing else, so a leaked app password can't touch other databases or create users.

**Encrypted and verified (TLS).** `DATABASE_URL` ends in `?sslmode=require`. The app's driver (`pg` 8) treats `require` as **verify-full**: it checks that the certificate is for this exact RDS endpoint. Node doesn't trust Amazon's RDS certificate authority by default, so Amazon's public certificates are downloaded once to `/opt/splitlah/rds-ca.pem` and given to Node with `NODE_EXTRA_CA_CERTS` (in `infra/docker-compose.yml`). Prisma's migration tool also connects over TLS with `sslmode=require`. `pg` 9 will change `require` to mean "encrypt but don't check the certificate", so when Dependabot brings `pg` 9 the URL should become `sslmode=verify-full`.

**Proof it is private:** from my laptop the endpoint resolves to `172.31.24.34` and `Test-NetConnection … -Port 5432` gives `TcpTestSucceeded: False`. From the server, `psql` connects (`SSL connection (protocol: TLSv1.3)`).

### Setup (done once)

1. EC2 → Security Groups: `rds-sg`, inbound PostgreSQL 5432 from the **server's** security group.
2. RDS → Create database → **Full configuration**, with the settings above.
3. On the server, download the certificates:
   `sudo -u deploy curl -fsSo /opt/splitlah/rds-ca.pem https://truststore.pki.rds.amazonaws.com/ap-southeast-1/ap-southeast-1-bundle.pem`
4. Log in as `postgres` (with `psql` from the `postgres:18` image, `sslmode=verify-full`) and run:
   `CREATE ROLE app LOGIN;` → `\password app` → `GRANT app TO postgres;` → `CREATE DATABASE splitlah OWNER app;`
   The `GRANT` is needed since Postgres 16: you can only make a role the owner of a database if you can act as that role.
5. In `/opt/splitlah/.env`: `DATABASE_URL=postgresql://app:<password>@<endpoint>:5432/splitlah?sslmode=require`. The password is made with `openssl rand -hex 24`, so it has only `0-9a-f` and needs no escaping in a URL.
6. Test before switching: a one-off `api` container connects with `pg`, and the `migrate` container creates the tables on RDS. The live site kept using the old database until the merge.

**Fallback:** if the free credits run out, put a `db` service back in `docker-compose.yml` and point `DATABASE_URL` at it. No code changes, because Prisma only reads `DATABASE_URL`. The old database's Docker volume is still on the server.

## Setup (repeatable)

Everything on the server is done by [`infra/setup-server.sh`](../infra/setup-server.sh), so it can be run again on a new server. It is checked with ShellCheck.

1. Launch the instance (settings above), with my own key pair for SSH.
2. On my laptop, make a **separate** key pair for GitHub Actions: `ssh-keygen -t ed25519 -f ~/.ssh/splitlah-actions` (no passphrase, because a workflow can't type one).
3. Copy the script to the server and run it with the Actions **public** key:
   ```bash
   scp -i ~/.ssh/splitlah-chee.pem infra/setup-server.sh ubuntu@47.129.169.19:~
   ssh -i ~/.ssh/splitlah-chee.pem ubuntu@47.129.169.19
   sudo bash setup-server.sh "ssh-ed25519 AAAA... github-actions-deploy"
   ```
4. Check it works with the Actions key: `ssh -i ~/.ssh/splitlah-actions deploy@47.129.169.19 docker ps`

What the script does:

| Step | What                                                                                         |
| ---- | -------------------------------------------------------------------------------------------- |
| 1    | Automatic security updates (`unattended-upgrades`)                                           |
| 2    | Docker Engine + Compose plugin from Docker's official repository                             |
| 3    | A `deploy` user that can run Docker but has **no sudo**                                      |
| 4    | Only the GitHub Actions public key can log in as `deploy`                                    |
| 5    | `/opt/splitlah`, owned by `deploy`, for the Compose file and `.env`                          |
| 6    | SSH: keys only, no passwords, no root login (config checked with `sshd -t` before reloading) |
| 7    | 1 GB swap                                                                                    |

## Keys and accounts

| Key / account                     | Where it lives                                           | Used for                                                  |
| --------------------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| AWS root account                  | Me only, **MFA on**                                      | Billing and account settings                              |
| `splitlah-chee.pem`               | My laptop only (`~/.ssh`, readable only by me)           | My SSH logins as `ubuntu`                                 |
| `splitlah-actions` (private)      | GitHub Secret `EC2_SSH_KEY` (`production`) and my laptop | The deploy job's SSH login                                |
| `splitlah-actions.pub` (public)   | `/home/deploy/.ssh/authorized_keys` on the server        | Lets that key in as `deploy`                              |
| IAM role `splitlah-github-deploy` | AWS; used by GitHub Actions through OIDC (no keys)       | Opening and closing port 22 for one deploy                |
| `/opt/splitlah/.env`              | The server only, readable only by `deploy`               | `DATABASE_URL` (RDS `app` user), `JWT_SECRET`, Gemini key |
| RDS master password (`postgres`)  | My password manager only                                 | Creating the `app` user                                   |

No key is in git. If the Actions key leaks, removing one line from `authorized_keys` cuts it off without touching my own access.

## How a deploy reaches the server

Port 22 normally only allows my home IP. GitHub Actions runners use thousands of changing IPs, so the deploy job opens port 22 **for its own IP only, for the few seconds of the deploy**, and always closes it afterwards. It gets permission through **OIDC**:

1. IAM **identity provider** `token.actions.githubusercontent.com` (audience `sts.amazonaws.com`): AWS trusts tokens signed by GitHub Actions.
2. IAM **policy** `splitlah-deploy-ssh-rule`: only `ec2:AuthorizeSecurityGroupIngress` and `ec2:RevokeSecurityGroupIngress`, only on this server's security group.
3. IAM **role** `splitlah-github-deploy`: has that policy, and its trust policy only accepts a token whose `sub` is exactly `repo:cheewei0123@210798904/ay2626s2-cicdp-ChongCheeWei@1437996139:environment:production`. A pull request or any other job gets a different `sub` and is refused.

GitHub puts the account and repository **numeric IDs** (`@210798904`, `@1437996139`) in the `sub`. Most guides show the older format without them; the deploy job prints its token's claims (never the token) so the trust policy can be matched exactly. The IDs never change, so even if someone later took over the name `cheewei0123`, their tokens would not match.

Options I did not choose: opening SSH to the whole internet (simplest, but bots try to log in all day), or storing an AWS access key in GitHub Secrets (works, but a long-lived cloud key is exactly what OIDC avoids).

## What runs on the server

`/opt/splitlah/` holds `docker-compose.yml` and `deploy.sh` (copied in by every deploy), `.env`, `rds-ca.pem` (Amazon's public RDS certificates) and `.deployed-tag` (the last release that passed its health check).

| Service   | Image                                        | Reachable from                          |
| --------- | -------------------------------------------- | --------------------------------------- |
| `web`     | `ghcr.io/cheewei0123/splitlah-web:<SHA>`     | Ports 80 and 443 (the only public ones) |
| `api`     | `ghcr.io/cheewei0123/splitlah-api:<SHA>`     | Only the `web` container (`api:3000`)   |
| `migrate` | `ghcr.io/cheewei0123/splitlah-migrate:<SHA>` | Runs once per deploy, then exits        |

## Cost

| Item                               | Cost                                                         |
| ---------------------------------- | ------------------------------------------------------------ |
| t3.micro, 20 GB gp3                | Free tier                                                    |
| Public IPv4 address                | About US$0.005/hour (≈ US$3.60/month), paid from AWS credits |
| RDS `db.t4g.micro`, 20 GB, backups | Free tier; no public IP, so no IPv4 charge                   |
| **Budget alert**                   | **US$10/month**, emails me before anything goes over         |

The ticket suggested a US$1 alert. I set US$10 because the public IPv4 alone is about US$3.60 a month, so a US$1 alert would fire every month and stop meaning anything.

## Trade-offs (report section d)

- **One server, no redundancy.** If the instance fails, the app is down until it is replaced. Acceptable for a student project; production would use at least two instances behind a load balancer.
- **SSH only from my IP** stops bots from trying to log in, but my IP changes (it changed when my VPN was on, and I was locked out until I updated the rule). The deploy job gets in by opening port 22 for its own IP for a few seconds (OIDC, above), which is more moving parts than leaving SSH open, but keeps port 22 closed almost all the time.
- **Managed database (RDS) vs a Postgres container:**
  - Reliability: AWS takes the backups and applies patches, and the data survives if the server dies. Before KAN-75 the data was only a Docker volume on the server.
  - Short history: backups are kept for 1 day, so a mistake noticed two days later can't be undone from them.
  - Still one copy: Single-AZ, so if that data centre fails the database is down until AWS recovers it. Multi-AZ keeps a standby copy but costs double and is not free tier.
  - Cost: free tier now; after it, RDS costs more than a container on the server I already pay for.
  - Lock-in: low. It is plain PostgreSQL, the app only knows `DATABASE_URL`, and `pg_dump` works.
  - More to set up: a second security group, TLS certificates and two database users.
- **A free domain I don't control.** DuckDNS could go down or change its rules. And if the instance is stopped and started, its public IP changes and the DuckDNS record must be updated (an Elastic IP would keep it fixed, at the same price while the server runs).
- **The web server image runs Caddy's latest 2.x** (`caddy:2-alpine`), so a rebuild can pick up a newer Caddy. Dependabot also watches Docker base images.
- **The `docker` group is close to root.** Anyone who can run Docker can mount the host's files into a container. So the `deploy` key is powerful even without sudo, and must stay only in GitHub Secrets.
- **Free-tier limits:** 1 GB of RAM (hence the swap), and burstable CPU that slows down under long heavy load.
