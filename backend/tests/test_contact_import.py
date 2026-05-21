"""
Tests for contact import CSV parsing, validation, column mapping, and dedup logic.
Tests the pure functions without requiring Firebase/Firestore.
"""
import os
import pytest

# Import the functions under test
from app.routes.contact_import import (
    parse_csv_content,
    parse_row_to_contact,
    map_columns,
    normalize_header,
    _is_valid_contact,
    COLUMN_MAPPINGS,
    MAX_FILE_SIZE_BYTES,
    MAX_IMPORT_ROWS,
    CREDITS_PER_CONTACT,
)
from app.utils.exceptions import ValidationError

TEST_CSV_DIR = os.path.join(os.path.dirname(__file__), 'test_csvs')


def _read_csv(filename):
    """Helper to read and parse a test CSV file."""
    path = os.path.join(TEST_CSV_DIR, filename)
    with open(path, 'r', encoding='utf-8-sig') as f:
        content = f.read()
    return parse_csv_content(content)


# =============================================================================
# CSV PARSING
# =============================================================================

class TestCSVParsing:
    def test_valid_basic_csv(self):
        headers, rows = _read_csv('valid_basic.csv')
        assert len(headers) == 9
        assert headers[0] == 'First Name'
        assert headers[2] == 'Email'
        assert len(rows) == 5

    def test_empty_csv_raises(self):
        with pytest.raises(ValidationError, match="empty"):
            parse_csv_content("")

    def test_headers_only_no_data(self):
        headers, rows = _read_csv('no_data.csv')
        assert len(headers) == 4
        assert len(rows) == 0

    def test_bom_utf8(self):
        headers, rows = _read_csv('bom_utf8.csv')
        # BOM should be stripped - first header should be clean
        assert headers[0] == 'First Name', f"Got: {headers[0]!r}"
        assert len(rows) == 2
        # Unicode characters preserved
        mapping = map_columns(headers)
        contact = parse_row_to_contact(rows[0], mapping, headers)
        assert contact['firstName'] == 'José'
        assert contact['lastName'] == 'García'

    def test_whitespace_in_values(self):
        headers, rows = _read_csv('whitespace.csv')
        mapping = map_columns(headers)
        contact = parse_row_to_contact(rows[0], mapping, headers)
        # Values should be stripped
        assert contact['firstName'] == 'Alice'
        assert contact['lastName'] == 'Smith'
        assert contact['email'] == 'alice@google.com'
        assert contact['company'] == 'Google'


# =============================================================================
# COLUMN MAPPING
# =============================================================================

class TestColumnMapping:
    def test_standard_headers(self):
        headers = ['First Name', 'Last Name', 'Email', 'LinkedIn URL', 'Company', 'Job Title', 'College', 'Location', 'Phone']
        mapping = map_columns(headers)
        assert mapping[0] == 'firstName'
        assert mapping[1] == 'lastName'
        assert mapping[2] == 'email'
        assert mapping[3] == 'linkedinUrl'
        assert mapping[4] == 'company'
        assert mapping[5] == 'jobTitle'
        assert mapping[6] == 'college'
        assert mapping[7] == 'location'
        assert mapping[8] == 'phone'

    def test_alternate_headers(self):
        headers, rows = _read_csv('alternate_headers.csv')
        mapping = map_columns(headers)
        # fname -> firstName
        assert mapping[0] == 'firstName'
        # surname -> lastName
        assert mapping[1] == 'lastName'
        # e-mail -> email
        assert mapping[2] == 'email'
        # linkedin profile -> linkedinUrl
        assert mapping[3] == 'linkedinUrl'
        # organization -> company
        assert mapping[4] == 'company'
        # role -> jobTitle
        assert mapping[5] == 'jobTitle'
        # university -> college
        assert mapping[6] == 'college'
        # city -> city
        assert mapping[7] == 'city'
        # state -> state
        assert mapping[8] == 'state'
        # mobile -> phone
        assert mapping[9] == 'phone'

    def test_city_state_merged_to_location(self):
        headers, rows = _read_csv('alternate_headers.csv')
        mapping = map_columns(headers)
        contact = parse_row_to_contact(rows[0], mapping, headers)
        # city + state should merge into location
        assert contact['location'] == 'Boston, MA'
        assert 'city' not in contact
        assert 'state' not in contact

    def test_unmapped_columns_ignored(self):
        headers = ['First Name', 'Weird Column', 'Email']
        mapping = map_columns(headers)
        assert 0 in mapping  # firstName
        assert 1 not in mapping  # Weird Column not mapped
        assert 2 in mapping  # email

    def test_normalize_header(self):
        assert normalize_header('First Name') == 'first name'
        assert normalize_header('  FIRST_NAME  ') == 'first name'
        assert normalize_header('first-name') == 'first name'
        assert normalize_header('E-Mail') == 'e mail'


