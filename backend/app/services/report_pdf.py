"""PDF vectorial a partir del resultado autorizado, sin cálculos financieros."""

from io import BytesIO
from datetime import datetime
from zoneinfo import ZoneInfo
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    LongTable,
    TableStyle,
    KeepTogether,
)
from reportlab.pdfgen.canvas import Canvas
from reportlab.graphics.shapes import Drawing, String
from reportlab.graphics.charts.barcharts import VerticalBarChart

METRICS = {
    "charges_recorded": "Cargos registrados en el periodo",
    "obligations_total": "Cargos vigentes al corte",
    "obligations_applied": "Aplicado a cargos al corte",
    "pending": "Saldo por cobrar al corte",
    "rent_pending": "Alquiler pendiente al corte",
    "service_pending": "Servicios pendientes al corte",
    "ordinary_received": "Cobros y anticipos recibidos en el periodo",
    "cash_received": "Total de entradas reales en el periodo",
    "expenses_recorded": "Gastos registrados en el periodo",
    "expense_total": "Gasto vigente al corte",
    "expense_applied": "Desembolsos aplicados al corte",
    "payable_pending": "Gastos pendientes de pago al corte",
    "provider_refund_pending": "Importe pendiente de devolución del proveedor",
    "disbursed": "Desembolsos propios en el periodo",
    "cash_out": "Total de salidas propias en el periodo",
    "provider_direct": "Pagos directos de terceros en el periodo",
    "refunded": "Devoluciones de fondos en el periodo",
    "services_recovered": "Fondos aplicados a servicios en el periodo",
    "services_direct": "Servicios cubiertos directamente en el periodo",
    "owner_service_responsibility": "Parte del propietario en recibos cerrados en el periodo",
    "occupant_service_responsibility": "Parte del ocupante en recibos cerrados en el periodo",
    "recoveries_pending": "Servicios por recuperar con proveedor pagado",
    "guarantees_received": "Garantías recibidas en el periodo",
    "guarantees_available": "Garantías disponibles al corte",
    "advances_received": "Anticipos recibidos (incluidos en cobros)",
    "credit_available": "Crédito y anticipos disponibles al corte",
    "capital_agreed": "Capital acordado de los contratos consultados",
    "capital_received": "Capital recibido acumulado al corte",
    "capital_returned": "Capital devuelto acumulado al corte",
    "capital_pending": "Capital pendiente de devolución al corte",
    "capital_adjustments": "Ajustes no monetarios de capital al corte",
    "capital_received_period": "Capital recibido durante el periodo",
    "capital_returned_period": "Capital devuelto durante el periodo",
    "noncash_adjustments": "Ajustes económicos sin dinero en el periodo",
}
CHARTS = [
    (
        "Entradas reales por mes",
        ["ordinary_received", "guarantees_received", "capital_received_period"],
    ),
    (
        "Cargos, aplicaciones y saldo al cierre de mes",
        ["obligations_total", "obligations_applied", "pending"],
    ),
    ("Gastos y desembolsos del periodo", ["expenses_recorded", "disbursed"]),
    (
        "Servicios: fondos aplicados y pendientes",
        [
            "owner_service_responsibility",
            "occupant_service_responsibility",
            "services_recovered",
            "service_pending",
        ],
    ),
    (
        "Capital de anticréticos al cierre de mes",
        ["capital_received", "capital_returned", "capital_pending"],
    ),
    (
        "Evolución de movimientos y cargos",
        ["ordinary_received", "charges_recorded", "pending"],
    ),
]
STATE_LABELS = {
    "active": "Activo",
    "finished": "Finalizado",
    "draft": "Borrador",
    "cancelled": "Cancelado",
    "pending": "Pendiente",
    "partial": "Pago parcial",
    "paid": "Cubierto",
    "overdue": "Vencido",
    "adjusted": "Ajustado",
    "voided": "Anulado",
    "daily": "Diario",
    "weekly": "Semanal",
    "monthly": "Mensual",
    "anticretico": "Anticrético",
    "mixed": "Mixto",
    "collection": "Cobro",
    "advance": "Anticipo",
    "guarantee": "Garantía",
    "disbursement": "Desembolso propio",
    "provider_direct": "Pago directo al proveedor",
    "refund": "Devolución de fondos",
}


