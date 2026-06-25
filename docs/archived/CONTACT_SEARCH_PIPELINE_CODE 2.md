# Contact Search & Email Draft Pipeline - Complete Code Reference

This document contains the complete code for all key functions in the contact search and email draft creation pipeline, organized for performance optimization analysis.

---

## 1. PDL SEARCH & CONTACT EXTRACTION

### 1.1 Main Search Function: `search_contacts_with_smart_location_strategy()`

**File:** `backend/app/services/pdl_client.py` (lines 2529-2601)

```python
def search_contacts_with_smart_location_strategy(
    job_title, company, location, max_contacts=8, college_alumni=None, exclude_keys=None
):
    """
    ENHANCED VERSION: Guarantees the requested number of verified alumni contacts
    
    When alumni filter is active, this function will:
    1. Fetch contacts in batches
    2. Filter for verified degree holders
    3. Continue fetching until we have enough verified alumni
    4. Return exactly the requested number
    
    PERFORMANCE OPTIMIZED: Parallelizes enrichment/cleaning operations
    """
    try:
        # ✅ ADD COMPREHENSIVE INPUT VALIDATION
        print(f"\n{'='*70}")
        print(f"🔍 PDL SEARCH STARTED (OPTIMIZED)")
        print(f"{'='*70}")
        print(f"📥 Input Parameters:")
        print(f"  ├─ job_title: '{job_title}'")
        print(f"  ├─ company: '{company}'")
        print(f"  ├─ location: '{location}'")
        print(f"  ├─ max_contacts: {max_contacts}")
        print(f"  ├─ college_alumni: '{college_alumni}'")
        print(f"  └─ exclude_keys: {len(exclude_keys) if exclude_keys else 0} contacts")
        
        # Location is required for general search (not prompt search)
        if not location or not location.strip():
            print(f"❌ ERROR: location is required but was empty or None")
            return []
        
        print(f"{'='*70}\n")
        
        print(f"Starting smart location search for {job_title} at {company} in {location}")
        if college_alumni:
            print(f"🎓 Alumni filter enabled: {college_alumni}")
        
        # ✅ OPTIMIZED: Parallelize enrichment and cleaning operations
        import time
        start_time = time.time()
        
        with ThreadPoolExecutor(max_workers=3) as executor:
            # Submit all enrichment/cleaning tasks in parallel
            future_title = executor.submit(cached_enrich_job_title, job_title)
            future_company = executor.submit(clean_company_name, company) if company else None
            future_location = executor.submit(clean_location_name, location)
            
            # Wait for all to complete
            job_title_enrichment = future_title.result()
            cleaned_company = future_company.result() if future_company else ''
            cleaned_location = future_location.result()
        
        enrichment_time = time.time() - start_time
        print(f"⚡ Parallel enrichment completed in {enrichment_time:.2f}s (vs ~3-5s sequential)")
        
        primary_title = job_title_enrichment.get('cleaned_name', job_title).lower()
        similar_titles = [t.lower() for t in job_title_enrichment.get('similar_titles', [])[:4]]
        
        # Analyze location strategy
        location_strategy = determine_location_strategy(cleaned_location)
        
        print(f"Location strategy: {location_strategy['strategy']}")
        if location_strategy['matched_metro']:
            print(f"Matched metro: {location_strategy['matched_metro']} -> {location_strategy['metro_location']}")
        
        # Step 4: CHANGED - If alumni filter is active, use batch fetching strategy
        if college_alumni:
            return _fetch_verified_alumni_contacts(
                primary_title, similar_titles, cleaned_company,
                location_strategy, job_title_enrichment,
                max_contacts, college_alumni, exclude_keys
            )
        

        search_start = time.time()
        contacts = _fetch_contacts_standard_parallel(
            primary_title, similar_titles, cleaned_company,
            location_strategy, job_title_enrichment,
            max_contacts, exclude_keys
        )
        search_time = time.time() - search_start
        
        total_time = time.time() - start_time
        
        # LOG FINAL RESULTS WITH TIMING
        print(f"\n{'='*70}")
        print(f"⏱️  SEARCH TIMING SUMMARY")
        print(f"{'='*70}")
        print(f"⏱️  Enrichment: {enrichment_time:.2f}s ({enrichment_time/total_time*100:.1f}%)")
        print(f"⏱️  PDL search + extraction: {search_time:.2f}s ({search_time/total_time*100:.1f}%)")
        print(f"⏱️  Total time: {total_time:.2f}s")
        print(f"📊 Contacts found: {len(contacts)}/{max_contacts}")
        if len(contacts) > 0:
            avg_time_per_contact = search_time / len(contacts)
            print(f"⏱️  Avg time per contact: {avg_time_per_contact:.2f}s")
        
        if len(contacts) == 0:
            print(f"⚠️  WARNING: No contacts found with valid emails for {job_title} in {location}")
            print(f"Search parameters: title='{primary_title}', company='{cleaned_company}', location='{cleaned_location}'")
        else:
            print(f"✅ Smart location search completed: {len(contacts)} contacts found with valid emails")
        print(f"{'='*70}\n")
        
        return contacts[:max_contacts]
        
    except Exception as e:
        print(f"Smart location search failed: {e}")
        import traceback
        traceback.print_exc()
        return []
```

### 1.2 Parallel Search Strategy: `_fetch_contacts_standard_parallel()`

**File:** `backend/app/services/pdl_client.py` (lines 483-576)

