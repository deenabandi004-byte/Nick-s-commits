"""
Coffee chat prep routes
"""
import concurrent.futures
import logging
import threading
import traceback
from datetime import datetime, timezone

from firebase_admin import firestore, storage
from flask import Blueprint, jsonify, request

from app.config import COFFEE_CHAT_CREDITS, TIER_CONFIGS
from ..extensions import get_db, require_firebase_auth
from app.services.feature_flags import PDL_OUTAGE_ACTIVE
from app.services.auth import check_and_reset_credits, deduct_credits_atomic, refund_credits_atomic, check_and_reset_usage, can_access_feature
from app.utils.exceptions import ValidationError, OfferloopException, InsufficientCreditsError, AuthorizationError
from app.utils.validation import CoffeeChatPrepRequest, validate_request
from app.services.coffee_chat import (
    fetch_comprehensive_research,
    infer_hometown_from_education,
)
from app.services.pdl_client import enrich_linkedin_profile
from app.services.pdf_builder import generate_coffee_chat_pdf_v2
from app.utils.coffee_chat_prep import (
    generate_coffee_chat_questions,
    generate_coffee_chat_similarity,
    generate_company_cheat_sheet,
    generate_conversation_strategy,
)
from app.utils.users import (
    parse_resume_info,
    build_coffee_chat_user_context,
    _empty_coffee_chat_user_context,
)

logger = logging.getLogger(__name__)

coffee_chat_bp = Blueprint(
    "coffee_chat_prep", __name__, url_prefix="/api/coffee-chat-prep"
)


def _upload_pdf_to_storage(user_id: str, prep_id: str, pdf_bytes: bytes) -> dict:
    """
    Upload the generated PDF to Firebase Storage and return URLs.
    """
    bucket = storage.bucket()
    blob_path = f"coffee_chat_preps/{user_id}/{prep_id}.pdf"
    blob = bucket.blob(blob_path)
    blob.upload_from_string(pdf_bytes, content_type="application/pdf")
    try:
        blob.make_public()
        pdf_url = blob.public_url
    except Exception as exc:  # pragma: no cover
        print(f"Failed to make PDF public: {exc}")
        pdf_url = blob.generate_signed_url(expiration=3600)

    return {"pdf_storage_path": blob_path, "pdf_url": pdf_url}


# A prep normally completes in about a minute; one still in-flight this long
# after creation is orphaned (the worker is a daemon thread, so a dev-server
# auto-reload or a deploy restart kills it mid-job with no exception handler,
# freezing the doc at its last stage and keeping the credits). The status
# read path reaps those: mark failed + refund once. Must stay below the
# Scout panel's 5-minute poll timeout so the chat reports the failure
# honestly instead of giving up.
PREP_STALE_AFTER_SECONDS = 240


def _is_stale_prep(prep_data: dict) -> bool:
    """True when a prep is still non-terminal long past the normal runtime."""
    if prep_data.get("status") in ("completed", "failed"):
        return False
    created_raw = prep_data.get("createdAt")
    if not created_raw:
        return False
    try:
        created = datetime.fromisoformat(str(created_raw))
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return False
    age = (datetime.now(timezone.utc) - created).total_seconds()
    return age > PREP_STALE_AFTER_SECONDS


def _maybe_reap_stale_prep(prep_ref, prep_data: dict, user_id: str) -> dict:
    """Reap an orphaned in-flight prep: mark failed, refund once.

    Returns the (possibly updated) prep dict the caller should serve. Any
    error degrades to returning the data unchanged; the next poll retries.
    """
    try:
        if not _is_stale_prep(prep_data):
            return prep_data
        updates = {
            "status": "failed",
            "stage": "failed",
            "stageLabel": "Interrupted",
            "error": (
                "This prep was interrupted by a server restart and could "
                "not finish. Your credits were refunded."
            ),
            "reapedAt": datetime.now(timezone.utc).isoformat(),
            "creditsRefunded": True,
        }
        if not prep_data.get("creditsRefunded"):
            refund_credits_atomic(
                user_id, COFFEE_CHAT_CREDITS, "coffee_chat_prep_interrupted"
            )
        prep_ref.update(updates)
        logger.warning(
            "Reaped stale coffee chat prep %s for user %s (stage was %s)",
            getattr(prep_ref, "id", "?"), user_id, prep_data.get("stage"),
        )
        return {**prep_data, **updates}
    except Exception as e:
        logger.error(f"Stale prep reap failed: {e}")
        return prep_data


