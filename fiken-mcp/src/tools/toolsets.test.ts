import { logger } from 'fiken-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountingTools } from './accounting.js';
import { contactTools } from './contacts.js';
import { invoiceTools } from './invoices.js';
import { purchaseTools } from './purchases.js';
import { salesDocumentTools } from './sales-documents.js';
import { saleTools } from './sales.js';
import { CORE_TOOLS, DEFAULT_TOOLSETS, TOOLSETS, resolveToolsetNames, selectTools } from './toolsets.js';
import { inboxTools, projectTools, timeTools } from './workspace.js';

describe('toolsets', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the defaults when FIKEN_TOOLSETS is unset or blank', () => {
    expect(resolveToolsetNames(undefined)).toEqual(DEFAULT_TOOLSETS);
    expect(resolveToolsetNames(' , ')).toEqual(DEFAULT_TOOLSETS);
  });

  it('enables every toolset for "all"', () => {
    expect(resolveToolsetNames('all')).toEqual(Object.keys(TOOLSETS));
  });

  it('trims, dedupes and drops unknown names with a warning', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    expect(resolveToolsetNames(' sales, nope ,sales,time')).toEqual(['sales', 'time']);
    expect(warn).toHaveBeenCalledWith('Ignoring unknown FIKEN_TOOLSETS entries', expect.objectContaining({ unknown: ['nope'] }));
  });

  it('always includes the core tools', () => {
    const names = selectTools([]).map(tool => tool.name);
    expect(names).toEqual(expect.arrayContaining(['fiken_status', 'fiken_configure', 'fiken_get_companies']));
  });

  it('has unique fiken_ tool names across all toolsets', () => {
    const names = selectTools(Object.keys(TOOLSETS)).map(tool => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every(name => name.startsWith('fiken_'))).toBe(true);
  });

  it('puts every defined tool in exactly one toolset, so none is silently dropped', () => {
    const defined = [purchaseTools, saleTools, invoiceTools, contactTools, accountingTools, inboxTools,
      salesDocumentTools, projectTools, timeTools].flat().map(tool => tool.name).sort();
    const grouped = Object.values(TOOLSETS).flat().map(tool => tool.name).sort();
    expect(grouped).toEqual(defined);
  });

  it('exposes nothing irreversible: no delete tools and no recurring invoice creation', () => {
    const names = selectTools(Object.keys(TOOLSETS)).map(tool => tool.name);
    expect(names.filter(name => /delete|recurring_invoice(_job)?$|create_recurring/.test(name)
      && !name.startsWith('fiken_get_'))).toEqual([]);
  });

  it('keeps the core tools out of the toolsets', () => {
    const grouped = new Set(Object.values(TOOLSETS).flat().map(tool => tool.name));
    expect(CORE_TOOLS.filter(tool => grouped.has(tool.name))).toEqual([]);
  });
});
