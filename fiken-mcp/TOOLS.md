# Fiken MCP tools

Generated from the tool definitions in `src/tools/`: these are the exact descriptions and inputs the MCP client sees.

- **118 tools** in 12 toolsets plus the always-on core.
- **Default** (`FIKEN_TOOLSETS` unset): core + `purchases`, `sales`, `invoices`, `contacts`, `accounting`, `inbox` = **74 tools**.
- Enable others with `FIKEN_TOOLSETS=purchases,sales,...` (comma-separated) or `FIKEN_TOOLSETS=all`. Listing toolsets
  replaces the default, so include the default ones you still want.
- Every tool except the user/companies tools takes an optional `companySlug` (defaults to `FIKEN_COMPANY_SLUG`); it is
  left out of the Inputs column. **Bold** inputs are required.
- Money is integer øre (cents) unless a field says otherwise; the `amounts` summaries on purchases and sales are in
  major units. Create tools return `{ message, id, location }`. List tools return `{ pagination, <items> }` with a
  compact summary per item, or complete records with `detail: "full"`.
- Not exposed on purpose: deletes, recurring invoice creation/scheduling, file uploads over HTTP, and sending documents
  to customers (except `fiken_send_invoice`).

## Overview

| Toolset | Default | Tools | Covers |
|---|---|---|---|
| core | always on | 5 | Configuration status and company discovery. Always on, whatever FIKEN_TOOLSETS says. |
| `purchases` | ✅ default | 17 | Supplier purchases (kjøp): register, draft, pay, accrue and inspect them. |
| `sales` | ✅ default | 16 | Sales registered without a Fiken invoice (salg): register, draft, pay, accrue. |
| `invoices` | ✅ default | 12 | Customer invoices and invoice drafts, including turning a draft into an invoice and sending it. |
| `contacts` | ✅ default | 6 | Suppliers and customers (contacts) and contact groups. Use contactId as supplierId/customerId. |
| `accounting` | ✅ default | 14 | Chart of accounts, balances, bank accounts, journal entries and transactions. |
| `inbox` | ✅ default | 4 | Documents waiting in the Fiken inbox and received EHF invoices (read-only). |
| `sales-documents` | opt-in | 16 | Credit notes, offers, order confirmations and their drafts; recurring invoices are read-only. |
| `products` | opt-in | 5 | The product register and product sales report. |
| `contact-persons` | opt-in | 4 | Contact persons attached to a contact. |
| `projects` | opt-in | 4 | Projects that purchases, sales and time can be tagged with. |
| `time` | opt-in | 11 | Time tracking: time entries, activities, time users, and invoicing tracked time. |
| `setup` | opt-in | 4 | Number series counters for invoices and sales documents. Needed once per company. |

## Core (always on)

Configuration status and company discovery. Always on, whatever FIKEN_TOOLSETS says.

| Tool | What it does | Inputs |
|---|---|---|
| `fiken_status` | Check the current configuration status of the Fiken MCP server | – |
| `fiken_configure` *(stdio only)* | Configure the Fiken API connection with authentication token | **apiToken**, baseUrl, timeout |
| `fiken_get_user` | Get the Fiken user the API token belongs to (name and email). | – |
| `fiken_get_companies` | List the companies the user can access, with each company's slug. Use it to find the companySlug that every other tool takes. | detail: summary \| full, params (page, pageSize, sortBy) |
| `fiken_get_company` | Get a company's details: name, organization number, VAT registration, address and accounting start date. | – |

## Bookkeeping

### `purchases` ✅ default · 17 tools

Supplier purchases (kjøp): register, draft, pay, accrue and inspect them.

