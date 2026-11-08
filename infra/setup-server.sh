#!/usr/bin/env bash
# One-time setup of the SplitLah production server (Ubuntu 24.04 LTS on EC2).
# Safe to run again: every step checks before it changes anything.
#
# Run it ON THE SERVER, as the default ubuntu user:
#   sudo bash setup-server.sh "ssh-ed25519 AAAA... github-actions-deploy"
# The argument is the PUBLIC half of the key GitHub Actions will use to deploy.

set -euo pipefail # stop at the first error, unset variable or failed pipe

ACTIONS_PUBLIC_KEY="${1:-}"
if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo bash setup-server.sh \"<public key>\"" >&2
  exit 1
fi
if [[ "$ACTIONS_PUBLIC_KEY" != ssh-ed25519\ * ]]; then
  echo "Give the GitHub Actions PUBLIC key (starts with ssh-ed25519) as the argument" >&2
  exit 1
fi

echo "== 1. Automatic security updates"
apt-get update -q
apt-get install -y -q ca-certificates curl unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== 2. Docker Engine + Compose plugin (from Docker's official repository)"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
# shellcheck source=/dev/null
CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $CODENAME stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

echo "== 3. deploy user: can run Docker, has no sudo"
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
usermod -aG docker deploy

echo "== 4. Only the GitHub Actions key may log in as deploy"
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
echo "$ACTIONS_PUBLIC_KEY" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

echo "== 5. App folder"
install -d -m 750 -o deploy -g deploy /opt/splitlah

echo "== 6. SSH: keys only, no passwords, no root login"
cat > /etc/ssh/sshd_config.d/99-splitlah.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sshd -t # check the SSH config is valid before reloading, so we can't lock ourselves out
systemctl reload ssh

echo "== 7. 1 GB swap (a t3.micro has only 1 GB of RAM)"
if ! swapon --show | grep -q '^/swapfile'; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== Done"
docker --version
docker compose version
free -h | grep -i swap
