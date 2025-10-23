#!/bin/bash

echo "Building project with ES module fix..."
npm run build

echo "Adding changes to git..."
git add .

echo "Committing changes..."
git commit -m "CRITICAL FIX: Resolve 'require is not defined' ES module error"

echo "Deploying to fiken-ai Heroku app..."
git push heroku master

echo "Deployment complete!"
echo ""
echo "The 'require is not defined' error should now be resolved."
echo "MCP tool execution should work properly now."
