#!/usr/bin/env bash
# ==============================================================================
# Prozo Fulfilment Centre (FC) Margin Monitoring System
# AWS EC2 Instance Automated Setup & Deployment Script
#
# Supported OS: Ubuntu 22.04 LTS / Ubuntu 24.04 LTS / Debian 12
# Recommended EC2 Instance Type: t3.medium or t3.large (min 4GB RAM, 30GB gp3)
# ==============================================================================

set -euo pipefail

LOG_FILE="/var/log/prozo-ec2-setup.log"
exec > >(tee -a "${LOG_FILE}") 2>&1

echo "================================================================================"
echo " Starting Prozo FC Margin Monitor Automated EC2 Setup"
echo " Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "================================================================================"

# Ensure script is executed with root privileges
if [ "$(id -u)" -ne 0 ]; then
  echo "[ERROR] This setup script must be run as root (or with sudo)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

# ------------------------------------------------------------------------------
# 1. Update System Packages & Install Baseline Utilities
# ------------------------------------------------------------------------------
echo "==> [1/8] Updating package repositories and installing baseline utilities..."
apt-get update -y
apt-get install -y --no-install-recommends \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    jq \
    ufw \
    unzip \
    htop \
    fail2ban \
    software-properties-common

# ------------------------------------------------------------------------------
# 2. Configure 4GB Swap Space (Crucial for EC2 memory stability during Next.js builds)
# ------------------------------------------------------------------------------
echo "==> [2/8] Checking and configuring swap space..."
if [ ! -f /swapfile ]; then
    echo "Creating 4GB swapfile at /swapfile..."
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab

    # Tune kernel memory parameters for smooth server performance
    sysctl vm.swappiness=10
    sysctl vm.vfs_cache_pressure=50
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    echo 'vm.vfs_cache_pressure=50' >> /etc/sysctl.conf
    echo "Swap space successfully configured:"
    free -h
else
    echo "Swapfile already exists. Skipping swap creation."
fi

# ------------------------------------------------------------------------------
# 3. Install Official Docker Engine & Docker Compose Plugin
# ------------------------------------------------------------------------------
echo "==> [3/8] Installing Docker Engine and Docker Compose Plugin..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

UBUNTU_CODENAME="$(lsb_release -cs)"
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME} stable" > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y --no-install-recommends \
    docker-ce \
    docker-ce-cli \
    containerd.io \
    docker-buildx-plugin \
    docker-compose-plugin

# Configure Docker daemon with log rotation to prevent disk exhaustion
mkdir -p /etc/docker
cat << 'EOF' > /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
EOF

systemctl daemon-reload
systemctl enable docker
systemctl restart docker

# Add sudo/current user to docker group
TARGET_USER="${SUDO_USER:-ubuntu}"
if id "$TARGET_USER" &>/dev/null; then
    usermod -aG docker "$TARGET_USER"
    echo "Added user '${TARGET_USER}' to the docker group."
fi

echo "Docker installed: $(docker --version)"
echo "Docker Compose installed: $(docker compose version)"

# ------------------------------------------------------------------------------
# 4. Configure EC2 Firewall (UFW)
# ------------------------------------------------------------------------------
echo "==> [4/8] Configuring UFW firewall rules..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP Nginx'
ufw allow 443/tcp comment 'HTTPS Nginx'
ufw --force enable
echo "Firewall active with open ports 22, 80, 443."

# ------------------------------------------------------------------------------
# 5. Setup Project Repository Directory
# ------------------------------------------------------------------------------
APP_DIR="/opt/prozo-fc-margin-monitor"
echo "==> [5/8] Setting up application directory at ${APP_DIR}..."

# If the script is being executed inside an existing cloned repo, use current dir or copy
CURRENT_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "${CURRENT_SCRIPT_DIR}")"

if [ -f "${PARENT_DIR}/docker-compose.yml" ]; then
    echo "Running inside repository folder: ${PARENT_DIR}"
    if [ "${PARENT_DIR}" != "${APP_DIR}" ]; then
        mkdir -p "${APP_DIR}"
        cp -R "${PARENT_DIR}/." "${APP_DIR}/"
    fi
else
    echo "Directory not populated. Please ensure your project files exist at ${APP_DIR}."
    mkdir -p "${APP_DIR}"
fi

cd "${APP_DIR}"

# ------------------------------------------------------------------------------
# 6. Generate Production Environment Configuration (.env)
# ------------------------------------------------------------------------------
echo "==> [6/8] Configuring production environment (.env)..."

# Detect Public IP of the EC2 Instance using AWS IMDSv2 or fallback
EC2_PUBLIC_IP=""
if TOKEN=$(curl -s -S -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null); then
    EC2_PUBLIC_IP=$(curl -s -S -H "X-aws-ec2-metadata-token: $TOKEN" "http://169.254.169.254/latest/meta-data/public-ipv4" 2>/dev/null || true)
