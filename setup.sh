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
echo "  1. Edit server/.env and add your OPENAI_API_KEY and ANTHROPIC_API_KEY"
echo "  2. In one terminal: cd server && npm run dev"
echo "  3. In another terminal: cd client && npm run dev"
echo "  4. Open http://localhost:5173"
