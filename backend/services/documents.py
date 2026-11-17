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
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_margins(19, 16, 19)
    pdf.add_page()
    width = pdf.w - pdf.l_margin - pdf.r_margin
    navy, ink, muted, rule = (31, 55, 79), (38, 45, 54), (91, 102, 115), (205, 213, 221)
    name_seen = False
    contact_seen = False

    def latin(s: str) -> str:   # core fonts are Latin-1; swap the few common non-Latin glyphs
        return s.replace("–", "-").replace("—", "-").replace("•", "-").replace("’", "'").replace("“", '"').replace("”", '"').encode("latin-1", "replace").decode("latin-1")

    for kind, txt in _blocks(md):
        txt = latin(_plain(txt))
        if kind == "blank":
            pdf.ln(1.5)
        elif kind == "h1":
            name_seen = True
            pdf.set_text_color(*navy)
            pdf.set_font("Helvetica", "B", 24)
            pdf.multi_cell(width, 10, txt)
            pdf.ln(1)
        elif kind == "p" and name_seen and not contact_seen:
            contact_seen = True
            pdf.set_text_color(*muted)
            pdf.set_font("Helvetica", "", 9.5)
            pdf.multi_cell(width, 5, txt)
            y = pdf.get_y() + 2
            pdf.set_draw_color(*navy)
            pdf.set_line_width(0.7)
            pdf.line(pdf.l_margin, y, pdf.l_margin + 18, y)
            pdf.ln(5)
        elif kind == "h2":
            pdf.ln(2)
            pdf.set_text_color(*navy)
            pdf.set_font("Helvetica", "B", 11)
            pdf.multi_cell(width, 6, txt.upper())
            y = pdf.get_y() + 0.5
            pdf.set_draw_color(*rule)
            pdf.set_line_width(0.25)
            pdf.line(pdf.l_margin, y, pdf.l_margin + width, y)
            pdf.ln(2)
        elif kind == "h3":
            pdf.ln(1)
            pdf.set_text_color(*ink)
            pdf.set_font("Helvetica", "B", 10.5)
            pdf.multi_cell(width, 5.5, txt)
        elif kind == "li":
            pdf.set_text_color(*navy)
            pdf.set_font("Helvetica", "B", 10)
            x = pdf.get_x()
            pdf.cell(5, 5.5, "-")
            pdf.set_text_color(*ink)
            pdf.set_font("Helvetica", "", 10)
            pdf.multi_cell(width - 5, 5.5, txt)
            pdf.set_x(x)
            pdf.ln(1)
        else:
            pdf.set_text_color(*ink)
            pdf.set_font("Helvetica", "", 10)
            pdf.multi_cell(width, 5.2, txt)
            pdf.ln(1)
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
    from docx.shared import Inches, Pt, RGBColor

    doc = Document()
    navy, ink, muted = RGBColor(31, 55, 79), RGBColor(38, 45, 54), RGBColor(91, 102, 115)
    section = doc.sections[0]
    section.top_margin = Inches(0.65)
    section.bottom_margin = Inches(0.65)
    section.left_margin = Inches(0.75)
    section.right_margin = Inches(0.75)

    normal = doc.styles["Normal"]
    normal.font.name = "Arial"
    normal.font.size = Pt(10)
    normal.font.color.rgb = ink
    normal.paragraph_format.space_after = Pt(4)
    normal.paragraph_format.line_spacing = 1.08

    title = doc.styles["Title"]
    title.font.name = "Arial"
    title.font.size = Pt(24)
    title.font.bold = True
    title.font.color.rgb = navy
    title.paragraph_format.space_after = Pt(1)
    title.paragraph_format.keep_with_next = True

    heading = doc.styles["Heading 1"]
    heading.font.name = "Arial"
    heading.font.size = Pt(11)
    heading.font.bold = True
    heading.font.color.rgb = navy
    heading.paragraph_format.space_before = Pt(11)
    heading.paragraph_format.space_after = Pt(4)
    heading.paragraph_format.keep_with_next = True

    subheading = doc.styles["Heading 2"]
    subheading.font.name = "Arial"
    subheading.font.size = Pt(10.5)
    subheading.font.bold = True
    subheading.font.color.rgb = ink
    subheading.paragraph_format.space_before = Pt(6)
    subheading.paragraph_format.space_after = Pt(2)
    subheading.paragraph_format.keep_with_next = True

    name_seen = False
    contact_seen = False
    for kind, txt in _blocks(md):
        if kind == "blank":
            continue
        if kind == "h1":
            name_seen = True
            doc.add_heading(_plain(txt), level=0)
        elif kind == "p" and name_seen and not contact_seen:
            contact_seen = True
            paragraph = doc.add_paragraph()
            paragraph.paragraph_format.space_after = Pt(8)
            run = paragraph.add_run(_plain(txt))
            run.font.name = "Arial"
            run.font.size = Pt(9)
            run.font.color.rgb = muted
        elif kind == "h2":
            doc.add_heading(_plain(txt).upper(), level=1)
        elif kind == "h3":
            doc.add_heading(_plain(txt), level=2)
        elif kind == "li":
            paragraph = doc.add_paragraph(style="List Bullet")
            paragraph.paragraph_format.space_after = Pt(3)
            _add_runs(paragraph, txt)
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
