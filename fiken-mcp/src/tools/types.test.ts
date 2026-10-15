import { describe, expect, it } from 'vitest';
import { jsonResult, textResult } from './types.js';

describe('textResult', () => {
  it('wraps the text in a single text part', () => {
    expect(textResult('hello')).toEqual({ content: [{ type: 'text', text: 'hello' }] });
  });
});

describe('jsonResult', () => {
  const value = { a: 1, b: [2, 3] };

  it('pretty-prints by default', () => {
    expect(jsonResult(value)).toEqual({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
  });

  it('minifies with pretty: false', () => {
    expect(jsonResult(value, { pretty: false }).content[0].text).toBe('{"a":1,"b":[2,3]}');
  });

  it('adds meta.items only when items is given', () => {
    expect(jsonResult(value)).not.toHaveProperty('meta');
    expect(jsonResult(value, { items: 5 }).meta).toEqual({ items: 5 });
    expect(jsonResult(value, { items: 0 }).meta).toEqual({ items: 0 });
  });
});
