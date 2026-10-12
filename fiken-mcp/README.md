# Fiken MCP Server

A Model Context Protocol (MCP) server that provides tools for interacting with the Fiken Purchase Service API. This server allows AI assistants and other MCP clients to perform purchase-related operations in Fiken through a standardized interface.

## Features

### 🔧 **Available Tools**

1. **`fiken_configure`** - Configure API connection
2. **`fiken_get_purchases`** - Get all purchases with filtering
3. **`fiken_create_purchase`** - Create new purchases
4. **`fiken_get_purchase`** - Get specific purchase by ID
5. **`fiken_delete_purchase`** - Delete purchases (creates reverse transaction)
6. **`fiken_create_purchase_draft`** - Create purchase drafts
7. **`fiken_create_purchase_payment`** - Create payments for purchases

### 🛡️ **Built-in Validation**

- Input validation using Zod schemas
- Type-safe operations
- Comprehensive error handling
- Required field validation

### 🔌 **MCP Integration**

- Standard MCP protocol compliance
- Stdio transport for easy integration
- Structured tool definitions
- Error reporting

## Installation

```bash
# Clone or navigate to the project
cd fiken-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### 1. **Configuration**

#### Environment Variables (Recommended)

Create a `.env` file or set environment variables:

```bash
# Required: Your Fiken API token
export FIKEN_API_TOKEN="your-fiken-api-token"

# Optional: Default company slug
export FIKEN_COMPANY_SLUG="your-company-slug"

# Optional: Custom API base URL (defaults to https://api.fiken.no/api/v2)
export FIKEN_BASE_URL="https://api.fiken.no/api/v2"

# Optional: Request timeout in milliseconds (defaults to 30000)
export FIKEN_TIMEOUT="30000"
```

The server will automatically configure itself using these environment variables on startup.

#### Manual Configuration

Alternatively, configure the Fiken API connection manually:

```json
{
  "tool": "fiken_configure",
  "arguments": {
    "apiToken": "your-fiken-api-token",
    "baseUrl": "https://api.fiken.no/api/v2",
    "timeout": 30000
  }
}
```

**Note**: Manual configuration will override environment variables.

### 2. **Get Purchases**

Retrieve purchases with optional filtering:

```json
{
  "tool": "fiken_get_purchases",
  "arguments": {
    "companySlug": "my-company",  // Optional if FIKEN_COMPANY_SLUG is set
    "params": {
      "page": 0,
      "pageSize": 25,
      "dateGe": "2024-01-01",
      "dateLe": "2024-12-31",
      "paid": false,
      "sortBy": "date desc"
    }
  }
}
```

### 3. **Create Purchase**

Create a new purchase:

```json
{
  "tool": "fiken_create_purchase",
  "arguments": {
    "companySlug": "my-company",
    "purchase": {
      "date": "2024-01-15",
      "kind": "supplier",
      "currency": "NOK",
      "identifier": "INV-2024-001",
      "supplierId": 12345,
      "lines": [
        {
          "description": "Office supplies",
          "netPrice": 50000,
          "vat": 12500,
          "vatType": "HIGH",
          "account": "4000"
        }
      ]
    }
  }
}
```

### 4. **Create Purchase Draft**

Create a purchase draft:

```json
{
  "tool": "fiken_create_purchase_draft",
  "arguments": {
    "companySlug": "my-company",
    "draft": {
      "cash": false,
      "currency": "NOK",
      "contactId": 12345,
      "lines": [
        {
          "description": "Consulting services",
          "netPrice": 100000,
          "vatType": "HIGH"
        }
      ]
    }
  }
}
```

### 5. **Create Payment**

Add a payment to a purchase:

```json
{
  "tool": "fiken_create_purchase_payment",
  "arguments": {
    "companySlug": "my-company",
    "purchaseId": 123,
    "payment": {
      "date": "2024-01-20",
      "account": "1920:10001",
      "amount": 62500,
      "currency": "NOK"
    }
  }
}
```

## Development

### Scripts

```bash
# Build the project
npm run build

# Build and watch for changes
npm run build:watch

# Start the server
npm start

# Development mode (build + start)
npm run dev

# Run tests
npm test

# Clean build directory
npm run clean
```

### Project Structure

```
fiken-mcp/
├── src/
│   └── index.ts          # Main MCP server implementation
├── dist/                 # Compiled JavaScript output
├── package.json          # Project configuration
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

