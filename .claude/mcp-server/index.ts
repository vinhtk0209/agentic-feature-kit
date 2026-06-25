import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import TurndownService from 'turndown';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, writeFileSync, readdirSync, existsSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '.env') });

const server = new Server(
  { name: 'confluence-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

function extractPageId(url: string): string | null {
  const match = url.match(/\/pages\/(\d+)/);
  return match ? match[1] : null;
}

function extractBaseUrl(url: string): string {
  // https://your-confluence.example.com/conf/spaces/... → https://your-confluence.example.com/conf
  const match = url.match(/^(https?:\/\/[^/]+\/conf)/);
  return match ? match[1] : new URL(url).origin;
}

function htmlToMarkdown(html: string): string {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });

  // Strip Confluence macros that don't convert cleanly
  const cleaned = html
    .replace(/<ac:[^>]*>[\s\S]*?<\/ac:[^>]*>/g, '')
    .replace(/<ri:[^>]*\/?>/g, '');

  return td.turndown(cleaned);
}

function extractImageUrls(html: string, baseConfUrl: string): string[] {
  const urls: string[] = [];
  const srcPattern = /<img[^>]+src="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = srcPattern.exec(html)) !== null) {
    const src = match[1];
    // Only fetch images hosted on the same Confluence instance
    if (src.startsWith('/') || src.startsWith(baseConfUrl)) {
      const absolute = src.startsWith('/') ? `${new URL(baseConfUrl).origin}${src}` : src;
      urls.push(absolute);
    }
  }
  return urls;
}


async function fetchImageAsBase64(
  imageUrl: string,
  authHeader: Record<string, string>,
  agent: import('https').Agent,
  cookieHeader: Record<string, string> = {},
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const response = await axios.get(imageUrl, {
      headers: { ...authHeader, ...cookieHeader },
      httpsAgent: agent,
      responseType: 'arraybuffer',
      timeout: 8000,
    });
    const mimeType: string = (response.headers['content-type'] as string | undefined)
      ?.split(';')[0] ?? 'image/png';
    if (!mimeType.startsWith('image/')) return null;
    const data = Buffer.from(response.data as ArrayBuffer).toString('base64');
    return { data, mimeType };
  } catch {
    return null;
  }
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

interface CompareImagesResult {
  diffPercent: number;
  diffPixels: number;
  totalPixels: number;
  match: boolean;
  diffImagePath?: string;
  error?: string;
}

function loadPng(filePath: string): PNG | null {
  if (!existsSync(filePath)) return null;
  try {
    const buf = readFileSync(filePath);
    return PNG.sync.read(buf);
  } catch {
    return null;
  }
}

function resizePng(src: PNG, width: number, height: number): PNG {
  if (src.width === width && src.height === height) return src;
  const dst = new PNG({ width, height });
  // Nearest-neighbor scale into dst
  for (let y = 0; y < height; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / width));
      const sIdx = (sy * src.width + sx) << 2;
      const dIdx = (y * width + x) << 2;
      dst.data[dIdx] = src.data[sIdx];
      dst.data[dIdx + 1] = src.data[sIdx + 1];
      dst.data[dIdx + 2] = src.data[sIdx + 2];
      dst.data[dIdx + 3] = src.data[sIdx + 3];
    }
  }
  return dst;
}

function compareImages(
  imagePathA: string,
  imagePathB: string,
  threshold: number,
): CompareImagesResult {
  const pngA = loadPng(imagePathA);
  const pngB = loadPng(imagePathB);
  if (!pngA) return { diffPercent: 100, diffPixels: 0, totalPixels: 0, match: false, error: `Cannot read image: ${imagePathA}` };
  if (!pngB) return { diffPercent: 100, diffPixels: 0, totalPixels: 0, match: false, error: `Cannot read image: ${imagePathB}` };

  // Resize B to A's dimensions if different (baseline often has different scale)
  const width = pngA.width;
  const height = pngA.height;
  const resizedB = resizePng(pngB, width, height);

  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(
    pngA.data,
    resizedB.data,
    diff.data,
    width,
    height,
    { threshold: 0.1, includeAA: false },
  );
  const totalPixels = width * height;
  const diffPercent = (diffPixels / totalPixels) * 100;
  const match = diffPercent <= threshold * 100;

  // Save diff PNG next to imagePathA
  const parent = imagePathA.replace(/[\\/][^\\/]+$/, '');
  const baseName = imagePathA.replace(/.*[\\/]/, '').replace(/\.png$/i, '');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const diffImagePath = `${parent}/${baseName}-diff-${timestamp}.png`;
  try {
    mkdirSync(parent, { recursive: true });
    writeFileSync(diffImagePath, PNG.sync.write(diff));
  } catch {
    // Non-fatal
  }

  return { diffPercent, diffPixels, totalPixels, match, diffImagePath };
}

