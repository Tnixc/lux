import { defineEventHandler } from 'h3'
import { getSetting } from '../utils/settings'
import { homedir } from 'node:os'

export default defineEventHandler(() => {
  return {
    defaultAgentCli: getSetting('default_agent_cli') || 'amp',
    homeDir: getSetting('home_dir') || homedir()
  }
})
