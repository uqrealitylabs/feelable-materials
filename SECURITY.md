# Security

Report secrets or credential leaks privately where possible. Use GitHub private vulnerability reporting if it is enabled: https://github.com/uqrealitylabs/repo-template/security/advisories/new

If private reporting is unavailable, contact a maintainer directly before posting private keys, paid asset packages, licence files, signing keys, exploit details, or sensitive logs.

Common files to keep out of Git:

- Unity cloud/build credentials
- Unreal Marketplace or private plugin files
- Godot `export_credentials.cfg`
- keystores and signing keys
- `.env`
- API keys
- paid asset-store packages
