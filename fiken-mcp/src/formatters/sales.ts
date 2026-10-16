/**
 * Turn Fiken sale and sale draft records into shapes that are easy for a model to read correctly.
 */

import { centsToUnits, sumCents, withAmountSummary } from './purchases.js';

const units = (cents: unknown) => (typeof cents === 'number' ? centsToUnits(cents) : null);

const describeLines = (lines: unknown, field: string): string => {
  const texts: string[] = Array.isArray(lines) ? lines.map((line: any) => line[field]).filter(Boolean) : [];
  return [...new Set(texts)].join('; ').slice(0, 200);
};

// Sale lines are orderLines like purchase lines, so the line totals come from withAmountSummary; sales also
// carry what the customer still owes, which is what most questions about sales are after
export const withSaleAmountSummary = (sale: any) => {
  const summarised = withAmountSummary(sale);
  if (summarised === sale) return sale;

  const outstandingNok = units(sale.outstandingBalance);
  return {
    ...summarised,
    amounts: {
      ...summarised.amounts,
      outstanding: summarised.amounts.currency === 'NOK' ? outstandingNok : units(sale.outstandingBalanceInCurrency),
      outstandingNok,
    },
  };
};

// Compact list entry; the full record carries the customer contact, lines, payments, attachments and notes
export const toSaleSummary = (sale: any) => ({
  saleId: sale.saleId,
  saleNumber: sale.saleNumber,
  date: sale.date,
  dueDate: sale.dueDate,
  kind: sale.kind,
  customer: sale.customer?.name,
  description: describeLines(sale.lines, 'description'),
  settled: sale.settled,
  settledDate: sale.settledDate,
  writeOff: sale.writeOff || undefined,
  deleted: sale.deleted || undefined,
  amounts: withSaleAmountSummary(sale).amounts,
});

// Draft lines hold net and gross in the draft currency, unlike the NOK/*InCurrency split on sales
export const toSaleDraftSummary = (draft: any) => {
  const lines = Array.isArray(draft.lines) ? draft.lines : [];
  const net = sumCents(lines, 'net');
  const gross = sumCents(lines, 'gross');
  return {
    draftId: draft.draftId,
    invoiceIssueDate: draft.invoiceIssueDate,
    dueDate: draft.dueDate,
    invoiceNumber: draft.invoiceNumber,
    cash: draft.cash,
    paid: draft.paid,
    customer: draft.contact?.name,
    description: describeLines(lines, 'text'),
    amounts: {
      currency: draft.currency || 'NOK',
      net: units(net),
      vat: net === null || gross === null ? null : centsToUnits(gross - net),
      total: units(gross),
    },
  };
};

export const SALE_AMOUNTS_NOTE =
  'Each sale includes "amounts" in major units (68.5 = 68.50): net/vat/total/outstanding are in "currency", ' +
  'the *Nok fields are NOK. Raw fields are in cents.';
