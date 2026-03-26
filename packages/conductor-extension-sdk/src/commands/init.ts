import fs from 'fs'
import path from 'path'

export async function init(name: string): Promise<void> {
  const dir = path.resolve(name)
  const extensionId = name.toLowerCase().replace(/[^a-z0-9-]/g, '-')

  if (fs.existsSync(dir)) {
    console.error(`Directory "${name}" already exists.`)
    process.exit(1)
  }

  console.log(`Creating extension "${name}" in ${dir}...`)

  fs.mkdirSync(path.join(dir, 'src'), { recursive: true })

  // package.json
  const pkg = {
    name: `conductor-extension-${extensionId}`,
    version: '0.1.0',
    private: true,
    scripts: {
      build: 'conductor-extension build',
      package: 'conductor-extension package',
      dev: 'conductor-extension dev'
    },
    dependencies: {
      '@conductor/extension-sdk': '^0.1.0'
    },
    peerDependencies: {
      react: '^18.0.0'
    }
  }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')

  // manifest.json
  const manifest = {
    id: extensionId,
    name: name,
    version: '0.1.0',
    main: 'index.js'
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

  // tsconfig.json
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      jsx: 'react-jsx',
      outDir: './dist'
    },
    include: ['src']
  }
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n')

  // src/index.tsx
  const indexContent = `import { defineExtension } from '@conductor/extension-sdk'
import { MyTab } from './MyTab'

export default defineExtension({
  id: '${extensionId}',
  name: '${name}',
  tabs: [
    {
      type: '${extensionId}-tab',
      label: '${name}',
      icon: () => <span>📦</span>,
      component: MyTab
    }
  ]
})
`
  fs.writeFileSync(path.join(dir, 'src/index.tsx'), indexContent)

  // src/MyTab.tsx
  const tabContent = `import type { TabProps } from '@conductor/extension-sdk'

export function MyTab({ tab }: TabProps) {
  return (
    <div style={{ padding: 20, color: '#e4e4e7' }}>
      <h2>Hello from ${name}!</h2>
      <p>Tab: {tab.title}</p>
    </div>
  )
}
`
  fs.writeFileSync(path.join(dir, 'src/MyTab.tsx'), tabContent)

  console.log(`
Extension scaffolded successfully!

Next steps:
  cd ${name}
  npm install
  npm run build
  npm run package
`)
}