# =============================================================================
# CONTACT VALIDATION
# =============================================================================

class TestContactValidation:
    def test_valid_with_name(self):
        assert _is_valid_contact({'firstName': 'Alice', 'lastName': 'Smith'}) is True

    def test_valid_with_email(self):
        assert _is_valid_contact({'email': 'alice@example.com'}) is True

    def test_valid_with_linkedin(self):
        assert _is_valid_contact({'linkedinUrl': 'https://linkedin.com/in/alice'}) is True

    def test_invalid_empty(self):
        assert _is_valid_contact({}) is False

    def test_invalid_first_name_only(self):
        # Need BOTH first and last name
        assert _is_valid_contact({'firstName': 'Alice'}) is False

    def test_invalid_last_name_only(self):
        assert _is_valid_contact({'lastName': 'Smith'}) is False

    def test_invalid_empty_strings(self):
        assert _is_valid_contact({'firstName': '', 'lastName': '', 'email': '', 'linkedinUrl': ''}) is False

    def test_invalid_whitespace_only(self):
        assert _is_valid_contact({'email': '   ', 'linkedinUrl': '  '}) is False

    def test_valid_rows_in_csv(self):
        headers, rows = _read_csv('invalid_rows.csv')
        mapping = map_columns(headers)
        valid_count = 0
        for row in rows:
            contact = parse_row_to_contact(row, mapping, headers)
            if _is_valid_contact(contact):
                valid_count += 1
        # Row 1: Alice Smith alice@example.com - VALID (name + email)
        # Row 2: all empty - INVALID
        # Row 3: no name, no email, company only - INVALID
        # Row 4: Bob, no last name, has email - VALID (email)
        # Row 5: Jones only (last name), no email - INVALID (need both names)
        # Row 6: Charlie Brown, no email - VALID (both names)
        assert valid_count == 3, f"Expected 3 valid rows, got {valid_count}"


# =============================================================================
# DEDUPLICATION LOGIC (case-insensitive)
# =============================================================================

class TestDeduplication:
    """Test the dedup logic extracted from import_contacts."""

    def _simulate_dedup(self, csv_filename):
        """Simulate the import dedup loop from contact_import.py."""
        headers, rows = _read_csv(csv_filename)
        mapping = map_columns(headers)

        existing_emails = set()
        existing_linkedins = set()
        existing_name_company = set()

        created = 0
        skipped_duplicate = 0
        skipped_invalid = 0
        created_contacts = []

        for row in rows:
            contact_data = parse_row_to_contact(row, mapping, headers)
            first_name = contact_data.get('firstName', '').strip()
            last_name = contact_data.get('lastName', '').strip()
            email = contact_data.get('email', '').strip()
            linkedin = contact_data.get('linkedinUrl', '').strip()

            if not _is_valid_contact(contact_data):
                skipped_invalid += 1
                continue

            # Case-insensitive dedup (matches the new implementation)
            is_duplicate = False
            if email and email.lower() in existing_emails:
                is_duplicate = True
            if not is_duplicate and linkedin and linkedin.lower() in existing_linkedins:
                is_duplicate = True
            if not is_duplicate and first_name and last_name and contact_data.get('company'):
                key = (first_name.lower(), last_name.lower(), contact_data['company'].strip().lower())
                if key in existing_name_company:
                    is_duplicate = True

            if is_duplicate:
                skipped_duplicate += 1
                continue

            created += 1
            created_contacts.append(contact_data)

            if email:
                existing_emails.add(email.lower())
            if linkedin:
                existing_linkedins.add(linkedin.lower())
            if first_name and last_name and contact_data.get('company'):
                existing_name_company.add((first_name.lower(), last_name.lower(), contact_data['company'].strip().lower()))

        return created, skipped_duplicate, skipped_invalid, created_contacts

    def test_case_insensitive_email_dedup(self):
        created, dupes, invalid, contacts = self._simulate_dedup('duplicates_case.csv')
        # alice@google.com and ALICE@GOOGLE.COM and alice@google.com should dedup to 1
        alice_contacts = [c for c in contacts if c.get('firstName', '').lower() == 'alice']
        assert len(alice_contacts) == 1, f"Expected 1 Alice, got {len(alice_contacts)}"

    def test_case_insensitive_linkedin_dedup(self):
        created, dupes, invalid, contacts = self._simulate_dedup('duplicates_case.csv')
        # Bob with linkedin.com/in/bobjones and LinkedIn.com/in/BobJones should dedup
        bob_contacts = [c for c in contacts if c.get('firstName', '').lower() == 'bob']
        assert len(bob_contacts) == 1, f"Expected 1 Bob, got {len(bob_contacts)}"

    def test_name_company_dedup(self):
        created, dupes, invalid, contacts = self._simulate_dedup('duplicates_case.csv')
        # Carol Williams at Amazon appears twice (once with email, once with linkedin)
        # First one created (has email), second should dedup by name+company
        carol_contacts = [c for c in contacts if c.get('firstName', '').lower() == 'carol']
        assert len(carol_contacts) == 1, f"Expected 1 Carol, got {len(carol_contacts)}"

    def test_total_dedup_counts(self):
        created, dupes, invalid, contacts = self._simulate_dedup('duplicates_case.csv')
        # 7 rows total:
        # Alice row 1: created
        # Alice row 2: dup (email case)
        # Alice row 3: dup (exact email)
        # Bob row 1: created
        # Bob row 2: dup (linkedin case)
        # Carol row 1: created
        # Carol row 2: dup (name+company)
        assert created == 3, f"Expected 3 created, got {created}"
        assert dupes == 4, f"Expected 4 duplicates, got {dupes}"

    def test_no_duplicates_in_basic(self):
        created, dupes, invalid, contacts = self._simulate_dedup('valid_basic.csv')
        assert created == 5
        assert dupes == 0


