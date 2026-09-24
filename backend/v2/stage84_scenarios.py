"""Synthetic passive acceptance bytes; never customer/native results."""
from io import BytesIO
from reportlab.pdfgen.canvas import Canvas

def pdf():
    out=BytesIO();c=Canvas(out,pagesize=(200,200),invariant=1)
    c.drawString(15,150,'SYNTHETIC MANUAL ATTACHMENT');c.save();return out.getvalue()

def oblx():
    return b'<?xml version="1.0" encoding="utf-8"?><Root Programm="Synthetic manual file"><NumberOfSets>1</NumberOfSets><Materials><Material><Name>Synthetic</Name></Material></Materials></Root>'
