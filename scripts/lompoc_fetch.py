"""Fetch public Lompoc council pages with a browser TLS fingerprint.

The city's Akamai edge returns HTTP 403 to ordinary server HTTP clients, while
the same public pages and PDFs load in a browser. Keep this helper limited to
the city's official host and reject responses that are not the expected type.
"""

import argparse
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from curl_cffi import requests


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=("html", "pdf"))
    parser.add_argument("url")
    parser.add_argument("output", nargs="?")
    args = parser.parse_args()

    parsed = urlparse(args.url)
    if parsed.scheme != "https" or parsed.hostname not in {
        "www.cityoflompoc.com", "cityoflompoc.com"
    }:
        raise ValueError("Lompoc fetch accepts only official HTTPS URLs")
    if args.kind == "pdf" and not args.output:
        raise ValueError("PDF output path is required")

    response = requests.get(args.url, impersonate="chrome", timeout=45)
    response.raise_for_status()
    if args.kind == "html":
        if "text/html" not in response.headers.get("content-type", "").lower():
            raise ValueError("Lompoc listing was not HTML")
        sys.stdout.buffer.write(response.content)
        return

    if len(response.content) > 25 * 1024 * 1024 or not response.content.startswith(b"%PDF-"):
        raise ValueError("Lompoc document was not a usable PDF")
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".tmp")
    temporary.write_bytes(response.content)
    os.replace(temporary, target)
    print(len(response.content))


if __name__ == "__main__":
    main()
