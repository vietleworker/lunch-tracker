#!/usr/bin/env python3
"""Fetch latest deployed HTML → push to GitHub repo"""
import urllib.request, subprocess, os, sys

REPO = "https://github.com/vietleworker/lunch-tracker.git"
APP = "https://lunche-81567.web.app"

# Check for token
if len(sys.argv) < 2:
    print("Usage: python3 push_to_github.py <GITHUB_TOKEN>")
    print("Get token at: github.com/settings/tokens")
    sys.exit(1)

TOKEN = sys.argv[1]
REPO_AUTH = "https://{}@github.com/vietleworker/lunch-tracker.git".format(TOKEN)

WORK = os.path.expanduser("~/lunch-tracker-push")

print("1/4 Fetching deployed app...")
req = urllib.request.Request(APP, headers={"User-Agent":"Mozilla/5.0 (Macintosh) Chrome/124.0"})
with urllib.request.urlopen(req, timeout=15) as r:
    html = r.read().decode("utf-8")
print("    {} chars".format(len(html)))

print("2/4 Cloning repo...")
if os.path.exists(WORK):
    subprocess.run(["rm", "-rf", WORK])
subprocess.run(["git", "clone", REPO, WORK], check=True)

print("3/4 Updating index.html...")
with open(os.path.join(WORK, "index.html"), "w") as f:
    f.write(html)
print("    Saved {} KB".format(len(html)//1024))

print("4/4 Committing & pushing...")
os.chdir(WORK)
subprocess.run(["git", "config", "user.email", "viet@enclave.vn"])
subprocess.run(["git", "config", "user.name", "Victor Le"])
subprocess.run(["git", "add", "index.html"])
subprocess.run(["git", "commit", "-m", "Update: v4 patches - billNo format, Copy/Scan QR, payment billId tagging, tooltips"], check=True)
result = subprocess.run(["git", "push", REPO_AUTH, "main"], capture_output=True, text=True)
if result.returncode == 0:
    print("\n✅ Pushed to https://github.com/vietleworker/lunch-tracker")
else:
    print("\n❌ Push failed: {}".format(result.stderr))
