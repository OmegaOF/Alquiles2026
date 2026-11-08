from typing import Annotated
from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, ConfigDict, JsonValue
from sqlalchemy.orm import Session
from app.api.auth import current_user
from app.db.session import get_db
from app.models.entities import User
from app.schemas.reports import ReportFilters, ReportKind
from app.services import reports
from app.services.report_pdf import render

router = APIRouter(tags=["Resumen general y reportes internos"])
Filters = Annotated[ReportFilters, Query()]


class ReportResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    kind: ReportKind
    title: str
    filters: dict[str, JsonValue]
    period: dict[str, str]
    properties: list[dict[str, JsonValue]]
    summary: list[dict[str, str | None]]
    counts: dict[str, int | None]
    series: list[dict[str, JsonValue]]
    occupancy: list[dict[str, JsonValue]]
    rows: list[dict[str, JsonValue]]
    movements: list[dict[str, JsonValue]]
    limitations: list[str]
    total_rows: int
    has_data: bool
    fingerprint: str
    page: int
    page_size: int
    generated_at: str


@router.get("/reports/options")
def options(
    filters: Filters, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    return reports.options(db, user, filters)


@router.get("/dashboard", response_model=ReportResponse)
def dashboard(
    filters: Filters, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    data = reports.build(db, user, filters)
    db.rollback()  # Proyección inmutable: liberar bloqueos antes de serializar.
    return data


@router.get("/reports/{kind}", response_model=ReportResponse)
def report(
    kind: ReportKind,
    filters: Filters,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    data = reports.build(db, user, filters, kind)
    db.rollback()
    return data


@router.get("/reports/{kind}/pdf")
def pdf(
    kind: ReportKind,
    filters: Filters,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    data = reports.build(db, user, filters, kind, export=True)
    db.rollback()  # Dibujar páginas no debe retener bloqueos de cobros/pagos.
    content = render(data, filters.paper)
    return Response(
        content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="mi-casa-{kind}.pdf"',
            "X-Report-Fingerprint": data["fingerprint"],
        },
    )