def _update_stage(prep_ref, stage, label, pct):
    """Update processing stage for frontend progress display."""
    try:
        prep_ref.update({
            "status": stage,
            "stage": stage,
            "stageLabel": label,
            "progressPct": pct,
        })
    except Exception:
        pass


def process_coffee_chat_prep_background(
    prep_id,
    linkedin_url,
    user_id,
    resume_text,
    extra_context=None,
    user_profile=None,
    credits_charged=COFFEE_CHAT_CREDITS,
):
    """Background worker to process coffee chat prep.
    Credits are deducted BEFORE this thread starts (in the route handler).
    On failure, credits are refunded to the user.
    """
    prep_ref = None
    try:
        db = get_db()
        print(f"\n=== PROCESSING PREP {prep_id} ===")

        prep_ref = (
            db.collection("users")
            .document(user_id)
            .collection("coffee-chat-preps")
            .document(prep_id)
        )

        extra_context = extra_context or {}

        # Step 1: Enrich LinkedIn profile
        print("Step 1: Enriching LinkedIn profile...")
        _update_stage(prep_ref, "enriching", "Looking up LinkedIn profile...", 10)
        contact_data = enrich_linkedin_profile(linkedin_url)

        if not contact_data:
            print("Failed to enrich profile")
            # Refund credits — enrichment failed before any work was done
            refund_credits_atomic(user_id, credits_charged, "coffee_chat_enrichment_failed")
            prep_ref.update(
                {
                    "status": "failed",
                    "error": "Could not enrich LinkedIn profile. Please check the URL and try again.",
                    "creditsRefunded": True,
                }
            )
            return

        prep_ref.update({"contactData": contact_data})

        # Step 2: Fetch comprehensive research via SERP
        # Use extra_context overrides for division/office/industry if user provided them
        print("Step 2: Researching company & industry...")
        _update_stage(prep_ref, "researching", "Researching company & industry...", 30)

        research = fetch_comprehensive_research(
            company=contact_data.get("company", ""),
            industry=extra_context.get("industry") or contact_data.get("industry", ""),
            job_title=contact_data.get("jobTitle", ""),
            first_name=contact_data.get("firstName", ""),
            last_name=contact_data.get("lastName", ""),
            division=extra_context.get("division", ""),
            office=extra_context.get("office", ""),
            time_window=extra_context.get("time_window", "last 90 days"),
            geo=extra_context.get("geo", "us"),
            language=extra_context.get("language", "en"),
        )

        print(f"Found {len(research.get('company_news', []))} news, {len(research.get('person_mentions', []))} mentions")

        # Step 3: Build user context from resume or stored profile
        print("Step 3: Building user context...")
        _update_stage(prep_ref, "analyzing", "Analyzing career history...", 45)

        if resume_text and len(resume_text.strip()) > 50:
            parsed_resume = parse_resume_info(resume_text)
            user_context = build_coffee_chat_user_context(parsed_resume, user_profile)
        else:
            # Build minimal context from profile
            user_context = _empty_coffee_chat_user_context()
            if user_profile:
                resume_parsed = user_profile.get("resumeParsed")
                if resume_parsed and isinstance(resume_parsed, dict):
                    user_context = build_coffee_chat_user_context(resume_parsed, user_profile)
                else:
                    user_context["name"] = (
                        user_profile.get("displayName")
                        or f"{user_profile.get('firstName', '')} {user_profile.get('lastName', '')}".strip()
                        or user_profile.get("name", "")
                    )
                    user_context["university"] = user_profile.get("university", "")
                    user_context["major"] = (
                        user_profile.get("major")
                        or user_profile.get("fieldOfStudy", "")
                    )
                    user_context["year"] = (
                        user_profile.get("year")
                        or user_profile.get("graduationYear", "")
                    )

        prep_ref.update({"userContext": user_context})

        # Step 4: Hometown inference
        print("Step 4: Inferring hometown...")
        education_list = contact_data.get("educationArray", [])
        if education_list and isinstance(education_list, list):
            education_strings = [
                f"{e.get('school', '')} {e.get('degree', '')} {e.get('major', '')}"
                for e in education_list
                if isinstance(e, dict)
            ]
        else:
            fallback = contact_data.get("education", [])
            if isinstance(fallback, str):
                education_strings = [fallback]
            elif isinstance(fallback, list):
                education_strings = [str(e) for e in fallback]
            else:
                education_strings = []
        hometown = infer_hometown_from_education(education_strings, contact_data)
        if hometown:
            contact_data["hometown"] = hometown

        # Step 5: Generate AI content (parallel where possible)
        print("Step 5: Generating AI content...")
        _update_stage(prep_ref, "generating", "Writing tailored questions...", 65)

        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            f_similarity = executor.submit(
                generate_coffee_chat_similarity, contact_data, user_context, research)
            f_questions = executor.submit(
                generate_coffee_chat_questions, contact_data, user_context, research)
            f_cheatsheet = executor.submit(
                generate_company_cheat_sheet, contact_data, research)

            similarity = f_similarity.result()
            questions = f_questions.result()
            cheatsheet = f_cheatsheet.result()

        # Strategy uses similarity output — run after
        strategy = generate_conversation_strategy(contact_data, user_context, similarity)

        # Track which AI sections failed so we can inform the user
        partial_failures = []
        if not similarity:
            partial_failures.append("common_ground")
        if not questions:
            partial_failures.append("questions")
        if not cheatsheet:
            partial_failures.append("cheat_sheet")
        if not strategy:
            partial_failures.append("strategy")
        if partial_failures:
            logger.warning(f"Prep {prep_id}: AI generation partially failed for: {partial_failures}")

        ai_output = {
            "similarity": similarity,
            "questions": questions,
            "cheat_sheet": cheatsheet,
            "strategy": strategy,
        }

        # Step 6: Generate PDF
        print("Step 6: Generating PDF...")
        _update_stage(prep_ref, "building", "Building your prep sheet...", 85)

        pdf_buffer = generate_coffee_chat_pdf_v2(
            contact_data=contact_data,
            research=research,
            ai_output=ai_output,
            user_context=user_context,
        )

        pdf_bytes = pdf_buffer.getvalue()
        upload_result = _upload_pdf_to_storage(user_id, prep_id, pdf_bytes)

        # Step 7: Mark as completed
        print("Step 7: Marking as completed...")
        prep_ref.update(
            {
                "status": "completed",
                "stage": "completed",
                "stageLabel": "Complete!",
                "progressPct": 100,
                "completedAt": datetime.now(timezone.utc).isoformat(),
                "similaritySummary": similarity,
                "coffeeQuestions": questions,
                "companyCheatSheet": cheatsheet,
                "conversationStrategy": strategy,
                "research": research,
                "pdfUrl": upload_result["pdf_url"],
                "pdfStoragePath": upload_result["pdf_storage_path"],
                "contactName": contact_data.get("fullName", ""),
                **({"partialFailures": partial_failures} if partial_failures else {}),
            }
        )

        # Step 8: Increment usage counter atomically
        print("Step 8: Incrementing usage counter...")
        try:
            user_ref = db.collection("users").document(user_id)
            user_ref.update({
                "coffeeChatPrepsUsed": firestore.Increment(1),
                "updatedAt": datetime.now(timezone.utc).isoformat()
            })
        except Exception as usage_error:
            logger.error(f"Failed to increment usage counter: {usage_error}")

        print(f"=== PREP {prep_id} COMPLETED SUCCESSFULLY ===\n")

    except Exception as e:
        logger.error(f"Coffee chat prep failed for {prep_id}: {e}")
        traceback.print_exc()

        # Refund credits on failure
        try:
            success, _ = refund_credits_atomic(user_id, credits_charged, "coffee_chat_prep_failure")
            if success:
                logger.info(f"Refunded {credits_charged} credits to {user_id} after prep failure")
            else:
                logger.error(f"Failed to refund {credits_charged} credits to {user_id}")
        except Exception as refund_err:
            logger.error(f"Credit refund error: {refund_err}")

        try:
            if prep_ref:
                prep_ref.update({"status": "failed", "error": str(e), "creditsRefunded": True})
        except Exception as update_err:
            logger.error(f"Failed to update prep status to failed: {update_err}")