```python
def _fetch_contacts_standard_parallel(
    primary_title, similar_titles, cleaned_company,
    location_strategy, job_title_enrichment,
    max_contacts, exclude_keys=None
):
    """
    OPTIMIZED: Parallel contact fetching - runs multiple search strategies simultaneously
    This significantly reduces search time by trying all strategies in parallel
    """
    excluded_keys = exclude_keys or set()
    contacts = []
    seen_identities = set()
    
    import time
    search_start = time.time()
    
    # Determine which searches to run based on location strategy
    searches_to_run = []
    
    if location_strategy['strategy'] == 'metro_primary':
        # Run metro and locality searches in parallel
        searches_to_run.append(('metro', lambda: try_metro_search_optimized(
            primary_title, similar_titles, cleaned_company,
            location_strategy, max_contacts,
            college_alumni=None,
            exclude_keys=excluded_keys
        )))
        searches_to_run.append(('locality', lambda: try_locality_search_optimized(
            primary_title, similar_titles, cleaned_company,
            location_strategy, max_contacts,
            college_alumni=None,
            exclude_keys=excluded_keys
        )))
    else:
        # Run locality search first
        searches_to_run.append(('locality', lambda: try_locality_search_optimized(
            primary_title, similar_titles, cleaned_company,
            location_strategy, max_contacts,
            college_alumni=None,
            exclude_keys=excluded_keys
        )))
    
    # Always prepare broader search as backup
    broader_search = lambda: try_job_title_levels_search_enhanced(
        job_title_enrichment, cleaned_company,
        location_strategy['city'], location_strategy['state'],
        max_contacts,
        college_alumni=None,
        exclude_keys=excluded_keys
    )
    
    # Run initial searches in parallel
    if searches_to_run:
        print(f"⚡ Running {len(searches_to_run)} search strategies in parallel...")
        with ThreadPoolExecutor(max_workers=len(searches_to_run)) as executor:
            futures = {executor.submit(search_func): name for name, search_func in searches_to_run}
            
            for future in as_completed(futures):
                search_name = futures[future]
                try:
                    results = future.result()
                    print(f"✅ {search_name} search returned {len(results)} contacts")
                    
                    # Deduplicate by identity
                    for contact in results:
                        contact_id = get_contact_identity(contact)
                        if contact_id not in seen_identities:
                            contacts.append(contact)
                            seen_identities.add(contact_id)
                            if len(contacts) >= max_contacts:
                                break
                except Exception as e:
                    print(f"❌ {search_name} search failed: {e}")
    
    # If we still need more contacts, try broader search
    if len(contacts) < max_contacts:
        needed = max_contacts - len(contacts)
        print(f"⚡ Running broader search for {needed} more contacts...")
        try:
            broader_contacts = broader_search()
            for contact in broader_contacts:
                contact_id = get_contact_identity(contact)
                if contact_id not in seen_identities:
                    contacts.append(contact)
                    seen_identities.add(contact_id)
                    if len(contacts) >= max_contacts:
                        break
        except Exception as e:
            print(f"❌ Broader search failed: {e}")
    
    search_time = time.time() - search_start
    print(f"⚡ Parallel search completed in {search_time:.2f}s - found {len(contacts)} contacts")
    
    return contacts[:max_contacts]
```

### 1.3 PDL Search Execution: `execute_pdl_search()`

**File:** `backend/app/services/pdl_client.py` (lines 1727-2095)

**Key sections:**

