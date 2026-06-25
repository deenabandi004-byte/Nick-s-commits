"""
Tests for email generation service - v4 SAFE-HUMAN validation
"""
import pytest
import json
import re
from unittest.mock import Mock, patch, MagicMock
from app.services.reply_generation import batch_generate_emails


class TestEmailGenerationValidation:
    """Test email generation output validation"""
    
    def test_output_is_valid_json(self):
        """Test that output parses as valid JSON"""
        contacts = [
            {'FirstName': 'John', 'LastName': 'Doe', 'Company': 'Google', 'Title': 'Software Engineer'}
        ]
        resume_text = "John Smith\nComputer Science\nStanford University"
        user_profile = {'name': 'John Smith', 'email': 'john@example.com'}
        career_interests = "Software engineering"
        
        # Mock OpenAI response
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = json.dumps({
            "0": {
                "subject": "Question about software engineering",
                "body": "Hi John,\n\nYour work at Google caught my attention.\n\nWould you be open to a quick 10-15 minute chat?\n\nBest,\nJohn Smith"
            }
        })
        
        with patch('app.services.reply_generation.get_openai_client') as mock_client:
            mock_client.return_value.chat.completions.create.return_value = mock_response
            
            results = batch_generate_emails(contacts, resume_text, user_profile, career_interests)
            
            # Should return a dict
            assert isinstance(results, dict)
            assert '0' in results or 0 in results
            entry = results.get(0) or results.get('0')
            assert entry is not None
            assert 'subject' in entry
            assert 'body' in entry
    
    def test_no_banned_openers(self):
        """Test that banned openers are not present in first sentence"""
        contacts = [
            {'FirstName': 'Jane', 'LastName': 'Smith', 'Company': 'Microsoft', 'Title': 'Product Manager'}
        ]
        resume_text = "Alice Brown\nBusiness\nHarvard University"
        user_profile = {'name': 'Alice Brown', 'email': 'alice@example.com'}
        career_interests = "Product management"
        
        # Mock OpenAI response with banned opener
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = json.dumps({
            "0": {
                "subject": "Question about product management",
                "body": "Hi Jane,\n\nI hope you're doing well. I came across your profile and was impressed.\n\nWould you be open to a chat?\n\nBest,\nAlice Brown"
            }
        })
        
        with patch('app.services.reply_generation.get_openai_client') as mock_client:
            mock_client.return_value.chat.completions.create.return_value = mock_response
            
            results = batch_generate_emails(contacts, resume_text, user_profile, career_interests)
            
            body = results.get('0', {}).get('body', '') or results.get(0, {}).get('body', '')
            
            # Extract first sentence after greeting
            lines = body.split('\n')
            greeting_line = None
            first_sentence = None
            for i, line in enumerate(lines):
                if line.strip().startswith('Hi '):
                    greeting_line = i
                    if i + 1 < len(lines):
                        first_sentence = lines[i + 1].strip()
                    break
            
            if first_sentence:
                banned_openers = ["I hope", "Hope", "My name is", "I came across"]
                # Check that first sentence doesn't start with banned opener
                # (post-processing should have fixed it)
                assert not any(first_sentence.startswith(banned) for banned in banned_openers), \
                    f"Found banned opener in first sentence: {first_sentence}"
    
    def test_resume_line_only_when_allowed_targeted(self):
        """Test that resume line appears only for targeted outreach"""
        contacts = [
            {'FirstName': 'Bob', 'LastName': 'Johnson', 'Company': 'Amazon', 'Title': 'Data Scientist'}
        ]
        resume_text = "Charlie Davis\nData Science\nMIT"
        user_profile = {'name': 'Charlie Davis', 'email': 'charlie@example.com'}
        career_interests = "Data science"
        fit_context = {
            'job_title': 'Data Scientist Intern',
            'company': 'Amazon',
            'score': 75,
            'match_level': 'strong'
        }
        
        # Mock OpenAI response
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = json.dumps({
            "0": {
                "subject": "Question about data science roles",
                "body": "Hi Bob,\n\nYour experience as a Data Scientist at Amazon caught my attention.\n\nWould you be open to a quick chat?\n\nBest,\nCharlie Davis"
            }
        })
        
        with patch('app.services.reply_generation.get_anthropic_client', return_value=None):
            with patch('app.services.reply_generation.get_openai_client') as mock_client:
                mock_client.return_value.chat.completions.create.return_value = mock_response

                results = batch_generate_emails(contacts, resume_text, user_profile, career_interests, fit_context=fit_context, resume_filename="resume.pdf")

                entry = results.get(0) or results.get('0') or {}
                body = entry.get('body', '')

                # Should include resume line for targeted outreach when resume_filename is provided
                resume_mentions = ["included my resume", "attached my resume", "attached resume", "resume below", "resume attached"]
                has_resume_mention = any(mention in body.lower() for mention in resume_mentions)
                assert has_resume_mention, "Resume line should be included for targeted outreach"
    
    def test_resume_line_only_when_allowed_strong_connection(self):
        """Test that resume line appears for strong connections (alumni)"""
        contacts = [
            {'FirstName': 'Sarah', 'LastName': 'Wilson', 'Company': 'Facebook', 'Title': 'Engineer'}
        ]
        resume_text = "Tom Anderson\nComputer Science\nStanford University"
        user_profile = {'name': 'Tom Anderson', 'email': 'tom@example.com'}
        career_interests = "Software engineering"
        
        # Mock detect_commonality to return university connection
        with patch('app.services.reply_generation.detect_commonality') as mock_detect:
            mock_detect.return_value = ('university', {'university': 'Stanford'})
            
            # Mock OpenAI response
            mock_response = MagicMock()
            mock_response.choices = [MagicMock()]
            mock_response.choices[0].message.content = json.dumps({
                "0": {
                    "subject": "Fellow Stanford alum",
                    "body": "Hi Sarah,\n\nAs a fellow Stanford alum, I'd like to learn about your experience.\n\nWould you be open to connecting?\n\nBest,\nTom Anderson"
                }
            })
            
            with patch('app.services.reply_generation.get_anthropic_client', return_value=None):
                with patch('app.services.reply_generation.get_openai_client') as mock_client:
                    mock_client.return_value.chat.completions.create.return_value = mock_response

                    results = batch_generate_emails(contacts, resume_text, user_profile, career_interests, resume_filename="resume.pdf")

                    entry = results.get(0) or results.get('0') or {}
                    body = entry.get('body', '')

                    # Should include resume line for strong connection when resume_filename is provided
                    resume_mentions = ["included my resume", "attached my resume", "attached resume", "resume below", "resume attached"]
                    has_resume_mention = any(mention in body.lower() for mention in resume_mentions)
                    assert has_resume_mention, "Resume line should be included for strong connection (alumni)"
    
    def test_resume_line_not_included_for_general_networking(self):
        """Test that resume line is NOT included for general networking without strong connection"""
        contacts = [
            {'FirstName': 'Mike', 'LastName': 'Taylor', 'Company': 'Netflix', 'Title': 'Designer'}
        ]
        resume_text = "Lisa Chen\nDesign\nUC Berkeley"
        user_profile = {'name': 'Lisa Chen', 'email': 'lisa@example.com'}
        career_interests = "Design"
        
        # Mock detect_commonality to return no strong connection
        with patch('app.services.reply_generation.detect_commonality') as mock_detect:
            mock_detect.return_value = (None, {})
            
            # Mock OpenAI response
            mock_response = MagicMock()
            mock_response.choices = [MagicMock()]
            mock_response.choices[0].message.content = json.dumps({
                "0": {
                    "subject": "Question about design",
                    "body": "Hi Mike,\n\nYour work at Netflix caught my attention.\n\nWould you be open to a quick chat?\n\nBest,\nLisa Chen"
                }
            })
            
            with patch('app.services.reply_generation.get_openai_client') as mock_client:
                mock_client.return_value.chat.completions.create.return_value = mock_response
                
                results = batch_generate_emails(contacts, resume_text, user_profile, career_interests)
                
                body = results.get('0', {}).get('body', '') or results.get(0, {}).get('body', '')
                
                # Should NOT include resume line for general networking
                resume_mentions = ["attached my resume", "attached resume", "resume below", "resume attached"]
                has_resume_mention = any(mention in body.lower() for mention in resume_mentions)
                assert not has_resume_mention, "Resume line should NOT be included for general networking without strong connection"
    
    def test_word_count_within_range(self):
        """Test that email body word count is within 60-90 words (with +/- 15 tolerance)"""
        contacts = [
            {'FirstName': 'Alex', 'LastName': 'Martinez', 'Company': 'Apple', 'Title': 'Engineer'}
        ]
        resume_text = "David Lee\nEngineering\nCaltech"
        user_profile = {'name': 'David Lee', 'email': 'david@example.com'}
        career_interests = "Engineering"
        
        # Mock OpenAI response
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        # Create a body with appropriate word count
        body_text = "Hi Alex,\n\nYour work at Apple caught my attention. I'd like to learn more about your experience as an engineer.\n\nWould you be open to a quick 10-15 minute chat?\n\nBest,\nDavid Lee"
        mock_response.choices[0].message.content = json.dumps({
            "0": {
                "subject": "Question about engineering",
                "body": body_text
            }
        })
        
        with patch('app.services.reply_generation.get_openai_client') as mock_client:
            mock_client.return_value.chat.completions.create.return_value = mock_response
            
            results = batch_generate_emails(contacts, resume_text, user_profile, career_interests)
            
            body = results.get('0', {}).get('body', '') or results.get(0, {}).get('body', '')
            
            # Count words (excluding signature and greeting)
            # Remove greeting and signature for word count
            lines = body.split('\n')
            content_lines = []
            skip_signature = False
            for line in lines:
                if line.strip().startswith('Hi '):
                    continue
                if line.strip() in ['Best,', 'Best regards,', 'Thank you,', 'Thanks,']:
                    skip_signature = True
                    continue
                if skip_signature:
                    continue
                content_lines.append(line)
            
            content_text = ' '.join(content_lines)
            word_count = len(content_text.split())
            
            # Should be between 45-105 words (60-90 with +/- 15 tolerance)
            assert 45 <= word_count <= 105, f"Word count {word_count} is outside acceptable range (45-105)"
    
    def test_one_cta_only(self):
        """Test that email has only one CTA (heuristic: one question mark OR one explicit ask)"""
        contacts = [
            {'FirstName': 'Emma', 'LastName': 'Brown', 'Company': 'Tesla', 'Title': 'Manager'}
        ]
        resume_text = "Frank White\nBusiness\nYale"
        user_profile = {'name': 'Frank White', 'email': 'frank@example.com'}
        career_interests = "Management"
        
        # Mock OpenAI response
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = json.dumps({
            "0": {
                "subject": "Question about management",
                "body": "Hi Emma,\n\nYour work at Tesla caught my attention.\n\nWould you be open to a quick 10-15 minute chat?\n\nBest,\nFrank White"
            }
        })
        
        with patch('app.services.reply_generation.get_openai_client') as mock_client:
            mock_client.return_value.chat.completions.create.return_value = mock_response
            
            results = batch_generate_emails(contacts, resume_text, user_profile, career_interests)
            
            body = results.get('0', {}).get('body', '') or results.get(0, {}).get('body', '')
            
            # Count explicit CTAs
            cta_patterns = [
                r"Would you be open",
                r"Would you be willing",
                r"I'd appreciate",
                r"Could you",
                r"Can you"
            ]
            
            cta_count = sum(1 for pattern in cta_patterns if re.search(pattern, body, re.IGNORECASE))
            question_count = body.count('?')
            
            # Should have at most one explicit CTA pattern OR one question mark
            # (allowing for the CTA to be a question)
            assert cta_count <= 1, f"Found {cta_count} explicit CTAs, should be at most 1"
            # Question count should be reasonable (CTA question is allowed)
            assert question_count <= 2, f"Found {question_count} question marks, should be at most 2 (allowing for CTA question)"


