# NSB sample corpus tools

These commands extract the DOE High School Sample Questions catalog, parse its linked PDFs, and optionally import validated packets into the configured Postgres database.

## Manifest

Save the [official sample page](https://science.osti.gov/wdts/nsb/Regional-Competitions/Resources/HS-Sample-Questions) as HTML, then extract the PDF links:

```sh
node tools/import/nsb-source-manifest.js page.html docs/nsb-source-manifest.json
```

The manifest records source set/year/round and each PDF URL. The Energy information supplement in Set 3 has no round number.

## Build the local JSON corpus

Install Poppler so `pdftotext` is available, then run:

```sh
node tools/import/bulk-import-all-samples.js
```

This reads `docs/nsb-source-manifest.json`, downloads at most three PDFs at a time, and writes `data/nsb/sample-questions.json`. Override paths or concurrency as needed:

```sh
node tools/import/bulk-import-all-samples.js \
  --manifest docs/nsb-source-manifest.json \
  --output data/nsb/sample-questions.json \
  --concurrency 3
```

The builder retries transient download failures, checks the PDF response, deletes temporary PDFs, and writes one entry per source file. Each question keeps its original number, category, answer text and annotations, type, and ordered W/X/Y/Z options. Multiple-choice choices appear as separate `<br>` lines in the formatted question and as newline-separated choices in the sanitized question. The PDF reader uses word coordinates to recover stacked fractions and superscripts/subscripts where the source layout provides them; sanitized fields render numeric powers as Unicode superscripts/subscripts. Exact source-keyed corrections are applied for known extraction failures. Missing answers or malformed choices stay visible in the corpus diagnostics; the builder exits with status 1 when any entry needs review. The Set 3 Energy supplement is catalogued as informational content and does not create a round.

## Import validated packets to Postgres

Set `DATABASE_URL`, `SUPABASE_DB_URL`, or `POSTGRES_URL`, then run:

```sh
node tools/import/import-corpus.js --confirm-import
```

The command builds and validates its import plan before it starts writing, skips the informational supplement, and excludes incomplete or ambiguous question pairs while retaining the complete source corpus unchanged. It requires source years for packets that contain playable pairs and uses the repository's idempotent packet upsert. Use `--corpus path/to/file.json` to import a different generated corpus.
