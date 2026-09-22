# Security notes

This starter is intended for media you own or are authorized to distribute.

Before exposing the service publicly:

- Replace every example secret in `.env`.
- Serve the public endpoint only over HTTPS.
- Put the admin upload API behind a VPN, zero-trust gateway, or strict firewall in addition to the API key.
- Restrict `CORS_ORIGIN` rather than leaving it at `*`.
- Add rate limiting at Nginx or an upstream proxy.
- Keep the source upload directory inaccessible from the public web server.
- Run the service as an unprivileged user where practical.
- Set filesystem quotas and monitor disk usage; video can exhaust a VPS quickly.
- Back up PostgreSQL separately from disposable transcoded files.
- Consider malware scanning for third-party uploads.
- Validate any future remote-ingest feature against SSRF: block loopback, RFC1918/private ranges, link-local addresses, and cloud metadata endpoints.
- Add allowed-domain/referrer policy if embeds must be restricted to specific sites.
- Treat signed URLs as bearer tokens. Keep their TTL short enough for your use case.