| Tool | What it does | Inputs |
|---|---|---|
| `fiken_get_purchases` | Get purchases for a company with optional filtering and pagination. By default returns a compact summary per purchase (purchaseId, date, supplier, description, amounts, paid) plus pagination; use detail="full" for Fiken's complete records, or fiken_get_purchase for one purchase. Each purchase includes "amounts" in major units (68.5 = 68.50): net/vat/total are in "currency", netNok/vatNok/totalNok are NOK booked at Fiken's exchange rate. Prefer these over the raw line fields, which are in cents: netPrice/vat are always NOK, netPriceInCurrency/vatInCurrency are in the purchase currency. | detail: summary \| full, params (page, pageSize, date, dateLe, dateLt, dateGe, dateGt, lastModified, lastModifiedLe, lastModifiedLt, lastModifiedGe, lastModifiedGt, sortBy, paid, settledDate, settledDateLe, settledDateLt, settledDateGe, settledDateGt, contactId) |
| `fiken_create_purchase` | Create a purchase (supplier invoice or cash purchase). Amounts are integer cents (øre): 12500 = 125.00. Returns the new purchaseId as "id". | **purchase** |
| `fiken_get_purchase` | Get a specific purchase by ID. Each purchase includes "amounts" in major units (68.5 = 68.50): net/vat/total are in "currency", netNok/vatNok/totalNok are NOK booked at Fiken's exchange rate. Prefer these over the raw line fields, which are in cents: netPrice/vat are always NOK, netPriceInCurrency/vatInCurrency are in the purchase currency. | **purchaseId** |
| `fiken_get_purchase_drafts` | Get purchase drafts. By default returns a compact summary per draft (draftId, dates, contact, description, amounts, attachment count) plus pagination; use detail="full" for complete drafts. Each draft includes "amounts" in major units of its currency (68.5 = 68.50); the raw line net/gross are in cents. | detail: summary \| full, params (page, pageSize) |
| `fiken_create_purchase_draft` | Create a purchase draft. Amounts are integer cents (øre): 12500 = 125.00. Returns the new draftId as "id", e.g. for fiken_add_attachment_to_purchase_draft. | **draft** |
| `fiken_get_purchase_draft` | Get a specific purchase draft by ID. Each draft includes "amounts" in major units of its currency (68.5 = 68.50); the raw line net/gross are in cents. | **draftId** |
| `fiken_update_purchase_draft` | Replace a purchase draft: send the complete draft (all fields and lines), not only the changes. Amounts are integer cents (øre). Read it first with fiken_get_purchase_draft. | **draftId**, **draft** |
| `fiken_create_purchase_from_draft` | Book a purchase draft as a purchase. Returns the new purchaseId as "id". | **draftId** |
| `fiken_get_purchase_draft_attachments` | Get all attachments for a purchase draft, as { attachments } | **draftId** |
| `fiken_add_attachment_to_purchase_draft` *(stdio only)* | Upload a file from local disk (e.g. the supplier invoice or receipt) to a purchase draft. Allowed types: .png, .jpeg, .jpg, .gif, .pdf. | **draftId**, **attachment** |
| `fiken_get_purchase_attachments` | Get the attachments (invoice, receipt files) of a purchase, as { attachments } | **purchaseId** |
| `fiken_create_purchase_payment` | Register a payment of a purchase. Amounts are integer cents (øre): 34000 = 340.00. Returns the new paymentId as "id". | **purchaseId**, **payment** |
| `fiken_get_purchase_payments` | Get the payments of a purchase, as { payments }. Amounts are integer cents (øre); fee is always NOK. | **purchaseId** |
| `fiken_get_purchase_payment` | Get one payment of a purchase. Amounts are integer cents (øre); fee is always NOK. | **purchaseId**, **paymentId** |
| `fiken_get_purchase_accruals` | Get the accruals (periodisering) set up on a purchase, as { accruals }. amountPerPeriod is in cents (øre). | **purchaseId** |
| `fiken_get_purchase_accrual` | Get one accrual (periodisering) on a purchase. amountPerPeriod is in cents (øre). | **purchaseId**, **accrualId** |
| `fiken_create_purchase_accrual` | Spread one purchase line evenly over monthly periods (periodisering). The line must be on a result account (3000-7999); take its lineId from fiken_get_purchase. Returns the new accrualId as "id". | **purchaseId**, **accrual** |

### `sales` ✅ default · 16 tools

