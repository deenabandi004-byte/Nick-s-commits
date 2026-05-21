# Import Spreadsheet Feature - Complete Report

This document describes how the **Import Spreadsheet** (contact import from CSV/Excel) feature works end-to-end in Offerloop.

---

## 1. Overview

| Aspect | Details |
|--------|---------|
| **Purpose** | Bulk import contacts from a CSV or Excel file into the user’s contact library. |
| **Cost** | **15 credits per contact** imported. No charge for skipped rows (duplicates, invalid, or no credits). |
| **Access** | Intended for Pro/Elite; tier check is currently **disabled** (commented out) in code. |
| **Location in app** | Contact Search page → **Import** tab (`/contact-search`, tab value `import`). |

---

## 2. Where It Lives

### Frontend

| Item | Path |
|------|------|
| **UI component** | `connect-grow-hire/src/components/ContactImport.tsx` |
| **Usage** | Rendered inside `ContactSearchPage.tsx` as `<ContactImport />` under `<TabsContent value="import">`. |
| **API base** | `API_BASE` in component: `localhost:5001` in dev, `https://www.offerloop.ai` in production. |

### Backend

| Item | Path |
|------|------|
| **Blueprint** | `backend/app/routes/contact_import.py` |
| **URL prefix** | `/api/contacts` |
| **Registration** | Blueprint imported and registered in `backend/wsgi.py`. |

### API Endpoints (all under `/api/contacts`)

| Method | Path | Purpose |
|--------|------|---------|
| **POST** | `/import/preview` | Parse file, suggest column mapping, return stats and sample. **No credits deducted.** |
| **POST** | `/import` | Parse file, apply mapping, create contacts, deduct credits. |
| **GET** | `/import/template` | Download CSV template (headers + one sample row). |

All three require **Firebase auth**: `Authorization: Bearer <idToken>`.

---

## 3. User Flow (Three Steps)

### Step 1 - Upload

1. User is on Contact Search → Import tab.
2. User drops or selects a file (`.csv`, `.xlsx`, or `.xls`). Extension is validated in the UI.
3. Optional: user can click **Download template** to get `contact_import_template.csv` via `GET /api/contacts/import/template`.
4. Optional: user can expand **Import guidelines** (credits, duplicates, requirements, formats).
5. When a file is selected, a **Preview Import** button appears. Clicking it calls the preview API and moves to Step 2.

### Step 2 - Preview & Column Mapping

1. Frontend sends the **same file** to `POST /api/contacts/import/preview` (multipart, key `file`).
2. Backend parses the file (see Section 4), auto-maps columns (see Section 5), and returns:
   - `headers`, `column_mapping` (index → field name), `unmapped_headers`
   - `total_rows`, `valid_rows`, `sample_contacts` (first 5)
   - `credits`: `available`, `cost_per_contact` (15), `total_cost`, `can_afford`, `max_affordable`
3. User sees:
   - Stats (total rows, valid contacts, credits available).
   - Credit cost message (can afford full import vs. “import up to N”).
   - **Column mapping** table: each spreadsheet column can be mapped to a contact field or “(Skip this column)”.
   - **Sample preview** table (Name, Email, Company, Title) for the first few contacts.
4. User can change mappings via dropdowns. Mapping is keyed by column index (string keys in JSON, e.g. `{"0":"firstName","1":"lastName"}`).
5. User clicks **Import N Contacts** (or “Import N” when capped by credits). Frontend calls `POST /api/contacts/import` with the file and `column_mapping` in the form body.

### Step 3 - Result

1. Backend processes each row (see Section 6), creates non-duplicate contacts, deducts 15 credits per created contact.
2. Response includes `created`, `skipped` (duplicate, invalid, no_credits), `credits.spent` and `credits.remaining`, and the list of created contacts.
3. Frontend shows a success screen: imported count, skipped breakdown, credits spent/remaining, and actions **Import More** and **View in Tracker**.
4. `updateCredits(remaining)` is called so the app’s credit display stays in sync.

---

## 4. File Parsing

### Accepted formats

- **.csv** - UTF-8 decoded with `utf-8-sig` (BOM handled).
- **.xlsx / .xls** - First (active) sheet only; requires `openpyxl`. All cell values are stringified.

Extension is checked on both frontend and backend; other extensions are rejected.

### CSV

