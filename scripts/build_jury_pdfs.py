"""Build the jury PDFs (AI card, Lean Canvas, competitors) from docs/competition/*.md.

Needs the `markdown` package and Google Chrome or Microsoft Edge (headless print to PDF).
Usage: python scripts/build_jury_pdfs.py  ->  docs/competition/pdf/*.pdf
"""
from __future__ import annotations

import html
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs" / "competition"
OUT = DOCS / "pdf"
FONTS = ROOT / "frontend" / "node_modules" / "@fontsource-variable" / "geologica" / "files"
BROWSERS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "google-chrome", "chromium", "msedge",
]

CSS = """
@font-face { font-family: Geologica; font-weight: 100 900;
  src: url('{fonts}/geologica-cyrillic-wght-normal.woff2') format('woff2'); unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116; }
@font-face { font-family: Geologica; font-weight: 100 900;
  src: url('{fonts}/geologica-cyrillic-ext-wght-normal.woff2') format('woff2'); unicode-range: U+0460-052F, U+1C80-1C88, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F; }
@font-face { font-family: Geologica; font-weight: 100 900;
  src: url('{fonts}/geologica-latin-wght-normal.woff2') format('woff2'); unicode-range: U+0000-00FF, U+2000-206F, U+20B8, U+2212; }
@page { size: {size}; margin: {margin}; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: Arial, "Segoe UI", sans-serif; color: #202622; font-size: {font}; line-height: 1.38; margin: 0; }
h1, h2, h3, .cell h3, .brand { font-family: Geologica, Arial, sans-serif; color: #173e31; }
h1 { font-size: 20pt; font-weight: 700; letter-spacing: -.01em; margin: 0 0 2pt; }
h1 + p { color: #237a57; margin: 0 0 8pt; font-weight: 600; }
h2 { font-size: 12pt; margin: 10pt 0 4pt; }
p { margin: 0 0 5pt; }
ul { margin: 0 0 5pt; padding-left: 14pt; }
li { margin: 0 0 1.5pt; }
strong { color: #123c2f; }
a { color: #237a57; text-decoration: none; }
code { font-family: Consolas, monospace; font-size: .92em; background: #eef5e2; padding: 0 2pt; border-radius: 2pt; }
table { border-collapse: collapse; width: 100%; margin: 4pt 0 8pt; }
th, td { border: .6pt solid #d9e1d9; padding: 4pt 5pt; vertical-align: top; text-align: left; }
th { background: #173e31; color: #fff; font-family: Geologica, Arial, sans-serif; font-weight: 600; }
tr:nth-child(even) td { background: #f7f7f2; }
td:first-child { font-weight: 600; }
.bar { height: 4pt; background: #237a57; border-radius: 2pt; margin: 0 0 8pt; width: 60pt; }
"""


def chrome() -> str:
    for candidate in BROWSERS:
        found = shutil.which(candidate) or (candidate if Path(candidate).exists() else None)
        if found:
            return found
    raise SystemExit("Chrome or Edge not found")


def page(body: str, title: str, size="A4", margin="12mm 14mm", font="9.6pt", extra="") -> str:
    css = (CSS.replace("{fonts}", FONTS.as_uri()).replace("{size}", size)
           .replace("{margin}", margin).replace("{font}", font))
    return (f"<!doctype html><html lang='ru'><head><meta charset='utf-8'><title>{html.escape(title)}</title>"
            f"<style>{css}{extra}</style></head><body>{body}</body></html>")


def md(text: str) -> str:
    # Python-Markdown needs a blank line before a list that follows a paragraph line.
    text = re.sub(r"(?m)^(?![-\s|]).+\n(?=- )", lambda m: m.group(0) + "\n", text)
    # Keep "15 000 ₸" and "×10" on one line.
    text = re.sub(r"(\d) (\d{3})", "\\1\u00a0\\2", text).replace(" ₸", "\u00a0₸")
    rendered = markdown.markdown(text, extensions=["tables", "sane_lists"])
    # Open external links in a new tab when someone reads the PDF in a browser.
    return rendered.replace("<a href=", "<a target='_blank' href=")


