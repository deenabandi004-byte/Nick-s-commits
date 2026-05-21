"""
Agent Actions - real executors that wrap existing services.

Each action (find, find_jobs, discover_companies, find_hiring_managers)
calls the actual PDL / SerpAPI / email generation services.
Contacts are saved to Firestore and emails are generated immediately.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from app.extensions import get_db
from app.services.pdl_client import search_contacts_from_prompt, get_contact_identity
from app.services.reply_generation import batch_generate_emails
from app.services.auth import deduct_credits_atomic
from app.utils.warmth_scoring import score_contacts_for_email
from email_templates import get_template_instructions

logger = logging.getLogger(__name__)

# ── Common domain mapping for Clearbit logos ──────────────────────────────

_COMPANY_DOMAINS = {
    "goldman sachs": "goldmansachs.com",
    "jpmorgan": "jpmorgan.com",
    "jp morgan": "jpmorgan.com",
    "morgan stanley": "morganstanley.com",
    "bank of america": "bankofamerica.com",
    "mckinsey": "mckinsey.com",
    "bain": "bain.com",
    "bcg": "bcg.com",
    "boston consulting group": "bcg.com",
    "deloitte": "deloitte.com",
    "pwc": "pwc.com",
    "ey": "ey.com",
    "ernst & young": "ey.com",
    "kpmg": "kpmg.com",
    "google": "google.com",
    "meta": "meta.com",
    "facebook": "meta.com",
    "amazon": "amazon.com",
    "apple": "apple.com",
    "microsoft": "microsoft.com",
    "netflix": "netflix.com",
    "tesla": "tesla.com",
    "lazard": "lazard.com",
    "evercore": "evercore.com",
    "centerview": "centerviewpartners.com",
    "blackstone": "blackstone.com",
    "kkr": "kkr.com",
    "carlyle": "carlyle.com",
    "citadel": "citadel.com",
    "bridgewater": "bridgewater.com",
    "two sigma": "twosigma.com",
    "jane street": "janestreet.com",
}


def _company_to_domain(company_name: str) -> str | None:
    """Map company name to domain for Clearbit logo."""
    if not company_name:
        return None
    key = company_name.strip().lower()
    if key in _COMPANY_DOMAINS:
        return _COMPANY_DOMAINS[key]
    # Fallback: lowercase, remove spaces/special chars, add .com
    cleaned = "".join(c for c in key if c.isalnum())
    return f"{cleaned}.com" if cleaned else None


# ── FIND executor ─────────────────────────────────────────────────────────


def execute_find_and_draft(
    uid: str,
    action: dict,
    config: dict,
    user_data: dict,
) -> dict:
    """Find contacts via PDL and generate email drafts for them.

    Returns dict with contactsFound, emailsDrafted, contacts, creditsSpent.
    """
    db = get_db()
    company = action.get("company", "")
    title = action.get("title", "Software Engineer")
    count = min(action.get("count", 3), 5)

    # Build parsed prompt for PDL (must match prompt_parser output format)
    parsed_prompt = {
        "companies": [{"name": company}] if company else [],
        "title_variations": [title.lower()] if title else [],
        "schools": [],
        "locations": [],
    }

    # Add alumni preference (schools expects plain strings)
    prof = user_data.get("professionalInfo") or {}
    if config.get("preferAlumni") and prof.get("university"):
        parsed_prompt["schools"] = [prof["university"]]

    # Add location preference (locations expects plain strings)
    locations = config.get("targetLocations", [])
    if locations:
        parsed_prompt["locations"] = [loc for loc in locations[:2]]

    # Build exclusion set (dedup against existing contacts)
    exclusion_data = _build_exclusion_sets(uid, db)
    exclude_keys = exclusion_data["identity_set"]

    # Search PDL
    max_contacts = count
    tier_max = 15  # Elite tier
    user_profile = _build_user_profile(user_data)

    try:
        logger.info(
            "Agent find: uid=%s company=%s title=%s count=%d schools=%s locations=%s",
            uid, company, title, count,
            parsed_prompt.get("schools", []),
            parsed_prompt.get("locations", []),
        )
        result = search_contacts_from_prompt(
            parsed_prompt=parsed_prompt,
            max_contacts=min(max_contacts, tier_max),
            exclude_keys=exclude_keys,
            user_profile=user_profile,
        )
        # Returns (filtered_list, retry_level, already_saved, adjacency_metadata)
        raw_contacts = result[0] if isinstance(result, tuple) else result
        logger.info("Agent find first attempt: %d contacts for %s", len(raw_contacts) if raw_contacts else 0, company)

        # If no results found with alumni+location filters, retry with just company+title
        if not raw_contacts and (parsed_prompt.get("schools") or parsed_prompt.get("locations")):
            logger.info("Agent retry without alumni/location filters for %s", company)
            relaxed_prompt = {
                "companies": parsed_prompt["companies"],
                "title_variations": parsed_prompt.get("title_variations", []),
                "schools": [],
                "locations": [],
            }
            result = search_contacts_from_prompt(
                parsed_prompt=relaxed_prompt,
                max_contacts=min(max_contacts, tier_max),
                exclude_keys=exclude_keys,
                user_profile=user_profile,
            )
            raw_contacts = result[0] if isinstance(result, tuple) else result
            logger.info("Agent find relaxed retry: %d contacts for %s", len(raw_contacts) if raw_contacts else 0, company)

    except Exception as e:
        logger.exception("PDL search failed for agent uid=%s company=%s", uid, company)
        return {
            "contactsFound": 0,
            "emailsDrafted": 0,
            "contacts": [],
            "creditsSpent": 0,
            "error": f"{type(e).__name__}: {e}",
        }

    if not raw_contacts:
        return {
            "contactsFound": 0,
            "emailsDrafted": 0,
            "contacts": [],
            "creditsSpent": 0,
        }

    # Filter duplicates
    filtered = []
    for c in raw_contacts:
        email = (c.get("Email") or c.get("WorkEmail") or c.get("email") or "").strip().lower()
        fn = (c.get("FirstName") or c.get("firstName") or "").strip().lower()
        ln = (c.get("LastName") or c.get("lastName") or "").strip().lower()
        co = (c.get("Company") or c.get("company") or "").strip().lower()
        if email and email in exclusion_data["email_set"]:
            continue
        if fn and ln and co and f"{fn}_{ln}_{co}" in exclusion_data["name_company_set"]:
            continue
        filtered.append(c)
        if len(filtered) >= count:
            break

    if not filtered:
        return {
            "contactsFound": 0,
            "emailsDrafted": 0,
            "contacts": [],
            "creditsSpent": 0,
        }

    # Enrich contacts with real-time web data (Perplexity)
    enrichment_data = {}
    try:
        from app.services.perplexity_client import batch_enrich_contacts
        enrichment_data = batch_enrich_contacts(filtered)
        for idx, c in enumerate(filtered):
            enrich = enrichment_data.get(idx, {})
            c["enrichment_talking_points"] = enrich.get("talking_points", [])
            c["enrichment_recent_activity"] = enrich.get("recent_activity", "")
    except Exception:
        logger.warning("Contact enrichment failed, continuing without", exc_info=True)

    # Generate emails
    resume_text = user_data.get("resumeText") or ""
    career_interests = user_data.get("careerInterests") or []
    pre_parsed = user_data.get("resumeParsed")

    # Resolve email template from agent config
    template_instructions = _resolve_agent_template(config, user_data, db, uid)

    # Warmth scoring - returns a dict keyed by index, NOT the contact list
    warmth_data = {}
    try:
        warmth_data = score_contacts_for_email(user_profile, filtered)
    except Exception:
        logger.warning("Warmth scoring failed, continuing without")

    # Attach warmth data to each contact
    for i, c in enumerate(filtered):
        wd = warmth_data.get(i)
        if wd:
            c["warmth_score"] = wd.get("score")
            c["warmth_tier"] = wd.get("tier", "")
            c["warmth_label"] = wd.get("label", "")

    try:
        email_results = batch_generate_emails(
            contacts=filtered,
            resume_text=resume_text,
            user_profile=user_profile,
            career_interests=career_interests,
            pre_parsed_user_info=pre_parsed,
            template_instructions=template_instructions,
            email_template_purpose=config.get("emailTemplatePurpose"),
            signoff_config={
                "signoffPhrase": config.get("signoffPhrase") or "Best,",
                "signatureBlock": config.get("signatureBlock") or "",
            },
            auth_display_name=user_data.get("name") or prof.get("name") or "",
            enrichment_data=enrichment_data,
        )
    except Exception as e:
        logger.exception("Email generation failed for agent uid=%s", uid)
        email_results = {}

    user_email = user_data.get("email", "")

    # Save contacts to Firestore
    contacts_ref = db.collection("users").document(uid).collection("contacts")
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    today = datetime.now().strftime("%m/%d/%Y")
    saved_contacts = []

    for idx, contact in enumerate(filtered):
        email = (contact.get("Email") or contact.get("WorkEmail") or contact.get("email") or "").strip()
        first_name = (contact.get("FirstName") or contact.get("firstName") or "").strip()
        last_name = (contact.get("LastName") or contact.get("lastName") or "").strip()
        contact_key = f"{first_name} {last_name}"

        contact_doc = {
            "firstName": first_name,
            "lastName": last_name,
            "email": email,
            "linkedinUrl": (contact.get("LinkedIn") or contact.get("linkedinUrl") or "").strip(),
            "company": (contact.get("Company") or contact.get("company") or "").strip(),
            "jobTitle": (contact.get("Title") or contact.get("jobTitle") or "").strip(),
            "college": (contact.get("College") or contact.get("college") or "").strip(),
            "location": contact.get("location") or "",
            "city": contact.get("City") or "",
            "state": contact.get("State") or "",
            "firstContactDate": today,
            "status": "Not Contacted",
            "lastContactDate": today,
            "userId": uid,
            "createdAt": now_iso,
            "pdlId": contact.get("pdlId") or "",
            "source": "agent",
            "agentCycleId": action.get("cycleId"),
            "inOutbox": True,
            "draftCreatedAt": now_iso,
            "emailGeneratedAt": now_iso,
            "draftStillExists": True,
            "lastActivityAt": now_iso,
            "hasUnreadReply": False,
        }

        # Add email content if generated
        email_data = email_results.get(idx)
        if email_data:
            contact_doc["emailSubject"] = email_data.get("subject", "")
            contact_doc["emailBody"] = email_data.get("body", "")
            contact_doc["pipelineStage"] = "draft_created"
        else:
            contact_doc["pipelineStage"] = "not_contacted"

        # Add warmth data
        if contact.get("warmth_score") is not None:
            contact_doc["warmthScore"] = contact["warmth_score"]
            contact_doc["warmthTier"] = contact.get("warmth_tier", "")
            contact_doc["warmthLabel"] = contact.get("warmth_label", "")

        # Add enrichment data from Perplexity
        enrich = enrichment_data.get(idx, {})
        if enrich.get("talking_points"):
            contact_doc["enrichmentTalkingPoints"] = enrich["talking_points"][:5]
        if enrich.get("recent_activity"):
            contact_doc["enrichmentRecentActivity"] = enrich["recent_activity"][:1000]
        if enrich.get("citations"):
            contact_doc["enrichmentCitations"] = enrich["citations"][:5]
        if enrich:
            contact_doc["enrichedAt"] = now_iso

        # Create Gmail draft if possible
        if email_data and email.strip():
            try:
                from app.services.gmail_client import create_gmail_draft_for_user
                draft_result = create_gmail_draft_for_user(
                    contact=contact,
                    email_subject=email_data.get("subject", ""),
                    email_body=email_data.get("body", ""),
                    tier="elite",
                    user_email=user_email,
                    user_id=uid,
                )
                if draft_result and isinstance(draft_result, dict):
                    contact_doc["gmailDraftId"] = draft_result.get("id", "")
                    contact_doc["gmailDraftUrl"] = draft_result.get("url", "")
            except Exception as e:
                logger.warning("Gmail draft creation failed: %s", e)

        doc_ref = contacts_ref.add(contact_doc)
        saved_contacts.append({
            "id": doc_ref[1].id if isinstance(doc_ref, tuple) else "",
            "name": contact_key,
            "company": contact_doc["company"],
            "hasEmail": bool(email_data),
            "emailSubject": email_data.get("subject", "") if email_data else "",
            "emailBodyPreview": (email_data.get("body", "") if email_data else "")[:200],
        })

    # Deduct credits (1 credit per contact found)
    credits_spent = len(saved_contacts)
    try:
        deduct_credits_atomic(uid, credits_spent, "agent_find")
    except Exception:
        logger.warning("Credit deduction failed for agent uid=%s", uid)

    return {
        "contactsFound": len(saved_contacts),
        "emailsDrafted": sum(1 for c in saved_contacts if c["hasEmail"]),
        "contacts": saved_contacts,
        "creditsSpent": credits_spent,
    }


# ── FIND_JOBS executor ────────────────────────────────────────────────────


def execute_find_jobs(
    uid: str,
    action: dict,
    config: dict,
    user_data: dict,
) -> dict:
    """Find jobs matching user's target roles + companies.

    Primary: Perplexity + Firecrawl for enriched job data.
    Fallback: SerpAPI google_jobs if Perplexity is unavailable.
    """
    company = action.get("company", "")
    role = action.get("role", "")
    count = min(action.get("count", 5), 10)
    location = config.get("targetLocations", ["United States"])
    location = location[0] if location else "United States"

    query = f"{role} at {company}" if company else role
    if not query:
        query = "internship"

    jobs = []
    source = "serpapi"

    # PRIMARY: Perplexity job search + Firecrawl enrichment
    try:
        from app.services.perplexity_client import search_jobs_live
        from app.services.firecrawl_client import extract_job_posting

        raw_jobs = search_jobs_live(
            query=query, location=location, limit=10,
            domain_filter=["linkedin.com", "greenhouse.io", "lever.co", "workday.com"],
        )

        if raw_jobs:
            # Enrich top 5 with Firecrawl structured extraction
            enriched_jobs = []
            for job in raw_jobs[:5]:
                enriched = dict(job)
                if job.get("url"):
                    try:
                        structured = extract_job_posting(job["url"])
                        if structured:
                            enriched.update(structured)
                    except Exception:
                        pass
                enriched_jobs.append(enriched)
            # Add remaining un-enriched jobs
            enriched_jobs.extend(raw_jobs[5:count])
            jobs = enriched_jobs
            source = "perplexity"
    except Exception:
        logger.warning("Perplexity job search failed, falling back to SerpAPI", exc_info=True)

    # FALLBACK: SerpAPI (kept until Phase 8 removes it)
    if not jobs:
        try:
            from app.routes.job_board import fetch_jobs_from_serpapi
            serpapi_jobs, _ = fetch_jobs_from_serpapi(query, location, num_results=10, user_id=uid)
            jobs = serpapi_jobs or []
            source = "serpapi"
        except Exception as e:
            logger.exception("SerpAPI job search also failed for agent uid=%s", uid)
            return {"jobsFound": 0, "jobs": [], "creditsSpent": 0, "error": str(e)}

    if not jobs:
        return {"jobsFound": 0, "jobs": [], "creditsSpent": 0}

    # Generate match reasons via LLM
    scored_jobs = _generate_job_reasons(jobs[:count], user_data)

    # Save to Firestore
    db = get_db()
    jobs_ref = db.collection("users").document(uid).collection("agent_jobs")
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    saved = []

    for job in scored_jobs:
        doc = {
            "cycleId": action.get("cycleId"),
            "title": job.get("title", ""),
            "company": job.get("company_name", job.get("company", company)),
            "location": job.get("location", ""),
            "description": (job.get("description", job.get("summary", "")))[:500],
            "applyLink": job.get("apply_link", "") or job.get("link", "") or job.get("url", ""),
            "matchReasons": job.get("_matchReasons", []),
            "source": source,
            # Enriched fields from Firecrawl (empty if SerpAPI fallback)
            "requirements": job.get("requirements", [])[:10],
            "salaryRange": job.get("salary_range", ""),
            "teamOrDepartment": job.get("team_or_department", ""),
            "hiringManagerName": job.get("hiring_manager", ""),
            "sourceUrl": job.get("url", ""),
            "enrichedAt": now_iso if source == "perplexity" else "",
            "hmFound": False,
            "hmContactId": None,
            "createdAt": now_iso,
            "status": "new",
        }
        ref = jobs_ref.add(doc)
        saved.append({
            "id": ref[1].id,
            "title": doc["title"],
            "company": doc["company"],
            "location": doc["location"],
            "matchReasons": doc["matchReasons"],
        })

    logger.info("Agent find_jobs: uid=%s found %d jobs for %s", uid, len(saved), query)
    return {"jobsFound": len(saved), "jobs": saved, "creditsSpent": 0}


# ── DISCOVER_COMPANIES executor ───────────────────────────────────────────


def execute_discover_companies(
    uid: str,
    action: dict,
    config: dict,
    user_data: dict,
) -> dict:
    """Discover companies with live market intelligence.

    Primary: Perplexity discovers + Firecrawl enriches.
    Fallback: static recommendation engine.
    """
    companies = []

    # PRIMARY: Perplexity-powered discovery
    try:
        from app.services.perplexity_client import discover_companies_live
        from app.services.firecrawl_client import extract_company_profile

        prof = user_data.get("professionalInfo") or {}
        perplexity_companies = discover_companies_live(
            industries=config.get("targetIndustries", []),
            locations=config.get("targetLocations", []),
            roles=config.get("targetRoles", []),
            similar_to=config.get("targetCompanies", []),
            university=prof.get("university", ""),
            career_track=prof.get("careerTrack", ""),
        )

        # Enrich top 3 with Firecrawl website extraction
        for co in perplexity_companies[:5]:
            website = co.get("website")
            if website:
                try:
                    profile = extract_company_profile(website)
                    if profile:
                        co.update(profile)
                except Exception:
                    pass

        if perplexity_companies:
            companies = perplexity_companies
    except Exception:
        logger.warning("Perplexity company discovery failed, falling back to recommendations", exc_info=True)

    # FALLBACK: static recommendation engine
    if not companies:
        try:
            from app.services.company_recommendations import get_recommendations
            result = get_recommendations(user_data)
            companies = result.get("companies", [])
        except Exception as e:
            logger.exception("Company recommendations also failed for agent uid=%s", uid)
            return {"companiesDiscovered": 0, "companies": [], "creditsSpent": 0, "error": str(e)}

    # Filter out companies user already targets
    target_set = {c.lower() for c in config.get("targetCompanies", [])}
    new_companies = [c for c in companies if c.get("name", "").lower() not in target_set]

    db = get_db()
    cos_ref = db.collection("users").document(uid).collection("agent_companies")
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    saved = []

    for co in new_companies[:5]:
        domain = _company_to_domain(co.get("name", ""))
        logo_url = f"https://logo.clearbit.com/{domain}" if domain else None

        # Extract industry - field is "sector" in recommendation engine
        industry = co.get("industry") or co.get("sector", "")

        # Extract reason - scout sentence is nested: scout.short or scout.headline
        scout = co.get("scout") or {}
        if isinstance(scout, dict):
            reason = scout.get("short") or scout.get("headline") or scout.get("detail") or ""
        else:
            reason = co.get("scout_sentence", co.get("reason", ""))

        doc = {
            "cycleId": action.get("cycleId"),
            "name": co.get("name", ""),
            "industry": industry,
            "reason": reason,
            "sourceCompany": action.get("sourceCompany", ""),
            "score": co.get("score", 0) if isinstance(co.get("score"), (int, float)) else 0,
            "logoUrl": logo_url,
            "jobsFound": 0,
            "createdAt": now_iso,
            "status": "new",
            # Enriched fields from Perplexity/Firecrawl
            "hiringSignal": co.get("hiring_signal", ""),
            "recentNews": co.get("recent_news", ""),
            "website": co.get("website", "") or co.get("careers_url", ""),
            "description": (co.get("description", ""))[:500],
            "cultureKeywords": co.get("culture_keywords", [])[:5],
        }
        ref = cos_ref.add(doc)
        saved.append({
            "id": ref[1].id,
            "name": doc["name"],
            "industry": doc["industry"],
            "reason": doc["reason"],
            "logoUrl": doc["logoUrl"],
        })

    logger.info("Agent discover_companies: uid=%s found %d companies", uid, len(saved))
    return {"companiesDiscovered": len(saved), "companies": saved, "creditsSpent": 0}


# ── FIND_HIRING_MANAGERS executor ─────────────────────────────────────────


def execute_find_hiring_managers(
    uid: str,
    action: dict,
    config: dict,
    user_data: dict,
) -> dict:
    """Find hiring managers for a specific job and draft personalized emails."""
    from app.services.recruiter_finder import find_hiring_manager

    job_title = action.get("jobTitle", "")
    company = action.get("company", "")
    location = action.get("location", "")
    max_count = min(action.get("count", 2), 3)

    template_instructions = _resolve_agent_template(config, user_data, get_db(), uid)

    try:
        result = find_hiring_manager(
            company_name=company,
            job_title=job_title,
            job_description=action.get("jobDescription", ""),
            location=location,
            max_results=max_count,
            generate_emails=True,
            user_resume=user_data.get("resumeParsed"),
            resume_text=user_data.get("resumeText", ""),
            template_instructions=template_instructions,
            role_type="hiring_manager",
        )
    except Exception as e:
        logger.exception("find_hiring_manager failed for agent uid=%s", uid)
        return {"hmsFound": 0, "contacts": [], "creditsSpent": 0, "error": str(e)}

    hms = result.get("hiringManagers", result.get("hiring_managers", []))
    emails_list = result.get("emails", [])

    # Verify HMs are still active via Perplexity
    try:
        from app.services.perplexity_client import verify_hiring_managers
        verifications = verify_hiring_managers(hms, company, job_title)
        # Filter out HMs who have left the company
        active_hms = []
        active_emails = []
        for i, (hm, v) in enumerate(zip(hms, verifications)):
            if v.get("verified", True):
                active_hms.append(hm)
                if i < len(emails_list):
                    active_emails.append(emails_list[i])
        if active_hms:
            hms = active_hms
            emails_list = active_emails
            logger.info("HM verification: %d/%d verified active at %s",
                        len(active_hms), len(verifications), company)
    except Exception:
        logger.warning("HM verification failed, using all candidates", exc_info=True)

    db = get_db()
    contacts_ref = db.collection("users").document(uid).collection("contacts")
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    today = datetime.now().strftime("%m/%d/%Y")
    user_email = user_data.get("email", "")
    saved = []

    for idx, hm in enumerate(hms):
        # Get email data from the emails list if available
        email_data = emails_list[idx] if idx < len(emails_list) else {}
        email_body = email_data.get("body", hm.get("email_body", ""))
        email_subject = email_data.get("subject", hm.get("email_subject", ""))
        hm_email = (hm.get("Email") or hm.get("email") or hm.get("WorkEmail") or "").strip()
        first_name = (hm.get("FirstName") or hm.get("firstName") or hm.get("first_name") or "").strip()
        last_name = (hm.get("LastName") or hm.get("lastName") or hm.get("last_name") or "").strip()

        contact_doc = {
            "firstName": first_name,
            "lastName": last_name,
            "email": hm_email,
            "company": company,
            "jobTitle": (hm.get("Title") or hm.get("title") or hm.get("jobTitle") or "").strip(),
            "source": "agent",
            "agentCycleId": action.get("cycleId"),
            "pipelineStage": "draft_created" if email_body else "not_contacted",
            "emailSubject": email_subject,
            "emailBody": email_body,
            "inOutbox": True,
            "createdAt": now_iso,
            "firstContactDate": today,
            "lastContactDate": today,
            "status": "Not Contacted",
            "isHiringManager": True,
            "userId": uid,
            "emailGeneratedAt": now_iso,
            "draftCreatedAt": now_iso,
            "draftStillExists": True,
            "lastActivityAt": now_iso,
            "hasUnreadReply": False,
            "linkedinUrl": (hm.get("LinkedIn") or hm.get("linkedinUrl") or "").strip(),
        }

        # Create Gmail draft
        if email_body and hm_email:
            try:
                from app.services.gmail_client import create_gmail_draft_for_user
                draft = create_gmail_draft_for_user(
                    contact=hm,
                    email_subject=email_subject,
                    email_body=email_body,
                    tier="elite",
                    user_email=user_email,
                    user_id=uid,
                )
                if draft and isinstance(draft, dict):
                    contact_doc["gmailDraftId"] = draft.get("id", "")
                    contact_doc["gmailDraftUrl"] = draft.get("url", "")
            except Exception as e:
                logger.warning("Gmail draft creation for HM failed: %s", e)

        ref = contacts_ref.add(contact_doc)
        saved.append({
            "id": ref[1].id,
            "name": f"{first_name} {last_name}",
            "company": company,
            "hasEmail": bool(email_body),
            "emailSubject": email_subject,
            "emailBodyPreview": email_body[:200] if email_body else "",
            "isHiringManager": True,
        })

    credits = len(saved) * 5  # 5 credits per HM
    if credits > 0:
        try:
            deduct_credits_atomic(uid, credits, "agent_find_hm")
        except Exception:
            logger.warning("HM credit deduction failed for agent uid=%s", uid)

    logger.info("Agent find_hiring_managers: uid=%s found %d HMs at %s", uid, len(saved), company)
    return {"hmsFound": len(saved), "contacts": saved, "creditsSpent": credits}


# ── FOLLOW_UP executor ────────────────────────────────────────────────────


def execute_follow_up(
    uid: str,
    action: dict,
    config: dict,
    user_data: dict,
) -> dict:
    """Generate follow-up nudges for stale outreach."""
    from app.services.nudge_service import _generate_nudge_text

    db = get_db()
    contact_ids = action.get("contact_ids", [])
    if not contact_ids:
        return {"followUpsSent": 0, "contacts": [], "creditsSpent": 0}

    contacts_ref = db.collection("users").document(uid).collection("contacts")
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    sent = []

    for cid in contact_ids[:5]:  # max 5 follow-ups per cycle
        try:
            doc = contacts_ref.document(cid).get()
            if not doc.exists:
                continue
            contact = doc.to_dict()

            # Get recent company news for follow-up hook
            news_hook = ""
            company = contact.get("company", "")
            if company:
                try:
                    from app.services.perplexity_client import get_company_news_brief
                    news = get_company_news_brief(company, timeframe="week")
                    if news:
                        news_hook = news[0]
                except Exception:
                    pass

            nudge = _generate_nudge_text(contact, user_data, news_hook=news_hook)
            if not nudge:
                continue

            # Update contact with nudge
            update_fields = {
                "lastNudgeAt": now_iso,
                "nudgeSuggestion": nudge.get("suggestion", ""),
                "followUpDraft": nudge.get("followUpDraft", ""),
                "lastActivityAt": now_iso,
            }
            if news_hook:
                update_fields["followUpNewsHook"] = news_hook
            contacts_ref.document(cid).update(update_fields)
            sent.append({
                "id": cid,
                "name": f"{contact.get('firstName', '')} {contact.get('lastName', '')}".strip(),
                "company": contact.get("company", ""),
            })
        except Exception as e:
            logger.warning("Follow-up failed for contact %s: %s", cid, e)

    logger.info("Agent follow_up: uid=%s sent %d nudges", uid, len(sent))
    return {"followUpsSent": len(sent), "contacts": sent, "creditsSpent": 0}


# ── Helper: generate job match reasons ────────────────────────────────────


def _generate_job_reasons(jobs: list, user_data: dict) -> list:
    """LLM generates 'why this job?' reasons for each job.
    Falls back to empty reasons on LLM failure (non-blocking).
    """
    if not jobs:
        return jobs

    from app.config import CLAUDE_API_KEY
    if not CLAUDE_API_KEY:
        # Return jobs without reasons
        for j in jobs:
            j["_matchReasons"] = []
        return jobs

    prof = user_data.get("professionalInfo") or {}
    resume_text = user_data.get("resumeText") or ""
    interests = user_data.get("careerInterests") or []

    # Build a compact user profile for the prompt
    user_summary = f"""Student at {prof.get('university', 'unknown')} studying {prof.get('major', 'unknown')}.
