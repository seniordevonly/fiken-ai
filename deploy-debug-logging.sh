#!/bin/bash

echo "Building project with enhanced logging debug..."
npm run build

echo "Adding changes to git..."
git add .

echo "Committing changes..."
git commit -m "Add enhanced logging debug with fallback directories and debug file creation"

echo "Deploying to fiken-ai Heroku app..."
git push heroku master

echo "Deployment complete!"
echo ""
echo "After running the tool, check for debug information:"
echo "  heroku run 'cat /tmp/debug-handleGetPurchases.json' -a fiken-ai"
echo "  heroku run 'ls -la /tmp/' -a fiken-ai"
echo "  heroku run 'ls -la /tmp/fiken-logs/' -a fiken-ai"
