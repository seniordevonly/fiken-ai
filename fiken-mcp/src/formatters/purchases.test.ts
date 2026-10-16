import { describe, expect, it } from 'vitest';
import { toPurchaseDraftSummary, toPurchaseSummary, withAmountSummary, withDraftAmountSummary } from './purchases.js';

describe('withAmountSummary', () => {
  it('reports foreign-currency totals alongside the NOK amounts', () => {
    const purchase = {
      currency: 'EUR',
      lines: [{ netPrice: 73654, vat: 0, netPriceInCurrency: 6800, vatInCurrency: 0 }],
    };

    expect(withAmountSummary(purchase).amounts).toEqual({
      currency: 'EUR',
      net: 68,
      vat: 0,
      total: 68,
      netNok: 736.54,
      vatNok: 0,
      totalNok: 736.54,
    });
  });

  it('uses the NOK fields for both totals on a NOK purchase', () => {
    const purchase = {
      currency: 'NOK',
      lines: [
        { netPrice: 10000, vat: 2500 },
        { netPrice: 5050, vat: 1263 },
      ],
    };

    expect(withAmountSummary(purchase).amounts).toEqual({
      currency: 'NOK',
      net: 150.5,
      vat: 37.63,
      total: 188.13,
      netNok: 150.5,
      vatNok: 37.63,
      totalNok: 188.13,
    });
  });

  it('defaults to NOK when the currency is missing', () => {
    const result = withAmountSummary({ lines: [{ netPrice: 100, vat: 25 }] });

    expect(result.amounts.currency).toBe('NOK');
    expect(result.amounts.total).toBe(1.25);
  });

  it('gives null currency totals when *InCurrency fields are missing on a foreign purchase', () => {
    const purchase = { currency: 'USD', lines: [{ netPrice: 1000, vat: 250 }] };

    expect(withAmountSummary(purchase).amounts).toEqual({
      currency: 'USD',
      net: null,
      vat: null,
      total: null,
      netNok: 10,
      vatNok: 2.5,
      totalNok: 12.5,
    });
  });

  it('keeps the original purchase fields', () => {
    const purchase = { purchaseId: 7, currency: 'NOK', lines: [{ netPrice: 100, vat: 0 }] };

    expect(withAmountSummary(purchase)).toMatchObject(purchase);
  });

  it('returns the purchase unchanged when it has no lines', () => {
    const purchase = { purchaseId: 1, currency: 'NOK' };

    expect(withAmountSummary(purchase)).toBe(purchase);
    expect(withAmountSummary(null)).toBeNull();
  });
});

describe('toPurchaseSummary', () => {
  const purchase = {
    purchaseId: 42,
    date: '2026-01-15',
    dueDate: '2026-02-15',
    identifier: 'INV-1',
    kind: 'supplier',
    supplier: { name: 'Acme AS', email: 'post@acme.no' },
    paid: true,
    currency: 'NOK',
    lines: [
      { description: 'Hosting', netPrice: 10000, vat: 2500 },
      { description: 'Hosting', netPrice: 10000, vat: 2500 },
      { description: 'Support', netPrice: 5000, vat: 1250 },
      { netPrice: 0, vat: 0 },
    ],
    payments: [{ amount: 1 }],
    attachments: [{ identifier: 'x' }],
  };

  it('keeps only the summary fields', () => {
    expect(toPurchaseSummary(purchase)).toEqual({
      purchaseId: 42,
      date: '2026-01-15',
      dueDate: '2026-02-15',
      identifier: 'INV-1',
      kind: 'supplier',
      supplier: 'Acme AS',
      description: 'Hosting; Support',
      paid: true,
      amounts: {
        currency: 'NOK',
        net: 250,
        vat: 62.5,
        total: 312.5,
        netNok: 250,
        vatNok: 62.5,
        totalNok: 312.5,
      },
    });
  });

  it('caps the description at 200 characters', () => {
    const lines = [
      { description: 'a'.repeat(150), netPrice: 0, vat: 0 },
      { description: 'b'.repeat(150), netPrice: 0, vat: 0 },
    ];

    const { description } = toPurchaseSummary({ ...purchase, lines });

    expect(description).toHaveLength(200);
    expect(description).toBe(`${'a'.repeat(150)}; ${'b'.repeat(48)}`);
  });

  it('leaves supplier undefined when the purchase has none', () => {
    const { supplier, ...rest } = purchase;

    expect(toPurchaseSummary(rest).supplier).toBeUndefined();
  });

  it('handles a purchase without lines', () => {
    const summary = toPurchaseSummary({ purchaseId: 1 });

    expect(summary.description).toBe('');
    expect(summary.amounts).toBeUndefined();
  });
});

describe('withDraftAmountSummary', () => {
  it('derives VAT from gross minus net, in major units', () => {
    const draft = { currency: 'EUR', lines: [{ net: 10000, gross: 12500 }, { net: 50, gross: 50 }] };

    expect(withDraftAmountSummary(draft).amounts).toEqual({ currency: 'EUR', net: 100.5, vat: 25, total: 125.5 });
  });

  it('returns the draft unchanged when it has no lines', () => {
    expect(withDraftAmountSummary({ draftId: 1 })).toEqual({ draftId: 1 });
  });
});

describe('toPurchaseDraftSummary', () => {
  it('keeps the fields needed to pick a draft', () => {
    const draft = {
      draftId: 45,
      invoiceIssueDate: '2026-01-15',
      contact: { name: 'Acme AS', contactId: 3 },
      cash: false,
      paid: false,
      attachments: [{ uuid: 'a' }],
      lines: [{ text: 'Paper', net: 10000, gross: 12500 }, { text: 'Paper', net: 100, gross: 125 }],
    };

    expect(toPurchaseDraftSummary(draft)).toEqual({
      draftId: 45,
      invoiceIssueDate: '2026-01-15',
      dueDate: undefined,
      invoiceNumber: undefined,
      contact: 'Acme AS',
      cash: false,
      paid: false,
      description: 'Paper',
      attachments: 1,
      amounts: { currency: 'NOK', net: 101, vat: 25.25, total: 126.25 },
    });
  });
});
