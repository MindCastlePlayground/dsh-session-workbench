import { execFileSync } from 'node:child_process'
import { constants } from 'node:fs'
import { copyFile, mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const VERSION = '0.2.3-alpha.2'
const BASE = '4b399c39a6d1479cd84ca591b4d7c88e24d38a96'
const packages = {
  'dsh-agent': 'packages/core/agent/src/index.ts',
  'dsh-agent-loop': 'packages/core/agent-loop/src/index.ts',
  'dsh-session-persistence-jsonl': 'packages/session/session-persistence-jsonl/src/index.ts',
  'dsh-api-session-controller': 'packages/api/session-controller/src/index.ts',
}
const [, , upstream, installation] = process.argv
if (!upstream || !installation) {
  throw new Error('Usage: node patches/apply-web-relocation.mjs <applied-dsh-source> <dsh-npm-prefix>')
}

const source = resolve(upstream)
const modules = resolve(installation, 'node_modules', '@deepseek-ai')
const revisions = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
if (revisions !== BASE) throw new Error('Use the DSH 0.2.3-alpha.2 source checkout.')
const patch = fileURLToPath(new URL('./dsh-session-relocation.patch', import.meta.url))
execFileSync('git', ['-C', source, 'apply', '--reverse', '--check', patch], { stdio: 'inherit' })

// Cordis exposes FiberState only as a TypeScript const enum in this release.
// Compile those constants without bundling a second copy of the runtime.
const cordisSource = await readFile(join(source, 'vendor', 'cordis', 'src', 'fiber.ts'), 'utf8')
const fiberState = cordisSource.match(/export const enum FiberState \{[^}]*\}/)?.[0]
if (!fiberState) throw new Error('Cannot find the pinned Cordis FiberState declaration.')
const cordisEnums = {
  name: 'cordis-const-enums',
  setup(builder) {
    builder.onResolve({ filter: /^@deepseek-ai\/cordis$/ }, ({ namespace, path }) =>
      namespace === 'cordis-const-enums' ? { path, external: true } : { path, namespace: 'cordis-const-enums' })
    builder.onLoad({ filter: /.*/, namespace: 'cordis-const-enums' }, () => ({
      contents: 'export * from "@deepseek-ai/cordis";\n' + fiberState.replace('const enum', 'enum'),
      loader: 'ts',
    }))
  },
}

const scratch = await mkdtemp(join(tmpdir(), 'dsh-web-relocation-'))
const compiled = []
try {
  for (const [name, entry] of Object.entries(packages)) {
    const folder = join(modules, name)
    const metadata = JSON.parse(await readFile(join(folder, 'package.json'), 'utf8'))
    if (metadata.version !== VERSION) throw new Error('Unexpected version for ' + name + ': ' + metadata.version)
    const target = join(folder, 'lib', 'index.js')
    const output = join(scratch, name + '.mjs')
    await build({
      absWorkingDir: source,
      entryPoints: [entry],
      outfile: output,
      bundle: true,
      packages: 'external',
      tsconfigRaw: {},
      plugins: [cordisEnums],
      platform: 'node',
      format: 'esm',
      target: 'es2022',
    })
    execFileSync(process.execPath, ['--check', output], { stdio: 'inherit' })
    compiled.push({ target, output, backup: target + '.upstream', pending: target + '.relocation-pending' })
  }

  for (const item of compiled) {
    await copyFile(item.target, item.backup, constants.COPYFILE_EXCL).catch(error => {
      if (error.code !== 'EEXIST') throw error
    })
    await copyFile(item.output, item.pending)
  }

  const replaced = []
  try {
    for (const item of compiled) {
      await rename(item.pending, item.target)
      replaced.push(item)
    }
  } catch (error) {
    for (const item of replaced) await copyFile(item.backup, item.target)
    throw error
  }
} finally {
  await rm(scratch, { recursive: true, force: true })
}

console.log('Installed DSH Web hot session relocation for ' + VERSION)