def render(source_html: str, target: Path, title: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "page.html"
        src.write_text(source_html, encoding="utf-8")
        subprocess.run([chrome(), "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                        f"--print-to-pdf={target}", src.as_uri()], check=True, capture_output=True, timeout=120)
    # Clean metadata: only the project title, nothing else (contest rule 12.2).
    from pypdf import PdfReader, PdfWriter
    reader = PdfReader(target)
    writer = PdfWriter()
    for p in reader.pages:
        writer.add_page(p)
    writer.add_metadata({"/Title": title, "/Author": "SaqtaFood", "/Subject": "", "/Keywords": "",
                         "/Creator": "SaqtaFood", "/Producer": "SaqtaFood"})
    with target.open("wb") as fh:
        writer.write(fh)


def ai_card() -> None:
    text = (DOCS / "AI_CARD.md").read_text(encoding="utf-8")
    render(page(md(text), "SaqtaFood — AI-карта", font="9.6pt", margin="11mm 14mm",
                extra="p { margin: 0 0 3pt; } ul { margin-bottom: 4pt; } p strong:first-child { font-family: Geologica, Arial; font-size: 10.2pt; display: inline-block; margin-top: 4pt; }"),
           OUT / "SaqtaFood_AI_card.pdf", "SaqtaFood — AI-карта")


def competitors() -> None:
    text = (DOCS / "COMPETITORS.md").read_text(encoding="utf-8")
    render(page(md(text), "SaqtaFood — конкуренты", size="A4 landscape", font="9pt", margin="11mm 12mm"),
           OUT / "SaqtaFood_competitors.pdf", "SaqtaFood — конкуренты")


CANVAS_CSS = """
.grid { display: grid; grid-template-columns: repeat(10, 1fr); grid-template-rows: 1fr 1fr auto;
  gap: 4pt; height: 168mm; }
.cell { border: .8pt solid #d9e1d9; border-radius: 4pt; padding: 5pt 6pt; overflow: hidden; background: #fff; font-size: 8pt; line-height: 1.3; }
.cell h3 { font-size: 8.6pt; margin: 0 0 3pt; text-transform: uppercase; letter-spacing: .04em; }
.cell h3 span { color: #237a57; margin-right: 3pt; }
.cell .sub { margin-top: 5pt; padding-top: 4pt; border-top: .6pt dashed #d9e1d9; }
.cell .sub b { display: block; font-family: Geologica, Arial; color: #237a57; font-size: 7.8pt; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 1pt; }
.uvp { background: #eef5e2; border-color: #237a57; }
.uvp p:first-of-type { font-family: Geologica, Arial; font-size: 10.5pt; color: #173e31; font-weight: 600; }
.p { grid-column: 1 / 3; grid-row: 1 / 3; } .s { grid-column: 3 / 5; grid-row: 1; } .m { grid-column: 3 / 5; grid-row: 2; }
.u { grid-column: 5 / 7; grid-row: 1 / 3; } .a { grid-column: 7 / 9; grid-row: 1; } .c { grid-column: 7 / 9; grid-row: 2; }
.g { grid-column: 9 / 11; grid-row: 1 / 3; } .cost { grid-column: 1 / 6; grid-row: 3; } .rev { grid-column: 6 / 11; grid-row: 3; }
.head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 5pt; }
.head h1 { margin: 0; font-size: 17pt; } .head p { margin: 0; color: #5b6660; font-size: 8pt; }
.page2 { break-before: page; }
"""


def canvas_cell(cls: str, num: str, title: str, body: str, sub: tuple[str, str] | None = None) -> str:
    inner = md(body)
    if sub:
        inner += f"<div class='sub'><b>{html.escape(sub[0])}</b>{md(sub[1])}</div>"
    return f"<div class='cell {cls}'><h3><span>{num}</span>{html.escape(title)}</h3>{inner}</div>"


def lean_canvas() -> None:
    text = (DOCS / "LEAN_CANVAS.md").read_text(encoding="utf-8")
    rows = {}
    for line in text.splitlines():
        match = re.match(r"\| \*\*(.+?)\*\* \| (.+) \|$", line)
        if match:
            rows[re.sub(r"^\d+\.\s*", "", match.group(1))] = match.group(2)
    # Numbered items "1) ... 2) ..." read better as separate lines inside a small cell.
    def items(value: str) -> str:
        parts = [p.strip() for p in re.split(r"\s*\d\)\s+", value) if p.strip()]
        return "\n".join(f"- {p}" for p in parts) if len(parts) > 1 else value
    note = text.split("\n\n")[1]
    cells = "".join([
        canvas_cell("p", "1", "Проблема", items(rows["Проблема"]), ("Альтернативы сейчас", rows["Существующие альтернативы"])),
        canvas_cell("s", "4", "Решение", items(rows["Решение"])),
        canvas_cell("m", "8", "Ключевые метрики", rows["Ключевые метрики"]),
        canvas_cell("u uvp", "3", "Ценностное предложение", rows["Уникальное ценностное предложение"].replace("». ", "».\n\n", 1),
                    ("Концепция в одной фразе", rows["Концепция высокого уровня"])),
        canvas_cell("a", "9", "Скрытое преимущество", rows["Скрытое преимущество"]),
        canvas_cell("c", "5", "Каналы", rows["Каналы"]),
        canvas_cell("g", "2", "Сегменты клиентов", rows["Сегменты клиентов"], ("Ранние последователи", rows["Ранние последователи"])),
        canvas_cell("cost", "7", "Структура затрат", rows["Структура затрат"]),
        canvas_cell("rev", "6", "Потоки доходов", rows["Потоки доходов"]),
    ])
    rest = text.split("## Пример экономии", 1)[1]
    body = (f"<div class='head'><h1>Lean Canvas — SaqtaFood</h1><p>{html.escape(note)}</p></div>"
            f"<div class='grid'>{cells}</div>"
            f"<div class='page2'><h1>SaqtaFood — экономика и рынок</h1><div class='bar'></div>"
            f"{md('## Пример экономии' + rest)}</div>")
    render(page(body, "SaqtaFood — Lean Canvas", size="A4 landscape", margin="9mm 10mm", extra=CANVAS_CSS),
           OUT / "SaqtaFood_Lean_Canvas.pdf", "SaqtaFood — Lean Canvas")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    ai_card()
    competitors()
    lean_canvas()
    for pdf in sorted(OUT.glob("*.pdf")):
        print(pdf.relative_to(ROOT))
