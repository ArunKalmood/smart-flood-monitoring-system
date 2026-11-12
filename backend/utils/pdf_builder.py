"""
PDF generation helpers using ReportLab (already in requirements.txt).
Produces a styled A4 report for any of the 6 report types.
"""
from io import BytesIO
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from utils.timeutil import utc_now


# ── Palette ────────────────────────────────────────────────────────────────
HEADER_BG  = colors.HexColor("#1e3a5f")
ROW_ALT    = colors.HexColor("#f0f4f8")
ACCENT     = colors.HexColor("#3b82d4")
TEXT_DARK  = colors.HexColor("#1f2328")
TEXT_MUTED = colors.HexColor("#57606a")

REPORT_LABELS = {
    "flood":      "Flood Sensor Data Report",
    "sos":        "SOS Emergency Requests Report",
    "volunteer":  "Volunteer Registry Report",
    "feedback":   "Citizen Feedback Report",
    "sensor":     "Sensor Status Report",
    "prediction": "Flood Prediction History Report",
}

# Columns to show per report type (subset of model columns for readability)
COLUMN_MAP = {
    "flood":      ["id", "sensor_id", "water_level", "rainfall", "temperature", "humidity", "river_flow", "recorded_at"],
    "sos":        ["id", "name", "phone", "emergency_type", "status", "location", "assigned_team", "created_at"],
    "volunteer":  ["id", "full_name", "email", "phone", "blood_group", "status", "availability", "organization"],
    "feedback":   ["id", "title", "category", "priority", "status", "location", "user_name", "created_at"],
    "sensor":     ["id", "sensor_id", "name", "type", "location", "status", "battery_level", "last_seen"],
    "prediction": ["id", "sensor_id", "risk_level", "confidence", "predicted_water_level", "time_to_flood_hours", "model_version", "predicted_at"],
}


def _val(v):
    """Safely convert any value to a printable string."""
    if v is None:
        return "—"
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M")
    if isinstance(v, bool):
        return "Yes" if v else "No"
    if isinstance(v, float):
        return f"{v:.2f}"
    return str(v)


def build_pdf(report_type: str, data: list, period_days: int = None) -> bytes:
    """
    Build and return a PDF byte string for the given report_type + data rows.
    data: list of dicts (serialized ORM rows).
    """
    label   = REPORT_LABELS.get(report_type, report_type.upper())
    columns = COLUMN_MAP.get(report_type, list(data[0].keys()) if data else [])

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.5*cm, rightMargin=1.5*cm,
        topMargin=1.5*cm,  bottomMargin=1.5*cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title", parent=styles["Heading1"],
        textColor=HEADER_BG, fontSize=16, spaceAfter=4,
    )
    sub_style = ParagraphStyle(
        "Sub", parent=styles["Normal"],
        textColor=TEXT_MUTED, fontSize=9, spaceAfter=10,
    )

    story = []

    # ── Header ────────────────────────────────────────────────
    story.append(Paragraph("FloodMonitor", ParagraphStyle(
        "Brand", parent=styles["Normal"],
        textColor=ACCENT, fontSize=10, spaceAfter=2,
    )))
    story.append(Paragraph(label, title_style))
    period_text = f"Period: last {period_days} days  |  " if period_days else ""
    story.append(Paragraph(
        f"{period_text}Generated: {utc_now().strftime('%Y-%m-%d %H:%M UTC')}  |  "
        f"Total records: {len(data)}",
        sub_style,
    ))
    story.append(HRFlowable(width="100%", thickness=1, color=HEADER_BG, spaceAfter=8))

    if not data:
        story.append(Paragraph("No records found for the selected period.", styles["Normal"]))
        doc.build(story)
        return buf.getvalue()

    # ── Table ─────────────────────────────────────────────────
    header_row = [col.replace("_", " ").title() for col in columns]
    table_data = [header_row]

    for row in data:
        table_data.append([_val(row.get(col)) for col in columns])

    # Auto-size columns equally across available width (A4 - margins)
    available_w = A4[0] - 3*cm
    col_w = available_w / len(columns)
    col_widths = [col_w] * len(columns)

    tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(TableStyle([
        # Header
        ("BACKGROUND",  (0, 0), (-1, 0),  HEADER_BG),
        ("TEXTCOLOR",   (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",    (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",    (0, 0), (-1, 0),  8),
        ("TOPPADDING",  (0, 0), (-1, 0),  5),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
        # Body
        ("FONTNAME",    (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",    (0, 1), (-1, -1), 7),
        ("TEXTCOLOR",   (0, 1), (-1, -1), TEXT_DARK),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ROW_ALT]),
        ("TOPPADDING",  (0, 1), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
        # Grid
        ("GRID",        (0, 0), (-1, -1), 0.4, colors.HexColor("#e5e7eb")),
        ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
        ("WORDWRAP",    (0, 0), (-1, -1), True),
    ]))
    story.append(tbl)

    # ── Footer note ───────────────────────────────────────────
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "This report was automatically generated by the FloodMonitor Early Warning System.",
        ParagraphStyle("Footer", parent=styles["Normal"],
                       textColor=TEXT_MUTED, fontSize=8),
    ))

    doc.build(story)
    return buf.getvalue()
