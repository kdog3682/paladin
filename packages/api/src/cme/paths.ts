import { homedir } from 'os'
import { join } from 'path'

const HOME = homedir()
const ROOT = join(HOME, '.paladin')

export const userProjectsDir = () => join(ROOT, 'user', 'projects')
export const projectDir = (project: string) => join(userProjectsDir(), project)
export const documentsDir = (project: string) => join(projectDir(project), 'documents')
export const documentPath = (project: string, id: string) => join(documentsDir(project), `${id}.json`)

export const systemStateDir = () => join(ROOT, 'system', 'state')
export const systemCacheDir = () => join(ROOT, 'system', 'cache')
export const systemConfigDir = () => join(ROOT, 'system', 'config')
export const configPath = () => join(systemConfigDir(), 'config.json')
