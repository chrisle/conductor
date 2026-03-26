import { build as esbuild } from 'esbuild'
import fs from 'fs'
import path from 'path'

export async function build(): Promise<void> {
  const cwd = process.cwd()

  const manifestPath = path.join(cwd, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    console.error('No manifest.json found. Are you in an extension directory?')
    process.exit(1)
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  const entryPoint = findEntryPoint(cwd)
  if (!entryPoint) {
    console.error('No entry point found. Expected src/index.ts or src/index.tsx')
    process.exit(1)
  }

  const outDir = path.join(cwd, 'dist')
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  console.log(`Building extension "${manifest.name}"...`)

  await esbuild({
    entryPoints: [entryPoint],
    bundle: true,
    outfile: path.join(outDir, 'index.js'),
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    external: [
      'react',
      'react-dom',
      'zustand',
      'lucide-react',
      '@conductor/extension-api',
      '@conductor/extension-sdk'
    ],
    define: {
      'process.env.NODE_ENV': '"production"'
    },
    minify: false,
    sourcemap: true
  })

  fs.copyFileSync(manifestPath, path.join(outDir, 'manifest.json'))

  console.log(`Build complete: dist/index.js`)
}

function findEntryPoint(cwd: string): string | null {
  const candidates = [
    'src/index.tsx',
    'src/index.ts',
    'src/index.jsx',
    'src/index.js'
  ]
  for (const c of candidates) {
    const full = path.join(cwd, c)
    if (fs.existsSync(full)) return full
  }
  return null
}
