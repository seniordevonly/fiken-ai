
# Fiken AI Project

This project provides AI-powered integration with the Fiken accounting API through an MCP (Model Context Protocol) server.

## Components

- **fiken-shared**: Shared utilities, types, and services for Fiken API integration
- **fiken-mcp**: MCP server that provides Fiken API tools to Claude Desktop

## Logging

To monitor the MCP server logs:

```bash
tail -f /Users/tha022/Library/Logs/Claude/mcp-server-fikenAI.log
```

## MCP Heroku
```bash
heroku ai:models:create MODEL_NAME -a your-app-name --as INFERENCE
heroku ai:models:create claude-3-7-sonnet -a fiken-ai --as INFERENCE
heroku ai:models -a fiken-ai
```


## Quick Start

The MCP server is automatically configured via environment variables in Claude Desktop configuration.