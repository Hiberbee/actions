import { exportVariable, getInput, setFailed, info } from '@actions/core'
import { exec } from '@actions/exec'
import { download, getOsPlatform, getBinDir, getWorkspaceDir } from './index'
import { mkdirP } from '@actions/io'
import { exists } from '@actions/io/lib/io-util'
import { join } from 'path'

// noinspection JSUnusedGlobalSymbols
enum HelmfileArgs {
  ENVIRONMENT = 'environment',
  INTERACTIVE = 'interactive',
  KUBE_CONTEXT = 'kube-context',
  LOG_LEVEL = 'log-level',
}

function getHelmfileArgsFromInput(): string[] {
  return Object.values(HelmfileArgs)
    .filter((key) => getInput(key) !== '')
    .map((key) => `--${key}=${getInput(key)}`)
}

const workspaceDir = getWorkspaceDir()
const binDir = getBinDir(workspaceDir)
const cacheDir = join(workspaceDir, '.cache')
const helmCacheDir = join(workspaceDir, 'helm')
const platform = getOsPlatform()
const plugins = new Map<string, URL>()
  .set('diff', new URL('https://github.com/databus23/helm-diff'))
  .set('secrets', new URL('https://github.com/zendesk/helm-secrets'))

async function run(): Promise<void> {
  const helmVersion = getInput('helm-version')
  const helmfileVersion = getInput('helmfile-version')
  const repositoryConfig = getInput('repository-config')
  const helmfileConfig = getInput('helmfile-config')
  const helmUrl = `https://get.helm.sh/helm-v${helmVersion}-${platform}-amd64.tar.gz`
  const helmfileUrl = `https://github.com/roboll/helmfile/releases/download/v${helmfileVersion}/helmfile_${platform}_amd64`
  const repositoryConfigPath = join(workspaceDir, repositoryConfig)
  const helmfileConfigPath = join(workspaceDir, helmfileConfig)
  const pluginUrls = getInput('plugins')
    .split(',')
    .filter((name) => plugins.has(name))
    .map((name) => plugins.get(name) as URL)

  try {
    exportVariable('XDG_CACHE_HOME', cacheDir)
    const repositoryArgs = (await exists(repositoryConfigPath)) ? ['--repository-config', repositoryConfigPath] : []
    await mkdirP(helmCacheDir)
    await download(helmUrl, join(binDir, 'helm'))
    for (const url of pluginUrls) {
      await exec('helm', ['plugin', 'install', url.toString()]).catch(info)
    }
    await download(helmfileUrl, join(binDir, 'helmfile'))
    if (repositoryArgs.length > 0) {
      await exec('helm', ['repo', 'update'].concat(repositoryArgs))
    }
    if (getInput('helmfile-command') !== '') {
      const globalArgs = getHelmfileArgsFromInput().concat(
        (await exists(helmfileConfigPath)) ? ['--file', helmfileConfigPath] : [],
      )
      await exec('helmfile', globalArgs.concat(getInput('helmfile-command').split(' ')))
    } else if (getInput('helm-command') !== '') {
      await exec('helm', getInput('helm-command').split(' ').concat(repositoryArgs))
    }
  } catch (error) {
    setFailed(error.message)
  }
}

// noinspection JSIgnoredPromiseFromCall
run()
