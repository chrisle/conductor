#!/usr/bin/env node

import { argv, exit } from 'process'
import { init } from './commands/init.js'
import { build } from './commands/build.js'
import { pack } from './commands/pack.js'
import { dev } from './commands/dev.js'

const [,, command, ...args] = argv

const USAGE = `
conductor-extension - Conductor Extension SDK CLI

Commands:
  init <name>     Scaffold a new extension project
  build           Bundle the extension for distribution
  package         Create a .zip file from the built extension
  dev             Watch mode + symlink to Conductor extensions dir

Options:
  --help          Show this help message
`

async function main() {
  switch (command) {
    case 'init':
      if (!args[0]) {
        console.error('Usage: conductor-extension init <name>')
        exit(1)
      }
      await init(args[0])
      break
    case 'build':
      await build()
      break
    case 'package':
      await pack()
      break
    case 'dev':
      await dev()
      break
    case '--help':
    case undefined:
      console.log(USAGE)
      break
    default:
      console.error(`Unknown command: ${command}`)
      console.log(USAGE)
      exit(1)
  }
}

main().catch(err => {
  console.error(err)
  exit(1)
})
