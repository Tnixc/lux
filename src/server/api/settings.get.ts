import { defineEventHandler } from 'h3'
import { getConfiguredDefaultAgentCli, getConfiguredHomeDir } from '../utils/settings'

export default defineEventHandler(() => {
  return {
    defaultAgentCli: getConfiguredDefaultAgentCli(),
    homeDir: getConfiguredHomeDir()
  }
})
