"""Copies src/ into the two shipped builds: dist/app (desktop app) and dist/extension (Chrome/Edge)."""
import shutil, pathlib
root = pathlib.Path(__file__).parent
dist = root / "dist"
for name in ("app", "extension"):
    out = dist / name
    if out.exists(): shutil.rmtree(out)
    shutil.copytree(root / "src", out)
for f in (root / "extension-src").iterdir():
    shutil.copy2(f, dist / "extension" / f.name)
# the side panel loads the hosted app from the address in site.txt (bundled copy when offline)
site = (root / "site.txt").read_text().strip() if (root / "site.txt").exists() else ""
panel = dist / "extension" / "panel.js"
panel.write_text(panel.read_text(encoding="utf-8").replace("__APP_URL__", site), encoding="utf-8")
# the web-app manifest and offline worker only matter when src/ is hosted over https
for name in ("app", "extension"):
    out = dist / name
    (out / "sw.js").unlink(); (out / "manifest.webmanifest").unlink()
    html = (out / "index.html").read_text(encoding="utf-8")
    (out / "index.html").write_text(html.replace('<link rel="manifest" href="manifest.webmanifest">\n', ""), encoding="utf-8")
shutil.make_archive(str(dist / "next-step-extension"), "zip", dist / "extension")
# everything someone else needs, in one zip to send
import zipfile
with zipfile.ZipFile(dist / "NextStep-share.zip", "w", zipfile.ZIP_DEFLATED) as z:
    for name in ("app", "extension"):
        for f in (dist / name).rglob("*"):
            if f.is_file(): z.write(f, "NextStep/" + f.relative_to(root).as_posix())
    for f in ("install-app.ps1", "README.md"):
        z.write(root / f, "NextStep/" + f)
print("built", *[p.relative_to(root) for p in dist.iterdir()])
