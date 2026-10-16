# Workspace interaction regression check

`check-workspace-ui.mjs` mounts the actual App, AuthGate and WorkspaceMotion
components against an in-process mock API. It uses no Firebase credentials,
blocks external browser requests, and removes its temporary fixture afterward.
Mutation buttons are enabled only in this temporary fixture; the check opens and
closes forms without submitting business data. Production gates are unchanged.

Run with a development installation of Playwright and Chromium. To keep browser
tooling outside the application dependency tree, for example:

```sh
npm install --prefix /tmp/slaughterhouse-ui-tools playwright
node /tmp/slaughterhouse-ui-tools/node_modules/playwright/cli.js install chromium
PLAYWRIGHT_MODULE=/tmp/slaughterhouse-ui-tools/node_modules/playwright/index.mjs node scripts/check-workspace-ui.mjs
```

`CHROMIUM_EXECUTABLE` optionally selects an existing Chromium executable. If
Playwright is already resolvable from this project, the environment override is
unnecessary. Browser binaries may require additional OS libraries on Linux.

The eight cases cover desktop/mobile viewport sizes, light/dark themes and
motion enabled/paused. They exercise profile-menu hit testing; vendor-dialog
viewport bounds, input, close button, backdrop and Escape; theme/motion toggles;
invoice/record dialog navigation; mobile navigation; and logout theme cleanup
with login-input contrast. They do not verify live mutations, disabled business
gates, Safari-specific rendering, or every feature in the application.
