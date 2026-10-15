/**
 * Caller verification for HTTP mode: the static MCP_AUTH_TOKEN and OAuth access tokens issued by /oauth/token.
 */

import crypto from 'node:crypto';
import type http from 'node:http';
import { sendJson } from './utils.js';

// HMAC keyed by MCP_AUTH_TOKEN (always set in HTTP mode), so access tokens can't be forged
const signToken = (tokenData: string): string =>
  crypto.createHmac('sha256', process.env.MCP_AUTH_TOKEN!).update(`oauth-access-token:${tokenData}`).digest('hex');

// Compare digests so timingSafeEqual gets equal-length buffers
const safeEqual = (a: string, b: string): boolean => {
  const digestA = crypto.createHash('sha256').update(a).digest();
  const digestB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
};

export const generateAccessToken = (): string => {
  // Generate a secure access token (JWT-like format)
  const payload = {
    iss: 'fiken-mcp-server',
    aud: 'chatgpt',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
    scope: 'fiken:read fiken:write'
  };

  const tokenData = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `fiken_${tokenData}_${signToken(tokenData)}`;
};

// OAuth is only enabled when both credentials are configured; there are no defaults
export const isOAuthEnabled = (): boolean =>
  Boolean(process.env.OAUTH_CLIENT_ID?.trim() && process.env.OAUTH_CLIENT_SECRET?.trim());

export const validateOAuthCredentials = (clientId: string, clientSecret: string): boolean => {
  if (!isOAuthEnabled() || typeof clientId !== 'string' || typeof clientSecret !== 'string') {
    return false;
  }

  const idMatches = safeEqual(clientId, process.env.OAUTH_CLIENT_ID!);
  const secretMatches = safeEqual(clientSecret, process.env.OAUTH_CLIENT_SECRET!);
  return idMatches && secretMatches;
};

export const validateAccessToken = (token: string): boolean => {
  if (!token || !token.startsWith('fiken_')) {
    return false;
  }

  try {
    const parts = token.split('_');
    if (parts.length !== 3) return false;

    const expected = Buffer.from(signToken(parts[1]));
    const actual = Buffer.from(parts[2]);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      return false;
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    const now = Math.floor(Date.now() / 1000);

    // Check if token is expired
    return payload.exp > now;
  } catch (error) {
    return false;
  }
};

export const authenticateRequest = (req: http.IncomingMessage): boolean => {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!match) {
    return false;
  }

  const token = match[1];

  // Static token (e.g. Hermes)
  if (safeEqual(token, process.env.MCP_AUTH_TOKEN!)) {
    return true;
  }

  // OAuth access token issued by /oauth/token (e.g. ChatGPT)
  return validateAccessToken(token);
};

export const sendAuthError = (res: http.ServerResponse): void => {
  res.setHeader('WWW-Authenticate', 'Bearer');
  sendJson(res, 401, {
    error: 'invalid_token',
    error_description: 'The access token provided is expired, revoked, malformed, or invalid.'
  });
};