# =============================================================================
# LIMITS & CONSTRAINTS
# =============================================================================

class TestLimits:
    def test_credits_per_contact(self):
        assert CREDITS_PER_CONTACT == 15

    def test_max_file_size(self):
        assert MAX_FILE_SIZE_BYTES == 5 * 1024 * 1024  # 5MB

    def test_max_import_rows(self):
        assert MAX_IMPORT_ROWS == 1000

    def test_large_csv_row_count(self):
        """Generate a CSV exceeding MAX_IMPORT_ROWS and verify the constant."""
        # We don't test the endpoint directly, but verify the limit exists
        # and that a CSV with > 1000 rows would be caught
        header = "First Name,Last Name,Email"
        rows = [f"User{i},Last{i},user{i}@example.com" for i in range(1005)]
        content = header + "\n" + "\n".join(rows)
        headers, data_rows = parse_csv_content(content)
        assert len(data_rows) == 1005
        assert len(data_rows) > MAX_IMPORT_ROWS  # Would be rejected by endpoint


# =============================================================================
# ROW PARSING EDGE CASES
# =============================================================================

class TestRowParsing:
    def test_extra_columns_ignored(self):
        headers = ['First Name', 'Extra', 'Email']
        mapping = map_columns(headers)
        row = ['Alice', 'ignored_data', 'alice@example.com']
        contact = parse_row_to_contact(row, mapping, headers)
        assert contact['firstName'] == 'Alice'
        assert contact['email'] == 'alice@example.com'
        assert 'Extra' not in contact

    def test_missing_columns_empty_string(self):
        headers = ['First Name', 'Last Name', 'Email']
        mapping = map_columns(headers)
        row = ['Alice', '', '']
        contact = parse_row_to_contact(row, mapping, headers)
        assert contact['firstName'] == 'Alice'
        assert contact['lastName'] == ''
        assert contact['email'] == ''

    def test_fewer_values_than_headers(self):
        headers = ['First Name', 'Last Name', 'Email', 'Company']
        mapping = map_columns(headers)
        row = ['Alice', 'Smith']  # Only 2 values for 4 headers
        contact = parse_row_to_contact(row, mapping, headers)
        assert contact['firstName'] == 'Alice'
        assert contact['lastName'] == 'Smith'
        # email and company should NOT be in contact (row too short)
        assert 'email' not in contact
        assert 'company' not in contact

    def test_none_values_handled(self):
        headers = ['First Name', 'Email']
        mapping = map_columns(headers)
        row = [None, 'alice@example.com']
        contact = parse_row_to_contact(row, mapping, headers)
        assert contact['firstName'] == ''
        assert contact['email'] == 'alice@example.com'
