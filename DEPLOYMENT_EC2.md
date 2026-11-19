# AWS EC2 Production Deployment Guide

This guide provides end-to-end instructions for deploying the **Prozo Fulfilment Centre (FC) Margin Monitoring System** onto an **AWS EC2 instance** running **Amazon Linux 2023 (AL2023)** (or Ubuntu Server 22.04/24.04 LTS), using Docker, Docker Compose, PostgreSQL 16, Nginx, and native **AWS S3**.

---

## 1. Architecture Overview

When deployed on AWS EC2, the modular microservices run inside an isolated Docker bridge network (`prozo-network`) governed by a single `docker-compose.yml` file, integrating directly with AWS S3:

```
[ Internet Traffic ]
        │
        ▼ (Port 80 / 443)
┌─────────────────────────────────────────────────────────────┐
│ AWS EC2 Instance (Amazon Linux 2023 / AL2023)               │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Nginx Reverse Proxy (prozo-nginx:80/443)            │   │
│   │ - Client Max Body: 50MB (large spreadsheets)        │   │
│   │ - Static asset caching (_next/static)               │   │
│   │ - WebSocket upgrade handling                        │   │
│   │ - Gzip compression & security headers               │   │
│   └───┬───────────────────────────┬─────────────────────┘   │
│       │ /api/* & /health/*        │ /*                      │
│       ▼                           ▼                         │
│   ┌─────────────────────┐     ┌─────────────────────────┐   │
│   │ Express REST API    │     │ Next.js 15 Web Frontend │   │
│   │ (prozo-api:4000)    │     │ (prozo-web:3000)        │   │
│   └─────────┬───────────┘     └─────────────────────────┘   │
│             │                                               │
│             ├──────────────────────────┐                    │
│             ▼                          ▼                    │
│   ┌─────────────────────┐    ┌──────────────────────────┐   │
│   │ PostgreSQL 16 DB    │    │ Asynchronous Worker      │   │
│   │ (prozo-db:5432)     │◄───┤ (prozo-worker)           │   │
│   │ Volume: pgdata      │    │ Concurrency: 3 workers   │   │
│   │ Queue: FOR UPDATE   │    │ Pure DB Queue (No Redis) │   │
│   │        SKIP LOCKED  │    └─────────┬────────────────┘   │
│   └─────────────────────┘              │                    │
└────────────────────────────────────────┼────────────────────┘
                                         │
                                         ▼ S3 Uploads/Downloads
                              ┌──────────────────────┐
                              │ Native AWS S3 Bucket │
                              │ (AES256 Server-Side  │
                              │  Presigned URLs)     │
                              └──────────────────────┘
```

---

## 2. Recommended AWS EC2 Instance Sizing

| Metric | Minimum Requirement | Recommended Production |
| :--- | :--- | :--- |
| **AMI** | **`al2023-ami-2023.*-x86_64` (Amazon Linux 2023)** | Amazon Linux 2023 (or Ubuntu 24.04 LTS) |
| **Default User** | **`ec2-user`** (Amazon Linux 2023) | `ec2-user` |
| **Instance Type** | `t3.medium` (2 vCPU, 4GB RAM) | `t3.large` (2 vCPU, 8GB RAM) |
| **Storage (EBS)** | 30 GB gp3 | 50 GB gp3 |
| **Swap Space** | 4 GB (automatically provisioned by `ec2-setup.sh`) | 4 GB |

---

## 3. AWS Security Group Configuration

In the AWS EC2 Console, ensure your Security Group has these **Inbound Rules**:

| Type | Protocol | Port Range | Source | Description |
| :--- | :--- | :--- | :--- | :--- |
| **SSH** | TCP | `22` | `My IP` (or `0.0.0.0/0`) | Administrative Shell Access |
| **HTTP** | TCP | `80` | `0.0.0.0/0` | Web Dashboard & Nginx Gateway |
| **HTTPS** | TCP | `443` | `0.0.0.0/0` | Secure SSL Web Dashboard & API |

---

## 4. Amazon Linux 2023 (AL2023) Step-by-Step Deployment

### Step 1: Connect to your Amazon Linux 2023 Instance
> [!NOTE]
> Amazon Linux 2023 uses **`ec2-user`** as the default username (unlike Ubuntu which uses `ubuntu`).

From your **local terminal**:
```bash
chmod 400 /path/to/your-key.pem
ssh -i /path/to/your-key.pem ec2-user@<YOUR_EC2_PUBLIC_IP>
```

---

### Step 2: Clone or Copy the Repository to `/opt/prozo-fc-margin-monitor`