- Python `csv.reader` on the decoded string.
- First row = headers, rest = data rows.
- Empty file → `ValidationError("CSV file is empty", field="file")`.

### Excel

- `openpyxl.load_workbook(..., read_only=True)`, active sheet, `iter_rows(values_only=True)`.
- First row → headers (each coerced to `str`), remaining rows → data rows (cells stringified).
- Empty sheet → `ValidationError("Excel file is empty", field="file")`.
- If `openpyxl` is missing → `OfferloopException("Excel support not available...", error_code="EXCEL_NOT_SUPPORTED")`.

---

## 5. Column Mapping

### Backend auto-mapping

- **Function:** `map_columns(headers)` in `contact_import.py`.
- **Logic:** Headers are normalized (lowercase, strip, replace `-` and `_` with space). Each known schema field is matched against a list of allowed header variations; the **first** matching column index gets that field. Result is `{column_index: schema_field_name}`.

### Schema fields and header variations (COLUMN_MAPPINGS)

| Schema field   | Example header variations |
|----------------|----------------------------|
| firstName      | firstname, first_name, first name, fname, given name |
| lastName       | lastname, last_name, last name, lname, surname, family name |
| email          | email, email address, e-mail, mail, work email, personal email |
| linkedinUrl    | linkedin, linkedinurl, linkedin_url, linkedin url, linkedin profile, profile url |
| company        | company, company name, organization, employer, firm, workplace |
| jobTitle       | jobtitle, job_title, job title, title, role, position |
| college        | college, university, school, education, alma mater |
| location       | location, city, address, city, state, city/state |
| city           | city |
| state          | state, province, region |
| phone          | phone, phone number, mobile, cell, telephone |

### Row → contact (parse_row_to_contact)

- For each column index in the mapping, the cell value (stripped) is assigned to the corresponding schema field.
- **Special case:** If `city` and/or `state` are mapped, they are merged into a single `location` value (`city, state`) and removed from the contact dict so the stored contact has `location` only (no separate city/state).

### Custom mapping on import

- Preview returns `column_mapping` with **string** keys (e.g. `"0"`, `"1"`). Frontend stores it and can change mappings; keys stay as string column indices.
- On **import**, frontend sends `column_mapping` as JSON in the form: `formData.append('column_mapping', JSON.stringify(columnMapping))`.
- Backend parses it and converts keys back to **int** for use in `parse_row_to_contact`. If no custom mapping is sent, backend uses `map_columns(headers)` again.

---

## 6. Validation and Duplicate Detection

### Valid row (preview and import)

A row is considered **valid** if it has at least one of:

- **(First name AND last name)** - both non-empty after strip.
- **Email** - non-empty after strip.
- **LinkedIn URL** - non-empty after strip.

Rows that don’t meet this are **invalid** and skipped (counted in `skipped_invalid` on import; not created, no credits).

### Duplicate detection (import only)

Before creating a contact, the backend checks:

1. **By email** - If the row has email, query `users/{userId}/contacts` where `email == row email`; if any doc exists → duplicate.
2. **By LinkedIn URL** - If not already duplicate and row has LinkedIn URL, query where `linkedinUrl == row linkedinUrl`; if any doc exists → duplicate.
3. **By first name + last name + company** - If not already duplicate and row has first name, last name, and company, query where `firstName`, `lastName`, and `company` all match; if any doc exists → duplicate.

Duplicates are skipped and counted in `skipped_duplicate`; no credits are deducted.

### Credits (import only)

- Before processing each row, backend checks `credits < CREDITS_PER_CONTACT` (15). If so, the row is skipped and counted in `skipped_no_credits`; no contact is created and no credits are deducted for that row.
- For each **created** contact, 15 credits are subtracted from an in-memory `credits` value. After the loop, if `created > 0`, the user document is updated: `user_ref.update({ 'credits': credits, 'lastCreditUsage': datetime.now().isoformat() })`.

---

## 7. Stored Contact Schema (Firestore)

Created contacts are written to:

**Collection:** `users/{userId}/contacts`  
**Document:** Auto-generated ID via `contacts_ref.add(contact)`.

**Fields written:**

