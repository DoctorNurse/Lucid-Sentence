#!/usr/bin/env python3
"""Regenerate the fidelity corpus (engine/fidelity/corpus/*.docx).

Every sample is written by python-docx from this script, so the corpus is
ours to license (AGPL-3.0-only, like the rest of the repo) and reproducible:

    pip install python-docx==1.2.0 pillow
    python3 engine/fidelity/make_corpus.py

Each file exercises one area that a .docx round trip must keep.
"""
import io
import os
import struct
import zlib

from docx import Document
from docx.enum.section import WD_ORIENT
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'corpus')
LOREM = (
    'The quick brown fox jumps over the lazy dog while the committee reviews '
    'the quarterly figures, and the minutes note every decision in plain words. '
)


def save(doc, name):
    # Fixed core properties keep the files byte-stable between runs.
    import datetime

    cp = doc.core_properties
    cp.author = 'Lucid Sentence fidelity corpus'
    cp.last_modified_by = 'Lucid Sentence fidelity corpus'
    cp.created = cp.modified = datetime.datetime(2026, 1, 1)
    cp.revision = 1
    doc.save(os.path.join(OUT, name))


def png(w, h, rgb):
    """A tiny solid-color PNG (no Pillow needed)."""
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )


def basic():
    d = Document()
    d.add_heading('Spike heading', 1)
    p = d.add_paragraph('Hello ')
    p.add_run('bold').bold = True
    p.add_run(' and ')
    p.add_run('italic').italic = True
    p.add_run(' and ')
    p.add_run('underlined').underline = True
    p.add_run(' text.')
    d.add_paragraph('Item one', style='List Bullet')
    d.add_paragraph('Item two', style='List Number')
    t = d.add_table(rows=2, cols=2)
    t.style = 'Table Grid'
    for r, row in enumerate(t.rows):
        for c, cell in enumerate(row.cells):
            cell.text = f'R{r + 1}C{c + 1}'
    save(d, '01-basic.docx')


def styles():
    d = Document()
    d.add_heading('Document Title', 0)
    d.add_paragraph('A subtitle line', style='Subtitle')
    for lvl in (1, 2, 3):
        d.add_heading(f'Heading level {lvl}', lvl)
        d.add_paragraph(LOREM)
    d.add_paragraph('A quotation that matters.', style='Quote')
    d.add_paragraph('An intense quotation.', style='Intense Quote')
    for font in ('Calibri', 'Cambria', 'Arial', 'Times New Roman', 'Courier New'):
        p = d.add_paragraph()
        r = p.add_run(f'{font} at 14 pt')
        r.font.name = font
        r.font.size = Pt(14)
    p = d.add_paragraph()
    r = p.add_run('Red text, ')
    r.font.color.rgb = RGBColor(0xC0, 0x00, 0x00)
    r = p.add_run('strikethrough, ')
    r.font.strike = True
    r = p.add_run('x')
    p.add_run('2').font.superscript = True
    p.add_run(' and H')
    p.add_run('2').font.subscript = True
    p.add_run('O.')
    for align in (WD_ALIGN_PARAGRAPH.CENTER, WD_ALIGN_PARAGRAPH.RIGHT, WD_ALIGN_PARAGRAPH.JUSTIFY):
        p = d.add_paragraph(f'{align.name.title()} aligned. ' + LOREM)
        p.alignment = align
    custom = d.styles.add_style('Lucid Callout', 1)
    custom.base_style = d.styles['Normal']
    custom.font.bold = True
    custom.font.color.rgb = RGBColor(0x1F, 0x4E, 0x79)
    d.add_paragraph('A paragraph in a custom style.', style='Lucid Callout')
    save(d, '02-styles.docx')


def lists():
    d = Document()
    d.add_heading('Lists', 1)
    for i in range(3):
        d.add_paragraph(f'Bullet {i + 1}', style='List Bullet')
        d.add_paragraph(f'Nested bullet {i + 1}', style='List Bullet 2')
    for i in range(4):
        d.add_paragraph(f'Step {i + 1}', style='List Number')
    d.add_paragraph('Second level step', style='List Number 2')
    d.add_paragraph('Back to the body.')
    save(d, '03-lists.docx')


