/**
 * OAuth 2.0 endpoints (token, authorize) and the .well-known discovery documents.
 * The known gaps in this flow are tracked in TECH_DEBT.md.
 */

import type http from 'node:http';
import { generateAccessToken, validateOAuthCredentials } from './auth.js';
import { readBody, sendJson } from './utils.js';

interface AuthorizationServerOptions {
  authorizationEndpoint: boolean;
  subjectTypes: boolean;
}

// The variants differ on purpose (they mirror what each client probed for), so the optional keys stay optional
const authorizationServerMetadata = (host: string | undefined, options: AuthorizationServerOptions) => ({
  issuer: `https://${host}`,
  ...(options.authorizationEndpoint && { authorization_endpoint: `https://${host}/oauth/authorize` }),
  token_endpoint: `https://${host}/oauth/token`,
  grant_types_supported: ['client_credentials', 'authorization_code'],
  token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
  scopes_supported: ['fiken:read', 'fiken:write'],
  response_types_supported: ['token', 'code'],
  ...(options.subjectTypes && { subject_types_supported: ['public'] }),
});

const protectedResourceMetadata = (host: string | undefined) => ({
  resource: `https://${host}/mcp`,
  authorization_servers: [`https://${host}`],
  scopes_supported: ['fiken:read', 'fiken:write'],
  bearer_methods_supported: ['header'],
  resource_documentation: `https://${host}/`,
  resource_registration: `https://${host}/oauth/token`,
});

const DISCOVERY_DOCUMENTS: Record<string, (host: string | undefined) => object> = {
  // OAuth 2.0 Discovery Endpoint
  '/.well-known/oauth-authorization-server': host =>
    authorizationServerMetadata(host, { authorizationEndpoint: false, subjectTypes: false }),
  // OpenID Connect Discovery Endpoint (what ChatGPT actually looks for)
  '/.well-known/openid-configuration': host =>
    authorizationServerMetadata(host, { authorizationEndpoint: false, subjectTypes: true }),
  // OAuth 2.0 Protected Resource Discovery Endpoint (what ChatGPT is looking for)
  '/.well-known/oauth-protected-resource': protectedResourceMetadata,
  // OAuth 2.0 Protected Resource Discovery for MCP path
  '/.well-known/oauth-protected-resource/mcp': protectedResourceMetadata,
  // OAuth 2.0 Discovery Endpoint with MCP suffix (what ChatGPT looks for)
  '/.well-known/oauth-authorization-server/mcp': host =>
    authorizationServerMetadata(host, { authorizationEndpoint: true, subjectTypes: false }),
  // OpenID Connect Discovery with MCP suffix (what ChatGPT looks for)
  '/.well-known/openid-configuration/mcp': host =>
    authorizationServerMetadata(host, { authorizationEndpoint: true, subjectTypes: true }),
  // OAuth 2.0 Discovery Endpoint under MCP path
  '/mcp/.well-known/oauth-authorization-server': host =>
    authorizationServerMetadata(host, { authorizationEndpoint: true, subjectTypes: false }),
  // OpenID Connect Discovery Endpoint under MCP path (what ChatGPT looks for)
  '/mcp/.well-known/openid-configuration': host =>
    authorizationServerMetadata(host, { authorizationEndpoint: false, subjectTypes: true }),
};

/** Answers a GET for a discovery document; returns false when the path is not one */
export const handleDiscovery = (pathname: string, req: http.IncomingMessage, res: http.ServerResponse): boolean => {
  if (!Object.hasOwn(DISCOVERY_DOCUMENTS, pathname)) {
    return false;
  }
  sendJson(res, 200, DISCOVERY_DOCUMENTS[pathname](req.headers.host));
  return true;
};

