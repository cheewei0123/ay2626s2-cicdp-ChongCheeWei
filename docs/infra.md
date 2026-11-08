# Infrastructure

Where SplitLah runs in production, how it was set up, and the trade-offs. The pipeline that deploys to it is in `docs/pipeline.md`.

## The server

| Setting        | Value                                              | Why                                                                   |
| -------------- | -------------------------------------------------- | --------------------------------------------------------------------- |
| Cloud / region | AWS, **Asia Pacific (Singapore) `ap-southeast-1`** | Users are in Singapore; the database (RDS) will be in the same region |
| Instance       | EC2 **t3.micro** (2 vCPU, 1 GB RAM), x86           | Free-tier eligible; x86 matches the image GitHub Actions builds       |
| OS             | **Ubuntu Server 24.04 LTS**                        | Long-term support; Docker publishes packages for it                   |
| Disk           | 20 GB gp3                                          | Free tier allows up to 30 GB                                          |
| Swap           | 1 GB                                               | 1 GB of RAM is tight when pulling and starting Docker images          |
| Public address | `47.129.169.19` (public IPv4)                      | Caddy will serve HTTPS on it (KAN-39)                                 |

## Firewall (security group)

| Port | Open to                     | For                             |
| ---- | --------------------------- | ------------------------------- |
| 22   | **My home IP only** (`/32`) | SSH                             |
| 80   | Anywhere (`0.0.0.0/0`)      | HTTP (Caddy redirects to HTTPS) |
| 443  | Anywhere (`0.0.0.0/0`)      | HTTPS                           |

Postgres (5432) and the API (3000) are **never** opened. Only Caddy faces the internet; the API is reached through it.

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

| Key / account                   | Where it lives                                       | Used for                     |
| ------------------------------- | ---------------------------------------------------- | ---------------------------- |
| AWS root account                | Me only, **MFA on**                                  | Billing and account settings |
| `splitlah-chee.pem`             | My laptop only (`~/.ssh`, readable only by me)       | My SSH logins as `ubuntu`    |
| `splitlah-actions` (private)    | My laptop now; GitHub Secret `EC2_SSH_KEY` in KAN-37 | The deploy job's SSH login   |
| `splitlah-actions.pub` (public) | `/home/deploy/.ssh/authorized_keys` on the server    | Lets that key in as `deploy` |

No key is in git. If the Actions key leaks, removing one line from `authorized_keys` cuts it off without touching my own access.

## Cost

| Item                | Cost                                                         |
| ------------------- | ------------------------------------------------------------ |
| t3.micro, 20 GB gp3 | Free tier                                                    |
| Public IPv4 address | About US$0.005/hour (≈ US$3.60/month), paid from AWS credits |
| **Budget alert**    | **US$10/month**, emails me before anything goes over         |

The ticket suggested a US$1 alert. I set US$10 because the public IPv4 alone is about US$3.60 a month, so a US$1 alert would fire every month and stop meaning anything.

## Trade-offs (report section d)

- **One server, no redundancy.** If the instance fails, the app is down until it is replaced. Acceptable for a student project; production would use at least two instances behind a load balancer.
- **SSH only from my IP** stops bots from trying to log in, but my IP changes (it changed when my VPN was on, and I was locked out until I updated the rule). It also means **GitHub Actions cannot reach port 22 yet**; KAN-37 has to solve that.
- **The `docker` group is close to root.** Anyone who can run Docker can mount the host's files into a container. So the `deploy` key is powerful even without sudo, and must stay only in GitHub Secrets.
- **Free-tier limits:** 1 GB of RAM (hence the swap), and burstable CPU that slows down under long heavy load.
