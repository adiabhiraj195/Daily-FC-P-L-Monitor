# ==============================================================================
# Dockerfile for Nginx Reverse Proxy
# ==============================================================================

FROM nginx:1.27-alpine

# Install curl for healthcheck
RUN apk add --no-cache curl

# Remove default boilerplate configs
RUN rm -rf /etc/nginx/conf.d/*

# Copy customized Nginx configurations
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf

# Create ACME challenge web root
RUN mkdir -p /var/www/certbot

EXPOSE 80 443

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD curl -f http://localhost/nginx-health || exit 1

CMD ["nginx", "-g", "daemon off;"]
