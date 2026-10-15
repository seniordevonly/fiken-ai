import type http from 'node:http';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { readBody, sendJson } from './utils.js';

const request = () => {
  const stream = new PassThrough();
  return { stream, req: stream as unknown as http.IncomingMessage };
};

describe('readBody', () => {
  it('resolves the body as a UTF-8 string', async () => {
    const { stream, req } = request();
    const body = readBody(req);

    stream.write('{"hello":');
    stream.end('"wørld"}');

    await expect(body).resolves.toBe('{"hello":"wørld"}');
  });

  it('resolves an empty string for an empty body', async () => {
    const { stream, req } = request();
    const body = readBody(req);

    stream.end();

    await expect(body).resolves.toBe('');
  });

  it('accepts a body of exactly maxBytes', async () => {
    const { stream, req } = request();
    const body = readBody(req, 5);

    stream.end('12345');

    await expect(body).resolves.toBe('12345');
  });

  it('resolves null when the body exceeds maxBytes', async () => {
    const { stream, req } = request();
    const body = readBody(req, 5);

    stream.write('123');
    stream.end('456');

    await expect(body).resolves.toBeNull();
  });

  it('rejects when the stream errors', async () => {
    const { stream, req } = request();
    const body = readBody(req);

    stream.destroy(new Error('socket hang up'));

    await expect(body).rejects.toThrow('socket hang up');
  });
});

describe('sendJson', () => {
  it('writes the status, the JSON content type and the serialised body', () => {
    const res = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };

    sendJson(res as unknown as http.ServerResponse, 201, { ok: true });

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    expect(res.writeHead).toHaveBeenCalledWith(201);
    expect(res.end).toHaveBeenCalledWith('{"ok":true}');
  });
});
