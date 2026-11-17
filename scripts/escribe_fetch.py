"""Bounded public eSCRIBE document fetch with the browser TLS client used by Lompoc."""
import json
import sys
from urllib.parse import urlparse

from curl_cffi import requests

url = sys.argv[1]
parsed = urlparse(url)
if (parsed.scheme != "https" or not (parsed.hostname or "").endswith(".escribemeetings.com")
        or parsed.path.lower() != "/filestream.ashx"):
    raise ValueError("Only official eSCRIBE HTTPS document URLs are supported")

with requests.Session(impersonate="chrome") as session:
    response = session.get(url, timeout=45, stream=True, allow_redirects=False)
    metadata = {"status": response.status_code, "headers": {
        key: value for key, value in response.headers.items()
        if key.lower() in {"content-type", "location"}
    }}
    sys.stdout.buffer.write(json.dumps(metadata).encode() + b"\n")
    total = 0
    for chunk in response.iter_content(chunk_size=65536):
        total += len(chunk)
        if total > 25 * 1024 * 1024:
            raise ValueError("eSCRIBE document exceeds the 25 MiB limit")
        sys.stdout.buffer.write(chunk)
