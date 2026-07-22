# Security Policy

Please do **not** report security vulnerabilities through public GitHub issues.

Report them through BrowserStack's responsible disclosure program:
**https://www.browserstack.com/security** (or email security@browserstack.com).

Include the plugin version (see the repo release tag), your IDE/agent, and
reproduction steps. We'll acknowledge receipt and keep you updated.

## Scope notes

- The plugin stores your `PERCY_TOKEN` only in your project's gitignored
  secrets file or environment — never in committed files. If you believe a
  skill wrote a secret somewhere it shouldn't, treat that as a vulnerability
  and report it.
- The plugin talks only to `percy.io` REST APIs and your local test tooling.
