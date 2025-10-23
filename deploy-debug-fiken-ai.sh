#!/bin/bash

echo "Building project..."
npm run build

echo "Adding changes to git..."
git add .

echo "Committing changes..."
git commit -m "Add debug logging statements to handleGetPurchases method for fiken-ai app"

echo "Setting LOG_LEVEL environment variable on fiken-ai..."
heroku config:set LOG_LEVEL=debug -a fiken-ai

echo "Deploying to fiken-ai Heroku app..."
git push heroku master

echo "Deployment complete!"
echo "You can now check the logs with: heroku logs --tail -a fiken-ai"
