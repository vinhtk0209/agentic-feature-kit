import nextra from 'nextra'

const withNextra = nextra({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.tsx',
  defaultShowCopyCode: true,
})

export default withNextra({
  reactStrictMode: true,
  // For a static GitHub Pages deploy, uncomment the next two lines and set basePath
  // to your repo name. For Vercel, leave them commented (zero-config).
  // output: 'export',
  // basePath: '/claude-workflow-kit',
  images: { unoptimized: true },
})
