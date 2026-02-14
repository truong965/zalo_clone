# AWS Deployment Guide - Step by Step (For Beginners)

**Target Audience**: Developers with NO AWS/DevOps experience  
**Goal**: Deploy NestJS chat app to AWS in 6-8 hours  
**Budget**: Using AWS free tier + $200 student credits  

---

## 🎯 OVERVIEW

**What you'll deploy:**
```
✅ EC2 instance (free tier t2.micro)
✅ RDS PostgreSQL (free tier db.t3.micro)
✅ S3 bucket for media
✅ SQS queue for background jobs
✅ Self-hosted Redis on EC2 (to save money)
```

**Estimated time:**
- AWS account setup: 30 min
- RDS setup: 45 min
- EC2 setup: 2 hours
- App deployment: 2 hours
- Testing: 1 hour
- SSL/Domain: 1 hour (optional)

---

## 📋 PREREQUISITES

### 1. AWS Account Setup

**Step 1: Create AWS Account**
```bash
# Go to: https://aws.amazon.com/
# Click "Create an AWS Account"
# Use your student email (.edu email)
# Provide credit card (won't be charged if under free tier)
```

**Step 2: Apply for AWS Educate Credits**
```bash
# Go to: https://aws.amazon.com/education/awseducate/
# Apply with student email
# Get $200 credits (takes 1-2 days for approval)
```

**Step 3: Setup Billing Alerts**
```bash
# AWS Console → Billing → Billing Preferences
# Check "Receive Billing Alerts"
# Create alert: Notify when bill > $10, $20, $30
```

### 2. Install Required Tools

```bash
# On your local machine (Ubuntu/Mac/Windows WSL)

# 1. Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verify
aws --version  # Should show: aws-cli/2.x.x

# 2. Install Node.js (if not already)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version  # Should show: v20.x.x
npm --version   # Should show: 10.x.x

# 3. Install Git (if not already)
sudo apt-get install git
```

---

## 🔐 STEP 1: AWS IAM SETUP (15 minutes)

**Why?** Never use root account for daily work. Create IAM user instead.

### Create IAM User

```bash
# AWS Console → IAM → Users → Add User

Username: chat-app-deployer
Access type: ☑ Programmatic access, ☑ AWS Management Console access

# Next: Permissions
Attach existing policies directly:
  ☑ AdministratorAccess (for now, will restrict later)

# Next: Review → Create User

# IMPORTANT: Download CSV with credentials
# - Access Key ID
# - Secret Access Key
# - Console password
```

### Configure AWS CLI

```bash
# On your local machine
aws configure

# Enter when prompted:
AWS Access Key ID: [paste from CSV]
AWS Secret Access Key: [paste from CSV]
Default region name: ap-southeast-1  # Singapore (closest to Vietnam)
Default output format: json
```

**Test connection:**
```bash
aws sts get-caller-identity

# Should output:
# {
#   "UserId": "AIDAI...",
#   "Account": "123456789012",
#   "Arn": "arn:aws:iam::123456789012:user/chat-app-deployer"
# }
```

---

## 🗄️ STEP 2: RDS POSTGRESQL SETUP (45 minutes)

### Create Database Instance

```bash
# AWS Console → RDS → Create database

# Choose a database creation method:
○ Standard Create

# Engine options:
○ PostgreSQL
Version: PostgreSQL 15.x (latest)

# Templates:
○ Free tier

# Settings:
DB instance identifier: zalo-chat-db
Master username: postgres
Master password: [CREATE STRONG PASSWORD - Save in password manager!]

# DB instance class:
○ Burstable classes (includes t classes)
○ db.t3.micro (1 vCPU, 1 GB RAM) - Free tier eligible

# Storage:
Storage type: General Purpose SSD (gp3)
Allocated storage: 20 GB
☐ Enable storage autoscaling (disable to control cost)

# Connectivity:
○ Don't connect to an EC2 compute resource (we'll do it manually)
Public access: Yes (for now, will secure later)
VPC security group: Create new
New VPC security group name: zalo-chat-db-sg

# Additional configuration:
Initial database name: zalo_chat
☐ Enable automated backups (costs extra, enable later)
Backup retention period: 7 days (minimum)
☐ Enable encryption (free, but can't change later)

# Create database (takes 10-15 minutes)
```

**While waiting for RDS:**
```bash
# Note down these values (you'll need them later):
Endpoint: zalo-chat-db.xxxxx.ap-southeast-1.rds.amazonaws.com
Port: 5432
Username: postgres
Password: [your password]
Database: zalo_chat
```

---

