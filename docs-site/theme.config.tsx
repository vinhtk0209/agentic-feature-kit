import React from 'react'
import type { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
  logo: (
    <span>
      <b>claude-workflow-kit</b> <span style={{ opacity: 0.6 }}>docs</span>
    </span>
  ),
  project: {
    link: 'https://github.com/your-org/claude-workflow-kit',
  },
  docsRepositoryBase: 'https://github.com/your-org/claude-workflow-kit/tree/main/docs-site',
  footer: {
    content: (
      <span>
        claude-workflow-kit — agentic workflow kit. MIT Licence.
      </span>
    ),
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="Documentation for claude-workflow-kit — turn a spec into convention-compliant, PR-ready feature code." />
    </>
  ),
}

export default config
