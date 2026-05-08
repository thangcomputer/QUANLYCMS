# Load tests (k6)

The k6 binary is **not** committed (54 MB, exceeds GitHub recommended size).

## Install k6 locally

Pick one:

- **Chocolatey** (Windows): `choco install k6`
- **Scoop** (Windows): `scoop install k6`
- **Direct download**: https://github.com/grafana/k6/releases — extract `k6.exe` into `tests/load-test/k6-bin/k6-v0.50.0-windows-amd64/`
- **macOS / Linux**: see https://k6.io/docs/get-started/installation/

After install, run the included scripts:

```bash
node tests/load-test/run_k6.js
# or directly
k6 run tests/load-test/k6_api_load.js
```