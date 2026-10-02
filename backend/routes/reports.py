from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
from database.connection import get_db
from models.sos import SOS
from models.volunteer import Volunteer
from models.feedback import Feedback
from models.sensor import Sensor
from models.flood_data import FloodData, Prediction
from models.evacuation_center import Report
from auth.jwt_handler import get_current_user
from utils.pdf_builder import build_pdf
from datetime import datetime, timedelta

router = APIRouter(prefix="/reports", tags=["Reports"])

VALID_FORMATS = {"json", "csv", "pdf"}


def serialize_list(items):
    result = []
    for item in items:
        d = {}
        for col in item.__table__.columns:
            val = getattr(item, col.name)
            if isinstance(val, datetime):
                val = val.isoformat()
            d[col.name] = val
        result.append(d)
    return result


def _build_response(report_type: str, data: list, days: int, fmt: str):
    """Return JSON dict, CSV Response, or PDF Response depending on fmt."""
    serialized = serialize_list(data)

    if fmt == "pdf":
        pdf_bytes = build_pdf(report_type, serialized, period_days=days)
        filename = f"{report_type}_report_{datetime.utcnow().strftime('%Y%m%d')}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    if fmt == "csv":
        if not serialized:
            csv_content = ""
        else:
            headers = list(serialized[0].keys())
            rows = [",".join(headers)]
            for row in serialized:
                rows.append(",".join(str(row.get(h, "")) for h in headers))
            csv_content = "\n".join(rows)
        filename = f"{report_type}_report_{datetime.utcnow().strftime('%Y%m%d')}.csv"
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # Default: JSON
    return {"report_type": report_type, "period_days": days,
            "records": len(serialized), "data": serialized}


@router.get("/generate/{report_type}")
async def generate_report(
    report_type: str,
    format: str = Query("json", pattern="^(json|csv|pdf)$"),
    days: int = Query(30, ge=1, le=365),
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cutoff = datetime.utcnow() - timedelta(days=days)

    if report_type == "flood":
        data = db.query(FloodData).filter(FloodData.recorded_at >= cutoff).all()

    elif report_type == "sos":
        data = db.query(SOS).filter(SOS.created_at >= cutoff).all()

    elif report_type == "volunteer":
        data = db.query(Volunteer).all()
        days = None   # volunteer report has no time cutoff

    elif report_type == "feedback":
        data = db.query(Feedback).filter(Feedback.created_at >= cutoff).all()

    elif report_type == "sensor":
        data = db.query(Sensor).all()
        days = None

    elif report_type == "prediction":
        data = db.query(Prediction).filter(Prediction.predicted_at >= cutoff).all()

    else:
        raise HTTPException(status_code=400, detail=f"Unknown report type: {report_type}")

    return _build_response(report_type, data, days, format)


@router.get("/summary")
async def get_report_summary(
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return {
        "available_formats": ["json", "csv", "pdf"],
        "available_reports": [
            {"type": "flood",      "description": "Flood sensor data report"},
            {"type": "sos",        "description": "SOS emergency requests report"},
            {"type": "volunteer",  "description": "Volunteer registry report"},
            {"type": "feedback",   "description": "Citizen feedback report"},
            {"type": "sensor",     "description": "Sensor status report"},
            {"type": "prediction", "description": "Flood prediction history report"},
        ]
    }
