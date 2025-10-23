#!/bin/bash

echo "Building project with startup debugging..."
npm run build

echo "Adding changes to git..."
git add .

echo "Committing changes..."
git commit -m "Add startup logging to debug MCP server initialization"

echo "Deploying to fiken-ai Heroku app..."
git push heroku master

echo "Deployment complete!"
echo ""
echo "After deployment, check startup logs:"
echo "  heroku run 'cat /tmp/startup-trace.txt' -a fiken-ai"
echo "  heroku run 'cat /tmp/startup-error.txt' -a fiken-ai"
echo "  heroku run 'ls -la /tmp/' -a fiken-ai"
echo ""
echo "Then run the tool and check if any trace files appear."
