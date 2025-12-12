#!/bin/bash

set -e

echo "🚀 Next.js Self-Hosted Deployment Manager - Installation Script"
echo "================================================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed (v2 syntax)
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env file created"
    echo ""
    echo "⚠️  Please edit .env file and configure:"
    echo "   - PROJECTS_BASE_DIR (default: /srv/vps/websites)"
    echo "   - GITHUB_TOKEN (if you have private repos)"
    echo "   - DB_PASSWORD (for database projects)"
    echo ""
    read -p "Press Enter to continue after editing .env file..."
else
    echo "✅ .env file already exists"
fi

# Create projects directory if it doesn't exist
PROJECTS_DIR=$(grep PROJECTS_BASE_DIR .env | cut -d '=' -f2 | tr -d '"' || echo "/srv/vps/websites")
if [ -z "$PROJECTS_DIR" ]; then
    PROJECTS_DIR="/srv/vps/websites"
fi

echo "📁 Projects will be stored in: $PROJECTS_DIR"
echo ""

# Create data directory for port registry
mkdir -p data
echo "✅ Created data directory"

# Build and start the container
echo ""
echo "🔨 Building Docker image..."
docker compose build

echo ""
echo "🚀 Starting deployment manager..."
docker compose up -d

echo ""
echo "✅ Installation complete!"
echo ""
echo "📋 Next steps:"
echo "   1. The deployment manager is running on: http://localhost:${PORT:-3000}"
echo "   2. Open the web interface in your browser"
echo "   3. Start creating and deploying projects!"
echo ""
echo "📝 Useful commands:"
echo "   - View logs: docker compose logs -f"
echo "   - Stop: docker compose stop"
echo "   - Start: docker compose start"
echo "   - Restart: docker compose restart"
echo "   - Remove: docker compose down"
echo ""

