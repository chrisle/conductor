import AdmZip from 'adm-zip'
import fs from 'fs'
import path from 'path'

export async function pack(): Promise<void> {
  const cwd = process.cwd()
  const distDir = path.join(cwd, 'dist')

  if (!fs.existsSync(path.join(distDir, 'manifest.json'))) {
    console.error('No dist/manifest.json found. Run "conductor-plugin build" first.')
    process.exit(1)
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf-8'))
  const zipName = `${manifest.id}-${manifest.version}.zip`
  const zipPath = path.join(cwd, zipName)

  const zip = new AdmZip()

  // Add all files from dist/
  const files = fs.readdirSync(distDir)
  for (const file of files) {
    const filePath = path.join(distDir, file)
    const stat = fs.statSync(filePath)
    if (stat.isFile()) {
      zip.addLocalFile(filePath)
    }
  }

  zip.writeZip(zipPath)
  console.log(`Package created: ${zipName}`)
}
