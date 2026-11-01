#!/bin/bash

# Exit immediately if any command fails
set -e

BRANCH="develop"

echo "🚀 Starting 100% Local Docker Deployment..."

# 1. Ensure we are in the correct directory
cd "$(dirname "$0")"

# 2. Check local branch
echo "📦 Checking local Git status..."
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    echo "❌ Error: You are on branch '$CURRENT_BRANCH'. Switch to '$BRANCH' before building."
    exit 1
fi

# 3. Compile and launch the local containers on your Mac
echo "🐋 Building and launching local Docker containers..."
docker compose up -d --build

# 4. Verify the local endpoints on your MacBook
echo "🔍 Running local deployment verification matrix..."
echo "------------------------------------------------"
printf 'Local Active Commit HEAD = ' && git rev-parse --short HEAD
printf 'Local App Health Check   = ' && curl -sS http://localhost:8080/healthz || echo "Failed to connect to local app"
printf '\nLocal Recipes Service    = ' && curl -sS http://localhost:8080/api/recipes/healthz || echo "Failed to connect to local recipes"
printf '\nLocal Nutrition Service  = ' && curl -sS http://localhost:8080/api/nutrition/healthz || echo "Failed to connect to local nutrition"
printf '\n'
echo "------------------------------------------------"

echo "🎉 Local deployment completed successfully! Your remote server was not touched."