@coffee_chat_bp.route("", methods=["POST"])
@require_firebase_auth
def create_coffee_chat_prep():
    """Create a new coffee chat prep"""
    if PDL_OUTAGE_ACTIVE:
        return jsonify({"error": "service_unavailable", "message": "Coffee Chat Prep temporarily unavailable due to a data provider update.", "code": "PDL_OUTAGE"}), 503
    try:
        print("\n=== COFFEE CHAT PREP START ===")
        db = get_db()

        data = request.get_json() or {}

        # Validate request data
        try:
            validated_data = validate_request(CoffeeChatPrepRequest, data)
        except ValidationError as e:
            return jsonify({"error": str(e)}), 400

        linkedin_url = validated_data.get("linkedinUrl", "").strip().rstrip("/")
        # Remove query params and fragments for consistent dedup
        linkedin_url = linkedin_url.split("?")[0].split("#")[0]

        if not linkedin_url:
            return jsonify({"error": "LinkedIn URL is required"}), 400

        user_id = request.firebase_user.get("uid")
        user_email = request.firebase_user.get("email")

        # Single Firestore read for credits, tier, usage, resume — avoid redundant fetches
        user_data = {}
        if db and user_id:
            user_ref = db.collection("users").document(user_id)
            user_doc = user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict() or {}
                credits_available = check_and_reset_credits(user_ref, user_data)

                # Check and reset usage counters (for Pro/Elite monthly reset)
                # check_and_reset_usage modifies user_data in-place if reset needed
                check_and_reset_usage(user_ref, user_data)

                # Check credits
                if credits_available < COFFEE_CHAT_CREDITS:
                    return (
                        jsonify(
                            {
                                "error": f"Insufficient credits. You need {COFFEE_CHAT_CREDITS} credits.",
                                "credits_needed": COFFEE_CHAT_CREDITS,
                                "current_credits": credits_available,
                            }
                        ),
                        400,
                    )

                # Check feature access (coffee chat prep limit)
                tier = user_data.get("subscriptionTier") or user_data.get("tier", "free")
                tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS["free"])
                allowed, reason = can_access_feature(tier, "coffee_chat_prep", user_data, tier_config)

                if not allowed:
                    coffee_chat_limit = tier_config.get("coffee_chat_preps", 0)
                    if coffee_chat_limit != "unlimited":
                        current_usage = user_data.get("coffeeChatPrepsUsed", 0)
                        raise AuthorizationError(
                            f"Coffee Chat Prep limit reached. You've used {current_usage} of {coffee_chat_limit} allowed.",
                            details={
                                "current_usage": current_usage,
                                "limit": coffee_chat_limit,
                                "tier": tier,
                                "reason": reason
                            }
                        )

        # Resume check — reuse already-fetched user_data (no extra Firestore read)
        resume_text = user_data.get("resumeText")

        has_profile_fallback = any(
            [
                resume_text,
                user_data.get("resumeParsed"),
                user_data.get("firstName"),
                user_data.get("name"),
            ]
        )

        if not has_profile_fallback:
            return (
                jsonify(
                    {
                        "error": "Please upload your resume in Account Settings first.",
                        "needsResume": True,
                    }
                ),
                400,
            )

        # Deduct credits BEFORE spawning background thread (prevents TOCTOU)
        success, new_balance = deduct_credits_atomic(user_id, COFFEE_CHAT_CREDITS, "coffee_chat_prep")
        if not success:
            return (
                jsonify(
                    {
                        "error": "Insufficient credits",
                        "credits_needed": COFFEE_CHAT_CREDITS,
                    }
                ),
                400,
            )

        # Create prep record
        prep_data = {
            "linkedinUrl": linkedin_url,
            "status": "processing",
            "stage": "processing",
            "stageLabel": "Starting...",
            "progressPct": 0,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "userId": user_id,
            "userEmail": user_email,
        }

        prep_ref = (
            db.collection("users").document(user_id).collection("coffee-chat-preps").document()
        )
        prep_ref.set(prep_data)
        prep_id = prep_ref.id

        # Build extra_context with only non-None values
        extra_context = {}
        if validated_data.get("timeWindow"):
            extra_context["time_window"] = validated_data.get("timeWindow")
        if validated_data.get("geo"):
            extra_context["geo"] = validated_data.get("geo")
        if validated_data.get("language"):
            extra_context["language"] = validated_data.get("language")
        if validated_data.get("division"):
            extra_context["division"] = validated_data.get("division")
        if validated_data.get("office"):
            extra_context["office"] = validated_data.get("office")
        if validated_data.get("industry"):
            extra_context["industry"] = validated_data.get("industry")

        # Start background processing in a thread
        try:
            thread = threading.Thread(
                target=process_coffee_chat_prep_background,
                args=(
                    prep_id,
                    linkedin_url,
                    user_id,
                    resume_text,
                    extra_context,
                    user_data,
                ),
                daemon=True
            )
            thread.start()

            # Log coffee_chat_prep_used metric (manual trigger)
            from app.utils.metrics_events import log_event
            log_event(user_id, "coffee_chat_prep_used", {
                "auto_triggered": False,
                "contact_id": extra_context.get("contactId", ""),
            })

            # Return immediately with prep_id so frontend can start polling
            prep_data['id'] = prep_id
            prep_data['prepId'] = prep_id
            return jsonify(prep_data), 200

        except Exception as processing_error:
            logger.error(f"Processing error: {processing_error}")
            traceback.print_exc()
            return jsonify({"error": str(processing_error)}), 500

    except Exception as e:
        logger.error(f"Coffee chat prep error: {e}")
        return jsonify({"error": str(e)}), 500



