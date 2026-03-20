import { defineEventHandler } from 'h3'
import { homedir } from 'node:os'
import { getConfiguredDefaultAgentCli, getSetting } from '../utils/settings'

export default defineEventHandler(() => {
  const homeDir = process.env.LUX_HOME_DIR?.trim() || getSetting('home_dir') || homedir()
  return {
    defaultAgentCli: getConfiguredDefaultAgentCli(),
    homeDir
  }
})
