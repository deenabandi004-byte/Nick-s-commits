"""
Offerloop MCP server.

Three tools (find_contacts, get_company_intel, draft_outreach) exposed over
Model Context Protocol to AI assistants (Claude, ChatGPT, Cursor, etc.).
Anonymous IP-based usage with soft paywall + attribution tokens that flow
into the existing /claim signup funnel.

Mounts onto the existing Flask app at /mcp (stateless Streamable HTTP).
See mcp_server.flask_mount.register_mcp_blueprint().
"""
