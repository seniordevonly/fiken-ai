#!/bin/bash

echo "Building project..."
npm run build

echo "Adding changes to git..."
git add .

echo "Committing changes..."
git commit -m "Add debug logging statements to handleGetPurchases method"

echo "Setting LOG_LEVEL environment variable..."
heroku config:set LOG_LEVEL=debug -a fiken-ai-demo

echo "Deploying to Heroku..."
git push heroku-demo master

echo "Deployment complete!"
echo "You can now check the logs with: heroku logs --tail -a fiken-ai-demo"