On the EC2 instance:
```bash
# Prepare application directory with correct ownership
sudo mkdir -p /opt/prozo-fc-margin-monitor
sudo chown -R ec2-user:ec2-user /opt/prozo-fc-margin-monitor

# Clone your repository
git clone https://github.com/<YOUR-ORG>/FC-data-process.git /opt/prozo-fc-margin-monitor
cd /opt/prozo-fc-margin-monitor
```

*(Alternatively, to copy from your local machine via rsync:)*
```bash
# Run this from your LOCAL Mac/Linux machine:
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude 'dist' \
  -e "ssh -i /path/to/your-key.pem" \
  ./ ec2-user@<YOUR_EC2_PUBLIC_IP>:/opt/prozo-fc-margin-monitor/
```

---

### Step 3: Run the Automated Setup Script

On the EC2 instance:
```bash
cd /opt/prozo-fc-margin-monitor
sudo bash scripts/ec2-setup.sh
```

#### What `scripts/ec2-setup.sh` does automatically on Amazon Linux 2023:
1. Detects `amzn` from `/etc/os-release` and runs `dnf` updates.
2. Installs Docker Engine, Git, jq, and the latest official Docker Compose CLI binary.
3. Automatically adds `ec2-user` to the `docker` group.
4. Allocates a **4GB swap space** (`/swapfile`) to ensure memory stability during Next.js builds.
5. Auto-generates a production `.env` with strong 64-character random JWT secrets and detects your EC2 Public IP.
6. Installs `prozo.service` systemd unit so the containers automatically restart on EC2 reboot.
7. Builds and boots all 5 containers (`db`, `api`, `worker`, `web`, `nginx`).

---

### Step 4: Configure Your AWS S3 Bucket

Edit the `.env` file to add your AWS S3 bucket credentials:
```bash
nano /opt/prozo-fc-margin-monitor/.env
```

Set your AWS credentials:
```ini
AWS_REGION=ap-south-1
AWS_S3_BUCKET=your-actual-s3-bucket-name
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_S3_FORCE_PATH_STYLE=false

# LLM API (if using Groq for AI reports)
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_your_groq_api_key_here
```
Save and exit (`Ctrl + O`, then `Enter`, then `Ctrl + X`).

Restart containers with the updated configuration:
```bash
docker compose up -d
```

---

### Step 5: Verify Deployment

Check container health:
```bash
docker compose ps
```

Expected output:
```text
NAME           IMAGE                   COMMAND                  SERVICE   STATUS                    PORTS
prozo-api      fc-data-process-api     "./scripts/docker-en…"   api       Up (healthy)              0.0.0.0:4000->4000/tcp
prozo-db       postgres:16-alpine      "docker-entrypoint.s…"   db        Up (healthy)              0.0.0.0:5432->5432/tcp
prozo-nginx    fc-data-process-nginx   "/docker-entrypoint.…"   nginx     Up (healthy)              0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
prozo-web      fc-data-process-web     "docker-entrypoint.s…"   web       Up (healthy)              0.0.0.0:3000->3000/tcp
prozo-worker   fc-data-process-worker  "./scripts/docker-en…"   worker    Up                        
```

Test internal probes:
```bash
curl http://localhost/nginx-health
curl http://localhost/health/ready
```

Open your browser and navigate to:
```
http://<YOUR_EC2_PUBLIC_IP>
```

---

### Step 6: Default Seed Login Credentials

| Role | Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **System Administrator** | `admin@prozo.com` | `Password@123` | All FCs + Global Target Rules |
| **Finance Controller** | `finance@prozo.com` | `Password@123` | All National FCs |
| **Delhi FC Manager** | `manager.delhi@prozo.com` | `Password@123` | `FC-DEL-01` (Delhi Centre) |
| **Bangalore FC Manager** | `manager.blr@prozo.com` | `Password@123` | `FC-BLR-01` (Bangalore Centre) |

---

### Step 7 (Optional): Custom Domain & Free SSL (HTTPS)

Once your DNS A-record points to your EC2 instance (e.g., `monitor.yourcompany.com` $\to$ `<EC2_IP>`):

```bash
sudo bash scripts/setup-ssl.sh monitor.yourcompany.com ops@yourcompany.com
```

This will automatically install Certbot via `dnf`/`pip3`, issue a Let's Encrypt SSL certificate, update Nginx with TLS 1.2/1.3, configure HTTP $\to$ HTTPS redirection, and set up auto-renewal cron.

---

### Daily Management Commands on Amazon Linux 2023

```bash
cd /opt/prozo-fc-margin-monitor

# View live aggregate logs
docker compose logs -f

# View logs for a specific container
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f web

# Restart all services
docker compose restart

# Stop all services
docker compose down

# One-command code update and redeploy
sudo bash scripts/deploy.sh

# Database backup
docker compose exec db pg_dump -U postgres prozo_margin > ~/backup-$(date +%F).sql
```