Sales registered without a Fiken invoice (salg): register, draft, pay, accrue.

| Tool | What it does | Inputs |
|---|---|---|
| `fiken_get_sales` | List sales (salg) with filters and pagination; use settled=false to find sales not fully paid. Returns a compact summary per sale by default; use detail="full" for complete records. Each sale includes "amounts" in major units (68.5 = 68.50): net/vat/total/outstanding are in "currency", the *Nok fields are NOK. Raw fields are in cents. | detail: summary \| full, params (page, pageSize, date, dateLe, dateLt, dateGe, dateGt, lastModified, lastModifiedLe, lastModifiedLt, lastModifiedGe, lastModifiedGt, saleNumber, settled, contactId) |
| `fiken_get_sale` | Get one sale by ID, with its lines, payments and attachments. Each sale includes "amounts" in major units (68.5 = 68.50): net/vat/total/outstanding are in "currency", the *Nok fields are NOK. Raw fields are in cents. | **saleId** |
| `fiken_create_sale` | Register a sale whose invoice was made outside Fiken ("annet salg"); use the invoice tools for invoices issued from Fiken. Returns the new saleId. Amounts are integer cents (øre). | **sale** |
| `fiken_get_sale_attachments` | List the files attached to a sale, with download URLs. | **saleId** |
| `fiken_get_sale_payments` | List the payments registered on a sale. Amounts are integer cents (øre). | **saleId** |
| `fiken_get_sale_payment` | Get one payment on a sale. Amounts are integer cents (øre). | **saleId**, **paymentId** |
| `fiken_create_sale_payment` | Register a payment received for a sale. Returns the new paymentId. Amounts are integer cents (øre). | **saleId**, **payment** |
| `fiken_get_sale_accruals` | List the accruals (periodisering) on a sale. amountPerPeriod is in cents (øre). | **saleId** |
| `fiken_get_sale_accrual` | Get one accrual (periodisering) on a sale. amountPerPeriod is in cents (øre). | **saleId**, **accrualId** |
| `fiken_create_sale_accrual` | Spread one sale line evenly over monthly periods (periodisering). Returns the new accrualId; take lineId from the sale's lines in fiken_get_sale. | **saleId**, **accrual** |
| `fiken_get_sale_drafts` | List sale drafts. Returns a compact summary per draft (amounts in major units of the draft currency, 68.5 = 68.50) by default; use detail="full" for complete records, whose amounts are in cents. | detail: summary \| full, params (page, pageSize) |
| `fiken_get_sale_draft` | Get one sale draft by ID. Line net/gross are integer cents (øre) in the draft currency. | **draftId** |
| `fiken_create_sale_draft` | Create a sale draft, to book later with fiken_create_sale_from_draft. Returns the new draftId. Line net/gross are integer cents (øre) in the draft currency. | **draft** |
| `fiken_update_sale_draft` | Replace a sale draft's content; send the complete draft, not only the changed fields. Line net/gross are integer cents (øre) in the draft currency. | **draftId**, **draft** |
| `fiken_get_sale_draft_attachments` | List the files attached to a sale draft, with download URLs. | **draftId** |
| `fiken_create_sale_from_draft` | Book a sale draft as a sale. Returns the new saleId. | **draftId** |

### `invoices` ✅ default · 12 tools

Customer invoices and invoice drafts, including turning a draft into an invoice and sending it.