## 🖥️ STEP 3: EC2 INSTANCE SETUP (2 hours)

### 3.1 Launch EC2 Instance

```bash
# AWS Console → EC2 → Launch Instance

# Name: zalo-chat-server

# Application and OS Images:
○ Ubuntu Server 22.04 LTS (Free tier eligible)

# Instance type:
○ t2.micro (1 vCPU, 1 GB RAM) - Free tier eligible
# NOTE: Will upgrade to t3.medium later when needed

# Key pair (login):
Create new key pair
  Key pair name: zalo-chat-key
  Key pair type: RSA
  Private key file format: .pem
  → Download .pem file (SAVE IT! You can't download again)

# Network settings:
○ Create security group
  Security group name: zalo-chat-server-sg
  Description: Allow HTTP, HTTPS, SSH
  
  Inbound rules:
    Type: SSH, Source: My IP (your current IP)
    Type: HTTP, Source: Anywhere (0.0.0.0/0)
    Type: HTTPS, Source: Anywhere (0.0.0.0/0)
    Type: Custom TCP, Port: 3000, Source: Anywhere (for testing)

# Configure storage:
8 GB gp3 (Free tier includes 30 GB)

# Launch instance (takes 1-2 minutes)
```

### 3.2 Connect to EC2

```bash
# On your local machine
# Move the .pem file to ~/.ssh/
mv ~/Downloads/zalo-chat-key.pem ~/.ssh/
chmod 400 ~/.ssh/zalo-chat-key.pem

# Get EC2 public IP from AWS Console → EC2 → Instances
# Example: 54.251.123.45

# SSH into EC2
ssh -i ~/.ssh/zalo-chat-key.pem ubuntu@54.251.123.45

# You should see:
# ubuntu@ip-172-31-x-x:~$
```

### 3.3 Install Dependencies on EC2

```bash
# Now you're inside EC2 instance

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install build tools
sudo apt-get install -y build-essential

# Install Git
sudo apt-get install -y git

# Install PM2 (process manager)
sudo npm install -g pm2

# Install Redis
sudo apt-get install -y redis-server

# Configure Redis
sudo nano /etc/redis/redis.conf
# Find line: bind 127.0.0.1 ::1
# Keep as is (only local access)
# Find line: requirepass
# Uncomment and set password: requirepass your_redis_password_here
# Save: Ctrl+X, Y, Enter

# Restart Redis
sudo systemctl restart redis-server
sudo systemctl enable redis-server

# Test Redis
redis-cli
> AUTH your_redis_password_here
> PING
# Should return: PONG
> exit

# Install PostgreSQL client (for testing connection to RDS)
sudo apt-get install -y postgresql-client

# Verify installations
node --version   # v20.x.x
npm --version    # 10.x.x
git --version    # 2.x.x
pm2 --version    # 5.x.x
redis-cli --version  # 7.x.x
psql --version   # 14.x.x
```

---

## 🔗 STEP 4: SETUP RDS CONNECTION (30 minutes)

### 4.1 Test RDS Connection from EC2

```bash
# Still on EC2 instance

# Test connection to RDS
psql -h zalo-chat-db.xxxxx.ap-southeast-1.rds.amazonaws.com \
     -U postgres \
     -d zalo_chat

# Enter password when prompted
# If successful, you'll see: zalo_chat=>

# Test query
SELECT version();
# Should show PostgreSQL version

# Exit
\q
```

**If connection fails:**
```bash
# Check RDS security group
# AWS Console → RDS → Databases → zalo-chat-db → Connectivity & security

# Inbound rules should include:
# Type: PostgreSQL, Port: 5432, Source: 0.0.0.0/0 (anywhere)

# To fix:
# Click on VPC security group → Edit inbound rules → Add rule
# Type: PostgreSQL
# Source: Custom, 0.0.0.0/0
# Save rules
```

### 4.2 Create Environment Variables File

```bash
# On EC2, create project directory
mkdir -p ~/zalo_backend
cd ~/zalo_backend

# Create .env.production file
nano .env.production

# Paste this (replace with your actual values):
```

```bash
# Database
DATABASE_URL="postgresql://postgres:YOUR_RDS_PASSWORD@zalo-chat-db.xxxxx.ap-southeast-1.rds.amazonaws.com:5432/zalo_chat?schema=public&connection_limit=5"

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password_here

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# App
NODE_ENV=production
PORT=3000
FRONTEND_URL=http://54.251.123.45:3000

# AWS S3 (will setup later)
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET=zalo-chat-media
AWS_ACCESS_KEY_ID=your-key-id
AWS_SECRET_ACCESS_KEY=your-secret-key

# SQS (will setup later)
AWS_SQS_MEDIA_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/xxx/media-processing
AWS_SQS_NOTIFICATION_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/xxx/notifications

# Save: Ctrl+X, Y, Enter
```

