#!/bin/bash
# XRS Names API Test Script
# Run this after starting the server to verify everything works

API_URL="http://localhost:3000/api"

echo "🧪 Testing XRS Names API..."
echo ""

# Test 1: Health check
echo "1️⃣ Health Check"
curl -s "$API_URL/health" | json_pp
echo ""

# Test 2: Check name availability
echo "2️⃣ Check Availability - alice"
curl -s "$API_URL/check/alice" | json_pp
echo ""

# Test 3: Register a name
echo "3️⃣ Register Name - alice.xrs"
curl -s -X POST "$API_URL/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "alice",
    "address": "Xrs7d1e4f9c8b3a2d1e0f9c8b7a6d5e4f3c2b1a0z9y8x7w6v5u4t3s2r1q0p9o8n7m6k5j4i3h2g1f0",
    "metadata": {"description": "Alice test account"}
  }' | json_pp
echo ""

# Test 4: Check availability again (should be taken)
echo "4️⃣ Check Availability Again - alice (should be taken)"
curl -s "$API_URL/check/alice" | json_pp
echo ""

# Test 5: Resolve name
echo "5️⃣ Resolve Name - alice.xrs"
curl -s "$API_URL/resolve/alice" | json_pp
echo ""

# Test 6: Reverse lookup
echo "6️⃣ Reverse Lookup - Find names for address"
curl -s "$API_URL/reverse/Xrs7d1e4f9c8b3a2d1e0f9c8b7a6d5e4f3c2b1a0z9y8x7w6v5u4t3s2r1q0p9o8n7m6k5j4i3h2g1f0" | json_pp
echo ""

# Test 7: Register another name
echo "7️⃣ Register Another Name - bob.xrs"
curl -s -X POST "$API_URL/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "bob",
    "address": "XrsABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890"
  }' | json_pp
echo ""

# Test 8: Search names
echo "8️⃣ Search Names - 'al'"
curl -s "$API_URL/search?q=al&limit=5" | json_pp
echo ""

# Test 9: Recent registrations
echo "9️⃣ Recent Registrations"
curl -s "$API_URL/recent?limit=5" | json_pp
echo ""

# Test 10: Stats
echo "🔟 Service Stats"
curl -s "$API_URL/stats" | json_pp
echo ""

echo "✅ Tests Complete!"
echo ""
echo "Try the web UI: http://localhost:3000"
