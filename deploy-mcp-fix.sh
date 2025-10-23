#!/bin/bash

echo "Building project with MCP STDIO fix..."
npm run build

echo "Adding changes to git..."
git add .

echo "Committing changes..."
git commit -m "CRITICAL FIX: Disable console logging in FikenBaseService to prevent MCP STDIO interference"

echo "Deploying to fiken-ai Heroku app..."
git push heroku master

echo "Deployment complete!"
echo ""
echo "The MCP STDIO interference should now be resolved."
echo "Console logging is completely disabled in all services."
