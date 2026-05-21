# Move Plan: app.py → Backend Structure

## 1. Configuration & Constants → config.py
- All environment variable reads (OPENAI_API_KEY, GOOGLE_CLIENT_ID, etc.)
- TIER_CONFIGS dictionary
- PDL_METRO_AREAS dictionary
- PDL_BASE_URL
- RESUME_LINE constant
- GMAIL_SCOPES list
- OAUTH_REDIRECT_URI logic
- MEETING_CREDITS
- CACHE_DURATION
- DB_PATH
- CREATE_GMAIL_DRAFTS flag
- All API key validations

## 2. Flask Extensions → extensions.py
- Flask app initialization
- CORS configuration
- Firebase initialization
- All extension objects (db, etc.)

## 3. Routes → routes/*.py

### routes/health.py
- `/ping` (GET)
- `/health` (GET) 
- `/healthz` (GET)

### routes/spa.py
- `/` (GET) - SPA fallback
- `/<path:path>` (GET) - SPA catch-all

### routes/gmail_oauth.py
- `/api/google/oauth/start` (GET)
- `/api/google/oauth/callback` (GET)
- `/api/gmail/status` (GET)

### routes/emails.py
- `/api/emails/generate-and-draft` (POST)

### routes/contacts.py
- `/api/contacts` (GET, POST)
- `/api/contacts/<contact_id>` (PUT, DELETE)
- `/api/contacts/<contact_id>/check-replies` (GET)
- `/api/contacts/<contact_id>/mute-notifications` (POST)
- `/api/contacts/<contact_id>/generate-reply` (POST)
- `/api/contacts/batch-check-replies` (POST)
- `/api/contacts/bulk` (POST)

### routes/directory.py
- `/api/directory/contacts` (GET, POST)

### routes/runs.py
- `/api/free-run` (POST)
- `/api/free-run-csv` (POST)
- `/api/pro-run` (POST)
- `/api/pro-run-csv` (POST)
- `/api/basic-run` (POST) - redirect
- `/api/advanced-run` (POST) - redirect

### routes/enrichment.py
- `/api/autocomplete/<data_type>` (GET)
- `/api/enrich-job-title` (POST)

### routes/resume.py
- `/api/parse-resume` (POST)

### routes/meeting_prep.py
- `/api/meeting-prep` (POST)
- `/api/meeting-prep/history` (GET)
- `/api/meeting-prep/all` (GET)
- `/api/meeting-prep/<prep_id>` (GET, DELETE)
- `/api/meeting-prep/<prep_id>/download` (GET)

### routes/billing.py
- `/api/tier-info` (GET)
- `/api/check-credits` (GET)
- `/api/user/update-tier` (POST)
- `/api/create-checkout-session` (POST)
- `/api/complete-upgrade` (POST)
- `/api/stripe-webhook` (POST)
- `/api/create-portal-session` (POST)
- `/api/subscription-status` (GET)
- `/api/debug/check-upgrade/<user_id>` (GET)

### routes/users.py
- (Any user-specific routes if separate from billing)

## 4. Services → services/*.py

### services/auth.py
- `require_firebase_auth` decorator
- `check_and_reset_credits` function

### services/firebase.py
- Firebase initialization (already exists, enhance)
- All Firebase helper functions

### services/gmail_client.py
- `_gmail_client_config()`
- `_save_user_gmail_creds()`
- `_load_user_gmail_creds()`
- `_gmail_service()`
- `get_thread_messages()`
- `check_for_replies()`
- `get_gmail_service()`
- `get_gmail_service_for_user()`
- `create_gmail_draft_for_user()`

### services/pdl_client.py
- `clean_company_name()`
- `clean_location_name()`
- `enrich_job_title_with_pdl()`
- `get_autocomplete_suggestions()`
- `search_contacts_with_smart_location_strategy()`
- `try_metro_search_optimized()`
- `try_locality_search_optimized()`
- `try_job_title_levels_search_enhanced()`
- `determine_job_level()`
- `execute_pdl_search()`
- `extract_contact_from_pdl_person_enhanced()`
- `add_pdl_enrichment_fields_optimized()`
- `search_contacts_with_pdl_optimized()`
- `search_contacts_with_pdl()` (wrapper)
- `enrich_linkedin_profile()`
- `get_pdl_cache_key()`
- `get_cached_pdl_data()`
- `set_pdl_cache()`

