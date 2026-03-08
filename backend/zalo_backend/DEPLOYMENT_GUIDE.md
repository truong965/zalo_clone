# Hướng Dẫn Deploy Zalo Clone lên EC2 với Docker và Docker Hub

## 📋 Mục Lục

1. [Chuẩn bị môi trường](#chuẩn-bị-môi-trường)
2. [Tạo Docker Hub repository](#tạo-docker-hub-repository)
3. [Setup EC2 instance](#setup-ec2-instance)
4. [Build và push Docker image](#build-và-push-docker-image)
5. [Deploy lên EC2](#deploy-lên-ec2)
6. [Monitoring và maintenance](#monitoring-và-maintenance)

## 🛠 Chuẩn bị môi trường

### Yêu cầu cần có:
- Docker Desktop (loca l)
- Docker Hub account
- AWS account với EC2 access
- Domain name (khuyến nghị)

### Files đã được tạo:
- `Dockerfile.prod` - Production Dockerfile
- `docker-compose.prod.yml` - Production compose file
- `env.production.example` - Environment variables template
- `nginx.conf` - Nginx reverse proxy configuration

## 🐳 Tạo Docker Hub Repository

### 1. Đăng nhập Docker Hub
```bash
docker login
```

### 2. Tạo repository mới
- Truy cập https://hub.docker.com/
- Click "Create Repository"
- Đặt tên: `zalo-backend`
- Visibility: Public (hoặc Private nếu cần)

### 3. Tag và push image (sẽ làm ở bước 4)

## 🚀 Setup EC2 Instance

### 1. Launch EC2 Instance

```bash
# Recommended specifications:
- Instance type: t3.medium (minimum)
- AMI: Ubuntu 22.04 LTS
- Storage: 30GB SSD
- Security Group: Open ports 80, 443, 22
```

### 2. Connect to EC2

```bash
# SSH vào EC2
ssh -i your-key.pem ubuntu@your-ec2-public-ip

# Update system
sudo apt update && sudo apt upgrade -y
```

### 3. Install Docker trên EC2

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Reboot để apply group changes
sudo reboot
```

### 4. Setup Firewall

```bash
# Configure UFW
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable
```

## 🏗 Build và Push Docker Image

### 1. Build image locally

```bash
# Navigate to backend directory
cd backend/zalo_backend

# Build production image
docker build -f Dockerfile.prod -t trungmai965/zalo_backend:latest .
# Kiểm tra image build thành công
docker images | grep zalo_backend

# Test image locally (optional)
docker run -p 3000:3000 yourusername/zalo-backend:latest
```

### 2. Push to Docker Hub

```bash
# Push to Docker Hub
docker push trungmai965/zalo_backend:latest
```

### 3. Verify trên Docker Hub
- Check repository: https://hub.docker.com/r/yourusername/zalo-backend

## 📦 Deploy lên EC2

### 1. Prepare EC2 environment

```bash
# SSH vào EC2
ssh -i your-key.pem ubuntu@your-ec2-public-ip

# Create project directory
mkdir -p ~/zalo-clone
cd ~/zalo-clone

# Create necessary directories
mkdir -p ssl backups logs
```

### 2. Copy files to EC2

```bash
# From local machine, copy files
scp -i your-key.pem docker-compose.prod.yml ubuntu@your-ec2-public-ip:~/zalo-clone/
scp -i your-key.pem nginx.conf ubuntu@your-ec2-public-ip:~/zalo-clone/
scp -i your-key.pem env.production.example ubuntu@your-ec2-public-ip:~/zalo-clone/
```

### 3. Setup environment variables

```bash
# On EC2
cd ~/zalo-clone

# Copy environment template
cp env.production.example .env.production

# Edit environment file
nano .env.production
```

**Quan trọng: Cập nhật các giá trị sau:**
- `POSTGRES_PASSWORD` - Password mạnh cho PostgreSQL
- `REDIS_PASSWORD` - Password mạnh cho Redis
- `JWT_SECRET` - Secret key rất mạnh (minimum 32 characters)
- `MINIO_ROOT_USER` & `MINIO_ROOT_PASSWORD` - MinIO credentials
- `TURN_SECRET` - TURN server secret
- `DOMAIN` - Domain của bạn

### 4. Pull Docker image

```bash
# Pull image from Docker Hub
docker pull yourusername/zalo-backend:latest
```

### 5. Setup SSL (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate (cần có domain)
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com

# Copy certificates to project directory
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ~/zalo-clone/ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ~/zalo-clone/ssl/key.pem
sudo chown ubuntu:ubuntu ~/zalo-clone/ssl/*
```

### 6. Update nginx.conf

```bash
# Replace yourdomain.com trong nginx.conf với domain thực tế
sed -i 's/yourdomain.com/your-actual-domain.com/g' nginx.conf
```

### 7. Deploy application

```bash
# Start services
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f api
```

### 8. Database Migration

```bash
# Run database migrations
docker-compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# (Optional) Seed database
docker-compose -f docker-compose.prod.yml exec api npm run seed:prod
```

## 🔍 Monitoring và Maintenance

### 1. Health Checks

```bash
# Check all services status
docker-compose -f docker-compose.prod.yml ps

# Check API health
curl https://api.yourdomain.com/health

# Check logs
docker-compose -f docker-compose.prod.yml logs -f --tail=100
```

### 2. Backup Database

```bash
# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/ubuntu/zalo-clone/backups"

docker-compose -f docker-compose.prod.yml exec -T postgres pg_dump -U zalo_prod_user zalo_clone_prod_db > $BACKUP_DIR/backup_$DATE.sql

# Keep only last 7 days of backups
find $BACKUP_DIR -name "backup_*.sql" -mtime +7 -delete
EOF

chmod +x backup.sh

# Setup cron job for daily backups
crontab -e
# Add: 0 2 * * * /home/ubuntu/zalo-clone/backup.sh
```

### 3. Update Application

```bash
# Pull new image
docker pull yourusername/zalo-backend:latest

# Restart services
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d

# Run migrations if needed
docker-compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

## 🔧 Troubleshooting

### Common Issues:

1. **Port conflicts**
   ```bash
   sudo netstat -tulpn | grep :80
   sudo systemctl stop nginx  # if needed
   ```

2. **Permission issues**
   ```bash
   sudo chown -R ubuntu:ubuntu ~/zalo-clone
   ```

3. **Docker issues**
   ```bash
   docker system prune -f
   docker-compose -f docker-compose.prod.yml down -v
   docker-compose -f docker-compose.prod.yml up -d
   ```

4. **SSL issues**
   ```bash
   sudo certbot renew --dry-run
   ```

## 📝 Security Best Practices

1. **Regular updates**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Firewall rules**
   ```bash
   sudo ufw status
   # Only allow necessary ports
   ```

3. **Monitor logs**
   ```bash
   sudo tail -f /var/log/nginx/access.log
   sudo tail -f /var/log/nginx/error.log
   ```

4. **Database security**
   - Use strong passwords
   - Regular backups
   - Limit database access

## 🚀 Next Steps

1. Setup CI/CD pipeline (GitHub Actions)
2. Add monitoring (Prometheus + Grafana)
3. Setup log aggregation (ELK stack)
4. Add auto-scaling
5. Implement disaster recovery

## 📞 Support

Nếu gặp vấn đề:
1. Check logs: `docker-compose logs`
2. Verify environment variables
3. Check network connectivity
4. Review AWS security groups
5. Test with smaller deployment first