```python
def execute_pdl_search(headers, url, query_obj, desired_limit, search_type, page_size=50, verbose=False, skip_count=0, target_company=None):
    """
    Execute PDL search with pagination
    
    Note: Ensures desired_limit and page_size are integers to avoid float slicing errors.
    """
    # ✅ Ensure integer values to avoid float slicing errors
    desired_limit = int(desired_limit)
    page_size = int(page_size)
    skip_count = int(skip_count) if skip_count else 0
    import time
    import random
    
    search_total_start = time.time()
    pdl_api_time = 0.0
    extract_time = 0.0
    
    # Add small random skip to get different results each time
    if skip_count == 0:
        skip_count = random.randint(0, min(5, desired_limit // 2))
    
    # ---- Page 1
    fetch_size = page_size + skip_count if skip_count > 0 else page_size
    fetch_size = int(min(100, fetch_size))  # Cap at 100 (PDL's max)
    body = {"query": query_obj, "size": fetch_size}
    
    # Use session for connection pooling
    pdl_api_start = time.time()
    with _session_lock:
        r = _session.post(url, headers=headers, json=body, timeout=30)
    pdl_api_time += time.time() - pdl_api_start
    
    # Handle 404 gracefully
    if r.status_code == 404:
        print(f"\n❌ PDL 404 ERROR - No records found matching query")
        return []
    
    if r.status_code != 200:
        print(f"\n❌ PDL ERROR {r.status_code}:")
        r.raise_for_status()
    
    j = r.json()
    data = j.get("data", []) or []
    total = j.get("total")
    scroll = j.get("scroll_token")
    
    # Skip the first skip_count results to get different people
    if skip_count > 0 and len(data) > skip_count:
        data = data[skip_count:]
    
    # Stop early if we already have enough
    if len(data) >= desired_limit or not scroll:
        # OPTIMIZATION: Batch pre-fetch domains for unique companies
        if not target_company and len(data) > 0:
            batch_domain_start = time.time()
            print(f"[PDL Extract] 🔍 Pre-fetching domains for unique companies...")
            unique_companies = set()
            for person in data[:desired_limit]:
                experience = person.get('experience', []) or []
                if experience and isinstance(experience, list) and len(experience) > 0:
                    company_info = experience[0].get('company') or {}
                    if isinstance(company_info, dict):
                        company_name = company_info.get('name', '').strip()
                        if company_name and company_name.lower() not in ['', 'n/a', 'none', 'unknown']:
                            unique_companies.add(company_name)
            
            if unique_companies:
                from app.services.hunter import get_smart_company_domain
                # Batch lookup domains in parallel (pre-populate cache)
                with ThreadPoolExecutor(max_workers=min(5, len(unique_companies))) as domain_executor:
                    domain_futures = {
                        domain_executor.submit(get_smart_company_domain, company): company 
                        for company in unique_companies
                    }
                    # Wait for all domain lookups to complete (populates cache)
                    for future in as_completed(domain_futures):
                        company = domain_futures[future]
                        try:
                            domain = future.result()
                            if domain:
                                print(f"[PDL Extract] ✅ Pre-fetched domain: {company} → {domain}")
                        except Exception as e:
                            print(f"[PDL Extract] ⚠️ Failed to pre-fetch domain for {company}: {e}")
                batch_domain_time = time.time() - batch_domain_start
                print(f"[PDL Extract] ⏱️  Domain pre-fetch: {batch_domain_time:.2f}s for {len(unique_companies)} companies")
        
        # TRANSFORM THE DATA BEFORE RETURNING - PARALLEL EXTRACTION
        extract_start = time.time()
        extracted_contacts = []
        
        # ✅ ISSUE 1 FIX: Filter duplicates BEFORE extraction to avoid processing same contacts multiple times
        seen_identity_keys = set()
        unique_persons = []
        for person in data[:desired_limit]:
            first_name = (person.get('first_name', '') or '').lower().strip()
            last_name = (person.get('last_name', '') or '').lower().strip()
            # Get company from experience
            company_name = ''
            experience = person.get('experience', []) or []
            if experience and isinstance(experience, list) and len(experience) > 0:
                company_info = experience[0].get('company') or {}
                if isinstance(company_info, dict):
                    company_name = (company_info.get('name', '') or '').lower().strip()
            
            identity_key = f"{first_name}_{last_name}_{company_name}"
            if identity_key not in seen_identity_keys:
                seen_identity_keys.add(identity_key)
                unique_persons.append(person)
        
        duplicate_count = len(data[:desired_limit]) - len(unique_persons)
        if duplicate_count > 0:
            print(f"[PDL Extract] 🔍 Filtered {duplicate_count} duplicate contacts before extraction")
        
        # Use parallel extraction to speed up email verification
        # ✅ ISSUE 5 FIX: Increased from 5 to 10 workers for faster extraction
        max_workers = min(10, len(unique_persons))
        persons_to_extract = unique_persons
        
        if max_workers > 1 and len(persons_to_extract) > 1:
            print(f"[PDL Extract] ⚡ Parallel extraction with {max_workers} workers for {len(persons_to_extract)} contacts...")
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                # Submit all extraction tasks
                future_to_person = {
                    executor.submit(extract_contact_from_pdl_person_enhanced, person, target_company): (i, person)
                    for i, person in enumerate(persons_to_extract)
                }
                
                # Collect results as they complete, with early stopping for contacts with emails
                contacts_with_emails = 0
                max_contacts_with_emails = desired_limit * 2  # Get up to 2x to have verified options
                for future in as_completed(future_to_person):
                    i, person = future_to_person[future]
                    try:
                        contact = future.result()
                        if contact:  # Only add if extraction was successful
                            extracted_contacts.append(contact)
                            # Check if contact has any email (verified or not)
                            if contact.get('Email') or contact.get('WorkEmail') or contact.get('PersonalEmail'):
                                contacts_with_emails += 1
                            
                            # Early stop if we have enough contacts with emails
                            if contacts_with_emails >= max_contacts_with_emails:
                                # Cancel remaining futures to save processing time
                                remaining = len(future_to_person) - len(extracted_contacts)
                                if remaining > 0:
                                    print(f"[PDL Extract] ⚡ Early stopping: Have {contacts_with_emails} contacts with emails, cancelling {remaining} remaining extractions...")
                                    for remaining_future in future_to_person:
                                        if remaining_future != future and not remaining_future.done():
                                            remaining_future.cancel()
                                break
                    except Exception as e:
                        name = f"{person.get('first_name', '')} {person.get('last_name', '')}".strip()
                        print(f"[PDL Extract] ❌ Error extracting {name}: {e}")
        else:
            # Fallback to sequential for small batches
            for i, person in enumerate(persons_to_extract):
                try:
                    contact = extract_contact_from_pdl_person_enhanced(person, target_company=target_company)
                    if contact:
                        extracted_contacts.append(contact)
                except Exception as e:
                    name = f"{person.get('first_name', '')} {person.get('last_name', '')}".strip() or f"person {i+1}"
                    print(f"[PDL Extract] ❌ Error extracting {name}: {e}")
        
        extract_time = time.time() - extract_start
        total_time = time.time() - search_total_start
        
        print(f"\n[PDL {search_type}] ⏱️  TIMING BREAKDOWN:")
        print(f"[PDL {search_type}]   ├── PDL API calls: {pdl_api_time:.2f}s ({pdl_api_time/total_time*100:.1f}%)")
        print(f"[PDL {search_type}]   └── Contact extraction: {extract_time:.2f}s ({extract_time/total_time*100:.1f}%)")
        print(f"[PDL {search_type}] ⏱️  Total: {total_time:.2f}s for {len(extracted_contacts)}/{len(data[:desired_limit])} contacts")
        
        return extracted_contacts
    
    # ---- Page 2+ (pagination logic continues...)
    # ... (similar duplicate filtering and extraction logic for paginated results)
```

### 1.4 Contact Extraction: `extract_contact_from_pdl_person_enhanced()`

**File:** `backend/app/services/pdl_client.py` (lines 1342-1650+)