---

## 📦 STEP 5: DEPLOY YOUR APP (2 hours)

### 5.1 Push Code to GitHub (if not already)

```bash
# On your LOCAL machine (not EC2)
cd /path/to/your/zalo_backend

# Create .gitignore
echo "node_modules
.env*
dist
.DS_Store" > .gitignore

# Initialize git (if not already)
git init
git add .
git commit -m "Initial commit"

# Create GitHub repo
# Go to: https://github.com/new
# Name: zalo_backend
# Public or Private
# Don't initialize with README

# Add remote and push
git remote add origin https://github.com/YOUR_USERNAME/zalo_backend.git
git branch -M main
git push -u origin main
```

### 5.2 Clone and Build on EC2

```bash
# Back on EC2 instance
cd ~/zalo_backend

# Clone your repo
git clone https://github.com/YOUR_USERNAME/zalo_backend.git .

# Install dependencies
npm install

# Build app
npm run build

# Run Prisma migrations
npx dotenv -e .env.production -- npx prisma migrate deploy

# Generate Prisma client
npx dotenv -e .env.production -- npx prisma generate

# Test app manually
npx dotenv -e .env.production -- npm run start:prod

# If successful, you'll see:
# Nest application successfully started

# Test in browser: http://54.251.123.45:3000
# Should see: {"message": "Hello World"} or similar

# Stop app: Ctrl+C
```

### 5.3 Setup PM2 for Production

```bash
# Create PM2 ecosystem file
nano ecosystem.config.js
```

```javascript
module.exports = {
  apps: [{
    name: 'zalo-backend',
    script: 'dist/main.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env_production: {
      NODE_ENV: 'production',
    },
    env_file: '.env.production',
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
  }]
};
```

```bash
# Save: Ctrl+X, Y, Enter

# Create logs directory
mkdir -p logs

# Start app with PM2
pm2 start ecosystem.config.js --env production

# Check status
pm2 status
# Should show: online

# View logs
pm2 logs zalo-backend

# Setup PM2 to start on boot
pm2 startup
# Copy-paste the command it outputs (starts with sudo)
pm2 save
```

**Test again:**
```bash
curl http://localhost:3000
# Should return JSON response

# From your local machine:
curl http://54.251.123.45:3000
# Should also work
```

---

## 📤 STEP 6: S3 SETUP FOR MEDIA (45 minutes)

### 6.1 Create S3 Bucket

```bash
# AWS Console → S3 → Create bucket

Bucket name: zalo-chat-media-YOUR_NAME (must be globally unique)
Region: ap-southeast-1

# Block Public Access settings:
☑ Block all public access (we'll use presigned URLs)

# Bucket Versioning:
○ Disable (to save cost)

# Encryption:
Encryption type: Server-side encryption with Amazon S3 managed keys (SSE-S3)

# Create bucket
```

### 6.2 Setup Bucket Lifecycle Policy

```bash
# In S3 bucket → Management → Create lifecycle rule

Rule name: delete-temp-uploads
Rule scope: ○ Limit scope using one or more filters
  Prefix: uploads/temp/

# Lifecycle rule actions:
☑ Expire current versions of objects
Days after object creation: 1

# Create rule
```

### 6.3 Create IAM User for S3 Access

```bash
# AWS Console → IAM → Users → Add user

User name: zalo-s3-uploader
Access type: ☑ Programmatic access

# Permissions:
Attach existing policies directly:
  ☑ AmazonS3FullAccess (we'll restrict later)

# Create user
# Download CSV with credentials
```

### 6.4 Update .env.production on EC2

```bash
# SSH into EC2
ssh -i ~/.ssh/zalo-chat-key.pem ubuntu@54.251.123.45

cd ~/zalo_backend
nano .env.production

# Update these lines:
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET=zalo-chat-media-YOUR_NAME
AWS_ACCESS_KEY_ID=AKIA... (from CSV)
AWS_SECRET_ACCESS_KEY=... (from CSV)

# Save and restart app
pm2 restart zalo-backend
```

**Test S3 upload:**
```bash
# Create test file
echo "test" > test.txt

# Upload with AWS CLI
aws s3 cp test.txt s3://zalo-chat-media-YOUR_NAME/test.txt

# List files
aws s3 ls s3://zalo-chat-media-YOUR_NAME/

# Should show: test.txt

# Delete test file
aws s3 rm s3://zalo-chat-media-YOUR_NAME/test.txt
```