function listSpecImagePaths(featureName: string, workspaceRoot: string): string[] {
  const imagesDir = join(workspaceRoot, 'docs', 'specs', featureName, 'images');
  if (!existsSync(imagesDir)) return [];

  return readdirSync(imagesDir)
    .filter((f) => IMAGE_EXTENSIONS.has(f.slice(f.lastIndexOf('.')).toLowerCase()))
    .map((filename) => `docs/specs/${featureName}/images/${filename}`);
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'fetch_confluence_page',
      description: 'Fetch a Confluence page by URL and return its content as markdown. Requires CONFLUENCE_USER and CONFLUENCE_PASS (or CONFLUENCE_TOKEN for PAT) in .claude/mcp-server/.env',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Full Confluence page URL, e.g. https://your-confluence.example.com/conf/spaces/YOUR-SPACE/pages/123/...',
          },
        },
        required: ['url'],
      },
    },
    {
      name: 'read_spec_images',
      description: 'Read all downloaded spec images for a feature and return them as base64 image content. Use this at B10 before implementing <Feature>.tsx to get direct visual access to spec screenshots.',
      inputSchema: {
        type: 'object',
        properties: {
          featureName: {
            type: 'string',
            description: 'Feature name matching the folder under docs/specs/ (e.g. ProcessAndPublish)',
          },
        },
        required: ['featureName'],
      },
    },
    {
      name: 'compare_images',
      description: 'Compare two PNG images pixel-by-pixel using pixelmatch. Returns diff percentage and writes a diff visualization PNG. Used at B11 for visual regression vs spec mockup baseline.',
      inputSchema: {
        type: 'object',
        properties: {
          imagePathA: {
            type: 'string',
            description: 'Absolute or workspace-relative path to first PNG (typically actual screenshot from B11).',
          },
          imagePathB: {
            type: 'string',
            description: 'Absolute or workspace-relative path to second PNG (typically spec baseline image).',
          },
          threshold: {
            type: 'number',
            description: 'Pass threshold as fraction (0.05 = 5%). Default 0.05.',
          },
        },
        required: ['imagePathA', 'imagePathB'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'compare_images') {
    const { imagePathA, imagePathB, threshold } = request.params.arguments as {
      imagePathA: string;
      imagePathB: string;
      threshold?: number;
    };
    if (!imagePathA || !imagePathB) {
      return { content: [{ type: 'text', text: 'imagePathA and imagePathB are required' }], isError: true };
    }

    const workspaceRoot = process.cwd();
    const resolveA = imagePathA.startsWith('/') || /^[A-Za-z]:[\\/]/.test(imagePathA) ? imagePathA : join(workspaceRoot, imagePathA);
    const resolveB = imagePathB.startsWith('/') || /^[A-Za-z]:[\\/]/.test(imagePathB) ? imagePathB : join(workspaceRoot, imagePathB);
    const thr = typeof threshold === 'number' ? threshold : 0.05;

    const result = compareImages(resolveA, resolveB, thr);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: !!result.error };
  }

  if (request.params.name === 'read_spec_images') {
    const { featureName } = request.params.arguments as { featureName: string };
    if (!featureName) {
      return { content: [{ type: 'text', text: 'featureName is required' }], isError: true };
    }

    const workspaceRoot = process.cwd();
    const images = listSpecImagePaths(featureName, workspaceRoot);

    if (images.length === 0) {
      return {
        content: [{ type: 'text', text: `No images found for feature "${featureName}" in docs/specs/${featureName}/images/` }],
      };
    }

    const text = [
      `Found ${images.length} spec image(s) for "${featureName}".`,
      `Read each file below to see the spec visually — they are the authoritative UI spec:`,
      ...images.map((p, i) => `${i + 1}. ${p}`),
    ].join('\n');

    return { content: [{ type: 'text', text }] };
  }

  if (request.params.name !== 'fetch_confluence_page') {
    return { content: [{ type: 'text', text: 'Unknown tool' }], isError: true };
  }

  const { url } = request.params.arguments as { url: string };

  const pageId = extractPageId(url);
  if (!pageId) {
    return {
      content: [{ type: 'text', text: `Cannot extract page ID from URL: ${url}` }],
      isError: true,
    };
  }

  const baseConfUrl = extractBaseUrl(url);

  // Support both Basic auth (user+pass) and Personal Access Token (PAT)
  const user = process.env.CONFLUENCE_USER;
  const pass = process.env.CONFLUENCE_PASS;
  const pat = process.env.CONFLUENCE_TOKEN;

  if (!pat && (!user || !pass)) {
    return {
      content: [{
        type: 'text',
        text: [
          'Missing Confluence credentials.',
          'Set one of:',
          '  • CONFLUENCE_USER + CONFLUENCE_PASS  (LDAP/AD login)',
          '  • CONFLUENCE_TOKEN                    (Personal Access Token)',
          'in: .claude/mcp-server/.env',
        ].join('\n'),
      }],
      isError: true,
    };
  }

  try {
    const apiUrl = `${baseConfUrl}/rest/api/content/${pageId}?expand=body.export_view,title,space`;

    const authHeader = pat
      ? { Authorization: `Bearer ${pat}` }
      : {
          Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
        };

    const agent = new (await import('https')).Agent({ rejectUnauthorized: false });

    const apiResp = await axios.get(apiUrl, {
      headers: { ...authHeader, Accept: 'application/json' },
      httpsAgent: agent,
    });
    const { data } = apiResp;

    const title: string = data.title;
    const space: string = data.space?.name ?? '';
    const html: string = data.body.export_view.value;
    const markdown = htmlToMarkdown(html);

    const output = [
      `# ${title}`,
      space ? `**Space:** ${space}` : '',
      `**Page ID:** ${pageId}`,
      `**URL:** ${url}`,
      '',
      '---',
      '',
      markdown,
    ].filter(Boolean).join('\n');

    // Embedded-page attachment URLs (/download/attachments/embedded-page/...) require a web
    // session cookie that REST/Basic auth cannot provide. Work around this by prefetching the
    // current page's attachment list once, building a filename→REST-download-URL map, then
    // substituting those REST URLs (which do accept Basic/Bearer auth) before fetching.
    // Build filename → direct download URL map from the page's attachment list.
    // Use _links.download (the versioned URL) which accepts Basic/Bearer auth,
    // unlike /rest/api/content/{id}/download which redirects through the web layer.
    const attachmentMap = new Map<string, string>();
    try {
      const attResp = await axios.get(
        `${baseConfUrl}/rest/api/content/${pageId}/child/attachment?limit=50&expand=_links`,
        { headers: { ...authHeader, Accept: 'application/json' }, httpsAgent: agent },
      );
      for (const att of (attResp.data.results ?? [])) {
        const downloadPath: string | undefined = att._links?.download;
        if (att.title && downloadPath) {
          // _links.download is relative to the Confluence context root (e.g. /conf),
          // not the origin, so prepend baseConfUrl not just origin.
          attachmentMap.set(att.title as string, `${baseConfUrl}${downloadPath}`);
        }
      }
    } catch {
      // Non-fatal — fall back to original URLs
    }

    const rawImageUrls = extractImageUrls(html, baseConfUrl).slice(0, 10);
    const imageUrls = rawImageUrls.map((imgUrl) => {
      const m = imgUrl.match(/\/download\/attachments\/embedded-page\/[^/]+\/[^/]+\/([^?#]+)/);
      if (!m) return imgUrl;
      const filename = decodeURIComponent(m[1]);
      return attachmentMap.get(filename) ?? imgUrl;
    });

    const imageResults = await Promise.all(
      imageUrls.map((imgUrl) => fetchImageAsBase64(imgUrl, authHeader, agent)),
    );

    // Save markdown to docs/specs/ for user to review
    const safeTitle = title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 80);
    const specsDir = join(process.cwd(), 'docs', 'specs');
    const specPath = join(specsDir, `${safeTitle}.md`);
    try {
      mkdirSync(specsDir, { recursive: true });
      writeFileSync(specPath, output, 'utf-8');
    } catch {
      // Non-fatal — continue even if write fails
    }

    // Save embedded images to disk so B2 can annotate them without re-downloading
    const imagesDir = join(specsDir, safeTitle, 'images');
    const savedImagePaths: string[] = [];
    if (imageResults.some(Boolean)) {
      try {
        mkdirSync(imagesDir, { recursive: true });
        imageResults.forEach((img, idx) => {
          if (img && img.mimeType.startsWith('image/')) {
            const ext = img.mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
            const filename = `mcp-image-${String(idx + 1).padStart(2, '0')}.${ext}`;
            writeFileSync(join(imagesDir, filename), Buffer.from(img.data, 'base64'));
            savedImagePaths.push(`docs/specs/${safeTitle}/images/${filename}`);
          }
        });
      } catch {
        // Non-fatal
      }
    }

    const imageNote = savedImagePaths.length > 0
      ? `\n\n> **Spec images saved (${savedImagePaths.length}):** ${savedImagePaths.map((p) => `\`${p}\``).join(', ')}`
      : '';
    const savedNote = `\n\n> **Spec saved to:** \`docs/specs/${safeTitle}.md\`${imageNote}`;

    const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [
      { type: 'text', text: output + savedNote },
    ];
    for (const img of imageResults) {
      if (img) {
        content.push({ type: 'image', data: img.data, mimeType: img.mimeType });
      }
    }

    return { content };
  } catch (err: unknown) {
    const status = (err as { response?: { status: number } }).response?.status;
    const hint = status === 401
      ? 'Authentication failed — check CONFLUENCE_USER / CONFLUENCE_PASS / CONFLUENCE_TOKEN'
      : status === 403
        ? 'Access denied — your account may not have permission to view this page'
        : status === 404
          ? `Page ${pageId} not found`
          : String(err);

    return { content: [{ type: 'text', text: hint }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
