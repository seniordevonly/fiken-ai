#!/bin/bash

echo "Building project for fiken-ai-demo deployment..."
npm run build

echo "Adding changes to git..."
git add .

echo "Committing changes..."
git commit -m "Deploy logging fixes to fiken-ai-demo with stderr debug logging"

echo "Deploying to fiken-ai-demo Heroku app..."
git push heroku-demo master

echo "Deployment to fiken-ai-demo complete!"
echo ""
echo "To test the logging, run the tool and check logs:"
echo "  heroku logs --tail -a fiken-ai-demo"
echo ""
echo "Look for [FIKEN-MCP-DEBUG] messages in the log stream."