| Tool | What it does | Inputs |
|---|---|---|
| `fiken_get_invoices` | List invoices, filterable by issue/due/last-modified date, customer and settled status. Returns {pagination, invoices}; each invoice is a compact summary (ids, dates, customer, net/vat/gross, settled, outstandingBalanceInNok, sent) unless detail="full". Use fiken_get_invoice for one invoice. Amounts are integer cents (øre): 12500 = 125.00. net/vat/gross are in the invoice currency, *InNok in NOK. | detail: summary \| full, params (page, pageSize, issueDate, issueDateLe, issueDateLt, issueDateGe, issueDateGt, dueDate, dueDateLe, dueDateLt, dueDateGe, dueDateGt, lastModified, lastModifiedLe, lastModifiedLt, lastModifiedGe, lastModifiedGt, customerId, settled, orderReference, invoiceDraftUuid, invoiceNumber) |
| `fiken_create_invoice` | Create an invoice ("Ny faktura"). This books the sale; use fiken_create_invoice_draft for an editable draft. Each line is a product line (productId; price and VAT come from the product) or a free-text line (description, unitPrice and vatType). Amounts are integer cents (øre): 12500 = 125.00. Returns {message, id, location}; id is the new invoiceId, which fiken_send_invoice takes. | **invoice** |
| `fiken_get_invoice` | Get one invoice by invoiceId: Fiken's full record with lines, customer, sale (settled, outstandingBalance) and dispatches. Amounts are integer cents (øre): 12500 = 125.00. | **invoiceId** |
| `fiken_update_invoice` | Change an issued invoice's due date and/or mark it as sent outside Fiken; these are the only fields Fiken allows changing. Returns {message, invoiceId, location}. | **invoiceId**, **updates** |
| `fiken_send_invoice` | Send an issued invoice to its customer. method lists channels in priority order and Fiken uses the first that works; "auto" tries EHF, eFaktura, SMS, then email from the customer's details, and "letter" is a paid printed letter (Norway only). Returns {message, invoiceId, method}. | **sendRequest** |
| `fiken_get_invoice_drafts` | List invoice drafts. Returns {pagination, drafts}; each draft is a compact summary (draftId, type, customer, net/gross) unless detail="full". Amounts are integer cents (øre): 12500 = 125.00. | detail: summary \| full, params (page, pageSize, orderReference, uuid) |
| `fiken_create_invoice_draft` | Create an editable invoice draft; nothing is booked until it becomes an invoice. Amounts are integer cents (øre): 12500 = 125.00. Returns {message, id, location}; id is the new draftId. | **draft** |
| `fiken_get_invoice_draft` | Get one invoice draft by draftId: Fiken's full record with lines, customers and attachments. Amounts are integer cents (øre): 12500 = 125.00. | **draftId** |
| `fiken_update_invoice_draft` | Replace an invoice draft: fields left out are cleared, so start from fiken_get_invoice_draft (customerId is customers[0].contactId there). Amounts are integer cents (øre): 12500 = 125.00. Returns {message, id, location}; id is the draftId. | **draftId**, **draft** |
| `fiken_create_invoice_from_draft` | Turn an invoice draft into a booked invoice. Returns {message, id, location}; id is the new invoiceId, which fiken_send_invoice takes. | **draftId** |
| `fiken_get_invoice_attachments` | List the files attached to an invoice. Returns {attachments}, each with filename, type and downloadUrl (fetch it with the API token). | **invoiceId** |
| `fiken_get_invoice_draft_attachments` | List the files attached to an invoice draft. Returns {attachments}, each with filename, type and downloadUrl (fetch it with the API token). | **draftId** |

### `contacts` ✅ default · 6 tools

Suppliers and customers (contacts) and contact groups. Use contactId as supplierId/customerId.

| Tool | What it does | Inputs |
|---|---|---|
| `fiken_get_contacts` | Find contacts (customers and suppliers); filters are exact matches. Returns a compact summary per contact (contactId, name, organizationNumber, email, customerNumber, supplierNumber, inactive) plus pagination; use contactId as supplierId on purchases or customerId on invoices. | detail: summary \| full, params (page, pageSize, name, organizationNumber, email, phoneNumber, supplier, customer, inactive, supplierNumber, customerNumber, memberNumberString, group, lastModified, lastModifiedLe, lastModifiedLt, lastModifiedGe, lastModifiedGt, createdDate, createdDateLe, createdDateLt, createdDateGe, createdDateGt, sortBy) |
| `fiken_get_contact` | Get one contact by contactId, with its contact persons, notes, address, account codes and documents. | **contactId** |
| `fiken_create_contact` | Create a contact; set customer and/or supplier to true. Returns the new contactId; check fiken_get_contacts (e.g. by organizationNumber) first to avoid duplicates. | **contact** |
| `fiken_update_contact` | Replace a contact's details: send every field to keep, not just the changes (start from fiken_get_contact). Returns the contactId. | **contactId**, **contact** |
| `fiken_get_contact_attachments` | List the documents attached to a contact, with download URLs. | **contactId** |
| `fiken_get_contact_groups` | List the customer group names, usable as the group filter of fiken_get_contacts. | params (page, pageSize) |

