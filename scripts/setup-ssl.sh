#!/usr/bin/env bash
# ==============================================================================
# Prozo FC Margin Monitor - Let's Encrypt SSL / HTTPS Setup Script
# Usage: sudo bash scripts/setup-ssl.sh <your-domain.com> [admin-email]
# ==============================================================================

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-alerts@prozo.com}"

if [ -z "$DOMAIN" ]; then
    echo "Usage: sudo bash scripts/setup-ssl.sh <your-domain.com> [admin-email]"
    echo "Example: sudo bash scripts/setup-ssl.sh monitor.prozo.com ops@prozo.com"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "${SCRIPT_DIR}")"

cd "${APP_DIR}"

echo "=========================================================="
echo " Setting up Let's Encrypt SSL for domain: ${DOMAIN}       "
echo "=========================================================="

# 1. Install certbot if not already present
if ! command -v certbot &> /dev/null; then
    echo "==> Installing certbot..."
    if command -v dnf &> /dev/null; then
        dnf install -y certbot 2>/dev/null || {
            dnf install -y python3-pip
            pip3 install certbot
            ln -sf /usr/local/bin/certbot /usr/bin/certbot || true
        }
    else
        apt-get update -y
        apt-get install -y certbot
    fi
fi

# 2. Obtain SSL certificate using webroot authentication (proxied by Nginx)
echo "==> Requesting certificate from Let's Encrypt..."
mkdir -p /var/www/certbot

certbot certonly \
    --webroot \
    -w /var/www/certbot \
    -d "${DOMAIN}" \
    --email "${EMAIL}" \
    --agree-tos \
    --no-eff-email \
    --non-interactive

CERT_PATH="/etc/letsencrypt/live/${DOMAIN}"

if [ ! -d "${CERT_PATH}" ]; then
    echo "[ERROR] Certificate directory ${CERT_PATH} not found. Aborting."
    exit 1
fi

echo "Certificate obtained successfully for ${DOMAIN}!"

# 3. Update Nginx configuration with HTTPS server block
echo "==> Updating Nginx configuration to enable HTTPS..."

cat << EOF > "${APP_DIR}/nginx/conf.d/default.conf"
# ==============================================================================
# Upstream definitions
# ==============================================================================
upstream web_upstream {
    server web:3000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

upstream api_upstream {
    server api:4000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

# ==============================================================================
# HTTP Server (Redirect all traffic to HTTPS)
# ==============================================================================
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
        try_files \$uri =404;
    }

    location /nginx-health {
        access_log off;
        default_type text/plain;
        return 200 "healthy\n";
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# ==============================================================================
# HTTPS Server (Port 443 with TLS 1.2 / 1.3)
# ==============================================================================
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN};

    # SSL Certificates
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    # Modern TLS Security Parameters
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_session_tickets off;

    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size 50M;

    # REST API Routing
    location /api/ {
        proxy_pass http://api_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port 443;
        proxy_set_header Connection "";

        proxy_connect_timeout 60s;
        proxy_send_timeout 180s;
        proxy_read_timeout 180s;
        proxy_buffering off;
    }

    # API Health Checks
    location /health/ {
        proxy_pass http://api_upstream/health/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Next.js Static Assets
    location /_next/static/ {
        proxy_pass http://web_upstream/_next/static/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        expires 365d;
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /favicon.ico {
        proxy_pass http://web_upstream/favicon.ico;
        expires 7d;
        access_log off;
    }

    # Web Dashboard Frontend
    location / {
        proxy_pass http://web_upstream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port 443;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
EOF

# Update .env to reflect HTTPS & secure cookies
if [ -f "${APP_DIR}/.env" ]; then
    sed -i "s|^WEB_URL=.*|WEB_URL=https://${DOMAIN}|g" "${APP_DIR}/.env"
    sed -i "s|^API_URL=.*|API_URL=https://${DOMAIN}/api/v1|g" "${APP_DIR}/.env"
    sed -i "s|^COOKIE_SECURE=.*|COOKIE_SECURE=true|g" "${APP_DIR}/.env"
fi

# 4. Reload Nginx
echo "==> Reloading Nginx container..."
docker compose exec nginx nginx -s reload || docker compose restart nginx

# 5. Setup automated certificate renewal cron job
echo "==> Configuring auto-renewal cron..."
(crontab -l 2>/dev/null || true; echo "0 3 * * * certbot renew --quiet --webroot -w /var/www/certbot && docker compose -f ${APP_DIR}/docker-compose.yml exec -T nginx nginx -s reload") | crontab -

echo "=========================================================="
echo " HTTPS successfully enabled for https://${DOMAIN}         "
echo " Auto-renewal configured for Let's Encrypt certificates.  "
echo "=========================================================="
