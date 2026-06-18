# NINA filename pattern for HFR/SQM

This version supports NINA filenames ending with positional HFR/SQM fields, for example:

```text
$$TARGETNAME$$_$$IMAGETYPE$$_$$DATETIME$$_$$FILTER$$_$$SENSORTEMP$$_$$GAIN$$_$$EXPOSURETIME$$_$$FRAMENR$$_$$HFR$$_$$SQM$$
```

Example:

```text
M33_LIGHT_2016-01-01_12-00-00_L_-15_1600_10.21_0001_3.25_21.83.fits
```

The parser interprets the last fields as:

```text
... exposure_time, frame_number, HFR, SQM
```

It only accepts the parse if the frame-number field is an integer, so older filenames such as:

```text
2026-06-18_02-40-49_B_-10.00_126_180.00_0041.fits
```

are not misread as HFR/SQM.

Filter aliases are normalized before insertion:

- `O` -> `OIII`
- `S` -> `SII`
- `V` -> `G`
- `H`, `Ha`, `H-alpha` -> `H-alpha`
- unknown/empty filter -> `L` if `NINA_FALLBACK_FILTER=L`

SQM is stored only if NINA actually writes a numeric value. If no weather/SQM source is configured in NINA, the token may remain empty or unresolved and will be ignored.
