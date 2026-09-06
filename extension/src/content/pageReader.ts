/**
 * PrivAI — Page Reader
 *
 * Dedicated page-reading module for structured content extraction.
 * The agent uses this to answer questions like "What is on this page?",
 * "Find the login button", "Read the table", "Summarize this page", etc.
 */

export interface PageHeading {
  level: number;
  text: string;
  id?: string;
}

export interface PageLink {
  text: string;
  href: string;
  isExternal: boolean;
}

export interface PageFormField {
  label: string;
  type: string;
  name: string;
  placeholder: string;
  required: boolean;
  value: string;
}

export interface PageForm {
  action: string;
  method: string;
  fields: PageFormField[];
}

export interface PageTableCell {
  text: string;
  isHeader: boolean;
}

export interface PageTable {
  caption?: string;
  headers: string[];
  rows: string[][];
}

export interface PageImage {
  alt: string;
  src: string;
  width: number;
  height: number;
}

export interface PageReadResult {
  title: string;
  url: string;
  mainText: string;
  headings: PageHeading[];
  links: PageLink[];
  forms: PageForm[];
  tables: PageTable[];
  images: PageImage[];
  lists: string[][];
  metadata: {
    description?: string;
    keywords?: string;
    author?: string;
    language?: string;
  };
}

const MAX_MAIN_TEXT_LENGTH = 3000;
const MAX_LIST_ITEMS = 50;
const MAX_TABLE_ROWS = 30;

/**
 * Check if element is within our own extension UI
 */
function isPrivAIElement(el: Element): boolean {
  return !!(el.closest('#privai-assistant-root') || el.closest('#privai-overlay-container'));
}

/**
 * Extract visible text from the page with semantic structure preserved.
 */
export function extractPageText(): string {
  const mainEl = document.querySelector('main, [role="main"], article, .content, #content')
    || document.body;

  if (isPrivAIElement(mainEl)) return '';

  const walker = document.createTreeWalker(mainEl, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (isPrivAIElement(parent)) return NodeFilter.FILTER_REJECT;

      const tag = parent.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'META', 'LINK'].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }

      const style = window.getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return NodeFilter.FILTER_REJECT;
      }

      const text = node.textContent?.trim();
      if (!text || text.length === 0) return NodeFilter.FILTER_REJECT;

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const parts: string[] = [];
  let totalLength = 0;

  while (walker.nextNode() && totalLength < MAX_MAIN_TEXT_LENGTH) {
    const text = walker.currentNode.textContent?.trim() || '';
    if (text.length > 0) {
      parts.push(text);
      totalLength += text.length;
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, MAX_MAIN_TEXT_LENGTH);
}

/**
 * Extract all headings with their hierarchy.
 */
export function extractHeadings(): PageHeading[] {
  const headings: PageHeading[] = [];
  const els = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

  for (const el of els) {
    if (isPrivAIElement(el)) continue;
    const text = el.textContent?.trim();
    if (!text) continue;

    headings.push({
      level: parseInt(el.tagName[1]),
      text: text.slice(0, 200),
      id: el.id || undefined,
    });
  }

  return headings;
}

/**
 * Extract all links with text and href.
 */