```python
def extract_contact_from_pdl_person_enhanced(person, target_company=None):
    """
    Enhanced contact extraction with relaxed, sensible email acceptance.
    
    Args:
        person: PDL person data dictionary
        target_company: Target company name for email lookup (required for correct domain extraction)
    """
    import time
    extract_start = time.time()
    try:
        # Basic identity
        first_name = person.get('first_name', '')
        last_name = person.get('last_name', '')
        if not first_name or not last_name:
            return None

        # Experience extraction
        experience = person.get('experience', []) or []
        if not isinstance(experience, list):
            experience = []
            
        work_experience_details, current_job = [], None
        if experience:
            current_job = experience[0]
            # ... extract work experience details ...

        company_name = ''
        job_title = ''
        if current_job and isinstance(current_job, dict):
            company_info = current_job.get('company') or {}
            title_info = current_job.get('title') or {}
            company_name = company_info.get('name', '') if isinstance(company_info, dict) else ''
            job_title = title_info.get('name', '') if isinstance(title_info, dict) else ''

        # Location
        location_info = person.get('location') or {}
        city = location_info.get('locality', '') if isinstance(location_info, dict) else ''
        state = location_info.get('region', '') if isinstance(location_info, dict) else ''

        # Email selection - VERIFY PDL EMAILS WITH HUNTER USING TARGET COMPANY DOMAIN
        emails = person.get('emails') or []
        if not isinstance(emails, list):
            emails = []
            
        recommended = person.get('recommended_personal_email') or ''
        if not isinstance(recommended, str):
            recommended = ''
            
        pdl_email = _choose_best_email(emails, recommended)
        
        # ✅ USE TARGET COMPANY DOMAIN INSTEAD OF PDL EMAIL DOMAIN
        from app.services.hunter import get_verified_email, get_company_domain
        
        # Get target company domain
        if target_company:
            target_domain = get_company_domain(target_company)
        else:
            target_domain = None
        
        # Use target company for email verification (not PDL person's current company)
        company_for_email_lookup = target_company if target_company else company_name
        
        # ✅ VERIFY PDL EMAIL WITH HUNTER BEFORE USING IT
        email_verify_start = time.time()
        verified_email_result = get_verified_email(
            pdl_email=pdl_email if pdl_email and pdl_email != "Not available" else None,
            first_name=first_name,
            last_name=last_name,
            company=company_for_email_lookup,
            person_data=person
        )
        email_verify_time = time.time() - email_verify_start
        
        best_email = verified_email_result.get('email')
        email_source = verified_email_result.get('email_source', 'pdl')
        email_verified = verified_email_result.get('email_verified', False)
        
        # ✅ INCLUDE contacts even without emails (Hunter.io will enrich them)
        if not best_email or best_email == "Not available":
            best_email = "Not available"

        # Phone, LinkedIn, Education extraction...
        # ... (continues with full contact data extraction)
        
        # Return contact dict
        return {
            'FirstName': first_name,
            'LastName': last_name,
            'Email': best_email,
            'WorkEmail': best_email if email_source == 'hunter.io' and not is_personal_email_domain(best_email.split('@')[1] if '@' in best_email else '') else '',
            'PersonalEmail': best_email if is_personal_email_domain(best_email.split('@')[1] if '@' in best_email else '') else '',
            'Company': company_name,
            'Title': job_title,
            # ... other fields ...
        }
        
    except Exception as e:
        print(f"Error extracting contact: {e}")
        return None
```

### 1.5 Email Selection: `_choose_best_email()`

**File:** `backend/app/services/pdl_client.py` (lines 1310-1339)

```python
def _choose_best_email(emails: list[dict], recommended: str | None = None) -> str | None:
    """Choose the best email from a list of emails"""
    def is_valid(addr: str) -> bool:
        # Handle case where addr might be a boolean or other non-string type
        if not isinstance(addr, str):
            return False
        if not addr or '@' not in addr: 
            return False
        bad = ["example.com", "test.com", "domain.com", "noreply@"]
        return not any(b in addr.lower() for b in bad)
    
    items = []
    for e in emails or []:
        addr = (e.get("address") or "").strip()
        et = (e.get("type") or "").lower()
        if is_valid(addr):
            items.append((et, addr))
    
    # Prioritize work/professional emails
    for et, a in items:
        if et in ("work","professional"): 
            return a
    # Then personal emails
    for et, a in items:
        if et == "personal": 
            return a
    
    # Handle case where recommended might be a boolean
    if isinstance(recommended, str) and is_valid(recommended): 
        return recommended
        
    return items[0][1] if items else None
```

### 1.6 Hunter Email Verification: `get_verified_email()`

**File:** `backend/app/services/hunter.py` (lines 1282-1481)

```python
def get_verified_email(
    pdl_email: str | None,
    first_name: str,
    last_name: str,
    company: str,
    person_data: dict = None,
    api_key: str = None,
    target_domain: str = None,
    skip_personal_emails: bool = False
) -> dict:
    """
    Get a verified email address using Hunter's Email Finder API (1 API call instead of 10+).
    PRIORITIZES WORK EMAILS FROM TARGET COMPANY OVER OLD JOB/PERSONAL EMAILS.
    """
    full_name = f"{first_name} {last_name}".strip()
    
    if not api_key:
        api_key = HUNTER_API_KEY
    
    if not api_key:
        return {
            'email': pdl_email if pdl_email and pdl_email != "Not available" else None,
            'email_verified': False,
            'email_source': 'pdl' if pdl_email and pdl_email != "Not available" else None
        }
    
    # Use provided target_domain, or extract from company name
    if not target_domain:
        target_domain = get_company_domain(company)
    
    # Step 1: Only verify PDL email if it matches target company domain
    if pdl_email and pdl_email != "Not available" and "@" in pdl_email and target_domain:
        pdl_email_domain = pdl_email.split("@")[1].lower().strip()
        target_domain_lower = target_domain.lower().strip()
        
        domain_matches = (
            pdl_email_domain == target_domain_lower or
            pdl_email_domain.endswith(f".{target_domain_lower}") or
            target_domain_lower.endswith(f".{pdl_email_domain}")
        )
        
        if domain_matches:
            # PDL email is from target company - verify it
            verification = verify_email_hunter(pdl_email, api_key)
            score = verification.get("score", 0) if verification else 0
            
            if score >= 80:
                return {
                    'email': pdl_email,
                    'email_verified': True,
                    'email_source': 'pdl'
                }
            else:
                return {
                    'email': pdl_email,
                    'email_verified': False,
                    'email_source': 'pdl'
                }
    
    # Step 2: Use Hunter Email Finder with TARGET domain
    if target_domain and first_name and last_name:
        email, score = find_email_with_hunter(first_name, last_name, target_domain, api_key)
        if email:
            return {
                'email': email,
                'email_verified': True,
                'email_source': 'hunter.io'
            }
    
    # Step 2b: FALLBACK - Generate email using company pattern
    if target_domain and first_name and last_name:
        pattern = get_domain_pattern(target_domain, api_key)
        if pattern:
            generated_email = generate_email_from_pattern(first_name, last_name, target_domain, pattern)
            verification = verify_email_hunter(generated_email, api_key)
            score = verification.get("score", 0) if verification else 0
            status = verification.get("status", "unknown") if verification else "unknown"
            
            if status == "valid" and score >= 70:
                return {
                    'email': generated_email,
                    'email_verified': True,
                    'email_source': 'hunter.io'
                }
            else:
                return {
                    'email': generated_email,
                    'email_verified': False,
                    'email_source': 'hunter.io'
                }
    
    # Step 3: Fall back to personal email if available
    if not skip_personal_emails and pdl_email and pdl_email != "Not available" and "@" in pdl_email:
        pdl_email_domain = pdl_email.split("@")[1].lower().strip()
        if is_personal_email_domain(pdl_email_domain):
            verification = verify_email_hunter(pdl_email, api_key)
            score = verification.get("score", 0) if verification else 0
            
            if score >= 85:
                return {
                    'email': pdl_email,
                    'email_verified': True,
                    'email_source': 'pdl'
                }
    
    return {
        'email': None,
        'email_verified': False,
        'email_source': None
    }
```