class TestAnchorPrioritySelection:
    """Test anchor priority selection: transition → tenure → title"""
    
    def test_transition_anchor_chosen_over_tenure_and_title(self):
        """Test that transition anchor is selected when available, even if tenure and title also available"""
        from app.services.reply_generation import _select_anchor
        
        # Contact with transition (engineering → consulting), short tenure, and title
        contact = {
            'FirstName': 'John',
            'LastName': 'Doe',
            'Title': 'Consultant',
            'Company': 'McKinsey',
            'experience': [
                {
                    'company': {'name': 'McKinsey'},
                    'title': {'name': 'Consultant'},
                    'start_date': {'year': 2023, 'month': 1}  # Recent (tenure anchor available)
                },
                {
                    'company': {'name': 'Google'},
                    'title': {'name': 'Software Engineer'},
                    'start_date': {'year': 2020, 'month': 1},
                    'end_date': {'year': 2022, 'month': 12}
                }
            ]
        }
        
        selected = _select_anchor(contact)
        
        assert selected is not None, "Should select an anchor"
        assert selected['type'] == 'transition', f"Should select transition anchor, got {selected['type']}"
        assert 'transitioned' in selected['value'].lower() or 'moved' in selected['value'].lower(), \
            f"Anchor value should mention transition, got: {selected['value']}"
    
    def test_tenure_anchor_chosen_over_title_when_no_transition(self):
        """Test that tenure anchor is selected when no transition exists but tenure is short"""
        from app.services.reply_generation import _select_anchor
        
        # Contact with short tenure but no transition (same company)
        contact = {
            'FirstName': 'Jane',
            'LastName': 'Smith',
            'Title': 'Associate',
            'Company': 'Bain',
            'experience': [
                {
                    'company': {'name': 'Bain'},
                    'title': {'name': 'Associate'},
                    'start_date': {'year': 2023, 'month': 6}  # Recent (1 year tenure)
                }
            ]
        }
        
        selected = _select_anchor(contact)
        
        assert selected is not None, "Should select an anchor"
        assert selected['type'] == 'tenure', f"Should select tenure anchor, got {selected['type']}"
        assert 'recently joined' in selected['value'].lower() or 'early in your time' in selected['value'].lower(), \
            f"Anchor value should mention tenure, got: {selected['value']}"
    
    def test_title_anchor_used_as_fallback(self):
        """Test that title anchor is used only when no transition or tenure anchor applies"""
        from app.services.reply_generation import _select_anchor
        
        # Contact with long tenure (no tenure anchor), no transition (only one job)
        contact = {
            'FirstName': 'Bob',
            'LastName': 'Johnson',
            'Title': 'Analyst',
            'Company': 'Evercore',
            'experience': [
                {
                    'company': {'name': 'Evercore'},
                    'title': {'name': 'Analyst'},
                    'start_date': {'year': 2018, 'month': 1}  # Long tenure (>3 years)
                }
            ]
        }
        
        selected = _select_anchor(contact)
        
        assert selected is not None, "Should select an anchor"
        assert selected['type'] == 'title', f"Should select title anchor as fallback, got {selected['type']}"
        assert 'Analyst' in selected['value'] and 'Evercore' in selected['value'], \
            f"Anchor value should include title and company, got: {selected['value']}"
    
    def test_exactly_one_anchor_in_email(self):
        """Test that exactly ONE anchor appears in the final email"""
        from app.services.reply_generation import batch_generate_emails
        
        # Contact with transition, tenure, and title all available
        contact = {
            'FirstName': 'Sarah',
            'LastName': 'Wilson',
            'Title': 'Consultant',
            'Company': 'BCG',
            'experience': [
                {
                    'company': {'name': 'BCG'},
                    'title': {'name': 'Consultant'},
                    'start_date': {'year': 2023, 'month': 1}  # Recent
                },
                {
                    'company': {'name': 'Microsoft'},
                    'title': {'name': 'Software Engineer'},
                    'start_date': {'year': 2020, 'month': 1},
                    'end_date': {'year': 2022, 'month': 12}
                }
            ]
        }
        
        resume_text = "Alice Brown\nBusiness\nHarvard University"
        user_profile = {'name': 'Alice Brown', 'email': 'alice@example.com'}
        career_interests = "Consulting"
        
        # Mock OpenAI response
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        # Response with transition anchor
        mock_response.choices[0].message.content = json.dumps({
            "0": {
                "subject": "Question about consulting",
                "body": "Hi Sarah,\n\nI noticed you transitioned into consulting from engineering. I'd like to learn more about your experience.\n\nWould you be open to a quick chat?\n\nBest,\nAlice Brown"
            }
        })
        
        with patch('app.services.reply_generation.get_anthropic_client', return_value=None), \
             patch('app.services.reply_generation.get_openai_client') as mock_client:
            mock_obj = MagicMock()
            mock_obj.with_options.return_value = mock_obj
            mock_obj.chat.completions.create.return_value = mock_response
            mock_client.return_value = mock_obj

            results = batch_generate_emails([contact], resume_text, user_profile, career_interests)

            body = results.get('0', {}).get('body', '') or results.get(0, {}).get('body', '')

            # Count anchor mentions
            transition_mentions = ['transitioned', 'moved into', 'shifted from']
            tenure_mentions = ['recently joined', 'early in your time']
            title_mentions = ['Consultant at BCG', 'BCG Consultant']

            transition_count = sum(1 for pattern in transition_mentions if pattern in body.lower())
            tenure_count = sum(1 for pattern in tenure_mentions if pattern in body.lower())
            title_count = sum(1 for pattern in title_mentions if pattern in body.lower())

            # Should have exactly one anchor type mentioned
            anchor_types_found = sum([
                transition_count > 0,
                tenure_count > 0,
                title_count > 0
            ])

            assert anchor_types_found == 1, \
                f"Should have exactly one anchor type, found: transition={transition_count}, tenure={tenure_count}, title={title_count}"
    
    def test_anchor_priority_preserves_other_validation(self):
        """Test that anchor priority doesn't break existing validation (banned openers, word count, resume gating)"""
        from app.services.reply_generation import batch_generate_emails
        
        contact = {
            'FirstName': 'Mike',
            'LastName': 'Taylor',
            'Title': 'Associate',
            'Company': 'Goldman Sachs',
            'experience': [
                {
                    'company': {'name': 'Goldman Sachs'},
                    'title': {'name': 'Associate'},
                    'start_date': {'year': 2023, 'month': 1}
                },
                {
                    'company': {'name': 'JP Morgan'},
                    'title': {'name': 'Analyst'},
                    'start_date': {'year': 2021, 'month': 1},
                    'end_date': {'year': 2022, 'month': 12}
                }
            ]
        }
        
        resume_text = "David Lee\nFinance\nWharton"
        user_profile = {'name': 'David Lee', 'email': 'david@example.com'}
        career_interests = "Investment banking"
        fit_context = {
            'job_title': 'Investment Banking Analyst',
            'company': 'Goldman Sachs',
            'score': 80,
            'match_level': 'strong'
        }
        
        # Mock OpenAI response
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        body_text = "Hi Mike,\n\nI noticed you transitioned into investment banking. I'd like to learn more about your experience.\n\nWould you be open to a quick 10-15 minute chat?\n\nBest,\nDavid Lee"
        mock_response.choices[0].message.content = json.dumps({
            "0": {
                "subject": "Question about investment banking",
                "body": body_text
            }
        })
        
        with patch('app.services.reply_generation.get_anthropic_client', return_value=None):
            with patch('app.services.reply_generation.get_openai_client') as mock_client:
                mock_client.return_value.chat.completions.create.return_value = mock_response

                results = batch_generate_emails([contact], resume_text, user_profile, career_interests, fit_context=fit_context, resume_filename="resume.pdf")

                entry = results.get(0) or results.get('0') or {}
                body = entry.get('body', '')

                # Check banned openers (should not be present)
                banned_openers = ["I hope", "Hope", "My name is", "I came across"]
                first_sentence = body.split('\n')[1] if len(body.split('\n')) > 1 else ""
                assert not any(first_sentence.startswith(banned) for banned in banned_openers), \
                    "Should not have banned openers"

                # Check word count (should be reasonable)
                word_count = len(body.split())
                assert 30 <= word_count <= 150, f"Word count {word_count} should be reasonable"

                # Check resume line (should be present for targeted outreach)
                resume_mentions = ["included my resume", "attached my resume", "attached resume", "resume below", "resume attached"]
                has_resume_mention = any(mention in body.lower() for mention in resume_mentions)
                assert has_resume_mention, "Should include resume line for targeted outreach"


