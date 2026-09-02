# Security

x-utils runs entirely inside the user's own browser tab on x.com. It never handles passwords, tokens or cookies, opens no connections of its own beyond the requests the X web client already makes, and writes only to the user's Downloads folder. The threat model is therefore small, but not empty:

- The report renders data written by other X users (names, bios, post text). Every value is HTML-escaped and only plain `http(s)` URLs become links. A bypass here would be a cross-site scripting issue in a local file.
- CSV exports neutralise cells that spreadsheets would treat as formulas.
- The scripts are pasted into the console by hand; anything that made them do more than read would be a serious problem.

If you find a vulnerability, please open a private security advisory on GitHub ("Security" tab, "Report a vulnerability") or contact [@devploit](https://x.com/devploit) directly. Please do not open a public issue for security problems. Reports are answered within a few days and fixed releases are noted in the changelog.