export function extractLinks(): PageLink[] {
  const links: PageLink[] = [];
  const seen = new Set<string>();
  const els = document.querySelectorAll('a[href]');

  for (const el of els) {
    if (isPrivAIElement(el)) continue;
    const a = el as HTMLAnchorElement;
    const text = a.textContent?.trim();
    const href = a.href;

    if (!text || !href || href === '#' || href.startsWith('javascript:')) continue;

    const key = `${text}:${href}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const isExternal = !href.startsWith(window.location.origin);
    links.push({ text: text.slice(0, 200), href, isExternal });
  }

  return links;
}

/**
 * Extract form structure with fields.
 */
export function extractForms(): PageForm[] {
  const forms: PageForm[] = [];
  const els = document.querySelectorAll('form');

  for (const form of els) {
    if (isPrivAIElement(form)) continue;

    const fields: PageFormField[] = [];
    const inputs = form.querySelectorAll('input, textarea, select');

    for (const input of inputs) {
      if (input instanceof HTMLInputElement && input.type === 'hidden') continue;

      const label = getFieldLabel(input);
      fields.push({
        label,
        type: (input as HTMLInputElement).type || input.tagName.toLowerCase(),
        name: (input as HTMLInputElement).name || '',
        placeholder: (input as HTMLInputElement).placeholder || '',
        required: (input as HTMLInputElement).required || false,
        value: (input as HTMLInputElement).value || '',
      });
    }

    if (fields.length > 0) {
      forms.push({
        action: form.action || '',
        method: (form.method || 'GET').toUpperCase(),
        fields,
      });
    }
  }

  return forms;
}

function getFieldLabel(el: Element): string {
  // Check aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // Check for associated label element
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent?.trim() || '';
  }

  // Check parent label
  const parentLabel = el.closest('label');
  if (parentLabel) return parentLabel.textContent?.trim() || '';

  // Fallback to placeholder or name
  return (el as HTMLInputElement).placeholder
    || (el as HTMLInputElement).name
    || '';
}

/**
 * Extract tables as structured data.
 */
export function extractTables(): PageTable[] {
  const tables: PageTable[] = [];
  const els = document.querySelectorAll('table');

  for (const table of els) {
    if (isPrivAIElement(table)) continue;

    const caption = table.querySelector('caption')?.textContent?.trim();
    const headers: string[] = [];
    const rows: string[][] = [];

    // Extract headers
    const thEls = table.querySelectorAll('thead th, tr:first-child th');
    for (const th of thEls) {
      headers.push(th.textContent?.trim() || '');
    }

    // Extract rows
    const tbody = table.querySelector('tbody');
    const trEls = tbody
      ? tbody.querySelectorAll('tr')
      : table.querySelectorAll('tr:not(:first-child)');
    let rowCount = 0;
    for (const tr of trEls) {
      if (rowCount >= MAX_TABLE_ROWS) break;
      const cells: string[] = [];
      const tdEls = tr.querySelectorAll('td, th');
      if (tdEls.length === 0) continue;

      for (const td of tdEls) {
        cells.push(td.textContent?.trim().slice(0, 100) || '');
      }
      rows.push(cells);
      rowCount++;
    }

    if (headers.length > 0 || rows.length > 0) {
      tables.push({ caption, headers, rows });
    }
  }

  return tables;
}

/**
 * Extract lists (ul/ol) as arrays.
 */
export function extractLists(): string[][] {
  const lists: string[][] = [];
  const els = document.querySelectorAll('ul, ol');

  for (const list of els) {
    if (isPrivAIElement(list)) continue;

    // Skip navigation lists (they're captured as links)
    if (list.closest('nav')) continue;

    const items: string[] = [];
    const liEls = list.querySelectorAll(':scope > li');
    let itemCount = 0;

    for (const li of liEls) {
      if (itemCount >= MAX_LIST_ITEMS) break;
      const text = li.textContent?.trim().slice(0, 200);
      if (text) {
        items.push(text);
        itemCount++;
      }
    }

    if (items.length > 1) {
      lists.push(items);
    }
  }

  return lists;
}

/**
 * Extract images with alt text.
 */
export function extractImages(): PageImage[] {
  const images: PageImage[] = [];
  const els = document.querySelectorAll('img');

  for (const img of els) {
    if (isPrivAIElement(img)) continue;
    if (!img.src || img.src.startsWith('data:')) continue;

    const rect = img.getBoundingClientRect();
    if (rect.width < 30 || rect.height < 30) continue; // Skip tiny icons

    images.push({
      alt: img.alt || '',
      src: img.src,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }

  return images;
}

/**
 * Extract page metadata.
 */
function extractMetadata(): PageReadResult['metadata'] {
  const getMeta = (name: string): string | undefined => {
    const el = document.querySelector(`meta[name="${name}"], meta[property="og:${name}"]`);
    return (el as HTMLMetaElement)?.content || undefined;
  };

  return {
    description: getMeta('description'),
    keywords: getMeta('keywords'),
    author: getMeta('author'),
    language: document.documentElement.lang || undefined,
  };
}

/**
 * Generate a compact page summary for the LLM.
 */
export function getPageSummary(): string {
  const title = document.title;
  const url = window.location.href;
  const headings = extractHeadings();
  const forms = extractForms();
  const mainText = extractPageText();

  const parts: string[] = [];
  parts.push(`Page: "${title}"`);
  parts.push(`URL: ${url}`);

  if (headings.length > 0) {
    parts.push(`Headings: ${headings.slice(0, 5).map(h => `H${h.level}: "${h.text}"`).join(', ')}`);
  }

  if (forms.length > 0) {
    parts.push(`Forms: ${forms.length} form(s) with fields: ${forms[0].fields.map(f => f.label || f.name || f.type).join(', ')}`);
  }

  if (mainText) {
    parts.push(`Content: ${mainText.slice(0, 500)}`);
  }

  return parts.join('\n');
}

/**
 * Full page read — returns comprehensive structured data.
 */
export function readPage(): PageReadResult {
  return {
    title: document.title,
    url: window.location.href,
    mainText: extractPageText(),
    headings: extractHeadings(),
    links: extractLinks(),
    forms: extractForms(),
    tables: extractTables(),
    images: extractImages(),
    lists: extractLists(),
    metadata: extractMetadata(),
  };
}
