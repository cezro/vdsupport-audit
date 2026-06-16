import json
import re
import ssl
import urllib.parse
import urllib.request
from collections import deque

ctx = ssl.create_default_context()
BASE = "https://fullarchsalesexperts.com"
visited = set()
queue = deque([BASE + "/"])
found = {}

# Seed known paths from audit logs + common GHL patterns
SEEDS = [
    "/home",
    "/ncla-squeeze-page-1",
    "/ncla-squeeze-page-484776",
    "/ncla-result-page",
    "/ncla-quiz-funnel",
    "/service-page",
    "/fase-service-page",
    "/full-arch-growth-system",
    "/terms",
    "/terms-and-conditions",
    "/privacy",
    "/privacy-policy",
    "/login",
    "/masterclass",
    "/discovery-call",
    "/book-a-call",
    "/thank-you",
    "/thankyou",
]
for s in SEEDS:
    queue.append(BASE + s)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (FASE-audit-bot)"})
    try:
        with urllib.request.urlopen(req, timeout=25, context=ctx) as r:
            return r.geturl(), r.status, r.read().decode("utf-8", errors="replace")
    except Exception as e:
        code = getattr(e, "code", None)
        return url, code or str(e), ""


def normalize(url):
    p = urllib.parse.urlparse(url)
    host = p.netloc.lower().replace("www.", "")
    if host and host != "fullarchsalesexperts.com":
        return None
    path = p.path.rstrip("/") or "/"
    return urllib.parse.urlunparse(("https", "fullarchsalesexperts.com", path, "", p.query, ""))


while queue and len(visited) < 250:
    url = queue.popleft()
    norm = normalize(url)
    if not norm or norm in visited:
        continue
    visited.add(norm)
    final, status, html = fetch(norm)
    final_norm = normalize(final) or norm
    title_m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    title = re.sub(r"\s+", " ", title_m.group(1)).strip() if title_m else ""
    h1_m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.I | re.S)
    h1 = re.sub(r"<[^>]+>", "", h1_m.group(1)).strip() if h1_m else ""
    h1 = re.sub(r"\s+", " ", h1)
    meta_m = re.search(
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)',
        html,
        re.I,
    )
    desc = meta_m.group(1).strip() if meta_m else ""
    found[final_norm] = {
        "status": status,
        "title": title,
        "h1": h1[:200],
        "description": desc[:300],
        "size": len(html),
    }
    if not html:
        continue
    links = set(re.findall(r'href=["\']([^"\'#]+)', html, re.I))
    for link in links:
        if link.startswith(("mailto:", "tel:", "javascript:", "data:")):
            continue
        absu = urllib.parse.urljoin(final_norm, link)
        n = normalize(absu)
        if n and n not in visited:
            queue.append(n)

out = {"count": len(found), "pages": dict(sorted(found.items(), key=lambda x: x[0]))}
print(json.dumps(out, indent=2))