@coffee_chat_bp.route("/history", methods=["GET"])
@require_firebase_auth
def get_coffee_chat_history():
    """Get recent coffee chat prep history"""
    try:
        db = get_db()
        user_id = request.firebase_user.get("uid")
        limit = request.args.get("limit", 5, type=int)

        preps_ref = (
            db.collection("users").document(user_id).collection("coffee-chat-preps")
        )
        preps = (
            preps_ref.order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(limit)
            .stream()
        )

        history = []
        for prep in preps:
            prep_data = prep.to_dict()
            contact_data = prep_data.get("contactData", {})
            history.append({
                "id": prep.id,
                "contactName": f"{contact_data.get('firstName', '')} {contact_data.get('lastName', '')}".strip()
                or contact_data.get("fullName", "Unknown"),
                "company": contact_data.get("company", ""),
                "jobTitle": contact_data.get("jobTitle", ""),
                "status": prep_data.get("status", "unknown"),
                "createdAt": prep_data.get("createdAt", ""),
                "pdfUrl": prep_data.get("pdfUrl"),
                "error": prep_data.get("error", ""),
            })

        return jsonify({"history": history}), 200

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"history": []}), 200


@coffee_chat_bp.route("/all", methods=["GET"])
@require_firebase_auth
def get_all_coffee_chat_preps():
    """Get all coffee chat preps"""
    try:
        db = get_db()
        user_id = request.firebase_user.get("uid")
        preps_ref = (
            db.collection("users").document(user_id).collection("coffee-chat-preps")
        )
        preps = preps_ref.order_by("createdAt", direction=firestore.Query.DESCENDING).stream()

        all_preps = []
        for prep in preps:
            prep_data = prep.to_dict()
            # Heal orphaned in-flight preps so the library never shows a
            # forever-spinning "Processing..." card for a dead job.
            prep_data = _maybe_reap_stale_prep(prep.reference, prep_data, user_id)
            contact_data = prep_data.get("contactData", {})

            all_preps.append({
                "id": prep.id,
                "contactName": f"{contact_data.get('firstName', '')} {contact_data.get('lastName', '')}".strip()
                or contact_data.get("fullName", "Unknown"),
                "company": contact_data.get("company", ""),
                "jobTitle": contact_data.get("jobTitle", ""),
                "linkedinUrl": prep_data.get("linkedinUrl", ""),
                "status": prep_data.get("status"),
                "createdAt": prep_data.get("createdAt", ""),
                "pdfUrl": prep_data.get("pdfUrl"),
                "error": prep_data.get("error", ""),
            })

        return jsonify({"preps": all_preps})

    except Exception as e:
        logger.error(f"Error getting all coffee chat preps: {e}")
        traceback.print_exc()
        return jsonify({"preps": [], "error": "Failed to load coffee chat preps"}), 200


