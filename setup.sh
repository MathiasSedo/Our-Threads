#!/bin/bash
set -e

echo "Setting up Our Threads..."

# Server
cd server
cp -n .env.example .env 2>/dev/null || true
npm install
cd ..

# Client
cd client
npm install
cd ..

echo ""
echo "Done. Next steps:"
echo ""
echo "  1. In one terminal: cd server && npm run dev"
echo "  2. In another terminal: cd client && npm run dev"
echo "  3. Open http://localhost:5173"