### `accounting` ✅ default · 14 tools

Chart of accounts, balances, bank accounts, journal entries and transactions.

| Tool | What it does | Inputs |
|---|---|---|
| `fiken_get_accounts` | Get the chart of accounts for the current year as {code, name}, e.g. to find the code for "office supplies". Sub-accounts (reskontro) look like 1500:10001; use fiken_get_account_balances for balances. | params (page, pageSize, fromAccount, toAccount, range) |
| `fiken_get_account` | Get one bookkeeping account's code and name. For its balance use fiken_get_account_balance. | **accountCode** |
| `fiken_get_account_balances` | Get accounts with their closing balance at the end of params.date (required). Returns {date, pagination, accountBalances: [{code, name, balance, balanceNok}]}: balance is integer cents (15200 = 152.00 NOK) and balanceNok the same in kroner; positive is debit and negative credit, so income accounts are usually negative. For income and expense accounts (3000-8999) it is usually the year-to-date total. Use fromAccount/toAccount to narrow, e.g. 1900-1999 for bank and cash. | **params** (date, fromAccount, toAccount, page, pageSize) |
| `fiken_get_account_balance` | Get one account's closing balance at the end of a date, as {code, name, balance, balanceNok, date}: balance is integer cents (15200 = 152.00 NOK) and balanceNok the same in kroner; positive is debit and negative credit, so income accounts are usually negative. For income and expense accounts (3000-8999) it is usually the year-to-date total. | **accountCode**, **date** |
| `fiken_get_bank_accounts` | Get the company's bank accounts (active only unless params.inactive is true). Returns a compact summary per account (bankAccountId, name, accountCode = its ledger account, bankAccountNumber, type, reconciledBalance in integer cents as of reconciledDate, inactive) plus pagination. | detail: summary \| full, params (page, pageSize, inactive) |
| `fiken_get_bank_account` | Get one bank account by bankAccountId; reconciledBalance is integer cents as of reconciledDate. | **bankAccountId** |
| `fiken_create_bank_account` | Create a bank account. Returns the new bankAccountId; fiken_get_bank_account shows its ledger accountCode. | **bankAccount** |
| `fiken_get_bank_balances` | Get the balance reported for each bank account, as {bankAccountId, bankAccountCode, date, amount, source} with amount in integer cents (250000 = 2500.00) on the given date. For the balance booked in the ledger, use fiken_get_account_balance with the bankAccountCode. | params (page, pageSize, date) |
| `fiken_get_journal_entries` | Get journal entries (posteringer), e.g. with params.dateGe/dateLe for a period. Returns a compact summary per entry (journalEntryId, journalEntryNumber, date, description, transactionId, transactionType, lines {account, amount, vatCode}, attachmentCount) plus pagination. Line amounts are integer cents, positive for debit and negative for credit. | detail: summary \| full, params (page, pageSize, date, dateLe, dateLt, dateGe, dateGt, lastModified, lastModifiedLe, lastModifiedLt, lastModifiedGe, lastModifiedGt, createdDate, createdDateLe, createdDateLt, createdDateGe, createdDateGt, transactionType) |
| `fiken_get_journal_entry` | Get one journal entry by journalEntryId, with its lines and attachments. Line amounts are integer cents, positive for debit and negative for credit. | **journalEntryId** |
| `fiken_get_journal_entry_attachments` | List the attachments (receipts, invoices) of a journal entry, with filename and downloadUrl. | **journalEntryId** |
| `fiken_create_general_journal_entry` | Create a general journal entry (fri postering); this posts real bookkeeping, so confirm accounts and amounts first. Each line books a positive amount in integer cents to debitAccount and/or creditAccount; a line with both balances itself, otherwise debit-only and credit-only lines must total the same. Returns the new id; use fiken_get_accounts to find account codes. | **generalJournalEntry** |
| `fiken_get_transactions` | Get transactions (a sale, purchase or journal posting with all its entries). Returns a compact summary per transaction (transactionId, type, description, createdDate, deleted, entries with lines) plus pagination; to filter by booking date use fiken_get_journal_entries. Line amounts are integer cents, positive for debit and negative for credit. | detail: summary \| full, params (page, pageSize, lastModified, lastModifiedLe, lastModifiedLt, lastModifiedGe, lastModifiedGt, createdDate, createdDateLe, createdDateLt, createdDateGe, createdDateGt, type) |
| `fiken_get_transaction` | Get one transaction by transactionId (as found on sales, purchases and journal entries), with its journal entries. Line amounts are integer cents, positive for debit and negative for credit. | **transactionId** |

