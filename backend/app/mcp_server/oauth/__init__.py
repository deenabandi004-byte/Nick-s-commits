"""
OAuth 2.1 authorization server for the Offerloop MCP server.

Layout:
  - keys.py        RSA keypair loader (env var or ephemeral dev key)
  - tokens.py      JWT mint + verify (RS256, audience-bound to /mcp)
  - storage.py     In-memory auth code + refresh token + client registry
  - metadata.py    /.well-known/* JSON
  - blueprint.py   Flask routes: /oauth/{authorize,grant,token,register,jwks.json}

Architecture: separate AS at /oauth and RS at /mcp, per MCP spec 2025-06-18.
The AS federates identity to Firebase (Offerloop's existing user store) and
mints JWTs the RS validates against the AS's JWKS.
"""
