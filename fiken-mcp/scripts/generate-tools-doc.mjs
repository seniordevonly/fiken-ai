// Generates TOOLS.md from the tool definitions in dist/ (run via npm run docs:tools, which builds first)
import { writeFileSync } from 'node:fs';
const base = new URL('../dist/tools/', import.meta.url).href;
process.env.LOG_LEVEL ??= 'error';
const { TOOLSETS, DEFAULT_TOOLSETS, CORE_TOOLS } = await import(base + 'toolsets.js');

const SECTIONS = [
  ['Bookkeeping', ['purchases', 'sales', 'invoices', 'contacts', 'accounting', 'inbox']],
  ['Running the business (opt-in)', ['sales-documents', 'products', 'contact-persons', 'projects', 'time']],
  ['Company setup (opt-in)', ['setup']],
];
const BLURB = {
  core: 'Configuration status and company discovery. Always on, whatever FIKEN_TOOLSETS says.',
  purchases: 'Supplier purchases (kjøp): register, draft, pay, accrue and inspect them.',
  sales: 'Sales registered without a Fiken invoice (salg): register, draft, pay, accrue.',
  invoices: 'Customer invoices and invoice drafts, including turning a draft into an invoice and sending it.',
  contacts: 'Suppliers and customers (contacts) and contact groups. Use contactId as supplierId/customerId.',
  accounting: 'Chart of accounts, balances, bank accounts, journal entries and transactions.',
  inbox: 'Documents waiting in the Fiken inbox and received EHF invoices (read-only).',
  'sales-documents': 'Credit notes, offers, order confirmations and their drafts; recurring invoices are read-only.',
  products: 'The product register and product sales report.',
  'contact-persons': 'Contact persons attached to a contact.',
  projects: 'Projects that purchases, sales and time can be tagged with.',
  time: 'Time tracking: time entries, activities, time users, and invoicing tracked time.',
  setup: 'Number series counters for invoices and sales documents. Needed once per company.',
};

const esc = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
const describeInputs = schema => {
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  const parts = Object.entries(props)
    .filter(([name]) => name !== 'companySlug')
    .map(([name, prop]) => {
      let label = required.has(name) ? `**${name}**` : name;
      if (prop.type === 'object' && prop.properties && name === 'params') {
        label += ` (${Object.keys(prop.properties).join(', ')})`;
      } else if (prop.enum) {
        label += `: ${prop.enum.join(' | ')}`;
      }
      return label;
    });
  return parts.length ? parts.join(', ') : '–';
};
const flags = tool => (tool.http === false ? ' *(stdio only)*' : '');
const table = tools => [
  '| Tool | What it does | Inputs |',
  '|---|---|---|',
  ...tools.map(t => `| \`${t.name}\`${flags(t)} | ${esc(t.description)} | ${esc(describeInputs(t.inputSchema))} |`),
].join('\n');

const total = Object.values(TOOLSETS).flat().length + CORE_TOOLS.length;
const defaultCount = CORE_TOOLS.length + DEFAULT_TOOLSETS.reduce((n, k) => n + TOOLSETS[k].length, 0);
let md = `# Fiken MCP tools

Generated from the tool definitions in \`src/tools/\`: these are the exact descriptions and inputs the MCP client sees.

- **${total} tools** in ${Object.keys(TOOLSETS).length} toolsets plus the always-on core.
- **Default** (\`FIKEN_TOOLSETS\` unset): core + ${DEFAULT_TOOLSETS.map(s => `\`${s}\``).join(', ')} = **${defaultCount} tools**.
- Enable others with \`FIKEN_TOOLSETS=purchases,sales,...\` (comma-separated) or \`FIKEN_TOOLSETS=all\`. Listing toolsets
  replaces the default, so include the default ones you still want.
- Every tool except the user/companies tools takes an optional \`companySlug\` (defaults to \`FIKEN_COMPANY_SLUG\`); it is
  left out of the Inputs column. **Bold** inputs are required.
- Money is integer øre (cents) unless a field says otherwise; the \`amounts\` summaries on purchases and sales are in
  major units. Create tools return \`{ message, id, location }\`. List tools return \`{ pagination, <items> }\` with a
  compact summary per item, or complete records with \`detail: "full"\`.
- Not exposed on purpose: deletes, recurring invoice creation/scheduling, file uploads over HTTP, and sending documents
  to customers (except \`fiken_send_invoice\`).

## Overview

| Toolset | Default | Tools | Covers |
|---|---|---|---|
| core | always on | ${CORE_TOOLS.length} | ${BLURB.core} |
`;
for (const [, names] of SECTIONS) for (const k of names)
  md += `| \`${k}\` | ${DEFAULT_TOOLSETS.includes(k) ? '✅ default' : 'opt-in'} | ${TOOLSETS[k].length} | ${BLURB[k]} |\n`;

md += `\n## Core (always on)\n\n${BLURB.core}\n\n${table(CORE_TOOLS)}\n`;
for (const [title, names] of SECTIONS) {
  md += `\n## ${title}\n`;
  for (const k of names) {
    md += `\n### \`${k}\`${DEFAULT_TOOLSETS.includes(k) ? ' ✅ default' : ' (opt-in)'} · ${TOOLSETS[k].length} tools\n\n${BLURB[k]}\n\n${table(TOOLSETS[k])}\n`;
  }
}
const missing = Object.keys(TOOLSETS).filter(k => !SECTIONS.some(([, n]) => n.includes(k)));
if (missing.length) throw new Error('Toolsets missing from doc: ' + missing);
writeFileSync(new URL('../TOOLS.md', import.meta.url), md);
console.log('tools', total, 'default', defaultCount, 'bytes', md.length);
