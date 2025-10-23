#!/bin/bash

echo "Building project with all execution path tracing..."
npm run build

echo "Adding changes to git..."
git add .

echo "Committing changes..."
git commit -m "Add trace logging to all execution paths to identify which is used"

echo "Deploying to fiken-ai Heroku app..."
git push heroku master

echo "Deployment complete!"
echo ""
echo "After running the tool, check which execution path is used:"
echo "  heroku run 'ls -la /tmp/trace-*.txt' -a fiken-ai"
echo "  heroku run 'cat /tmp/trace-tool-handler.txt' -a fiken-ai"
echo "  heroku run 'cat /tmp/trace-http-handler.txt' -a fiken-ai"
echo "  heroku run 'cat /tmp/trace-mcp-handler.txt' -a fiken-ai"
echo "  heroku run 'cat /tmp/trace-method-called.txt' -a fiken-ai"
