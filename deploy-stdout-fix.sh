#!/bin/bash

echo "Building project with file-only logging solution..."
npm run build

echo "Adding changes to git..."
git add .

echo "Committing changes..."
git commit -m "Implement file-only logging solution - no I/O interference with MCP"

echo "Setting environment variables for file logging..."
heroku config:set LOG_LEVEL=debug LOG_DIR=/tmp/logs -a fiken-ai

echo "Deploying to fiken-ai Heroku app..."
git push heroku master

echo "Deployment complete!"
echo ""
echo "Logging is now completely file-based in /tmp/logs/ - no I/O interference."
echo "To check logs on Heroku:"
echo "  heroku run 'cat /tmp/logs/combined.log' -a fiken-ai"
echo "  heroku run 'tail -f /tmp/logs/combined.log' -a fiken-ai"