---

## 📨 STEP 7: SQS SETUP (30 minutes)

### 7.1 Create SQS Queues

```bash
# AWS Console → SQS → Create queue

# Queue 1: Media Processing
Name: media-processing.fifo
Type: FIFO (First-In-First-Out)
Configuration:
  Visibility timeout: 300 seconds (5 minutes)
  Message retention period: 4 days
  Receive message wait time: 20 seconds (long polling)
  Content-based deduplication: ☑ Enabled

# Create queue
# Copy Queue URL: https://sqs.ap-southeast-1.amazonaws.com/123456789012/media-processing.fifo

# Queue 2: Notifications
Name: notifications.fifo
Type: FIFO
Configuration: (same as above)

# Create queue
# Copy Queue URL
```

### 7.2 Create Dead Letter Queues

```bash
# Create DLQ for media-processing
Name: media-processing-dlq.fifo
Type: FIFO
# Create queue

# Edit media-processing.fifo queue
# → Dead-letter queue → Edit
# ☑ Enabled
# Choose queue: media-processing-dlq.fifo
# Maximum receives: 3

# Repeat for notifications queue
```

### 7.3 Grant EC2 Access to SQS

```bash
# Option A: Add SQS permissions to IAM user (simple)
# IAM → Users → chat-app-deployer → Add permissions
# Attach policies: AmazonSQSFullAccess

# Option B: EC2 Instance Role (better, but more complex)
# IAM → Roles → Create role
# Trusted entity: AWS service → EC2
# Permissions: AmazonSQSFullAccess
# Role name: zalo-ec2-sqs-role
# Attach to EC2: EC2 → Instances → Actions → Security → Modify IAM role
```

### 7.4 Update .env.production

```bash
# On EC2
nano ~/zalo_backend/.env.production

# Add SQS URLs:
AWS_SQS_MEDIA_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/123456789012/media-processing.fifo
AWS_SQS_NOTIFICATION_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/123456789012/notifications.fifo

# Save and restart
pm2 restart zalo-backend
```

---

## 🔒 STEP 8: SSL CERTIFICATE (Optional, 1 hour)

### 8.1 Buy Domain (Optional)

```bash
# Option 1: Use Namecheap, GoDaddy, etc.
# Example: mychatapp.com ($10-15/year)

# Option 2: Use free subdomain
# freedns.afraid.org
# Register: mychatapp.freedns.org
```

### 8.2 Point Domain to EC2

```bash
# In domain registrar:
# Add A record:
#   Host: @ (or mychatapp)
#   Points to: 54.251.123.45 (your EC2 public IP)
#   TTL: 300

# Wait 5-10 minutes for DNS propagation
# Test: ping mychatapp.com
```

### 8.3 Install Nginx + Certbot

```bash
# On EC2
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Configure Nginx
sudo nano /etc/nginx/sites-available/zalo-chat

# Paste this config:
```

```nginx
server {
    listen 80;
    server_name mychatapp.com www.mychatapp.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /socket.io {
        proxy_pass http://localhost:3000/socket.io;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Save and enable site
sudo ln -s /etc/nginx/sites-available/zalo-chat /etc/nginx/sites-enabled/
sudo nginx -t  # Test config
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d mychatapp.com -d www.mychatapp.com

# Follow prompts:
# Enter email
# Agree to ToS
# Redirect HTTP to HTTPS: Yes

# Certificate auto-renews every 90 days
# Test renewal: sudo certbot renew --dry-run
```

---

## ✅ STEP 9: TESTING & VERIFICATION

### 9.1 Health Checks

```bash
# Test HTTP API
curl http://mychatapp.com/health
# Or: curl http://54.251.123.45:3000/health

# Test WebSocket
# Use tool: https://websocket.org/echo.html
# Connect to: wss://mychatapp.com/socket.io/?EIO=4&transport=websocket

# Test database connection
# SSH to EC2
pm2 logs zalo-backend
# Should not show database errors

# Test Redis connection
redis-cli
AUTH your_redis_password_here
PING  # Should return PONG
exit

# Test S3 upload (from app)
# Upload an image via your app
# Check S3 bucket: aws s3 ls s3://zalo-chat-media-YOUR_NAME/

# Test SQS (from app)
# Send a message with media
# Check CloudWatch: SQS → media-processing.fifo → Monitoring
# Should see messages sent/received
```

### 9.2 Monitor Logs