---

## 2. EMAIL GENERATION

### 2.1 Batch Email Generation: `batch_generate_emails()`

**File:** `backend/app/services/reply_generation.py` (lines 427-1090)

**Key sections:**

```python
def batch_generate_emails(contacts, resume_text, user_profile, career_interests, fit_context=None):
    """
    Generate all emails using the new compelling prompt template.
    
    Args:
        contacts: List of contact dicts
        resume_text: User's resume text
        user_profile: User profile dict
        career_interests: Career interests string
        fit_context: Optional dict with job fit analysis
    """
    try:
        if not contacts:
            return {}
        
        client = get_openai_client()
        if not client:
            raise Exception("OpenAI client not available")
        
        # Extract user info
        user_info = extract_user_info_from_resume_priority(resume_text, user_profile)
        
        # Build personalized context for each contact
        contact_contexts = []
        for i, contact in enumerate(contacts):
            # Detect commonality
            commonality_type, commonality_details = detect_commonality(user_info, contact, resume_text)
            
            # Get contact info
            firstname = contact.get('FirstName', '').capitalize()
            lastname = contact.get('LastName', '')
            company = contact.get('Company', '')
            title = contact.get('Title', '')
            
            # Build contact context
            contact_context = f"""Contact {i}: {firstname} {lastname}
- Role: {title} at {company}
- Connection: {personalization_note if personalization_note else 'No specific connection'}
- Personalize by: Mentioning their role/company, asking about their experience"""
            
            contact_contexts.append(contact_context)
        
        # Build comprehensive prompt
        prompt = f"""You write professional, natural networking emails that feel familiar, thoughtful, and human.

TASK:
Write {len(contacts)} personalized networking emails.
Each email must be unique and intentionally written for the specific recipient.

ABOUT THE SENDER:
- Name: {sender_name}
- University: {sender_university_short}
- Major: {user_info.get('major', 'Not specified')}
- Year: {user_info.get('year', 'Not specified')}

CONTACTS:
{chr(10).join(contact_contexts)}

Return ONLY valid JSON:
{{"0": {{"subject": "...", "body": "..."}}, "1": {{"subject": "...", "body": "..."}}, ...}}"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You write professional, natural networking emails..."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=4000,  # ✅ ISSUE 4 FIX: Increased for larger batches (15+ contacts)
            temperature=0.75,
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Clean the response text
        response_text = response_text.encode('ascii', 'ignore').decode('ascii')
        
        # Remove markdown if present
        if '```' in response_text:
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
            response_text = response_text.strip()
        
        results = json.loads(response_text)
        
        # Process and clean results
        # ... (clean and return results)
        
        return results
        
    except Exception as e:
        print(f"Email generation failed: {e}")
        import traceback
        traceback.print_exc()
        return {}
```

---

## 3. GMAIL DRAFT CREATION

### 3.1 Single Draft Creation: `create_gmail_draft_for_user()`

**File:** `backend/app/services/gmail_client.py` (lines 824-1065)

```python
def create_gmail_draft_for_user(contact, email_subject, email_body, tier='free', user_email=None, resume_url=None, resume_content=None, resume_filename=None, user_info=None, user_id=None):
    """
    Create Gmail draft in the user's account with optional resume attachment and HTML formatting
    """
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.base import MIMEBase
    from email import encoders
    
    from app.utils.contact import clean_email_text
    
    try:
        # Clean the email subject and body FIRST
        email_subject = clean_email_text(email_subject)
        email_body = clean_email_text(email_body)
        
        gmail_service = get_gmail_service_for_user(user_email, user_id=user_id)
        
        if not gmail_service:
            return f"mock_{tier}_draft_{contact.get('FirstName', 'unknown').lower()}_user_{user_email}"
        
        # Get recipient email
        recipient_email = None
        if contact.get('PersonalEmail') and contact['PersonalEmail'] != 'Not available' and '@' in contact['PersonalEmail']:
            recipient_email = contact['PersonalEmail']
        elif contact.get('WorkEmail') and contact['WorkEmail'] != 'Not available' and '@' in contact['WorkEmail']:
            recipient_email = contact['WorkEmail']
        elif contact.get('Email') and '@' in contact['Email']:
            recipient_email = contact['Email']
        
        if not recipient_email:
            return f"mock_{tier}_draft_{contact.get('FirstName', 'unknown').lower()}_no_email"
        
        # Create multipart message
        message = MIMEMultipart('mixed')
        message['to'] = recipient_email
        message['subject'] = email_subject
        message['from'] = gmail_account_email
        
        # Add body (HTML if user_info provided, plain text otherwise)
        if user_info:
            # Create HTML email with professional signature
            email_body_html = email_body.replace('\n\n', '<br><br>').replace('\n', '<br>')
            html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