| Field | Source |
|-------|--------|
| firstName | Mapped column or "" |
| lastName | Mapped column or "" |
| email | Mapped column or "" |
| linkedinUrl | Mapped column or "" |
| company | Mapped column or "" |
| jobTitle | Mapped column or "" |
| college | Mapped column or "" |
| location | Mapped column or merged from city+state |
| phone | Mapped column or "" |
| firstContactDate | Today (MM/DD/YYYY) |
| lastContactDate | Today (MM/DD/YYYY) |
| status | `"Not Contacted"` |
| userId | Requesting user’s Firebase UID |
| createdAt | Today (MM/DD/YYYY) |
| importedAt | ISO timestamp |
| importSource | `"spreadsheet"` |

The frontend receives the created contacts (with `id` set to the new document ID) in the import response.

---

## 8. Template Download

- **Route:** `GET /api/contacts/import/template`
- **Auth:** Required (Bearer token).
- **Response:** CSV with:
  - Header row: First Name, Last Name, Email, LinkedIn URL, Company, Job Title, College, Location, Phone
  - One data row: John, Doe, john.doe@example.com, https://linkedin.com/in/johndoe, Acme Corp, Software Engineer, MIT, San Francisco, CA, 555-123-4567
- **Content-Disposition:** `attachment; filename=contact_import_template.csv`

---

## 9. Error Handling

### Backend

- **ValidationError** (e.g. no file, wrong extension, empty file): 400, `{ "error": message, "field": fieldName }`.
- **OfferloopException** (e.g. DB not initialized, user not found, Excel not supported): 500, `{ "error": message, "error_code": code }`.
- **Tier (when re-enabled):** 403, `{ "error": "...", "upgrade_required": true }`.
- **Uncaught exception:** 500, `{ "error": "Failed to preview import: ..." }` or `"Failed to import contacts: ..."`; traceback printed server-side.

### Frontend

- On non-OK response, if `data.upgrade_required` is true, an **Upgrade** dialog is shown (Pro/Elite); otherwise the `error` message is shown in the UI.
- After import success, `updateCredits(data.credits.remaining)` is called so global credit state is updated.
- Optional props: `onImportComplete` and `onSwitchTab`. Currently `ContactSearchPage` renders `<ContactImport />` with no props, so “Search for people” / “Import from LinkedIn” do nothing unless the parent passes `onSwitchTab`.

---

## 10. Constants and Config

| Constant / config | Value / location |
|-------------------|------------------|
| Credits per contact | `CREDITS_PER_CONTACT = 15` in `contact_import.py` |
| Blueprint prefix | `url_prefix='/api/contacts'` |
| CSV encoding | `utf-8-sig` |
| Date format | `%m/%d/%Y` for `firstContactDate`, `lastContactDate`, `createdAt` |
| Frontend API base | `ContactImport.tsx`: localhost:5001 vs https://www.offerloop.ai by hostname |

---

## 11. Summary Diagram

```
User selects file (.csv/.xlsx/.xls)
         │
         ▼
┌─────────────────────────────────────┐
│  POST /api/contacts/import/preview  │  ← No credits deducted
│  (file only)                        │
└─────────────────────────────────────┘
         │
         ▼
Backend: parse file → map_columns(headers) → count valid rows → credit math
         │
         ▼
Response: headers, column_mapping, total_rows, valid_rows, sample_contacts, credits
         │
         ▼
User adjusts column mapping (optional), clicks Import
         │
         ▼
┌─────────────────────────────────────┐
│  POST /api/contacts/import          │
│  (file + column_mapping JSON)        │
└─────────────────────────────────────┘
         │
         ▼
Backend: parse file → for each row:
           parse_row_to_contact → valid? → credits? → duplicate? → create contact, deduct 15
         │
         ▼
Update user.credits in Firestore; return created, skipped, credits, contacts
         │
         ▼
Frontend: show result; updateCredits(remaining); optional onImportComplete()
```

---

## 12. Optional: Enabling Tier Restriction

To restrict import to Pro/Elite only:

1. In `contact_import.py`, in both `preview_import` and `import_contacts`, uncomment the block that checks `tier == 'free'` and returns 403 with `upgrade_required: True`.
2. Ensure the frontend already handles `upgrade_required` (it does: Upgrade dialog and navigate to pricing).

---

*Report generated for the Offerloop codebase. Backend: `backend/app/routes/contact_import.py`; Frontend: `connect-grow-hire/src/components/ContactImport.tsx`.*