def tables():
    d = Document()
    d.add_heading('Tables', 1)
    t = d.add_table(rows=4, cols=3)
    t.style = 'Light Grid Accent 1'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    hdr = ['Region', 'Q1', 'Q2']
    for c, h in enumerate(hdr):
        t.rows[0].cells[c].text = h
    data = [('North', '12', '15'), ('South', '9', '11'), ('Total', '21', '26')]
    for r, row in enumerate(data, start=1):
        for c, v in enumerate(row):
            t.rows[r].cells[c].text = v
    a = t.cell(3, 1).merge(t.cell(3, 2))
    a.text = 'Merged: 47'
    d.add_paragraph('After the table.')
    nested = d.add_table(rows=1, cols=2)
    nested.style = 'Table Grid'
    nested.cell(0, 0).text = 'Outer cell'
    inner = nested.cell(0, 1).add_table(rows=2, cols=1)
    inner.cell(0, 0).text = 'Inner A'
    inner.cell(1, 0).text = 'Inner B'
    save(d, '04-tables.docx')


def images():
    d = Document()
    d.add_heading('Pictures', 1)
    d.add_paragraph('A blue square:')
    d.add_picture(io.BytesIO(png(64, 64, (40, 90, 200))), width=Inches(1))
    d.add_paragraph('An orange bar:')
    d.add_picture(io.BytesIO(png(200, 40, (240, 140, 20))), width=Inches(3))
    d.add_paragraph('The end.')
    save(d, '05-images.docx')


def sections():
    d = Document()
    s = d.sections[0]
    s.header.paragraphs[0].text = 'Quarterly report: header'
    s.footer.paragraphs[0].text = 'Confidential: footer'
    d.add_heading('Portrait section', 1)
    d.add_paragraph(LOREM * 3)
    p = d.add_paragraph('Before a page break.')
    p.add_run().add_break(WD_BREAK.PAGE)
    d.add_paragraph('After the page break.')
    land = d.add_section()
    land.orientation = WD_ORIENT.LANDSCAPE
    land.page_width, land.page_height = land.page_height, land.page_width
    d.add_heading('Landscape section', 1)
    d.add_paragraph(LOREM * 2)
    save(d, '06-sections.docx')


def text():
    d = Document()
    d.add_heading('Scripts and characters', 1)
    d.add_paragraph('Accents: café, naïve, Ærøskøbing, Żółć, Ğüşİöç.')
    d.add_paragraph('Greek and Cyrillic: Αλφάβητο, Кириллица.')
    rtl = d.add_paragraph('العربية: مرحبا بالعالم')
    ppr = rtl._p.get_or_add_pPr()
    bidi = OxmlElement('w:bidi')
    ppr.append(bidi)
    d.add_paragraph('Hebrew: שלום עולם')
    d.add_paragraph('Symbols: © ® ™ € £ ¥ § ¶ † ‡ • … – — “quotes” ‘single’')
    p = d.add_paragraph('Tab\tseparated\tvalues')
    p = d.add_paragraph('Line one')
    p.add_run().add_break()
    p.add_run('Line two after a soft break')
    d.add_paragraph('Spaces:   three   between   words.')
    save(d, '07-text.docx')


def links():
    d = Document()
    d.add_heading('Links and fields', 1)
    p = d.add_paragraph('Visit ')
    part = d.part
    rid = part.relate_to('https://example.org/', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', is_external=True)
    h = OxmlElement('w:hyperlink')
    h.set(qn('r:id'), rid)
    r = OxmlElement('w:r')
    rpr = OxmlElement('w:rPr')
    st = OxmlElement('w:rStyle')
    st.set(qn('w:val'), 'Hyperlink')
    rpr.append(st)
    r.append(rpr)
    t = OxmlElement('w:t')
    t.text = 'example.org'
    r.append(t)
    h.append(r)
    p._p.append(h)
    p.add_run(' for details.')
    save(d, '08-links.docx')


def long():
    d = Document()
    d.add_heading('A long document', 0)
    for i in range(1, 41):
        d.add_heading(f'Section {i}', 2)
        for _ in range(3):
            d.add_paragraph(LOREM * 3)
    save(d, '09-long.docx')


def comments():
    d = Document()
    d.add_heading('Comments', 1)
    p = d.add_paragraph('This sentence has a comment.')
    try:
        d.add_comment(p.runs, text='Please check this figure.', author='Reviewer', initials='RV')
    except AttributeError:
        pass  # python-docx < 1.2
    d.add_paragraph('No comment here.')
    save(d, '10-comments.docx')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for fn in (basic, styles, lists, tables, images, sections, text, links, long, comments):
        fn()
    print('corpus:', ', '.join(sorted(os.listdir(OUT))))
