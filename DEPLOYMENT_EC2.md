# AWS EC2 Production Deployment Guide

This guide provides end-to-end instructions for deploying the **Prozo Fulfilment Centre (FC) Margin Monitoring System** onto an **AWS EC2 instance** using Docker, Docker Compose, PostgreSQL 16, and Nginx, with native **AWS S3** for secure object storage.

---

## 1. Architecture Overview

When deployed on AWS EC2, the modular microservices run inside an isolated Docker bridge network (`prozo-network`) governed by a single `docker-compose.yml` file, integrating directly with AWS S3:

```
[ Internet Traffic ]
        │
        ▼ (Port 80 / 443)
┌─────────────────────────────────────────────────────────────┐
│ AWS EC2 Instance (Ubuntu 22.04 / 24.04 LTS)                 │
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
| **Instance Type** | `t3.medium` (2 vCPU, 4GB RAM) | `t3.large` or `c6i.large` (2 vCPU, 8GB RAM) |
| **Operating System** | Ubuntu Server 22.04 LTS / 24.04 LTS (HVM, 64-bit x86) | Ubuntu Server 24.04 LTS |
| **Storage (EBS)** | 30 GB gp3 | 50 GB gp3 (3,000 IOPS, 125 MB/s throughput) |
| **Swap Space** | 4 GB (automatically provisioned by `ec2-setup.sh`) | 4 GB |

---

## 3. AWS Security Group Configuration

Create an EC2 Security Group (`prozo-margin-monitor-sg`) with the following **Inbound Rules**:

| Type | Protocol | Port Range | Source | Description |
| :--- | :--- | :--- | :--- | :--- |
| **SSH** | TCP | `22` | `Your-Office-IP/32` or Admin IP | Administrative Shell Access |
| **HTTP** | TCP | `80` | `0.0.0.0/0` | Web Dashboard & ACME Let's Encrypt |
| **HTTPS** | TCP | `443` | `0.0.0.0/0` | Secure SSL Web Dashboard & API |

*Note: All outbound traffic (`0.0.0.0/0`) is allowed for AWS S3 communication, LLM APIs, and email delivery.*

---

## 4. Deployment Option A: Zero-Touch Automated Launch (User Data)

When launching your EC2 instance in the AWS Management Console:
1. Choose **Ubuntu Server 24.04 LTS** as the AMI.
2. Select instance type **`t3.medium`** or **`t3.large`**.
3. Attach the security group created in Step 3.
4. Expand **Advanced Details** at the bottom of the page.
5. In the **User Data** field, paste the contents of `scripts/ec2-setup.sh`:

```bash
#!/usr/bin/env bash
curl -fsSL https://raw.githubusercontent.com/<YOUR-ORG>/<YOUR-REPO>/main/scripts/ec2-setup.sh | bash
```

The instance will initialize, install Docker, provision swap, configure Nginx, build the containers, run database migrations/seeds, and start the system automatically.

---

## 5. Deployment Option B: Manual SSH Deployment

### Step 1: Connect to your EC2 Instance
```bash
ssh -i /path/to/your-key.pem ubuntu@<your-ec2-public-ip>
```

### Step 2: Clone the Repository
```bash
git clone https://github.com/<YOUR-ORG>/FC-data-process.git /opt/prozo-fc-margin-monitor
cd /opt/prozo-fc-margin-monitor
```

### Step 3: Run the Automated Setup Script
```bash
sudo bash scripts/ec2-setup.sh
```
This script will:
- Update OS packages and install Docker, Docker Compose, Git, UFW, and jq.
- Configure a 4GB swap space to ensure memory stability during Next.js builds.
- Configure UFW firewall allowing ports 22, 80, and 443.
- Generate a secure `.env` file with random 64-character JWT secrets.
- Install the `prozo.service` systemd service for automatic reboot recovery.
- Build and launch all services (`db`, `api`, `worker`, `web`, `nginx`).

### Step 4: Configure AWS S3 Credentials in `.env`
Edit `/opt/prozo-fc-margin-monitor/.env`:
```ini
AWS_REGION=ap-south-1
AWS_S3_BUCKET=your-production-bucket-name
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=your_aws_secret_key_here
AWS_S3_FORCE_PATH_STYLE=false
```
Then restart the containers:
```bash
docker compose up -d
```

---

## 6. One-Command Starting and Managing

You can manage the entire application using standard Docker Compose commands from the project root:

```bash
# Start all services in the background (One command)
docker compose up -d

