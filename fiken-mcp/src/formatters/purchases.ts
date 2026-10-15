/**
 * Turn Fiken purchase records into shapes that are easy for a model to read correctly.
 */

// Fiken amounts are in cents, and on foreign-currency purchases netPrice/vat are NOK while
// *InCurrency is the original currency; models mix these up, so expose totals in major units
export const centsToUnits = (cents: number) => Math.round(cents) / 100;

export const sumCents = (lines: any[], field: string): number | null => {
  let total = 0;
  for (const line of lines) {
    if (typeof line[field] !== 'number') return null;
    total += line[field];
  }
  return total;
};

export const withAmountSummary = (purchase: any) => {
  if (!purchase || !Array.isArray(purchase.lines)) return purchase;

  const currency = purchase.currency || 'NOK';
  const isNok = currency === 'NOK';
  const netNok = sumCents(purchase.lines, 'netPrice');
  const vatNok = sumCents(purchase.lines, 'vat');
  const net = isNok ? netNok : sumCents(purchase.lines, 'netPriceInCurrency');
  const vat = isNok ? vatNok : sumCents(purchase.lines, 'vatInCurrency');

  return {
    amounts: {
      currency,
      net: net === null ? null : centsToUnits(net),
      vat: vat === null ? null : centsToUnits(vat),
      total: net === null || vat === null ? null : centsToUnits(net + vat),
      netNok: netNok === null ? null : centsToUnits(netNok),
      vatNok: vatNok === null ? null : centsToUnits(vatNok),
      totalNok: netNok === null || vatNok === null ? null : centsToUnits(netNok + vatNok),
    },
    ...purchase,
  };
};

// Compact list entry with what's needed to answer "what did we buy"; Fiken's full record is ~15x larger
// (supplier contact, lines, payments, attachments) and overflows agent context on big pages
export const toPurchaseSummary = (purchase: any) => {
  const descriptions: string[] = Array.isArray(purchase.lines)
    ? purchase.lines.map((line: any) => line.description).filter(Boolean)
    : [];
  return {
    purchaseId: purchase.purchaseId,
    date: purchase.date,
    dueDate: purchase.dueDate,
    identifier: purchase.identifier,
    kind: purchase.kind,
    supplier: purchase.supplier?.name,
    description: [...new Set(descriptions)].join('; ').slice(0, 200),
    paid: purchase.paid,
    amounts: withAmountSummary(purchase).amounts,
  };
};

export const PURCHASE_AMOUNTS_NOTE =
  'Each purchase includes "amounts" in major units (68.5 = 68.50): net/vat/total are in "currency", ' +
  'netNok/vatNok/totalNok are NOK booked at Fiken\'s exchange rate. Prefer these over the raw line fields, ' +
  'which are in cents: netPrice/vat are always NOK, netPriceInCurrency/vatInCurrency are in the purchase currency.';

// Draft lines carry net and gross (net + VAT) in cents of the draft currency
export const withDraftAmountSummary = (draft: any) => {
  if (!draft || !Array.isArray(draft.lines)) return draft;

  const net = sumCents(draft.lines, 'net');
  const gross = sumCents(draft.lines, 'gross');
  return {
    amounts: {
      currency: draft.currency || 'NOK',
      net: net === null ? null : centsToUnits(net),
      vat: net === null || gross === null ? null : centsToUnits(gross - net),
      total: gross === null ? null : centsToUnits(gross),
    },
    ...draft,
  };
};

export const toPurchaseDraftSummary = (draft: any) => {
  const texts: string[] = Array.isArray(draft.lines) ? draft.lines.map((line: any) => line.text).filter(Boolean) : [];
  return {
    draftId: draft.draftId,
    invoiceIssueDate: draft.invoiceIssueDate,
    dueDate: draft.dueDate,
    invoiceNumber: draft.invoiceNumber,
    contact: draft.contact?.name,
    cash: draft.cash,
    paid: draft.paid,
    description: [...new Set(texts)].join('; ').slice(0, 200),
    attachments: Array.isArray(draft.attachments) ? draft.attachments.length : 0,
    amounts: withDraftAmountSummary(draft).amounts,
  };
};

export const DRAFT_AMOUNTS_NOTE =
  'Each draft includes "amounts" in major units of its currency (68.5 = 68.50); the raw line net/gross are in cents.';