fi

if [ -z "${EC2_PUBLIC_IP}" ]; then
    EC2_PUBLIC_IP=$(curl -s https://checkip.amazonaws.com || echo "localhost")
fi

echo "Detected EC2 Public IP: ${EC2_PUBLIC_IP}"

if [ ! -f "${APP_DIR}/.env" ]; then
    echo "Creating production .env with cryptographically secure random secrets..."
    
    JWT_ACCESS_SEC=$(openssl rand -hex 32)
    JWT_REFRESH_SEC=$(openssl rand -hex 32)
    DB_PASSWORD=$(openssl rand -hex 16)
    MINIO_PASSWORD=$(openssl rand -hex 16)

    cat << EOF > "${APP_DIR}/.env"
# Runtime Environment
NODE_ENV=production
BUSINESS_TIMEZONE=Asia/Kolkata
WEB_URL=http://${EC2_PUBLIC_IP}
API_URL=http://${EC2_PUBLIC_IP}/api/v1
NEXT_PUBLIC_API_URL=/api/v1

# PostgreSQL Configuration
POSTGRES_DB=prozo_margin
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${DB_PASSWORD}
POSTGRES_PORT=5432

# AWS S3 Object Storage Configuration
AWS_REGION=ap-south-1
AWS_S3_BUCKET=your-production-s3-bucket-name
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_FORCE_PATH_STYLE=false
S3_PRESIGNED_URL_TTL_SECONDS=600
MAX_UPLOAD_SIZE_BYTES=25000000

# Authentication Secrets
JWT_ACCESS_SECRET=${JWT_ACCESS_SEC}
JWT_REFRESH_SECRET=${JWT_REFRESH_SEC}
COOKIE_SECURE=false

# LLM Providers (Groq recommended default)
LLM_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
LLM_TIMEOUT_MS=30000
LLM_MAX_RETRIES=1

# Email Configuration
EMAIL_PROVIDER=test
EMAIL_FROM=Prozo Margin Monitor <alerts@example.com>
RESEND_API_KEY=

# Background Worker Settings
WORKER_ID=worker-ec2-1
WORKER_CONCURRENCY=3
WORKER_POLL_INTERVAL_MS=1000
JOB_LEASE_SECONDS=120
JOB_HEARTBEAT_INTERVAL_SECONDS=30
JOB_MAX_ATTEMPTS=3
EOF
    echo "Generated production .env successfully."
else
    echo "Existing .env found. Keeping existing credentials."
fi

# Ensure permissions
chown -R "${TARGET_USER}:${TARGET_USER}" "${APP_DIR}"
chmod 600 "${APP_DIR}/.env"

# ------------------------------------------------------------------------------
# 7. Create Systemd Service for Auto-Start on System Boot
# ------------------------------------------------------------------------------
echo "==> [7/8] Installing systemd service (prozo.service)..."
cat << EOF > /etc/systemd/system/prozo.service
[Unit]
Description=Prozo FC Margin Monitoring Docker Application
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable prozo.service
echo "prozo.service enabled for system boot."

# ------------------------------------------------------------------------------
# 8. Build & Start Docker Stack
# ------------------------------------------------------------------------------
echo "==> [8/8] Building Docker images and starting services..."
cd "${APP_DIR}"

echo "Building all services (this may take a few minutes on first run)..."
docker compose build

echo "Starting services in detached mode..."
docker compose up -d

echo "Waiting for services to become healthy..."
sleep 15
docker compose ps

echo "================================================================================"
echo " Prozo FC Margin Monitoring System Successfully Deployed!"
echo "================================================================================"
echo ""
echo " Application URLs:"
echo " - Web Dashboard:  http://${EC2_PUBLIC_IP}"
echo " - REST API:        http://${EC2_PUBLIC_IP}/api/v1"
echo " - API Health:      http://${EC2_PUBLIC_IP}/health/ready"
echo ""
echo " Default Seed Login Credentials:"
echo " ----------------------------------------------------------------------"
echo " Role                Email                     Password"
echo " ----------------------------------------------------------------------"
echo " System Admin        admin@prozo.com           Password@123"
echo " Finance Controller  finance@prozo.com         Password@123"
echo " Delhi FC Manager    manager.delhi@prozo.com   Password@123"
echo " Bangalore Manager   manager.blr@prozo.com     Password@123"
echo " ----------------------------------------------------------------------"
echo ""
echo " Operational Commands:"
echo " - Check status:    cd ${APP_DIR} && docker compose ps"
echo " - View live logs:  cd ${APP_DIR} && docker compose logs -f"
echo " - Restart stack:   cd ${APP_DIR} && docker compose restart"
echo " - Redeploy:        cd ${APP_DIR} && bash scripts/deploy.sh"
echo " - Setup SSL/HTTPS: cd ${APP_DIR} && bash scripts/setup-ssl.sh yourdomain.com"
echo "================================================================================"
