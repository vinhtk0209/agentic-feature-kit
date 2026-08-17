import TurndownService from 'turndown';

function normalizeTableCell(content: string): string {
  return content
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert Confluence export_view HTML into the canonical B0 Markdown shape.
 *
 * Turndown's default rules flatten an HTML table into one paragraph. That destroys row-level
 * acceptance-criterion provenance, so table cells/rows are rendered explicitly before the shared
 * Spec-IR adapter sees the text. The rule treats page content as inert data only.
 */
export function htmlToMarkdown(html: string): string {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });

  td.addRule('confluenceTableCell', {
    filter: ['th', 'td'],
    replacement: (content) => ` ${normalizeTableCell(content)} |`,
  });
  td.addRule('confluenceTableRow', {
    filter: 'tr',
    replacement: (content) => {
      const cells = content.trim();
      return cells ? `\n| ${cells}\n` : '';
    },
  });
  td.addRule('confluenceTable', {
    filter: 'table',
    replacement: (content) => `\n\n${content.trim()}\n\n`,
  });

  // Strip Confluence macros that do not convert cleanly.
  const cleaned = html
    .replace(/<ac:[^>]*>[\s\S]*?<\/ac:[^>]*>/g, '')
    .replace(/<ri:[^>]*\/?>/g, '');

  return td.turndown(cleaned);
}
