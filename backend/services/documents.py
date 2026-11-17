"""Markdown resume / cover letter -> PDF (fpdf2) and DOCX (python-docx). Also text extraction for uploads.

The Markdown subset handled: # / ## / ### headings, "- " bullets, **bold**, blank lines, plain paragraphs.
Good enough for a resume; both outputs are ATS-friendly (real text, one column, standard fonts).
"""
import io
import re
from typing import Iterator

_BOLD = re.compile(r"\*\*(.+?)\*\*")
_LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def _plain(s: str) -> str:
    s = _LINK.sub(r"\1 (\2)", s)
    return _BOLD.sub(r"\1", s).replace("`", "")


def _blocks(md: str) -> Iterator[tuple[str, str]]:
    for raw in md.splitlines():
        line = raw.rstrip()
        if not line.strip():
            yield "blank", ""
        elif line.startswith("### "):
            yield "h3", line[4:]
        elif line.startswith("## "):
            yield "h2", line[3:]
        elif line.startswith("# "):
            yield "h1", line[2:]
        elif re.match(r"^\s*[-*•]\s+", line):
            yield "li", re.sub(r"^\s*[-*•]\s+", "", line)
        else:
            yield "p", line


# ── PDF ──────────────────────────────────────────────────────────────────────

def markdown_to_pdf(md: str) -> bytes:
    from fpdf import FPDF

    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.set_margins(18, 16, 18)
    pdf.add_page()
    width = pdf.w - pdf.l_margin - pdf.r_margin

    def latin(s: str) -> str:   # core fonts are Latin-1; swap the few common non-Latin glyphs
        return s.replace("–", "-").replace("—", "-").replace("•", "-").replace("’", "'").replace("“", '"').replace("”", '"').encode("latin-1", "replace").decode("latin-1")

    for kind, txt in _blocks(md):
        txt = latin(_plain(txt))
        if kind == "blank":
            pdf.ln(2)
        elif kind == "h1":
            pdf.set_font("Helvetica", "B", 18); pdf.multi_cell(width, 8, txt); pdf.ln(1)
        elif kind == "h2":
            pdf.ln(2); pdf.set_font("Helvetica", "B", 12.5); pdf.multi_cell(width, 6.5, txt.upper())
            y = pdf.get_y(); pdf.set_draw_color(120, 120, 120); pdf.line(pdf.l_margin, y, pdf.l_margin + width, y); pdf.ln(1.5)
        elif kind == "h3":
            pdf.ln(1); pdf.set_font("Helvetica", "B", 11); pdf.multi_cell(width, 6, txt)
        elif kind == "li":
            pdf.set_font("Helvetica", "", 10.5)
            x = pdf.get_x()
            pdf.cell(5, 5.5, "-")
            pdf.multi_cell(width - 5, 5.5, txt)
            pdf.set_x(x)
        else:
            pdf.set_font("Helvetica", "", 10.5); pdf.multi_cell(width, 5.5, txt)
    return bytes(pdf.output())


# ── DOCX ─────────────────────────────────────────────────────────────────────

def _add_runs(paragraph, txt: str) -> None:
    pos = 0
    for m in _BOLD.finditer(txt):
        if m.start() > pos:
            paragraph.add_run(_plain(txt[pos:m.start()]))
        paragraph.add_run(m.group(1)).bold = True
        pos = m.end()
    if pos < len(txt):
        paragraph.add_run(_plain(txt[pos:]))


def markdown_to_docx(md: str) -> bytes:
    from docx import Document
    from docx.shared import Pt

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(10.5)
    for kind, txt in _blocks(md):
        if kind == "blank":
            continue
        if kind == "h1":
            doc.add_heading(_plain(txt), level=0)
        elif kind == "h2":
            doc.add_heading(_plain(txt), level=1)
        elif kind == "h3":
            doc.add_heading(_plain(txt), level=2)
        elif kind == "li":
            _add_runs(doc.add_paragraph(style="List Bullet"), txt)
        else:
            _add_runs(doc.add_paragraph(), txt)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ── Upload extraction ────────────────────────────────────────────────────────

def extract_text(filename: str, data: bytes) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((p.extract_text() or "") for p in reader.pages)
    if name.endswith(".docx"):
        from docx import Document
        d = Document(io.BytesIO(data))
        parts = [p.text for p in d.paragraphs]
        for t in d.tables:
            for row in t.rows:
                parts.append(" | ".join(c.text for c in row.cells))
        return "\n".join(parts)
    return data.decode("utf-8", errors="replace")
