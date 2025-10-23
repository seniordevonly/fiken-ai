#!/bin/bash

echo "Building project with stderr logging for Heroku..."
npm run build

echo "Adding changes to git..."
git add .

echo "Committing changes..."
git commit -m "Switch to stderr logging that Heroku captures instead of ephemeral file logging"

echo "Deploying to fiken-ai Heroku app..."
git push heroku master

echo "Deployment complete!"
echo ""
echo "Now run the tool and check Heroku logs in real-time:"
echo "  heroku logs --tail -a fiken-ai"
echo ""
echo "Look for [FIKEN-MCP-DEBUG] messages in the log stream."
