# Local database handoff

The local database and mobile import archive use the current application schema. The live site and its deployment settings were not changed.

## Local artifacts

- `data/logbook.sqlite3`: canonical local SQLite database.
- `data/fishing-logbook-v2-mobile-import.zip`: portable archive with the local logbook and available uploads. Importing it replaces mobile data; it does not merge mobile-only records.
- `data/uploads/`: media files used by the desktop application.

The database snapshot contains 27 trips, 88 catches, and 11 lost fish. The archive contains 537 media files and all 146 referenced media files.

## Later site update

The local snapshot may differ from the live site. Before updating the site, stop writes and take a fresh backup of the live database and uploads. Compare records and settings; do not replace newer live data with this local snapshot. With the service stopped, install the database and matching uploads together, then verify health, record counts, representative trips, settings, and referenced media before reopening writes.

Do not use the mobile ZIP to update the live site: it replaces the whole logbook and represents only this local snapshot.
