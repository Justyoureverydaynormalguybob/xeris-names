# Deployment Guide - XRS Names

## Quick Deploy Options

### 1. Railway (Recommended for SQLite)

**Step 1:** Create Railway account at railway.app

**Step 2:** Click "New Project" → "Deploy from GitHub repo"

**Step 3:** Select your xrs-names repository

**Step 4:** Railway auto-detects Node.js and runs `npm install && npm start`

**Step 5:** Get your public URL: `xrs-names.railway.app`

**That's it!** SQLite works perfectly on Railway.

#### Custom Domain (Optional)
- Go to Settings → Domains
- Add your custom domain
- Update DNS records

---

### 2. Vercel (Requires Database Change)

Vercel doesn't support SQLite files well. Use Vercel KV instead:

**Step 1:** Install Vercel CLI
```bash
npm i -g vercel
```

**Step 2:** Create `vercel.json`
```json
{
  "version": 2,
  "builds": [
    {
      "src": "server.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "server.js"
    }
  ]
}
```

**Step 3:** Deploy
```bash
vercel
```

**Note:** For production on Vercel, migrate to Vercel KV or PostgreSQL.

---

### 3. VPS / DigitalOcean (Full Control)

**Step 1:** SSH into your server
```bash
ssh user@your-server-ip
```

**Step 2:** Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Step 3:** Clone your repo
```bash
git clone https://github.com/yourusername/xrs-names.git
cd xrs-names
npm install
```

**Step 4:** Install PM2 for process management
```bash
sudo npm install -g pm2
pm2 start server.js --name xrs-names
pm2 save
pm2 startup
```

**Step 5:** Configure Nginx reverse proxy
```nginx
server {
    listen 80;
    server_name xrs-names.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Step 6:** Enable SSL with Let's Encrypt
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d xrs-names.your-domain.com
```

---

### 4. Termux (Android Development)

Perfect for testing and local development:

**Step 1:** Install Node.js in Termux
```bash
pkg install nodejs
```

**Step 2:** Clone and run
```bash
cd ~/xrs-names
npm install
npm start
```

**Access locally:** `http://localhost:3000`

**Make accessible on local network:**
```bash
# Get your phone's IP
ifconfig

# Start server on all interfaces
PORT=3000 node server.js
```

**Access from other devices:** `http://your-phone-ip:3000`

---

## Database Options

### SQLite (Default)
✅ Simple, no setup required  
✅ Works great for small-medium deployments  
✅ Perfect for Railway/VPS  
❌ Not ideal for Vercel  

### PostgreSQL (Production)
✅ Scales well  
✅ Works on all platforms  
✅ Better for high traffic  

**Railway PostgreSQL:**
1. Add PostgreSQL plugin in Railway
2. Copy DATABASE_URL
3. Update `server.js` to use Postgres
4. Run migrations

**Vercel Postgres:**
1. Go to Storage → Create Database → Postgres
2. Copy connection string
3. Update code to use Vercel Postgres SDK

---

## Post-Deployment Checklist

- [ ] Test all API endpoints
- [ ] Verify database is persisting
- [ ] Check CORS settings
- [ ] Add custom domain (optional)
- [ ] Enable SSL certificate
- [ ] Set up monitoring
- [ ] Configure backups
- [ ] Add to Xeris ecosystem docs

---

## Update Deployment

### Railway
```bash
git push origin main
# Railway auto-deploys
```

### Vercel
```bash
vercel --prod
```

### VPS
```bash
ssh user@server
cd xrs-names
git pull
npm install
pm2 restart xrs-names
```

---

## Environment Variables

Set these in your deployment platform:

```
PORT=3000
NODE_ENV=production
DATABASE_URL=your-db-url (if using Postgres)
```

---

## Monitoring

### Railway
Built-in metrics and logs in dashboard

### PM2 (VPS)
```bash
pm2 logs xrs-names
pm2 monit
pm2 status
```

### Uptime Monitoring
Add to UptimeRobot or similar service to monitor availability

---

## Backup Strategy

### SQLite
```bash
# Automated daily backup
0 2 * * * cp /path/to/xrs-names.db /backups/xrs-names-$(date +\%Y\%m\%d).db
```

### PostgreSQL
```bash
# Automated backup
pg_dump DATABASE_URL > backup.sql
```

---

## Scaling Considerations

**Under 1000 names:** SQLite is perfect  
**1000-10000 names:** SQLite still fine, consider Postgres  
**10000+ names:** Use Postgres + caching  

**High traffic:** Add Redis for caching resolved names

---

## Support

Questions? Check:
- README.md for setup
- INTEGRATION.md for code examples
- GitHub issues for common problems

---

## Quick Commands Reference

```bash
# Development
npm install      # Install dependencies
npm start        # Start server
npm run dev      # Development mode

# Testing
bash test-api.sh # Test all endpoints

# Deployment
git push         # Auto-deploy (Railway)
vercel --prod    # Deploy to Vercel
pm2 restart all  # Restart on VPS
```