## Integration with MCP Clients

### Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "fiken": {
      "command": "node",
      "args": ["/path/to/fiken-mcp/dist/index.js"],
      "env": {
        "FIKEN_API_TOKEN": "your-fiken-api-token",
        "FIKEN_COMPANY_SLUG": "your-company-slug"
      }
    }
  }
}
```

Or use system environment variables by omitting the `env` section.

### Hermes Agent on Railway (HTTP)

When `PORT` is set, the server runs in HTTP mode and serves MCP at `POST /mcp`. HTTP mode requires
`MCP_AUTH_TOKEN` and refuses to start without it. `/mcp` accepts either:

- `Authorization: Bearer <MCP_AUTH_TOKEN>` — a static token, used by Hermes;
- an OAuth access token from `/oauth/token` (client credentials or authorization code flow), used by ChatGPT.
  OAuth is enabled only when `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` are set (enter the same values in the
  ChatGPT connector); there are no default credentials.
  Access tokens are signed with `MCP_AUTH_TOKEN`, so changing it invalidates issued tokens.

`fiken_configure` and `fiken_add_attachment_to_purchase_draft` are not available over HTTP.

1. In the Railway project that runs Hermes, add a service from this repo (Railway runs `npm install`, `npm run build`, `npm start`).
2. Set its variables:
   ```bash
   FIKEN_API_TOKEN=your-fiken-api-token
   FIKEN_COMPANY_SLUG=your-company-slug
   PORT=8080
   MCP_AUTH_TOKEN=<output of: openssl rand -hex 32>
   LOG_LEVEL=warn
   ```
   Don't generate a public domain; Hermes reaches the service over Railway's private network.
   In the service settings, set the healthcheck path to `/health` and watch paths to `/fiken-mcp/**`, `/fiken-shared/**`, `/package.json`.
3. On the Hermes service, set `FIKEN_MCP_TOKEN` to the same value as `MCP_AUTH_TOKEN` (define it either as a Railway variable
   or in Hermes's `.env`, not both — the `.env` file wins), and add to Hermes's `config.yaml` (`/opt/data/config.yaml` in the official image):
   ```yaml
   mcp_servers:
     fiken:
       url: "http://<fiken-service-name>.railway.internal:8080/mcp"
       headers:
         Authorization: "Bearer ${FIKEN_MCP_TOKEN}"
       tools:
         exclude: [fiken_delete_purchase]   # everyone in Slack shares one Fiken identity
   ```
4. Run `/reload-mcp` in Hermes (a running gateway also picks up `mcp_servers` changes within about a minute), or check with `hermes mcp test fiken`.

### Other MCP Clients

The server uses stdio transport and follows standard MCP protocol, making it compatible with any MCP client.

## API Reference

### Tool Schemas

All tools include comprehensive input validation:

- **Date formats**: `YYYY-MM-DD` (ISO 8601)
- **Currency codes**: 3-letter ISO 4217 codes (e.g., NOK, EUR, USD)
- **Amounts**: Integer values in cents (e.g., 50000 = 500.00)
- **VAT types**: Standard Fiken VAT types (HIGH, MEDIUM, LOW, etc.)

### Error Handling

The server provides detailed error messages for:
- Invalid input parameters
- Missing required fields
- API connection issues
- Authentication failures
- Business logic violations

### Response Format

All successful operations return structured responses:
- Purchase data in JSON format
- Location headers for created resources
- Pagination information when applicable

## Dependencies

- **@modelcontextprotocol/sdk**: MCP protocol implementation
- **fiken-shared**: Fiken Purchase Service and types
- **zod**: Runtime type validation
- **TypeScript**: Type safety and compilation

## Requirements

- Node.js 18.0.0 or higher
- Valid Fiken API token
- Access to Fiken company data

## Security

- API tokens are handled securely
- No sensitive data is logged
- Input validation prevents injection attacks
- Error messages don't expose internal details

## License

MIT License - see LICENSE file for details.

## Support

For issues related to:
- **MCP Server**: Create an issue in this repository
- **Fiken API**: Contact Fiken support at api@fiken.no
- **MCP Protocol**: Refer to MCP documentation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Changelog

### v0.1.0
- Initial release
- Basic purchase operations
- MCP protocol compliance
- Input validation
- Error handling