@coffee_chat_bp.route("/<prep_id>/download", methods=["GET"])
@require_firebase_auth
def download_coffee_chat_pdf(prep_id):
    """Return Coffee Chat PDF download URL"""
    try:
        db = get_db()
        user_id = request.firebase_user.get("uid")
        prep_ref = (
            db.collection("users")
            .document(user_id)
            .collection("coffee-chat-preps")
            .document(prep_id)
        )
        prep_doc = prep_ref.get()

        if not prep_doc.exists:
            return jsonify({"error": "Prep not found"}), 404

        prep_data = prep_doc.to_dict()
        pdf_url = prep_data.get("pdfUrl")
        pdf_path = prep_data.get("pdfStoragePath")

        # If stored URL is a public URL (not signed), return it directly
        if pdf_url and "X-Goog-Signature" not in pdf_url and "Signature=" not in pdf_url:
            return jsonify({"pdfUrl": pdf_url}), 200

        # Otherwise regenerate a fresh signed URL from storage path
        if pdf_path:
            bucket = storage.bucket()
            blob = bucket.blob(pdf_path)
            if blob.exists():
                signed_url = blob.generate_signed_url(expiration=3600)
                return jsonify({"pdfUrl": signed_url}), 200

        # Last resort: try stored URL even if it might be expired
        if pdf_url:
            return jsonify({"pdfUrl": pdf_url}), 200

        return jsonify({"error": "PDF not found"}), 404

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500