Career track: {prof.get('careerTrack', 'unknown')}.
Interests: {', '.join(interests) if interests else 'not specified'}.
Resume highlights: {resume_text[:300] if resume_text else 'not available'}"""

    jobs_text = "\n".join(
        f"{i+1}. {j.get('title', '')} at {j.get('company_name', '')} in {j.get('location', '')}. "
        f"Description: {(j.get('description', ''))[:150]}"
        for i, j in enumerate(jobs)
    )

    prompt = f"""Given this student profile and job listings, generate 1-2 brief reasons (each under 15 words) why each job is a good match.

## Student
{user_summary}

## Jobs
{jobs_text}

Return a JSON array where each element is an array of reason strings, one per job. Example:
[["Matches your React skills", "Located in target city"], ["Alumni network at this company"]]

Return ONLY the JSON array."""

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=CLAUDE_API_KEY)
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            raw = "\n".join(lines)

        reasons_list = json.loads(raw)
        if isinstance(reasons_list, list):
            for i, job in enumerate(jobs):
                if i < len(reasons_list) and isinstance(reasons_list[i], list):
                    job["_matchReasons"] = reasons_list[i]
                else:
                    job["_matchReasons"] = []
        else:
            for j in jobs:
                j["_matchReasons"] = []
    except Exception:
        logger.warning("Job reason generation failed, continuing without reasons")
        for j in jobs:
            j["_matchReasons"] = []

    return jobs


# ── Shared helpers ────────────────────────────────────────────────────────


def _build_exclusion_sets(uid: str, db) -> dict:
    """Build dedup sets from existing contacts."""
    identity_set = set()
    email_set = set()
    name_company_set = set()

    contacts_ref = db.collection("users").document(uid).collection("contacts")
    for doc in contacts_ref.select(
        ["firstName", "lastName", "email", "linkedinUrl", "company"]
    ).stream():
        cd = doc.to_dict() or {}
        first = (cd.get("firstName") or "").strip()
        last = (cd.get("lastName") or "").strip()
        company = (cd.get("company") or "").strip()
        email = (cd.get("email") or "").strip().lower()

        standardized = {
            "FirstName": first,
            "LastName": last,
            "Email": email,
            "Company": company,
        }
        identity_set.add(get_contact_identity(standardized))
        if email:
            email_set.add(email)
        fn = first.lower()
        ln = last.lower()
        co = company.lower()
        if fn and ln and co:
            name_company_set.add(f"{fn}_{ln}_{co}")

    return {
        "identity_set": identity_set,
        "email_set": email_set,
        "name_company_set": name_company_set,
    }


def _build_user_profile(user_data: dict) -> dict:
    """Build user profile dict for PDL/email gen."""
    prof = user_data.get("professionalInfo") or {}
    return {
        "name": user_data.get("name") or prof.get("name") or "",
        "university": prof.get("university") or "",
        "major": prof.get("major") or "",
        "graduationYear": prof.get("graduationYear") or "",
        "careerTrack": prof.get("careerTrack") or "",
        "careerInterests": user_data.get("careerInterests") or [],
    }


def _resolve_agent_template(config: dict, user_data: dict, db, uid: str) -> str:
    """Resolve email template instructions from agent config or user defaults."""
    purpose = config.get("emailTemplatePurpose")
    style_preset = config.get("emailStylePreset")
    custom_instructions = config.get("customInstructions") or ""

    # Fall back to user's saved template
    if not purpose:
        t = (user_data.get("emailTemplate") or {})
        purpose = t.get("purpose")
        style_preset = style_preset or t.get("stylePreset")
        custom_instructions = custom_instructions or (t.get("customInstructions") or "")

    return get_template_instructions(
        purpose=purpose,
        style_preset=style_preset,
        custom_instructions=custom_instructions,
    )