### `inbox` ✅ default · 4 tools

Documents waiting in the Fiken inbox and received EHF invoices (read-only).

| Tool | What it does | Inputs |
|---|---|---|
| `fiken_get_inbox_documents` | List documents in the company's inbox (uploaded receipts and invoices). Returns documentId, name, filename, used and createdAt per document; documentId is the inboxDocumentId that attachment tools accept. | detail: summary \| full, params (page, pageSize, sortBy, status, name) |
| `fiken_get_inbox_document` | Get one inbox document, including its download URL. | **inboxDocumentId** |
| `fiken_get_ehf_documents` | List received EHF documents (electronic supplier invoices and credit notes). Returns a summary with supplier, invoice number, dates, gross amount in cents (øre) and status; unprocessed ones still need booking. | detail: summary \| full, params (page, pageSize, sortBy, status, issueDate, issueDateLe, issueDateLt, issueDateGe, issueDateGt) |
| `fiken_get_ehf_document` | Get one received EHF document with its lines, payment details (KID, account number) and PDF/XML URLs. Amounts are integer cents (øre). | **ehfDocumentId** |

## Running the business (opt-in)

### `sales-documents` (opt-in) · 16 tools

Credit notes, offers, order confirmations and their drafts; recurring invoices are read-only.

| Tool | What it does | Inputs |
|---|---|---|
| `fiken_get_credit_notes` | List credit notes. Returns a compact summary per credit note (creditNoteId, number, issueDate, customer, amounts, settled, associatedInvoiceId) plus pagination. Amounts are integer cents (øre) in the document currency. | detail: summary \| full, params (page, pageSize, issueDate, issueDateLe, issueDateLt, issueDateGe, issueDateGt, lastModified, lastModifiedLe, lastModifiedLt, lastModifiedGe, lastModifiedGt, customerId, settled, creditNoteDraftUuid) |
| `fiken_get_credit_note` | Get one credit note by creditNoteId, with lines, customer and PDF link. Amounts are integer cents (øre) in the document currency. | **creditNoteId** |
| `fiken_create_credit_note` | Issue a credit note. kind "full" credits a whole invoice (issueDate, invoiceId, creditNoteText only); "partial" credits the given lines, against invoiceId or standalone for contactId. Returns the new creditNoteId. | **kind**: full \| partial, **creditNote** |
| `fiken_get_offers` | List offers (tilbud). Returns a compact summary per offer (offerId, number, date, contactId, amounts, accepted, archived) plus pagination. Amounts are integer cents (øre) in the document currency. | detail: summary \| full, params (page, pageSize) |
| `fiken_get_offer` | Get one offer by offerId, with lines and dispatch history. Amounts are integer cents (øre) in the document currency. | **offerId** |
| `fiken_get_order_confirmations` | List order confirmations. Returns a compact summary per confirmation (confirmationId, number, date, contactId, amounts, createdInvoice, archived) plus pagination. Amounts are integer cents (øre) in the document currency. | detail: summary \| full, params (page, pageSize) |
| `fiken_get_order_confirmation` | Get one order confirmation by confirmationId, with lines. Amounts are integer cents (øre) in the document currency. | **confirmationId** |
| `fiken_create_invoice_draft_from_order_confirmation` | Create an invoice draft from an order confirmation. Returns the new invoice draft's id; review and issue it with the invoice draft tools. | **confirmationId** |
| `fiken_get_sales_document_drafts` | List credit note, offer or order confirmation drafts. Returns a compact summary per draft (draftId, issueDate, customer, net, gross) plus pagination. Amounts are integer cents (øre) in the document currency. | **documentType**: credit_note \| offer \| order_confirmation, detail: summary \| full, params (page, pageSize) |
| `fiken_get_sales_document_draft` | Get one credit note, offer or order confirmation draft by draftId, with lines. Amounts are integer cents (øre) in the document currency. | **documentType**: credit_note \| offer \| order_confirmation, **draftId** |
| `fiken_create_sales_document_draft` | Create a credit note (standalone), offer or order confirmation draft. Returns the new draftId; issue it with fiken_create_sales_document_from_draft. Use fiken_get_contacts to find customerId. | **documentType**: credit_note \| offer \| order_confirmation, **draft** |
| `fiken_update_sales_document_draft` | Replace a credit note, offer or order confirmation draft: send every field and line to keep, not just the changes (start from fiken_get_sales_document_draft). | **documentType**: credit_note \| offer \| order_confirmation, **draftId**, **draft** |
| `fiken_get_sales_document_draft_attachments` | List the attachments of a credit note, offer or order confirmation draft (uuid, filename, download URL). | **documentType**: credit_note \| offer \| order_confirmation, **draftId** |
| `fiken_create_sales_document_from_draft` | Issue the credit note, offer or order confirmation from a draft (it gets its number and the draft is used up). Returns the new document's id. Does not send it to the customer. | **documentType**: credit_note \| offer \| order_confirmation, **draftId** |
| `fiken_get_recurring_invoices` | List recurring invoices (repeterende faktura). Returns a compact summary per recurring invoice (recurringInvoiceId, description, active, jobs with customer, frequency, nextDate, gross) plus pagination. Amounts are integer cents (øre) in the document currency. | detail: summary \| full, params (page, pageSize, customerId, active) |
| `fiken_get_recurring_invoice` | Get one recurring invoice by recurringInvoiceId, with its jobs (one per customer: schedule, recipients, lines, generated invoice ids). Amounts are integer cents (øre) in the document currency. | **recurringInvoiceId** |

