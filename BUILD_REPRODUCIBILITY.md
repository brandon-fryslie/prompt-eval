# Build Reproducibility

This project publishes SHA-256 hashes of every file in the deployed bundle so
that anyone can verify the hosted version matches the public source code.

## Dependency Pinning

All dependencies are pinned via `package-lock.json`. The CI pipeline and the
verification script both use `npm ci`, which installs the exact versions recorded
in the lock file. This eliminates version drift between local and CI builds.

**Do not delete or ignore `package-lock.json`.** It is the single source of
truth for dependency versions.

## How Builds Are Hashed

The CI workflow (`.github/workflows/deploy.yml`) generates a
`BUILD_HASHES.sha256` file after every build. This file contains SHA-256 hashes
of every file in `dist/` and is included in the uploaded build artifact.

## Verifying a Build

### Quick steps

1. Clone the repository at the same commit as the release you want to verify.
2. Run the verification script:

   ```bash
   ./scripts/verify-build.sh
   ```

3. If you have a `BUILD_HASHES.sha256` file (downloaded from the CI artifact),
   pass it as an argument:

   ```bash
   ./scripts/verify-build.sh path/to/BUILD_HASHES.sha256
   ```

   The script will report whether your local build matches.

### What the script does

1. Runs `npm ci` to install exact pinned dependencies.
2. Runs `npm run build` to produce the production bundle.
3. Generates SHA-256 hashes of all files in `dist/`.
4. Compares against a reference hash file if one is provided, or prints the
   hashes for manual comparison.

### Prerequisites

- Node.js (version 20+) and npm
- `sha256sum` (Linux) or `shasum` (macOS, ships by default)

## Where to Find Hashes

Build hashes are available in the CI build artifact for each workflow run. Go to
the Actions tab of the repository, select a workflow run, and download the
`site--master` (or relevant preview) artifact. The `BUILD_HASHES.sha256` file is
inside.
