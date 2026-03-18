# @paladin/pdf/utils/render.py
import base64
import io
import fitz  # pymupdf


def to_images(path: str, dpi: int = 300) -> list[str]:
    doc = fitz.open(path)
    zoom = dpi / 72
    mat = fitz.Matrix(zoom, zoom)
    images = []
    for page in doc:
        pix = page.get_pixmap(matrix=mat)
        buf = io.BytesIO()
        buf.write(pix.tobytes("png"))
        images.append(base64.b64encode(buf.getvalue()).decode())
    doc.close()
    return images
