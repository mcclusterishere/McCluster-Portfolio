/**
 * McCluster Network — Google Sheets backend.
 * One script receives every intake on the site (fellowship terminal,
 * space interview, verification form), files each into its own tab,
 * and sends the two automated emails.
 *
 * Ships in 5 minutes: see SETUP.md next to this file.
 */

var OWNER_EMAIL = "matthew@mccluster.org";
var SITE = "https://mcclusterishere.github.io/McCluster-Portfolio";

/** Every site submission lands here. */
function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var form = String(data._form || "unsorted");
  delete data._form;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(form) || ss.insertSheet(form);

  // keep headers in sync with whatever fields arrive
  var headers = sheet.getLastRow() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
  if (!headers.length || headers[0] !== "Received") {
    headers = ["Received", "Status"];
    sheet.getRange(1, 1, 1, 2).setValues([headers]);
  }
  Object.keys(data).forEach(function (k) {
    if (headers.indexOf(k) === -1) {
      headers.push(k);
      sheet.getRange(1, headers.length).setValue(k);
    }
  });

  var row = headers.map(function (h) {
    if (h === "Received") return new Date();
    if (h === "Status") return "NEW";
    return data[h] || "";
  });
  sheet.appendRow(row);

  // email 1: the owner gets the full record
  var body = Object.keys(data).map(function (k) { return k + ": " + data[k]; }).join("\n");
  MailApp.sendEmail(OWNER_EMAIL, "[" + form + "] " + (data.name || data["Business name"] || data.bizname || "new submission"), body);

  // email 2: the applicant gets the automated welcome + education link
  var applicant = data.email || data.Email;
  if (applicant) {
    var welcome =
      form === "fellowship"
        ? "Welcome to the uprise. Your fellowship record is in.\n\n" +
          "While the party processes it, learn the system we verify everything against:\n" +
          SITE + "/identifiers.html\n\nEquity. Then we rise."
        : "Your application to the McCluster Service Network is in.\n\n" +
          "Every badge is backed by real registry identifiers — here is what each one means\n" +
          "and why we check them:\n" + SITE + "/identifiers.html\n\n" +
          "We confirm each identifier against its registry and follow up within a few days.";
    MailApp.sendEmail(applicant, "Received — McCluster Network", welcome);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Self-monitoring digest. Add a daily time trigger pointed at this
 * function (clock icon -> Add Trigger -> dailyDigest -> Day timer).
 */
function dailyDigest() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = [];
  ss.getSheets().forEach(function (sheet) {
    var rows = sheet.getDataRange().getValues();
    if (rows.length < 2 || rows[0][0] !== "Received") return;
    var day = 24 * 60 * 60 * 1000;
    var fresh = 0, open = 0;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] && new Date() - new Date(rows[i][0]) < day) fresh++;
      if (rows[i][1] === "NEW") open++;
    }
    lines.push(sheet.getName() + ": " + fresh + " new in 24h, " + open + " still marked NEW");
  });
  if (lines.length) MailApp.sendEmail(OWNER_EMAIL, "Network digest — " + new Date().toDateString(), lines.join("\n"));
}
