/**
 * Small helpers for the raw node:http server.
 */

import type http from 'node:http';
import { MAX_HTTP_BODY_BYTES } from '../config.js';

export const sendJson = (res: http.ServerResponse, status: number, body: unknown): void => {
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(status);
  res.end(JSON.stringify(body));
};

/** Resolves null when the body exceeds the limit; the caller answers 413 and closes the connection */
export const readBody = (req: http.IncomingMessage, maxBytes = MAX_HTTP_BODY_BYTES): Promise<string | null> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        // Stop buffering
        chunks.length = 0;
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(size > maxBytes ? null : Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
