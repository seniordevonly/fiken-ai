#!/bin/bash

echo "Building project with direct file logging..."
npm run build

echo "Adding changes to git..."
git add .

echo "Committing changes..."
git commit -m "Add direct file logging to bypass Winston complexity"

echo "Deploying to fiken-ai Heroku app..."
git push heroku master

echo "Deployment complete!"
echo ""
echo "After running the tool, check for logs:"
echo "  heroku run 'cat /tmp/debug-handleGetPurchases.json' -a fiken-ai"
echo "  heroku run 'cat /tmp/fiken-mcp-direct.log' -a fiken-ai"
echo "  heroku run 'ls -la /tmp/' -a fiken-ai"