### `products` (opt-in) · 5 tools

The product register and product sales report.

| Tool | What it does | Inputs |
|---|---|---|
| `fiken_get_products` | List products with optional filters. Returns a compact summary per product (productId, name, productNumber, unitPrice in cents (øre) excl. VAT, vatType, incomeAccount, active) plus pagination. | detail: summary \| full, params (page, pageSize, name, productNumber, active, createdDate, createdDateLe, createdDateLt, createdDateGe, createdDateGt, lastModified, lastModifiedLe, lastModifiedLt, lastModifiedGe, lastModifiedGt) |
| `fiken_get_product` | Get one product by productId (not productNumber). unitPrice is in cents (øre) excluding VAT. | **productId** |
| `fiken_create_product` | Create a product; unitPrice is in cents (øre) excluding VAT. Returns the new productId. | **product** |
| `fiken_update_product` | Replace a product's details: send every field to keep, not just the changes (start from fiken_get_product). unitPrice is in cents (øre) excluding VAT. | **productId**, **product** |
| `fiken_get_product_sales_report` | Sales per product for a date range: units, sales and net/VAT/gross amounts in cents (øre), split into sold, credited and sum. | **from**, **to** |

### `contact-persons` (opt-in) · 4 tools

Contact persons attached to a contact.

| Tool | What it does | Inputs |
|---|---|---|
| `fiken_get_contact_persons` | List the contact persons of a contact (contactPersonId, name, email, phoneNumber, address). | **contactId** |
| `fiken_get_contact_person` | Get one contact person of a contact. | **contactId**, **contactPersonId** |
| `fiken_create_contact_person` | Add a contact person (name and email required) to a contact. Returns the new contactPersonId. | **contactId**, **contactPerson** |
| `fiken_update_contact_person` | Replace a contact person's details: send every field to keep, not just the changes. | **contactId**, **contactPersonId**, **contactPerson** |

