"""Integration test: bounce DSN in Gmail webhook stamps contact as bounced.

Mocks every external service `_process_gmail_notification` touches and
exercises the bounce branch end-to-end. Asserts:
  - the matched contact gets `pipelineStage="bounced"` (not "replied")
  - notification doc is NOT pushed a "{contact} responded" item
  - record_bounce + log_event("email_bounced") fire
  - reply_coach is NOT spawned
"""
from unittest.mock import MagicMock, patch


def _make_history_response(thread_id="thread-123", msg_id="msg-456"):
    return {
        "history": [
            {
                "messagesAdded": [
                    {"message": {"id": msg_id, "threadId": thread_id}}
                ]
            }
        ],
        "nextPageToken": None,
    }


def _make_bounce_message():
    return {
        "labelIds": ["INBOX"],
        "payload": {
            "headers": [
                {"name": "From", "value": "Mail Delivery Subsystem <mailer-daemon@googlemail.com>"},
                {"name": "To", "value": "student@example.com"},
                {"name": "Subject", "value": "Delivery Status Notification (Failure)"},
            ]
        },
        "snippet": "Address not found Your message wasn't delivered to milves@aegworldwide.com because the address couldn't be found",
    }


def _make_contact_doc(contact_id="contact-abc", email="milves@aegworldwide.com"):
    doc = MagicMock()
    doc.id = contact_id
    doc.to_dict.return_value = {
        "email": email,
        "firstName": "Michael",
        "lastName": "Ilves",
        "company": "AEG Worldwide",
        "pipelineStage": "draft_created",
        "gmailThreadId": "thread-123",
        "inOutbox": True,
    }
    doc.reference = MagicMock()
    return doc


def test_bounce_stamps_contact_bounced_not_replied():
    contact = _make_contact_doc()

    # Build the contacts collection mock
    contacts_collection = MagicMock()
    thread_query = MagicMock()
    thread_query.limit.return_value.get.return_value = [contact]
    thread_query.limit.return_value.stream.return_value = iter([contact])
    contacts_collection.where.return_value = thread_query

    # Build top-level Firestore mock
    db = MagicMock()

    gmail_integration_doc = MagicMock()
    gmail_integration_doc.exists = True
    gmail_integration_doc.to_dict.return_value = {"watchHistoryId": "100"}

    user_doc = MagicMock()
    user_doc.exists = True
    user_doc.to_dict.return_value = {"email": "student@example.com"}

    notif_doc = MagicMock()
    notif_doc.exists = False

    notif_ref = MagicMock()
    notif_ref.get.return_value = notif_doc

    gmail_ref = MagicMock()
    gmail_ref.get.return_value = gmail_integration_doc

    user_root_ref = MagicMock()
    user_root_ref.get.return_value = user_doc

    def collection_side_effect(name):
        if name == "users":
            users_collection = MagicMock()
            users_doc_chain = MagicMock()

            def doc_user(uid):
                # users/{uid}.get() → user profile
                # users/{uid}.collection("integrations").document("gmail") → gmail_ref
                # users/{uid}.collection("contacts") → contacts_collection
                # users/{uid}.collection("notifications").document("outbox") → notif_ref
                user_ref = MagicMock()
                user_ref.get.return_value = user_doc

                def sub_collection(sub):
                    sub_coll = MagicMock()
                    if sub == "integrations":
                        sub_coll.document.return_value = gmail_ref
                    elif sub == "contacts":
                        # Return the contacts_collection for every call
                        return contacts_collection
                    elif sub == "notifications":
                        sub_coll.document.return_value = notif_ref
                    return sub_coll

                user_ref.collection.side_effect = sub_collection
                return user_ref

            users_collection.document.side_effect = doc_user
            return users_collection
        return MagicMock()

    db.collection.side_effect = collection_side_effect

    # Build Gmail service mock
    service = MagicMock()
    service.users().history().list().execute.return_value = _make_history_response()
    service.users().messages().get().execute.return_value = _make_bounce_message()

    with (
        patch("app.routes.gmail_webhook.find_uid_by_gmail_address", return_value="uid-1"),
        patch("app.routes.gmail_webhook.get_db", return_value=db),
        patch("app.routes.gmail_webhook.get_gmail_service_for_user", return_value=service),
        patch("app.services.suppression.record_bounce") as mock_record_bounce,
        patch("app.utils.metrics_events.log_event") as mock_log_event,
        patch("app.services.reply_coach.spawn_reply_coach") as mock_spawn_reply_coach,
        patch("app.services.nudge_service.dismiss_pending_nudges_for_contact"),
    ):
        from app.routes.gmail_webhook import _process_gmail_notification
        _process_gmail_notification("student@example.com", "200")

    # Contact was updated as bounced, NOT replied.
    # The webhook does: contact_ref = contacts_ref.document(contact_id); contact_ref.update(...)
    # So the .update() lands on contacts_collection.document.return_value, not contact.reference.
    contact_ref_mock = contacts_collection.document.return_value
    assert contact_ref_mock.update.called, "contact.update was not called"
    update_payload = contact_ref_mock.update.call_args[0][0]
    assert update_payload.get("pipelineStage") == "bounced", (
        f"expected pipelineStage=bounced, got {update_payload!r}"
    )
    assert update_payload.get("emailVerificationStatus") == "bounced"
    assert update_payload.get("inOutbox") is False
    assert update_payload.get("hasUnreadReply") is False

    # No "{contact} responded" notification was pushed
    assert not notif_ref.set.called, "notification doc was updated for a bounce"

    # Suppression + metric fired
    assert mock_record_bounce.called, "record_bounce was not called"
    assert mock_record_bounce.call_args[0][0] == "uid-1"
    assert mock_record_bounce.call_args[0][1] == "milves@aegworldwide.com"

    bounce_metric_calls = [
        c for c in mock_log_event.call_args_list
        if c[0][1] == "email_bounced"
    ]
    assert bounce_metric_calls, f"email_bounced metric not fired (calls: {mock_log_event.call_args_list})"

    # reply_coach was NOT spawned for a bounce
    assert not mock_spawn_reply_coach.called, "reply_coach was spawned for a bounce"
