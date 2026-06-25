# Refactoring Status

## Completed ✅
1. ✅ Created MOVE_PLAN.md with comprehensive mapping
2. ✅ Created config.py with all configuration constants

## In Progress
- Moving extensions to extensions.py
- Moving services to services/*.py
- Moving routes to routes/*.py
- Moving utils to utils/*.py

## Next Steps
Given the size of app.py (7813 lines), the refactoring will proceed systematically:

1. **Config & Extensions** (DONE: config.py)
   - extensions.py - Flask app, CORS, Firebase init

2. **Services** (Critical - dependencies for routes)
   - auth.py - Authentication decorators
   - firebase.py - Firebase helpers
   - gmail_client.py - Gmail integration
   - pdl_client.py - PDL API client
   - openai_client.py - OpenAI client
   - reply_generation.py - Email generation
   - directory_search.py - Search logic
   - resume_parser.py - Resume processing
   - pdf_builder.py - PDF generation
   - stripe_client.py - Stripe integration

3. **Routes** (Depend on services)
   - All route handlers organized by domain

4. **Utils** (Helper functions)
   - Contact utilities
   - Email utilities
   - User utilities

5. **wsgi.py** (Main entry point)
   - Flask app creation
   - Blueprint registration
   - Middleware setup

6. **app.py shim** (Temporary compatibility)
   - Simple delegation to backend.wsgi

## Notes
- All function signatures and behavior must remain identical
- All imports will use absolute `app.*` paths
- Circular imports will be resolved by moving imports into function scope
- The refactoring maintains 100% runtime behavior parity