// OAuth 2.0 Authorization Endpoint - handle authorization code flow
export const handleAuthorizeGet = (url: URL, req: http.IncomingMessage, res: http.ServerResponse): void => {
  const query = Object.fromEntries(url.searchParams);
  const clientId = query?.client_id as string;
  const redirectUri = query?.redirect_uri as string;
  const state = query?.state as string;
  const responseType = query?.response_type as string;

  if (responseType === 'code' && clientId && redirectUri) {
    // Generate authorization code
    const authCode = `auth_${Buffer.from(JSON.stringify({clientId, timestamp: Date.now()})).toString('base64')}`;

    // Redirect back to ChatGPT with authorization code
    let redirectUrl: URL;
    try {
      redirectUrl = new URL(redirectUri);
    } catch {
      sendJson(res, 400, { error: 'invalid_request', error_description: 'Invalid redirect_uri' });
      return;
    }
    redirectUrl.searchParams.set('code', authCode);
    if (state) redirectUrl.searchParams.set('state', state);

    res.writeHead(302, { 'Location': redirectUrl.toString() });
    res.end();
  } else {
    // Show helpful page for manual testing
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(authorizeHelpPage(req.headers.host));
  }
};

// Handle POST to authorization endpoint - redirect to client credentials
export const handleAuthorizePost = (res: http.ServerResponse): void => {
  sendJson(res, 400, {
    error: 'unsupported_grant_type',
    error_description: 'This server only supports client_credentials grant type. Use POST /oauth/token with grant_type=client_credentials.'
  });
};

// OAuth 2.0 Token Endpoint
export const handleOAuthToken = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
  try {
    const body = await readBody(req);
    if (body === null) {
      res.setHeader('Connection', 'close');
      sendJson(res, 413, { error: 'invalid_request', error_description: 'Request body too large' });
      return;
    }

    try {
      // Parse form data or JSON
      let params: any;
      const contentType = req.headers['content-type'] || '';

      if (contentType.includes('application/x-www-form-urlencoded')) {
        params = Object.fromEntries(new URLSearchParams(body).entries());
      } else {
        params = JSON.parse(body);
      }

      const { grant_type, client_id, client_secret, code } = params;

      if (grant_type === 'client_credentials') {
        // Handle Client Credentials flow
        if (!validateOAuthCredentials(client_id, client_secret)) {
          sendJson(res, 401, { error: 'invalid_client', error_description: 'Invalid client credentials' });
          return;
        }
      } else if (grant_type === 'authorization_code') {
        // Handle Authorization Code flow
        if (!code) {
          sendJson(res, 400, { error: 'invalid_request', error_description: 'Authorization code is required' });
          return;
        }

        // Validate authorization code (simple validation for demo)
        if (!code.startsWith('auth_')) {
          sendJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid authorization code' });
          return;
        }

        // Validate client credentials for authorization code flow too
        if (!validateOAuthCredentials(client_id, client_secret)) {
          sendJson(res, 401, { error: 'invalid_client', error_description: 'Invalid client credentials' });
          return;
        }
      } else {
        sendJson(res, 400, {
          error: 'unsupported_grant_type',
          error_description: 'Supported grant types: client_credentials, authorization_code'
        });
        return;
      }

      // Generate access token for both flows
      sendJson(res, 200, {
        access_token: generateAccessToken(),
        token_type: 'Bearer',
        expires_in: 86400, // 24 hours
        scope: 'fiken:read fiken:write'
      });
    } catch (error) {
      sendJson(res, 400, { error: 'invalid_request', error_description: 'Invalid request format' });
    }
  } catch (error) {
    sendJson(res, 500, { error: 'server_error', error_description: 'Internal server error' });
  }
};

// The whitespace inside this template is part of the response body; keep it as is
const authorizeHelpPage = (host: string | undefined): string => `
              <!DOCTYPE html>
              <html>
              <head><title>OAuth Authorization</title></head>
              <body>
                <h1>OAuth 2.0 Authorization</h1>
                <p>This server supports both <strong>Authorization Code</strong> and <strong>Client Credentials</strong> flows.</p>
                <h2>For Authorization Code Flow:</h2>
                <p>Use: <code>GET /oauth/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI</code></p>
                <h2>For Client Credentials Flow:</h2>
                <pre>POST https://${host}/oauth/token
  Content-Type: application/x-www-form-urlencoded

  grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET</pre>
                <p><a href="/.well-known/openid-configuration">View OpenID Configuration</a></p>
              </body>
              </html>
            `;