@coffee_chat_bp.route("/<prep_id>", methods=["GET"])
@require_firebase_auth
def get_coffee_chat_prep(prep_id):
    """Get prep status with stage progress info"""
    try:
        db = get_db()
        user_id = request.firebase_user.get("uid")
        prep_ref = (
            db.collection("users")
            .document(user_id)
            .collection("coffee-chat-preps")
            .document(prep_id)
        )
        prep_doc = prep_ref.get()

        if not prep_doc.exists:
            return jsonify({"error": "Prep not found"}), 404

        prep_data = prep_doc.to_dict()
        prep_data = _maybe_reap_stale_prep(prep_ref, prep_data, user_id)
        prep_data["id"] = prep_id

        # Ensure stage fields are present for frontend
        if "stage" not in prep_data:
            prep_data["stage"] = prep_data.get("status", "")
        if "stageLabel" not in prep_data:
            prep_data["stageLabel"] = "Working on it..."
        if "progressPct" not in prep_data:
            prep_data["progressPct"] = 0

        return jsonify(prep_data), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@coffee_chat_bp.route("/<prep_id>", methods=["DELETE"])
@require_firebase_auth
def delete_coffee_chat_prep(prep_id):
    """Delete a coffee chat prep"""
    try:
        db = get_db()
        user_id = request.firebase_user.get("uid")

        print(f"[CoffeeChatPrep] DELETE request for prep_id: {prep_id}")

        prep_ref = (
            db.collection("users")
            .document(user_id)
            .collection("coffee-chat-preps")
            .document(prep_id)
        )
        prep_doc = prep_ref.get()

        print(f"[CoffeeChatPrep] Prep exists: {prep_doc.exists}")

        if not prep_doc.exists:
            return jsonify({"error": "Prep not found"}), 404

        prep_data = prep_doc.to_dict()
        pdf_path = prep_data.get("pdfStoragePath")
        if pdf_path:
            try:
                bucket = storage.bucket()
                blob = bucket.blob(pdf_path)
                if blob.exists():
                    blob.delete()
                    print(f"Deleted PDF at: {pdf_path}")
            except Exception as e:
                print(f"Failed to delete PDF: {e}")
                pass

        prep_ref.delete()
        print(f"Successfully deleted prep: {prep_id}")

        return jsonify({"message": "Prep deleted successfully"})

    except Exception as e:
        print(f"Error deleting prep: {e}")
        return jsonify({"error": str(e)}), 500