class TestLoopBriefInjection:
    """Regression: the Loop's briefText (and parsed chips) must reach the
    LLM prompt. Without these checks the brief silently gets dropped and
    every Loop generates generic networking copy regardless of the student's
    stated goal — exactly the bug we just fixed in agent_actions.execute_find_and_draft.
    """

    def _captured_prompt(self, **batch_kwargs):
        """Run batch_generate_emails with the brief kwargs and return the
        full prompt string the GPT fallback path would have seen."""
        contacts = [{
            "FirstName": "Maya",
            "LastName": "Reyes",
            "Company": "JPMorgan",
            "Title": "VP, Investment Banking",
        }]
        resume_text = "Deena Sid\nUSC, Computer Science"
        user_profile = {"name": "Deena Sid", "email": "deena@example.com"}
        career_interests = "Networking"

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = json.dumps({
            "0": {"subject": "Hi", "body": "Hi Maya,\n\nbody\n\nBest,\nDeena"}
        })

        captured = {}
        def fake_create(**kwargs):
            captured.update(kwargs)
            return mock_response

        with patch("app.services.reply_generation.get_anthropic_client", return_value=None):
            with patch("app.services.reply_generation.get_openai_client") as mock_client:
                mock_client.return_value.with_options.return_value.chat.completions.create.side_effect = fake_create
                # Also wire the .chat.completions.create path on the raw
                # client (some code paths skip .with_options).
                mock_client.return_value.chat.completions.create.side_effect = fake_create
                batch_generate_emails(
                    contacts=contacts,
                    resume_text=resume_text,
                    user_profile=user_profile,
                    career_interests=career_interests,
                    **batch_kwargs,
                )
        # Extract the user message — that's where the brief block lives.
        messages = captured.get("messages") or []
        for m in messages:
            if m.get("role") == "user":
                return m.get("content", "")
        return ""

    def test_brief_text_lands_verbatim_in_prompt(self):
        brief = "I want to chat with PMs at Stripe, Ramp, and Notion about breaking into fintech."
        prompt = self._captured_prompt(loop_brief_text=brief)
        assert "LOOP GOAL" in prompt, "expected the brief section header in the prompt"
        assert brief in prompt, "expected the student's brief text verbatim in the prompt"

    def test_brief_parsed_chips_land_in_prompt(self):
        prompt = self._captured_prompt(
            loop_brief_text="",
            loop_brief_parsed={
                "companies": ["JPMorgan", "Goldman"],
                "roles": ["Investment Banking Analyst"],
                "industries": ["Finance"],
                "locations": ["New York"],
                "emailPurpose": "summer internship recruiting",
            },
        )
        assert "LOOP GOAL" in prompt
        assert "JPMorgan" in prompt
        assert "Investment Banking Analyst" in prompt
        assert "summer internship recruiting" in prompt

    def test_no_brief_section_when_brief_empty(self):
        """Non-Loop callers (Find page, demo) must not get the brief block."""
        prompt = self._captured_prompt()  # no brief kwargs
        assert "LOOP GOAL" not in prompt, (
            "the brief section should be absent when no brief was supplied — "
            "otherwise standalone Find/demo flows pay for an irrelevant block"
        )

