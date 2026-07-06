# Ship the Sheets backend — 6 steps, ~5 minutes, from a computer

1. Go to **sheets.new** (logged into your Google account). Name the
   spreadsheet **MCC Network**.

2. In the Sheet's menu: **Extensions → Apps Script**. A code editor opens.

3. Delete the starter code in the editor. Paste in everything from
   `Code.gs` (this folder). Hit the 💾 save icon.

4. Top right: **Deploy → New deployment**. Click the gear ⚙, choose
   **Web app**. Set:
   - Description: `network intake`
   - Execute as: **Me**
   - Who has access: **Anyone**
   Click **Deploy**.

5. Google asks you to authorize. Click through: **Authorize access →
   your account → Advanced → Go to (unsafe) → Allow**. ("Unsafe" just
   means Google didn't review it — it's your own script reading your
   own sheet.)

6. Copy the **Web app URL** (ends in `/exec`). Paste that URL into the INTAKE_ENDPOINT line near the top of the scripts in verify.html, interview.html, and fellowship.html (or hand it to your developer).
   Every submission then flows into the Sheet with both emails automated.

Optional, later:
- **Daily digest:** in Apps Script, click the ⏰ clock icon → Add
  Trigger → function `dailyDigest` → Time-driven → Day timer → pick a
  morning hour. You'll get one email a day summarizing new rows.
- **Work the pipeline:** every row lands with Status = NEW. Change it
  to IN REVIEW / VERIFIED / REJECTED as you process — the digest counts
  what's still NEW so nothing rots.
