import { defineEventHandler } from 'h3'
import { getConfiguredHomeDir, getSetting } from '../utils/settings'

export default defineEventHandler(() => {
  return {
    defaultAgentCli: getSetting('default_agent_cli') || 'amp',
    homeDir: getConfiguredHomeDir()
  }
})
