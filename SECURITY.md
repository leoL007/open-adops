# Security Policy

## Reporting a vulnerability

Please do not post sensitive account data, credentials, access tokens, or customer exports in a public issue. Report a vulnerability through GitHub's private vulnerability reporting feature for this repository.

## Security model

- The HTTP service binds to `127.0.0.1` by default.
- Browser projects are stored locally with `localStorage`.
- Raw imported CSV rows are parsed in the browser; only aggregated metrics are sent to the local Codex bridge.
- Codex runs with an ephemeral session and a read-only sandbox.
- The browser does not store an API key.
- OpenAdOps does not apply live ad-account mutations.

This is an early open-source release. Users remain responsible for removing sensitive data from project notes, exported reports, screenshots, and bug reports.
