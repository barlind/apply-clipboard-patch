require('esbuild').build({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outdir: 'out',
    platform: 'node',
    external: ['vscode'],  // Treat 'vscode' as external
    logLevel: 'info',
  }).catch(() => process.exit(1));