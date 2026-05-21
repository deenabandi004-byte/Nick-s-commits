# Resume Workshop – LPL JD Testing Checklist

After running Tailor with the LPL job description and clicking **Apply**, verify:

## 1. Accept all suggestions and click Apply

- Run Tailor with the LPL Financial (or target) JD.
- Accept all suggestions (Summary, Experience, Skills, etc.).
- Click **Apply** - resume should update and switch to Editor.

## 2. Offerloop role – all 5 original bullets preserved

- In Editor → Experience, open the **Offerloop** role.
- **Expected:** There are still **5 bullets**.
- Only bullets that had a suggestion should show the **suggested** text; others should be unchanged from the original.

## 3. ITS role – all 3 original bullets preserved

- In Editor → Experience, open the **ITS** (or Tutor) role.
- **Expected:** There are still **3 bullets**.
- Only modified bullets should differ from the original; the rest unchanged.

## 4. Skills – Python appears only once

- In Editor → Skills, check every category (e.g. Programming Languages, Core Skills, Tools & Frameworks).
- **Expected:** **Python** appears in **one** category only (no duplicate across categories).

## 5. Tutor – no fabricated "over 100 students"

- In the Tutor/ITS experience bullet(s), check the text.
- **Expected:** The bullet does **not** say **"over 100 students"** (or similar) unless the **original** bullet already contained that phrase.
- If the original was e.g. "Tutored students in math and science", the suggested version must not add "over 100 students".

---

**Backend validation:** `backend/tests/test_resume_workshop.py` includes a helper that flags when a suggested bullet introduces phrases like "over 100 students" when the current bullet did not have them. The API response can be validated with this helper to catch regressions.
