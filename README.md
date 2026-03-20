![lux](public/cover.webp)

cheapskate platform for running agents on your local projects.

lux lets you browse directories on your machine, mark them as projects, and spin up persistent terminal sessions running CLI agents. You interact with agents through an in-browser terminal, review git diffs as they work, and manage multiple projects and sessions at the same time.

## What it does

- Browse local directories and register them as projects
- Start named sessions that run an AI agent CLI in a tmux pane
- Connect to sessions through a web terminal (xterm.js or ghostty-web)
- Review git diffs, with syntax highlighting and split/unified views
- Auto-detect changes by polling git status and refreshing diffs on the fly
- Manage multiple projects and sessions from a single tab-based UI

## Setup

You will need Vite+, tmux, Node.js (Vite+ can do this for you).

Copy `.env.example` to `.env` and fill in your GitHub OAuth credentials/config:

```
LUX_AUTH_MODE=github
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
LUX_GITHUB_ALLOWED_USERS=your-github-username[,another-username]
LUX_HOME_DIR=~:~/Developer:~/Projects
LUX_DEFAULT_AGENT_CLI=codex
```

`LUX_AUTH_MODE` can be `github` or `none`.
`LUX_GITHUB_ALLOWED_USERS` is a comma-separated GitHub username allowlist (used in `github` mode).
`LUX_HOME_DIR` controls the root directories shown in the directory picker, colon-separated (defaults to `~`).
`LUX_DEFAULT_AGENT_CLI` sets the default agent CLI command when creating sessions (defaults to `amp`).

Install dependencies with `vp i`, `vp build`, and finally `vp preview`.
