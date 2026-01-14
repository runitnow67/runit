# Phase 9 Deployment Checklist

## 🔧 Pre-Deployment

### Server (Render)
- [ ] Update `package.json` with new dependencies
- [ ] Run `npm install` to install security packages
- [ ] Test rate limiting locally
- [ ] Verify security logging works
- [ ] Deploy to Render
- [ ] Verify server starts without errors
- [ ] Check logs for security event formatting

### Provider
- [ ] Rebuild Docker image with security hardening
  ```bash
  cd provider
  docker build -t runit-jupyter docker/
  ```
- [ ] Test container starts with non-root user
- [ ] Verify resource limits are applied
- [ ] Test read-only filesystem protection
- [ ] Create `workspace/` directory
- [ ] Test provider agent registration

### Testing
- [ ] Run security test suite: `./test_security.sh`
- [ ] Verify rate limiting blocks after limit
- [ ] Test invalid provider URL rejection
- [ ] Verify session locking works
- [ ] Test container isolation
- [ ] Check resource limits with `docker stats`

## 🚀 Deployment Steps

### 1. Deploy Server to Render

```bash
cd server
npm install
git add .
git commit -m "Phase 9: Security hardening"
git push origin main
```

**Render will auto-deploy**. Monitor logs for:
- ✅ `RUNIT server listening on port 10000`
- ✅ No startup errors

### 2. Update Provider

```bash
cd provider

# Rebuild image
docker build -t runit-jupyter docker/

# Test locally first
mkdir -p workspace
python3 provider_agent.py
```

**Expected output:**
```
[agent] checking docker image: runit-jupyter
[agent] docker image exists
[agent] workspace directory: /path/to/workspace
[agent] starting dockerized jupyter...
[docker] Running as: jupyteruser
[agent] token detected: abc123...
[agent] starting cloudflared...
[agent] detected public URL: https://xyz.trycloudflare.com
=== SESSION READY ===
[agent] session registered: <uuid>
```

### 3. Verify Security Features

**Test 1: Rate Limiting**
```bash
./test_security.sh
```
Look for: `❌ RATE LIMITED (expected after 10 requests)`

**Test 2: Container Isolation**
```bash
docker exec runit-session whoami
# Expected: jupyteruser (not root)

docker exec runit-session touch /etc/test
# Expected: Read-only file system error
```

**Test 3: Session Locking**
- Open renter.html
- Connect to a session
- Try to access the same session from another browser
- Expected: "Session already in use"

**Test 4: IP Hijacking Protection**
- Connect from IP A
- Send heartbeat from IP B (using proxy/VPN)
- Expected: "IP mismatch - access denied" in logs

### 4. Monitor Security Events

**Server logs (Render dashboard):**
```
[SECURITY] ... - NEW_PROVIDER_REGISTERED: { providerId: '...', ip: '...' }
[SECURITY] ... - SESSION_LOCKED: { sessionId: '...', ip: '...' }
[SECURITY] ... - INVALID_ACCESS_ATTEMPT: { ip: '...', accessToken: '...' }
```

**Provider logs:**
```
[agent] session registered: <sessionId>
[agent] heartbeat updated for: <sessionId>
[agent] container activity detected
```

## 🔍 Post-Deployment Verification

### Server Health
- [ ] https://runit-p5ah.onrender.com/ returns "RUNIT control plane running ✅"
- [ ] Rate limiting is enforced
- [ ] Security headers present (check browser DevTools)
- [ ] CORS working for renter.html

### Provider Health
- [ ] Docker container starts successfully
- [ ] Non-root user verified
- [ ] Resource limits applied
- [ ] Heartbeats sending every 30s
- [ ] Session appears in `/renter/sessions`

### End-to-End Flow
- [ ] Provider registers session
- [ ] Session appears in renter.html
- [ ] Click "Connect" redirects to Jupyter
- [ ] Session locks on first access
- [ ] Second access blocked (409 error)
- [ ] Heartbeats keep session alive
- [ ] Auto-unlock after heartbeat timeout
- [ ] Idle timeout shuts down container

## 🚨 Common Issues

### Issue: "Rate limit exceeded"
**Cause:** Too many requests from same IP  
**Fix:** Wait 15 minutes or restart server to reset

### Issue: "Invalid or expired token"
**Cause:** Access token not found or session removed  
**Fix:** Create new session from provider

### Issue: "Session already in use"
**Cause:** Session locked by another renter  
**Fix:** Wait 60s for auto-unlock or provider restart

### Issue: Docker container won't start
**Cause:** Workspace directory missing  
**Fix:** `mkdir -p provider/workspace`

**Cause:** Resource limits too high for host  
**Fix:** Reduce `--memory` or `--cpus` in provider_agent.py

### Issue: "Read-only file system" in Jupyter
**Expected behavior!** Root is read-only for security.  
**Workaround:** Save files to `/workspace` (mounted and writable)

### Issue: "IP mismatch - access denied"
**Cause:** IP changed mid-session (VPN, proxy, mobile network)  
**Fix:** Release session and reconnect

## 📊 Metrics to Track

### Security Metrics
- Invalid access attempts per hour
- Session hijack attempts per day
- Rate limit hits per hour
- Bandwidth violations per day
- Provider URL validation failures

### Performance Metrics
- Average session lock time
- Heartbeat success rate
- Container startup time
- Idle timeout efficiency

### Business Metrics
- Active providers
- Total sessions created
- Average session duration
- Bandwidth usage per provider

## 🎯 Success Criteria

Phase 9 is successfully deployed when:

✅ **Rate limiting** blocks excessive requests  
✅ **Session hijacking** prevented via IP tracking  
✅ **Container isolation** enforced (non-root, read-only)  
✅ **Resource limits** applied (CPU, RAM, PIDs)  
✅ **Bandwidth monitoring** tracks and limits usage  
✅ **Security logging** captures all events  
✅ **End-to-end flow** works without errors  
✅ **Auto-recovery** handles failures gracefully

## 🔮 Next Steps (Phase 10)

After Phase 9 is stable:

1. **Dashboard** - Real-time security metrics visualization
2. **Alerting** - Webhook notifications for security events
3. **Billing** - Usage tracking with bandwidth-based pricing
4. **Auth** - OAuth2, API keys, user accounts
5. **Persistence** - Database for audit logs
6. **Scaling** - Auto-scaling provider pools

## 📚 Documentation

- [PHASE9_SECURITY.md](PHASE9_SECURITY.md) - Complete security documentation
- [README.md](README.md) - Project overview and quick start
- [test_security.sh](test_security.sh) - Automated security tests

---

**Deployment Date:** ________________  
**Deployed By:** ________________  
**Server URL:** https://runit-p5ah.onrender.com  
**Status:** ☐ Pending ☐ In Progress ☑️ Complete