```bash
# App logs
pm2 logs zalo-backend

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Redis logs
sudo journalctl -u redis-server -f

# System logs
sudo journalctl -f
```

---

## 🚨 TROUBLESHOOTING

### App won't start

```bash
# Check PM2 logs
pm2 logs zalo-backend --lines 100

# Common issues:
# 1. Database connection failed
#    → Check DATABASE_URL in .env.production
#    → Test: psql -h RDS_ENDPOINT -U postgres -d zalo_chat

# 2. Redis connection failed
#    → Check Redis is running: sudo systemctl status redis-server
#    → Test: redis-cli -a your_redis_password PING

# 3. Port 3000 already in use
#    → Check: sudo lsof -i :3000
#    → Kill process: sudo kill -9 PID

# 4. Out of memory
#    → Check: free -h
#    → Upgrade instance: t2.micro → t3.medium
```

### Can't connect from browser

```bash
# Check security group allows port 3000
# EC2 → Instances → zalo-chat-server → Security → Security groups
# Inbound rules should have: Custom TCP, Port 3000, Source 0.0.0.0/0

# Check app is listening
sudo netstat -tulpn | grep 3000
# Should show: LISTEN on 0.0.0.0:3000

# Check firewall (should be disabled by default on Ubuntu)
sudo ufw status
# If active: sudo ufw allow 3000/tcp
```

### S3 upload fails

```bash
# Check IAM credentials
aws s3 ls
# Should list buckets

# Check bucket exists
aws s3 ls s3://zalo-chat-media-YOUR_NAME
# Should not error

# Check app has correct AWS_ACCESS_KEY_ID in .env.production
grep AWS_ACCESS_KEY_ID ~/zalo_backend/.env.production
```

---

## 💰 COST MONITORING

### Setup Budget Alert

```bash
# AWS Console → Billing → Budgets → Create budget

Budget type: Cost budget
Name: Monthly-Budget
Amount: $40
Alert threshold: 80% ($32)
Email: your@email.com

# Create budget
```

### Daily Cost Check

```bash
# AWS Console → Billing → Bills
# Check current month-to-date charges

# Expected costs (month 1):
# EC2 t2.micro: $0 (free tier)
# RDS db.t3.micro: $0 (free tier)
# S3: ~$2-5
# Data transfer: ~$5-10
# CloudWatch: ~$2
# Total: ~$10-15/month
```

---

## 🔄 DEPLOYMENT WORKFLOW (For Updates)

```bash
# On LOCAL machine:
# 1. Make code changes
git add .
git commit -m "Fix bug"
git push origin main

# 2. SSH to EC2
ssh -i ~/.ssh/zalo-chat-key.pem ubuntu@54.251.123.45

# 3. Pull latest code
cd ~/zalo_backend
git pull origin main

# 4. Rebuild
npm install  # Only if package.json changed
npm run build

# 5. Run migrations (if schema changed)
npx dotenv -e .env.production -- npx prisma migrate deploy

# 6. Restart app
pm2 restart zalo-backend

# 7. Check logs
pm2 logs zalo-backend --lines 50
```

---

## 🎓 LEARNING RESOURCES

- **AWS Free Tier**: https://aws.amazon.com/free/
- **EC2 Tutorial**: https://docs.aws.amazon.com/ec2/
- **RDS Tutorial**: https://docs.aws.amazon.com/rds/
- **S3 Tutorial**: https://docs.aws.amazon.com/s3/
- **PM2 Docs**: https://pm2.keymetrics.io/docs/usage/quick-start/
- **Nginx Tutorial**: https://nginx.org/en/docs/beginners_guide.html

---

## ✅ FINAL CHECKLIST

**Before going live:**

- [ ] AWS account created with billing alerts
- [ ] IAM user created (not using root)
- [ ] RDS instance running and accessible
- [ ] EC2 instance running with all dependencies
- [ ] App deployed and running via PM2
- [ ] Redis installed and password-protected
- [ ] S3 bucket created with lifecycle rules
- [ ] SQS queues created with DLQs
- [ ] SSL certificate installed (if using domain)
- [ ] Logs monitored (PM2 logs, CloudWatch)
- [ ] Backup strategy documented
- [ ] Team has access to AWS console
- [ ] All passwords stored in password manager
- [ ] Cost monitoring dashboard setup

**You're ready to go! 🚀**

---

**Need Help?**
- AWS Support: https://console.aws.amazon.com/support/
- NestJS Discord: https://discord.gg/nestjs
- Stack Overflow: Tag questions with `aws`, `nestjs`, `deployment`