class NumberedCanvas(Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.states = []

    def showPage(self):
        self.states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        count = len(self.states)
        for state in self.states:
            self.__dict__.update(state)
            self.setFont("Helvetica", 9)
            self.setFillColor(colors.HexColor("#43534f"))
            self.drawString(36, 24, "Mi Casa · Administración interna de propiedades")
            self.drawRightString(
                self._pagesize[0] - 36, 24, f"Página {self._pageNumber} de {count}"
            )
            super().showPage()
        super().save()


def render(data, paper="A4"):
    output = BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=A4 if paper == "A4" else letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=38,
        bottomMargin=42,
        title=data["title"],
        author="Mi Casa · Alquiles2026",
    )
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="Cell7", fontName="Helvetica", fontSize=10, leading=14, spaceAfter=2
        )
    )
    styles["Normal"].fontSize = 11
    styles["Normal"].leading = 16
    styles["Heading1"].textColor = colors.HexColor("#164f43")

    def p(value, style="Cell7"):
        return Paragraph(
            escape("Sin información" if value is None else str(value)), styles[style]
        )

    def table(rows, widths=None):
        t = LongTable(
            [[p(v) for v in row] for row in rows],
            colWidths=widths,
            repeatRows=1,
            hAlign="LEFT",
            splitByRow=1,
            splitInRow=1,
        )
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e3efea")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.HexColor("#649a8c")),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.HexColor("#f5f8f6")],
                    ),
                    ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor("#d4dfdb")),
                ]
            )
        )
        return t

    scope = (
        ", ".join(x["name"] for x in data["properties"])
        or "Sin propiedades autorizadas"
    )
    period = data["period"]
    story = [
        p(data["title"], "Title"),
        p(scope, "Heading2"),
        p(
            f"Periodo: {period['start']} a {period['end']}. Corte: {period['as_of']} ({period['timezone']}).",
            "Normal",
        ),
        p(
            "Generado: "
            + datetime.fromisoformat(data["generated_at"])
            .astimezone(ZoneInfo("America/La_Paz"))
            .strftime("%d/%m/%Y %H:%M")
            + " (Bolivia).",
            "Normal",
        ),
        p("Referencia de datos: " + data["fingerprint"], "Cell7"),
        Spacer(1, 12),
    ]
    filters = {k: v for k, v in data["filters"].items() if v is not None}
    if filters:
        labels = {
            "property_id": "Propiedad",
            "owner_id": "Propietario",
            "unit_id": "Unidad",
            "contract_id": "Contrato",
            "person_id": "Responsable",
            "mode": "Modalidad",
            "service_type_id": "Tipo de servicio",
            "category_id": "Tipo de gasto",
            "currency": "Moneda",
            "start_date": "Fecha inicial",
            "end_date": "Fecha final",
            "as_of": "Fecha de corte",
            "state": "Estado",
            "month": "Mes",
            "year": "Año",
        }
        story += [
            p("Filtros utilizados", "Heading2"),
            p(
                "; ".join(f"{labels.get(k,k)}: {v}" for k, v in filters.items()),
                "Normal",
            ),
        ]
    if not data["has_data"]:
        story += [p("No hay datos para este periodo.", "Heading2")]
    for group in data["summary"]:
        currency = group["currency"]
        story += [
            p("Resumen · " + currency, "Heading1"),
            p(
                "Los totales y sus desgloses son medidas distintas; no sumarlos entre sí. Capital, garantías y cobros permanecen separados.",
                "Normal",
            ),
            table(
                [["Medida", "Importe", "Moneda"]]
                + [[label, group[key], currency] for key, label in METRICS.items()],
                [doc.width * 0.66, doc.width * 0.21, doc.width * 0.13],
            ),
            Spacer(1, 14),
        ]
        points = [x for x in data["series"] if x["currency"] == currency]
        # Máximo 12 meses por panel; nunca se reduce la precisión del texto monetario.
        for title, keys in CHARTS:
            for offset in range(0, len(points), 12):
                subset = points[offset : offset + 12]
                if not subset or not any(x["has_data"] for x in subset):
                    continue
                drawing = Drawing(doc.width, 200)
                chart = VerticalBarChart()
                chart.x = 55
                chart.y = 42
                chart.width = doc.width - 65
                chart.height = 130
                chart.data = [[float(x[key]) for x in subset] for key in keys]
                chart.categoryAxis.categoryNames = [x["month"] for x in subset]
                chart.categoryAxis.labels.fontSize = 8
                chart.categoryAxis.labels.angle = 30
                chart.valueAxis.labels.fontSize = 8
                # Una escala recortada oculta la barra del importe menor.
                # Incluir cero conserva también los valores negativos, si los hay.
                chart.valueAxis.forceZero = True
                chart.bars[0].fillColor = colors.HexColor("#23705e")
                if len(keys) > 1:
                    chart.bars[1].fillColor = colors.HexColor("#df9a37")
                if len(keys) > 2:
                    chart.bars[2].fillColor = colors.HexColor("#586fa6")
                if len(keys) > 3:
                    chart.bars[3].fillColor = colors.HexColor("#7b4d88")
                drawing.add(chart)
                drawing.add(String(3, 187, currency, fontSize=9))
                story += [
                    KeepTogether(
                        [
                            p(title + " · " + currency, "Heading2"),
                            drawing,
                            p(" / ".join(METRICS[k] for k in keys), "Cell7"),
                        ]
                    )
                ]
    # Ocupación física: se presenta con el mismo ámbito y advertencia de versión.
    if data["occupancy"]:
        story += [
            p("Ocupación por fechas registradas", "Heading1"),
            p(
                "Contratos válidos en su versión actual; no reconstruye cambios históricos de inventario o estado.",
                "Normal",
            ),
            table(
                [
                    [
                        "Mes",
                        "Días de cuartos ocupados",
                        "Días de cuartos registrados",
                        "Ocupación (%)",
                    ]
                ]
                + [
                    [
                        x["month"],
                        x["occupied_unit_days"],
                        x["unit_days"],
                        x["occupancy_percent"] or "Sin información",
                    ]
                    for x in data["occupancy"]
                ],
                [
                    doc.width * 0.19,
                    doc.width * 0.27,
                    doc.width * 0.29,
                    doc.width * 0.25,
                ],
            ),
        ]
        known = [x for x in data["occupancy"] if x["occupancy_percent"] is not None]
        for offset in range(0, len(known), 12):
            subset = known[offset : offset + 12]
            drawing = Drawing(doc.width, 185)
            chart = VerticalBarChart()
            chart.x = 45
            chart.y = 40
            chart.width = doc.width - 55
            chart.height = 125
            chart.data = [[float(x["occupancy_percent"]) for x in subset]]
            chart.categoryAxis.categoryNames = [x["month"] for x in subset]
            chart.categoryAxis.labels.fontSize = 8
            chart.categoryAxis.labels.angle = 30
            chart.valueAxis.valueMin = 0
            chart.valueAxis.valueMax = 100
            chart.bars[0].fillColor = colors.HexColor("#23705e")
            drawing.add(chart)
            story += [
                KeepTogether(
                    [
                        p("Ocupación registrada · % de días de cuartos", "Heading2"),
                        drawing,
                    ]
                )
            ]
    story += [p("Detalle · " + str(data["total_rows"]) + " registros", "Heading1")]
    detail = [
        [
            "Referencia",
            "Propiedad, persona y periodo",
            "Importe / moneda",
            "Aplicado",
            "Pendiente",
        ]
    ]
    detail_rows = []
    for parent in data["rows"]:
        detail_rows.append(parent)
        if data["kind"] == "contracts":
            detail_rows.extend(
                {**x, "property": parent.get("property", "")}
                for x in parent.get("obligations", [])
            )
            detail_rows.extend(
                {**x, "property": parent.get("property", "")}
                for x in parent.get("capital", [])
            )
            detail_rows.extend(
                {**x, "property": parent.get("property", "")}
                for x in parent.get("movements", [])
            )
    for row in detail_rows:
        ref = (
            row.get("record_type")
            or STATE_LABELS.get(row.get("kind"))
            or row.get("concept")
            or row.get("description")
            or row.get("service")
            or (
                "Contrato " + str(row["contract_id"])
                if row.get("contract_id")
                else row.get("unit", "Propiedad")
            )
        )
        context = " · ".join(
            (
                STATE_LABELS.get(str(row[k]), str(row[k]))
                if k in {"state", "contract_state", "mode", "kind"}
                else str(row[k])
            )
            for k in [
                "property",
                "unit",
                "person",
                "owner",
                "period_start",
                "period_end",
                "due_on",
                "state",
                "contract_state",
                "mode",
                "kind",
                "start_date",
                "end_date",
                "filtered_person",
            ]
            if row.get(k) is not None
        )
        if row.get("pending_financial_import"):
            context += " · Reparto confirmado pendiente de importar a Pagos y gastos."
        amount = row.get(
            "total",
            row.get(
                "amount",
                row.get("agreed", row.get("price", row.get("obligations_total", "—"))),
            ),
        )
        paid = row.get(
            "applied", row.get("returned", row.get("obligations_applied", "—"))
        )
        pending = row.get("pending", row.get("capital_pending", "—"))
        currency = row.get("currency") or ""
        amount_text = "Sin información" if amount is None else str(amount)
        detail.append([str(ref), context, amount_text + " " + currency, paid, pending])
    if len(detail) > 1:
        story.append(
            table(
                detail,
                [
                    doc.width * 0.19,
                    doc.width * 0.38,
                    doc.width * 0.17,
                    doc.width * 0.13,
                    doc.width * 0.13,
                ],
            )
        )
    else:
        story.append(p("No hay registros de detalle para estos filtros.", "Normal"))
    if data["kind"] in {"properties", "owners", "units", "comparison", "contracts"}:
        story.append(p("Importes completos de cada desglose", "Heading1"))
        story.append(
            p(
                "Son partes del mismo resumen. Las filas de copropietarios no deben sumarse como derechos personales.",
                "Normal",
            )
        )
        for row in data["rows"]:
            title = " · ".join(
                str(row[k]) for k in ["owner", "property", "unit"] if row.get(k)
            )
            if row.get("contract_id"):
                title += " · Contrato " + str(row["contract_id"])
            story.append(p(title, "Heading2"))
            if row.get("scope"):
                story.append(p(row["scope"], "Normal"))
            groups = (
                row.get("summary", [])
                if data["kind"] == "contracts"
                else [row] if row.get("currency") else []
            )
            if not groups:
                story.append(
                    p(
                        "Sin movimientos económicos atribuidos a este registro.",
                        "Normal",
                    )
                )
            for group in groups:
                story.append(
                    table(
                        [["Medida", "Importe", "Moneda"]]
                        + [
                            [label, group.get(key), group["currency"]]
                            for key, label in METRICS.items()
                        ],
                        [doc.width * 0.66, doc.width * 0.21, doc.width * 0.13],
                    )
                )
            if row.get("contracts"):
                story.append(
                    table(
                        [["Contrato", "Entrada", "Salida"]]
                        + [
                            [c["id"], c["start_date"], c["end_date"]]
                            for c in row["contracts"]
                        ],
                        [doc.width * 0.2, doc.width * 0.4, doc.width * 0.4],
                    )
                )
    story += [p("Observaciones y límites de interpretación", "Heading1")]
    story += [p(note, "Normal") for note in data["limitations"]]
    doc.build(story, canvasmaker=NumberedCanvas)
    return output.getvalue()
