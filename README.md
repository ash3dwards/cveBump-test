# CVE Bump Test Repository

This is a test repository for testing the CVE Bump auto-PR feature.

## Intentionally Vulnerable Dependencies

This repo contains intentionally outdated/vulnerable packages for testing:

- `form-data@4.0.0` - Vulnerable to GHSA-fjxv-7rqg-78g4 (CRITICAL)
- `axios@1.6.0` - Has known vulnerabilities
- `lodash@4.17.20` - Has known vulnerabilities

**DO NOT USE THIS IN PRODUCTION**
