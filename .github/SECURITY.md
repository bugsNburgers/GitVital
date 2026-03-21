# Security Policy

## Supported Versions

This project is under active development. Security fixes are applied on the `main` branch.

| Version | Supported |
| --- | --- |
| `main` | :white_check_mark: |
| older snapshots/commits | :x: |

## Reporting a Vulnerability

Please do **not** open public GitHub issues for security vulnerabilities.

Use one of the private channels below:

1. Preferred: GitHub private vulnerability reporting
2. Fallback: open a private security advisory draft in this repository

When reporting, include:

- Affected endpoint/file/component
- Clear reproduction steps
- Impact (data leak, auth bypass, RCE, DoS, etc.)
- Proof of concept (minimal)
- Suggested fix (optional)

## Initial Response SLA

- Acknowledgement target: within 72 hours
- Triage/update target: within 7 days

## Disclosure Policy

- Please allow maintainers time to investigate and patch before public disclosure.
- After a patch is available, coordinated disclosure is welcome.

## Scope

In scope:

- Backend API routes and worker logic
- Authentication/session/token handling
- Redis/cache/key handling
- Dependency vulnerabilities with practical exploit path

Out of scope (unless privilege escalation is demonstrated):

- Missing best-practice headers without exploit impact
- Rate-limit bypass claims without reproducible abuse path
- Self-XSS requiring only your own browser session

## Safe Harbor

If you act in good faith, avoid privacy violations/destructive actions, and report responsibly, we will not pursue legal action for your research.
