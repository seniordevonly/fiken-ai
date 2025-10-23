#!/bin/bash

echo "Building project with enhanced trace logging..."
npm run build

echo "Adding changes to git..."
git add .

echo "Committing changes..."
git commit -m "Add comprehensive trace logging to debug tool execution"

echo "Deploying to fiken-ai Heroku app..."
git push heroku master

echo "Deployment complete!"
echo ""
echo "After running the tool, check for trace files:"
echo "  heroku run 'ls -la /tmp/' -a fiken-ai"
echo "  heroku run 'cat /tmp/trace-tool-handler.txt' -a fiken-ai"
echo "  heroku run 'cat /tmp/trace-method-called.txt' -a fiken-ai"
echo "  heroku run 'cat /tmp/debug-handleGetPurchases.json' -a fiken-ai"
echo "  heroku run 'cat /tmp/fiken-mcp-direct.log' -a fiken-ai"
