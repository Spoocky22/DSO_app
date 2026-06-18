# HFR median by target/filter + ntfy summary

This version keeps the existing NINA raw-acquisition sync and adds quality statistics at the level that matters for astrophotography:

- HFR median ± sigma by **target/panel and filter** in the Stats tab.
- FWHM and SQM are shown the same way when available.
- The end-of-night ntfy summary now includes HFR median ± sigma by target/filter when HFR values were parsed from the NINA filename or sent by NINA.

## NINA filename pattern

Recommended NINA file pattern:

```text
$$TARGETNAME$$_$$IMAGETYPE$$_$$DATETIME$$_$$FILTER$$_$$SENSORTEMP$$_$$GAIN$$_$$EXPOSURETIME$$_$$FRAMENR$$_$$HFR$$_$$SQM$$
```

The agent parses the final fields as:

```text
..._EXPOSURETIME_FRAMENR_HFR_SQM
```

Example:

```text
Sh2 129_LIGHT_2026-06-18_23-12-05_O_-10.0_126_600.00_0042_3.25_21.83.fits
```

will be imported as:

```text
filter = OIII
hfr = 3.25
sqm = 21.83
```

## Deployment

No Neon migration is required if the columns already exist:

```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS hfr DOUBLE PRECISION;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS fwhm DOUBLE PRECISION;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sqm DOUBLE PRECISION;
```

Deploy web app:

```powershell
git add .
git commit -m "Add HFR median stats by target and filter"
git push
```

On the remote NINA PC, replace:

```text
C:\DSO\nina_agent\nina_sync_agent.py
```

then restart the scheduled task or the running agent.
