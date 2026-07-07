#!/usr/bin/env python3
"""Rebuild data/evidence-manifest.json.

Fingerprints every file under assets/dockets with SHA-256 so the
provenance page can prove any downloaded copy is unaltered. Run this
after adding or replacing anything in the archive, then commit both
the archive change and the regenerated manifest in the same commit.

    python3 scripts/evidence-manifest.py
"""
import hashlib
import json
import os
import time

ROOT = "assets/dockets"
OUT = "data/evidence-manifest.json"


def main():
    entries = []
    for dirpath, _, files in os.walk(ROOT):
        for fn in sorted(files):
            if fn.startswith("."):
                continue
            p = os.path.join(dirpath, fn).replace("\\", "/")
            h = hashlib.sha256()
            with open(p, "rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    h.update(chunk)
            entries.append({"path": p, "sha256": h.hexdigest(), "bytes": os.path.getsize(p)})
    entries.sort(key=lambda e: e["path"])
    manifest = {
        "title": "McCluster evidence manifest",
        "note": "SHA-256 fingerprints of every file in the public archive. Recompute the hash of any downloaded file; if it matches this manifest, the file is bit-for-bit identical to what was published.",
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "algorithm": "SHA-256",
        "count": len(entries),
        "files": entries,
    }
    with open(OUT, "w") as f:
        json.dump(manifest, f, indent=1)
    print(f"{OUT}: {len(entries)} files")


if __name__ == "__main__":
    main()