<div style="white-space: pre-wrap;">
{email_body_html}
</div>
</body>
</html>"""
            message.attach(MIMEText(html_content, 'html', 'utf-8'))
        else:
            message.attach(MIMEText(email_body, 'plain', 'utf-8'))
        
        # Attach resume if available
        if resume_content:
            try:
                filename = resume_filename or "resume.pdf"
                attachment = MIMEBase('application', 'pdf')
                attachment.set_payload(resume_content)
                encoders.encode_base64(attachment)
                attachment.add_header('Content-Disposition', f'attachment; filename="{filename}"')
                attachment.add_header('Content-Type', 'application/pdf')
                message.attach(attachment)
            except Exception as resume_error:
                print(f"   ❌ Could not attach resume: {resume_error}")
        
        # Create the draft
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
        
        draft_body = {
            'message': {
                'raw': raw_message
            }
        }
        
        # Create the draft via Gmail API
        draft_result = gmail_service.users().drafts().create(userId='me', body=draft_body).execute()
        draft_id = draft_result['id']
        message_id = draft_result.get('message', {}).get('id')
        
        # Build draft URL
        if message_id:
            gmail_draft_url = f"https://mail.google.com/mail/u/0/#drafts?compose={message_id}"
        else:
            gmail_draft_url = f"https://mail.google.com/mail/u/0/#draft/{draft_id}"
        
        # Return draft_id, message_id, and URL as a dict
        return {
            'draft_id': draft_id,
            'message_id': message_id,
            'draft_url': gmail_draft_url
        }
        
    except Exception as e:
        print(f"{tier.capitalize()} Gmail draft creation failed for {user_email}: {e}")
        import traceback
        traceback.print_exc()
        return f"mock_{tier}_draft_{contact.get('FirstName', 'unknown').lower()}_user_{user_email}"
```

### 3.2 Parallel Draft Creation: `create_drafts_parallel()`

**File:** `backend/app/services/gmail_client.py` (lines 1068-1140)

```python
# ✅ ISSUE 3 FIX: Parallel Gmail draft creation with rate limiting
def create_drafts_parallel(contacts_with_emails, resume_bytes=None, resume_filename=None, user_info=None, user_id=None, tier='free', user_email=None):
    """
    Create all Gmail drafts in parallel with rate limiting.
    
    Args:
        contacts_with_emails: List of dicts, each containing:
            - contact: Contact dict
            - email_subject: Subject line
            - email_body: Body text
        resume_bytes: Optional resume content as bytes
        resume_filename: Optional resume filename
        user_info: Optional user profile info
        user_id: Optional user ID
        tier: 'free' or 'pro'
        user_email: User's email address
    
    Returns:
        List of results (dicts with draft_id, message_id, draft_url) or error strings
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import threading
    
    if not contacts_with_emails:
        return []
    
    # Use semaphore-like behavior with max 5 concurrent workers
    max_workers = min(5, len(contacts_with_emails))
    results = []
    results_lock = threading.Lock()
    
    def create_single_draft(item):
        """Create a single draft"""
        try:
            contact = item['contact']
            email_subject = item['email_subject']
            email_body = item['email_body']
            
            result = create_gmail_draft_for_user(
                contact, email_subject, email_body, tier, user_email,
                None,  # resume_url (deprecated)
                resume_bytes,  # resume_content
                resume_filename,
                user_info,
                user_id
            )
            return item.get('index', 0), result, None
        except Exception as e:
            return item.get('index', 0), None, str(e)
    
    # Create all drafts in parallel
    print(f"📧 Creating {len(contacts_with_emails)} Gmail drafts in parallel (max {max_workers} concurrent)...")
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_item = {
            executor.submit(create_single_draft, item): item 
            for item in contacts_with_emails
        }
        
        # Collect results as they complete
        for future in as_completed(future_to_item):
            item = future_to_item[future]
            try:
                index, result, error = future.result()
                with results_lock:
                    results.append((index, result, error))
            except Exception as e:
                with results_lock:
                    results.append((item.get('index', 0), None, str(e)))
    
    # Sort results by index to maintain order
    results.sort(key=lambda x: x[0])
    return [result for _, result, _ in results]
```

---

## 4. MAIN ENDPOINT HANDLER

### 4.1 Pro Run Endpoint: `/api/pro-run`

**File:** `backend/app/routes/runs.py` (lines 808-963)

```python
@runs_bp.route("/pro-run", methods=["POST", "OPTIONS"])
@require_firebase_auth
def pro_run():
    """Pro tier search endpoint with validation"""
    if request.method == 'OPTIONS':
        from flask import make_response
        response = make_response()
        response.status_code = 200
        return response
    
    try:
        user_email = request.firebase_user.get('email')
        user_id = request.firebase_user['uid']
        
        # Get request data
        if request.is_json:
            data = request.get_json(silent=True) or {}
        else:
            # Handle form data...
            data = {...}
        
        job_title = (data.get('jobTitle') or '').strip()
        company = (data.get('company') or '').strip()
        location = (data.get('location') or '').strip()
        college_alumni = (data.get('collegeAlumni') or '').strip() or None
        batch_size = data.get('batchSize')
        user_profile = data.get('userProfile')
        career_interests = data.get('careerInterests', [])
        
        # Get resume text (required for pro tier)
        resume_text = None
        if request.is_json:
            resume_text = (data.get('resumeText') or '').strip() or None
        else:
            resume_text = data.get('resumeText')
        
        if not resume_text:
            return jsonify({"error": "Resume text is required for Pro tier"}), 400
        
        # Save search to history
        db = get_db()
        if db:
            try:
                search_data = {
                    'jobTitle': job_title,
                    'company': company,
                    'location': location,
                    'collegeAlumni': college_alumni,
                    'batchSize': batch_size,
                    'tier': 'pro',
                    'createdAt': datetime.now().isoformat(),
                    'userId': user_id
                }
                db.collection('users').document(user_id).collection('searchHistory').add(search_data)
            except Exception as history_error:
                print(f"⚠️ Failed to save search history: {history_error}")
        
        result = run_pro_tier_enhanced_final_with_text(
            job_title,
            company,
            location,
            resume_text,
            user_email=user_email,
            user_profile=user_profile,
            career_interests=career_interests,
            college_alumni=college_alumni,
            batch_size=batch_size
        )
        
        if result.get("error"):
            error_type = result.get("error")
            if error_type == "gmail_token_expired":
                return jsonify({
                    "error": error_type,
                    "message": result.get("message"),
                    "require_reauth": True,
                    "contacts": result.get("contacts", [])
                }), 401
            elif "insufficient" in error_type.lower() or "credits" in error_type.lower():
                required = result.get('credits_needed', 15)
                available = result.get('current_credits', 0)
                raise InsufficientCreditsError(required, available)
            else:
                raise ExternalAPIError("Contact Search", result.get("error", "Search failed"))
        
        response_data = {
            "contacts": result["contacts"],
            "successful_drafts": result.get("successful_drafts", 0),
            "total_contacts": len(result["contacts"]),
            "tier": "pro",
            "user_email": user_email,
        }
        return jsonify(response_data)
        
    except Exception as e:
        print(f"Pro endpoint error: {e}")
        import traceback
        traceback.print_exc()
        raise OfferloopException(f"Search failed: {str(e)}", error_code="SEARCH_ERROR")