### services/openai_client.py
- OpenAI client initialization
- `batch_generate_emails()`
- `generate_meeting_similarity()`
- `generate_meeting_questions()`
- `extract_hometown_from_education_history_enhanced()`
- `batch_extract_hometowns()`
- `generate_similarity_summary()`
- `generate_similarity_async()`
- `batch_generate_similarities()`

### services/reply_generation.py
- All email generation functions:
  - `generate_template_based_email_system()`
  - `generate_enhanced_template_email()`
  - `generate_email_for_both_tiers()`
  - `generate_email_for_tier()`
  - All template-related functions
  - All email formatting/sanitization functions

### services/directory_search.py
- `determine_location_strategy()`
- `es_title_block()`
- `es_title_block_from_enrichment()`

### services/resume_parser.py
- `extract_text_from_pdf()`
- `parse_resume_info()`
- `extract_resume_info_fallback()`
- `extract_detailed_resume_insights()`
- `save_resume_to_firebase()`
- `upload_resume_to_firebase_storage()`

### services/pdf_builder.py
- `generate_meeting_pdf_simple_fixed()`
- `process_meeting_prep_background()`

### services/stripe_client.py
- All Stripe-related functions:
  - `handle_checkout_completed()`
  - `handle_subscription_updated()`
  - `handle_subscription_deleted()`
  - `handle_payment_succeeded()`
  - `handle_payment_failed()`

## 5. Models → models/*.py

### models/enums.py
- Any enum definitions (if any)

### models/users.py
- User data models/schemas (if any)

### models/contact.py
- Contact data models/schemas
- `normalize_contact()` function

### models/meeting_prep.py
- Meeting prep models (if any)

## 6. Utils → utils/*.py

### utils/users.py
- `check_and_reset_credits()` (if not auth service)
- User utility functions

### utils/contact.py
- `_school_aliases()`
- `_contact_has_school_alias()`
- `get_university_shorthand()`
- `get_university_mascot()`
- `get_current_season()`
- `determine_industry()`
- `extract_experience_summary()`
- `extract_hometown_from_resume()`
- `extract_companies_from_resume()`
- `detect_commonality()`
- `normalize_contact()` (if not model)
- `extract_hometown_from_education()`
- `_choose_best_email()`

### utils/meeting_prep.py
- Meeting utility functions
- `fetch_company_news()`

### utils/enums.py
- Enum utilities (if any)

### Email Generation Utils (move to utils/contact.py or reply_generation.py)
- `find_mutual_interests_and_hooks()`
- `extract_interests_from_resume()`
- `extract_contact_interests()`
- `get_industry_from_company()`
- `extract_field_from_title()`
- `find_interest_overlaps()`
- `calculate_interest_similarity()`
- `determine_overlap_type()`
- `create_interest_hook()`
- `generate_unique_conversation_starters()`
- `extract_university_name()`
- `extract_location_from_interest()`
- `generate_compelling_email_with_hooks()`
- `generate_intriguing_subject_line()`
- `generate_fallback_email_with_hook()`
- `extract_comprehensive_user_info()`
- `generate_simple_fallback_email()`
- `sanitize_placeholders()`
- `clean_email_text()`
- `extract_user_info_from_resume_priority()`
- `extract_career_interests_from_profile()`
- `build_template_prompt()`
- `generate_conversation_hook()`
- `parse_openai_email_response()`
- `parse_openai_email_response_updated()`
- `sanitize_email_placeholders()`
- `enforce_networking_prompt_rules()`
- `ensure_resume_line()`
- `attach_resume_if_available()`

## 7. Database Utils → utils/contact.py or new utils/db.py
- `get_db()` context manager
- `init_db()`
- `save_contacts_sqlite()`
- `list_contacts_sqlite()`

## 8. Main Application Logic → wsgi.py
- Flask app creation
- Blueprint registration
- Middleware registration (before_request, after_request)
- Error handlers
- Startup checks
- Static file serving setup

## 9. Business Logic Functions → routes/*.py or services/*.py
- `run_free_tier_enhanced_final()`
- `run_free_tier_enhanced_optimized()`
- `run_pro_tier_enhanced_final_with_text()` (if exists)
- `validate_search_inputs()`
- `log_api_usage()`
- `cleanup_old_csv_files()`
- `validate_api_keys()`
- `startup_checks()`
- `build_mailto_link()`

## Import Strategy
- Use absolute imports: `from app.config import ...`
- Services import from other services as needed
- Routes import from services and utils
- Avoid circular imports by moving imports into functions if needed

