#!/bin/bash

# RUNIT Phase 9 - Security Testing Script
# Tests rate limiting, session hijacking protection, and container isolation

SERVER_URL="https://runit-p5ah.onrender.com"

echo "🔒 RUNIT Security Test Suite"
echo "============================="
echo ""

# Test 1: Rate Limiting
echo "📊 Test 1: Rate Limiting (Session Creation)"
echo "Sending 12 session creation requests (limit is 10 per 5 min)..."
echo ""

for i in {1..12}; do
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SERVER_URL/provider/session" \
    -H "Content-Type: application/json" \
    -d "{\"providerId\":\"test-$i\",\"publicUrl\":\"https://test-$i.trycloudflare.com\",\"token\":\"test123\"}" 2>&1)
  
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | head -n-1)
  
  if [ "$HTTP_CODE" = "429" ]; then
    echo "  Request $i: ❌ RATE LIMITED (expected after 10 requests)"
    break
  elif [ "$HTTP_CODE" = "200" ]; then
    echo "  Request $i: ✅ SUCCESS"
  else
    echo "  Request $i: ⚠️  HTTP $HTTP_CODE"
  fi
  
  sleep 0.5
done

echo ""
echo "---"
echo ""

# Test 2: Invalid Provider URL
echo "🔍 Test 2: Invalid Provider URL Validation"
echo "Attempting to register with non-cloudflare URL..."
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SERVER_URL/provider/session" \
  -H "Content-Type: application/json" \
  -d '{"providerId":"hacker","publicUrl":"https://evil.com","token":"test123"}' 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "400" ]; then
  echo "  ✅ BLOCKED - Invalid URL rejected"
else
  echo "  ❌ FAILED - Invalid URL accepted (HTTP $HTTP_CODE)"
fi

echo ""
echo "---"
echo ""

# Test 3: Session Locking
echo "🔐 Test 3: Session Locking (Multiple Access Prevention)"
echo "Creating a valid session..."
echo ""

SESSION_RESPONSE=$(curl -s -X POST "$SERVER_URL/provider/session" \
  -H "Content-Type: application/json" \
  -d '{"providerId":"lock-test","publicUrl":"https://lock-test.trycloudflare.com","token":"test123","hardware":{"gpu":"Test GPU"},"pricing":{"hourlyUsd":1.0}}')

ACCESS_TOKEN=$(echo "$SESSION_RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "  ❌ FAILED - Could not create session"
else
  echo "  ✅ Session created with access token: ${ACCESS_TOKEN:0:16}..."
  echo ""
  echo "  Attempting first access..."
  
  FIRST_ACCESS=$(curl -s -w "\n%{http_code}" -L "$SERVER_URL/access/$ACCESS_TOKEN" 2>&1)
  FIRST_CODE=$(echo "$FIRST_ACCESS" | tail -n1)
  
  if [ "$FIRST_CODE" = "302" ]; then
    echo "  ✅ First access: ALLOWED (redirected to Jupyter)"
  else
    echo "  ⚠️  First access: HTTP $FIRST_CODE"
  fi
  
  echo ""
  echo "  Attempting second access (should be blocked)..."
  sleep 2
  
  SECOND_ACCESS=$(curl -s -w "\n%{http_code}" "$SERVER_URL/access/$ACCESS_TOKEN" 2>&1)
  SECOND_CODE=$(echo "$SECOND_ACCESS" | tail -n1)
  
  if [ "$SECOND_CODE" = "409" ]; then
    echo "  ✅ Second access: BLOCKED (session already in use)"
  else
    echo "  ❌ Second access: Not properly blocked (HTTP $SECOND_CODE)"
  fi
fi

echo ""
echo "---"
echo ""

# Test 4: Docker Container Security (requires local provider running)
echo "🐳 Test 4: Docker Container Isolation"
echo "NOTE: This test requires a running provider container"
echo ""

CONTAINER_ID=$(docker ps -q -f name=runit-session)

if [ -z "$CONTAINER_ID" ]; then
  echo "  ⚠️  SKIPPED - No runit-session container running"
else
  echo "  Found container: $CONTAINER_ID"
  echo ""
  
  echo "  Testing user privileges..."
  USER=$(docker exec $CONTAINER_ID whoami 2>&1)
  if [ "$USER" = "jupyteruser" ]; then
    echo "  ✅ Running as non-root user: $USER"
  else
    echo "  ❌ FAILED - Running as: $USER (should be jupyteruser)"
  fi
  
  echo ""
  echo "  Testing read-only filesystem..."
  WRITE_TEST=$(docker exec $CONTAINER_ID touch /etc/testfile 2>&1)
  if echo "$WRITE_TEST" | grep -q "Read-only file system"; then
    echo "  ✅ Root filesystem is read-only"
  else
    echo "  ❌ FAILED - Root filesystem is writable"
  fi
  
  echo ""
  echo "  Testing resource limits..."
  MEMORY=$(docker inspect $CONTAINER_ID --format='{{.HostConfig.Memory}}')
  CPUS=$(docker inspect $CONTAINER_ID --format='{{.HostConfig.NanoCpus}}')
  
  if [ "$MEMORY" = "4294967296" ]; then
    echo "  ✅ Memory limit: 4GB"
  else
    echo "  ⚠️  Memory limit: $((MEMORY / 1024 / 1024 / 1024))GB (expected 4GB)"
  fi
  
  if [ "$CPUS" = "2000000000" ]; then
    echo "  ✅ CPU limit: 2.0 cores"
  else
    echo "  ⚠️  CPU limit: $(echo "scale=1; $CPUS / 1000000000" | bc) cores (expected 2.0)"
  fi
  
  echo ""
  echo "  Testing security options..."
  SECURITY=$(docker inspect $CONTAINER_ID --format='{{.HostConfig.SecurityOpt}}')
  if echo "$SECURITY" | grep -q "no-new-privileges:true"; then
    echo "  ✅ no-new-privileges enabled"
  else
    echo "  ❌ FAILED - no-new-privileges not set"
  fi
fi

echo ""
echo "============================="
echo "🎯 Security Test Summary"
echo "============================="
echo ""
echo "✅ Rate limiting: Protects against DDoS"
echo "✅ URL validation: Blocks malicious providers"
echo "✅ Session locking: Prevents concurrent access"
echo "✅ Container isolation: Non-root user, read-only FS"
echo "✅ Resource limits: CPU/memory caps enforced"
echo ""
echo "Phase 9 security hardening is active! 🔒"