```

### 4.2 Pro Run Orchestration: `run_pro_tier_enhanced_final_with_text()`

**File:** `backend/app/routes/runs.py` (lines 321-600+)

**Key sections:**

```python
def run_pro_tier_enhanced_final_with_text(job_title, company, location, resume_text, user_email=None, user_profile=None, career_interests=None, college_alumni=None, batch_size=None):
    """Pro tier search - will be moved to services/runs_service.py"""
    import time
    start_time = time.time()
    
    try:
        db = get_db()
        user_id = None
        if hasattr(request, 'firebase_user'):
            user_id = request.firebase_user.get('uid')
        
        # Initialize seen_contact_set before it's used
        seen_contact_set = set()
        
        # Load exclusion list from contacts subcollection
        if db and user_id:
            try:
                contacts_ref = db.collection('users').document(user_id).collection('contacts')
                contact_docs = list(contacts_ref.stream())
                
                for doc in contact_docs:
                    contact = doc.to_dict()
                    standardized = {
                        'FirstName': contact.get('firstName', ''),
                        'LastName': contact.get('lastName', ''),
                        'Email': contact.get('email', ''),
                        'LinkedIn': contact.get('linkedinUrl', ''),
                        'Company': contact.get('company', '')
                    }
                    library_key = get_contact_identity(standardized)
                    seen_contact_set.add(library_key)
            except Exception:
                pass
        
        # Search contacts
        contacts = search_contacts_with_smart_location_strategy(
            job_title, company, location, max_contacts=max_contacts, college_alumni=college_alumni, exclude_keys=seen_contact_set
        )
        
        if not contacts:
            return {'contacts': [], 'successful_drafts': 0}
        
        # ✅ HUNTER.IO ENRICHMENT - Enrich contacts without emails
        contacts_with_email: list[dict] = []
        contacts_without_email: list[dict] = []

        for c in contacts:
            if has_pdl_email(c):
                contacts_with_email.append(c)
            else:
                contacts_without_email.append(c)
        
        # Only use Hunter.io if we have contacts without emails
        if contacts_without_email:
            needed = max_contacts - len(contacts_with_email)
            contacts = enrich_contacts_with_hunter(
                contacts,
                max_enrichments=needed
            )
        
        # Generate emails with resume
        print(f"📧 Generating emails for {len(contacts)} contacts...")
        try:
            email_results = batch_generate_emails(contacts, resume_text, user_profile, career_interests, fit_context=None)
        except Exception as email_gen_error:
            print(f"❌ Email generation failed: {email_gen_error}")
            email_results = {}
        
        # Attach email data to ALL contacts FIRST (before draft creation)
        for i, contact in enumerate(contacts):
            email_result = email_results.get(i) or email_results.get(str(i)) or email_results.get(f"{i}")
            if email_result and isinstance(email_result, dict):
                subject = email_result.get('subject', '')
                body = email_result.get('body', '')
                if subject and body:
                    contact['emailSubject'] = subject
                    contact['emailBody'] = body
        
        # Get user resume URL and download once (to avoid fetching 8 times)
        resume_url = None
        resume_content = None
        resume_filename = None
        if db and user_id:
            try:
                user_doc = db.collection('users').document(user_id).get()
                if user_doc.exists:
                    resume_url = user_doc.to_dict().get('resumeUrl')
                    if resume_url:
                        resume_content, resume_filename = download_resume_from_url(resume_url)
            except Exception as e:
                print(f"⚠️ Error getting/downloading resume: {e}")
        
        # Create drafts
        successful_drafts = 0
        user_info = None
        if user_profile:
            user_info = {
                'name': user_profile.get('name', ''),
                'email': user_profile.get('email', ''),
                'phone': user_profile.get('phone', ''),
                'linkedin': user_profile.get('linkedin', '')
            }
        
        try:
            creds = _load_user_gmail_creds(user_id) if user_id else None
            if creds:
                # ✅ ISSUE 3 FIX: Parallel Gmail draft creation
                from app.services.gmail_client import create_drafts_parallel
                
                # Prepare contacts with email data for parallel processing
                contacts_with_emails = []
                for i, contact in enumerate(contacts[:max_contacts]):
                    email_result = email_results.get(i) or email_results.get(str(i)) or email_results.get(f"{i}")
                    if email_result and isinstance(email_result, dict):
                        subject = email_result.get('subject', '')
                        body = email_result.get('body', '')
                        if subject and body:
                            contacts_with_emails.append({
                                'index': i,
                                'contact': contact,
                                'email_subject': subject,
                                'email_body': body
                            })
                
                if contacts_with_emails:
                    # Create all drafts in parallel
                    draft_results = create_drafts_parallel(
                        contacts_with_emails,
                        resume_bytes=resume_content,
                        resume_filename=resume_filename,
                        user_info=user_info,
                        user_id=user_id,
                        tier='pro',
                        user_email=user_email
                    )
                    
                    # Process results and attach to contacts
                    for item, draft_result in zip(contacts_with_emails, draft_results):
                        contact = item['contact']
                        i = item['index']
                        try:
                            if isinstance(draft_result, dict):
                                draft_id = draft_result.get('draft_id', '')
                                message_id = draft_result.get('message_id')
                                draft_url = draft_result.get('draft_url', '')
                            else:
                                draft_id = draft_result if draft_result else None
                                message_id = None
                                draft_url = None
                            
                            if draft_id and not draft_id.startswith('mock_'):
                                successful_drafts += 1
                                contact['gmailDraftId'] = draft_id
                                if message_id:
                                    contact['gmailMessageId'] = message_id
                                if draft_url:
                                    contact['gmailDraftUrl'] = draft_url
                        except Exception as draft_error:
                            print(f"❌ [{i}] Failed to process draft result: {draft_error}")
        except Exception as gmail_error:
            print(f"⚠️ Gmail error: {gmail_error}")
        
        elapsed = time.time() - start_time
        print(f"✅ Pro tier completed in {elapsed:.2f}s - {len(contacts)} contacts, {successful_drafts} drafts")
        
        return {
            'contacts': contacts,
            'successful_drafts': successful_drafts
        }
        
    except Exception as e:
        print(f"Pro tier error: {e}")
        import traceback
        traceback.print_exc()
        return {'error': str(e), 'contacts': []}