# Check live status of all services
docker compose ps

# Follow logs across all services
docker compose logs -f

# Follow logs for a specific service
docker compose logs -f api
docker compose logs -f worker
docker compose logs -f web
docker compose logs -f nginx

# Stop all services cleanly
docker compose down

# Stop and wipe database volume (clean reset)
docker compose down -v
```

---

## 7. Configuring Custom Domain & SSL (HTTPS)

Once your DNS A-record points your domain (e.g. `margin.yourcompany.com`) to your EC2 Public IP:

Run the automated SSL setup script:
```bash
sudo bash scripts/setup-ssl.sh margin.yourcompany.com admin@yourcompany.com
```

This script will:
1. Obtain an SSL certificate from Let's Encrypt using Certbot.
2. Configure Nginx with modern TLS 1.2/1.3 security ciphers and HTTP-to-HTTPS automatic redirection.
3. Update `.env` with `COOKIE_SECURE=true` and your HTTPS domain URLs.
4. Reload Nginx without downtime.
5. Install a daily cron job that auto-renews certificates before expiration.

---

## 8. Verifying Deployment & Health Probes

Once the stack is running, verify all endpoints:

| Endpoint | Purpose | Expected Status |
| :--- | :--- | :--- |
| `http://<EC2_IP>/nginx-health` | Nginx Proxy Health | `200 OK` ("healthy") |
| `http://<EC2_IP>/health/live` | Express API Live Probe | `200 OK` (`{"status":"live"}`) |
| `http://<EC2_IP>/health/ready` | API Database Readiness | `200 OK` (`{"status":"ready","database":"connected"}`) |
| `http://<EC2_IP>/login` | Web Dashboard UI | `200 OK` (Next.js HTML) |

---

## 9. Seeded User Credentials

On initial startup, `prisma/seed.ts` automatically provisions default test accounts:

| Role | Email | Default Password | Scoped Fulfilment Centres |
| :--- | :--- | :--- | :--- |
| **System Administrator** | `admin@prozo.com` | `Password@123` | All FCs + Global Target Rules |
| **Finance Controller** | `finance@prozo.com` | `Password@123` | All National FCs |
| **Delhi FC Manager** | `manager.delhi@prozo.com` | `Password@123` | `FC-DEL-01` (Delhi Centre) |
| **Bangalore FC Manager** | `manager.blr@prozo.com` | `Password@123` | `FC-BLR-01` (Bangalore Centre) |

> [!IMPORTANT]
> Change the default passwords immediately after your initial production login via the **Users Management** portal.

---

## 10. Continuous Updates & Redeployment

To pull the latest codebase updates and redeploy without downtime:

```bash
cd /opt/prozo-fc-margin-monitor
sudo bash scripts/deploy.sh
```

The `deploy.sh` script automatically:
1. Pulls the latest commits from the Git tracking branch.
2. Rebuilds modified Docker images with layer caching.
3. Performs a graceful restart of changed containers (`docker compose up -d --remove-orphans`).
4. Prunes stale Docker images to preserve EBS disk space.

---

## 11. Database Backup & Disaster Recovery

### Creating a Database Backup
```bash
docker compose exec db pg_dump -U postgres prozo_margin > /opt/backup-$(date +%Y%m%d-%H%M%S).sql
```

### Restoring from a Backup
```bash
cat /opt/backup-<timestamp>.sql | docker compose exec -T db psql -U postgres prozo_margin
```