### `projects` (opt-in) · 4 tools

Projects that purchases, sales and time can be tagged with.

| Tool | What it does | Inputs |
|---|---|---|
| `fiken_get_projects` | List projects. Returns projectId, number, name, dates, customer and completed per project. | detail: summary \| full, params (page, pageSize, completed, name, number) |
| `fiken_get_project` | Get one project, including its customer contact. | **projectId** |
| `fiken_create_project` | Create a project. Returns the new projectId. | **project** |
| `fiken_update_project` | Update a project's name, description, dates, customer or completed flag; only the given fields change. | **projectId**, **updates** |

### `time` (opt-in) · 11 tools

Time tracking: time entries, activities, time users, and invoicing tracked time.

| Tool | What it does | Inputs |
|---|---|---|
| `fiken_get_time_entries` | List time entries (hours registered). Returns date, hours, description, activity, project, person and invoiced per entry. | detail: summary \| full, params (page, pageSize, date, dateGe, dateLe, projectId, activityId, timeUserId, invoiced, lastModifiedGe, lastModifiedLe) |
| `fiken_get_time_entry` | Get one time entry, including its activity, project, person and invoice status. | **timeEntryId** |
| `fiken_create_time_entry` | Register hours worked. Returns the new timeEntryId. Use fiken_get_time_users for timeUserId and fiken_get_activities for activityId. | **timeEntry** |
| `fiken_update_time_entry` | Update a time entry; only the given fields change. Invoiced or locked entries can't be changed. | **timeEntryId**, **updates** |
| `fiken_create_invoice_draft_from_time_entries` | Create an invoice draft from uninvoiced time entries, one line per activity by default. Returns the new invoice draft's id; the draft still has to be turned into an invoice. | **request** |
| `fiken_get_activities` | List activities (types of work that time is registered on). Returns activityId, name, hourly rate in cents (øre), billable, projectId and archived per activity. | detail: summary \| full, params (page, pageSize, name, archived) |
| `fiken_get_activity` | Get one activity, including its product and project. hourlyRate is integer cents (øre). | **activityId** |
| `fiken_create_activity` | Create an activity to register time on. Returns the new activityId. | **activity** |
| `fiken_update_activity` | Update an activity; only the given fields change. hourlyRate is integer cents (øre). | **activityId**, **updates** |
| `fiken_get_time_users` | List the people who can register time. Returns timeUserId, name and email per person. | detail: summary \| full, params (page, pageSize, name, email) |
| `fiken_get_time_user` | Get one person who can register time. | **timeUserId** |

## Company setup (opt-in)

### `setup` (opt-in) · 4 tools

Number series counters for invoices and sales documents. Needed once per company.

| Tool | What it does | Inputs |
|---|---|---|
| `fiken_get_invoice_counter` | Get the invoice number counter: {value}, the last used invoice number. Fiken needs a counter before the first invoice; create one with fiken_create_invoice_counter. | – |
| `fiken_create_invoice_counter` | Create the invoice number counter, needed once before the first invoice. Each invoice gets the next number, so the default value 10000 makes the first invoice 10001. Returns {message, value}. | counter |
| `fiken_get_sales_document_counter` | Get the current number counter for credit notes, offers or order confirmations. Fails if the counter has not been created yet. | **documentType**: credit_note \| offer \| order_confirmation |
| `fiken_create_sales_document_counter` | Create the number counter for credit notes, offers or order confirmations; needed once before the first document of that kind. Numbering starts at value + 1 (default value 10000). | **documentType**: credit_note \| offer \| order_confirmation, value |