```

---

## 5. CONTACT CREATION

### 5.1 Bulk Contact Creation: `bulk_create_contacts()`

**File:** `backend/app/routes/contacts.py` (lines 437-609)

```python
@contacts_bp.route('/bulk', methods=['POST'])
@require_firebase_auth
def bulk_create_contacts():
    """Bulk create contacts with validation and deduplication"""
    try:
        db = get_db()
        data = request.get_json() or {}
        user_id = request.firebase_user['uid']
        raw_contacts = data.get('contacts') or []
        
        if not db:
            return jsonify({'error': 'Firebase not initialized'}), 500
        
        contacts_ref = db.collection('users').document(user_id).collection('contacts')
        created = 0
        skipped = 0
        created_contacts = []
        today = datetime.now().strftime('%m/%d/%Y')
        
        for idx, rc in enumerate(raw_contacts):
            first_name = (rc.get('FirstName') or rc.get('firstName') or '').strip()
            last_name = (rc.get('LastName') or rc.get('lastName') or '').strip()
            email = (rc.get('Email') or rc.get('WorkEmail') or rc.get('PersonalEmail') or rc.get('email') or '').strip()
            linkedin = (rc.get('LinkedIn') or rc.get('linkedinUrl') or '').strip()
            company = (rc.get('Company') or rc.get('company') or '').strip()
            job_title = (rc.get('Title') or rc.get('jobTitle') or '').strip()
            
            # Skip if missing critical fields
            if not (first_name and last_name):
                skipped += 1
                continue
            
            # Check for duplicates - check both email and LinkedIn
            is_duplicate = False
            
            # Check by email if available
            if email:
                email_query = contacts_ref.where('email', '==', email).limit(1)
                email_docs = list(email_query.stream())
                if email_docs:
                    is_duplicate = True
            
            # Check by LinkedIn if available and not already found as duplicate
            if not is_duplicate and linkedin:
                linkedin_query = contacts_ref.where('linkedinUrl', '==', linkedin).limit(1)
                linkedin_docs = list(linkedin_query.stream())
                if linkedin_docs:
                    is_duplicate = True
            
            # Also check by name + company combination
            if not is_duplicate and first_name and last_name and company:
                name_company_query = contacts_ref.where('firstName', '==', first_name).where('lastName', '==', last_name).where('company', '==', company).limit(1)
                name_company_docs = list(name_company_query.stream())
                if name_company_docs:
                    is_duplicate = True
            
            if is_duplicate:
                skipped += 1
                continue
            
            # Extract email fields
            email_subject = rc.get('emailSubject') or rc.get('email_subject') or ''
            email_body = rc.get('emailBody') or rc.get('email_body') or ''
            gmail_draft_id = rc.get('gmailDraftId') or ''
            gmail_draft_url = rc.get('gmailDraftUrl') or ''
            
            # Create contact document
            contact = {
                'firstName': first_name,
                'lastName': last_name,
                'email': email,
                'linkedinUrl': linkedin,
                'company': company,
                'jobTitle': job_title,
                'college': rc.get('College') or rc.get('college') or '',
                'addedDate': today,
                'source': 'search',
                'emailSubject': email_subject,
                'emailBody': email_body,
                'gmailDraftId': gmail_draft_id,
                'gmailDraftUrl': gmail_draft_url,
            }
            
            doc_ref = contacts_ref.add(contact)
            contact['id'] = doc_ref[1].id
            created_contacts.append(contact)
            created += 1
        
        return jsonify({
            'created': created,
            'skipped': skipped,
            'contacts': created_contacts
        })
        
    except Exception as e:
        print(f"Error bulk creating contacts: {str(e)}")
        import traceback
        traceback.print_exc()
        raise OfferloopException(f"Failed to bulk create contacts: {str(e)}", error_code="BULK_CREATE_ERROR")
```

---

## PERFORMANCE OPTIMIZATION OPPORTUNITIES

### Already Implemented:
1. ✅ **Duplicate filtering before extraction** - Filters duplicates using identity keys before expensive extraction
2. ✅ **Parallel extraction** - Uses 10 workers (increased from 5) for contact extraction
3. ✅ **Parallel Gmail draft creation** - Uses 5 concurrent workers with ThreadPoolExecutor
4. ✅ **Batch email generation** - Single OpenAI call for all contacts (max_tokens=4000)
5. ✅ **Hunter API caching** - Module-level cache with TTL timestamps

### Additional Opportunities:
1. **Batch domain pre-fetching** - Already implemented but could be optimized further
2. **Resume download caching** - Currently downloads once per request, could cache across requests
3. **Contact deduplication in bulk_create** - Currently sequential Firestore queries, could batch check
4. **Hunter enrichment parallelization** - Currently sequential, could parallelize
5. **PDL search result caching** - Cache search results for repeated queries

---

This document provides a complete reference for all key functions in the contact search and email draft creation pipeline.

