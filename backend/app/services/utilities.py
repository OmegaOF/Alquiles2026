"""Registro de servicios, medidores y recibos externos, sin pagos efectivos."""

import json
from datetime import date, datetime
from decimal import Decimal
from fastapi import HTTPException
from sqlalchemy import func, select
from app.models.entities import AuditEvent, Unit
from app.models.utilities import (
    UtilityType,
    ServiceAccount,
    UtilityMeter,
    MeterReading,
    UtilityConfiguration,
    UtilityConfigurationUnit,
    UtilityReceipt,
    UtilityReceiptRevision,
    UtilityCurrentDistribution,
    UtilityDistribution,
)
from app.services.tenancy import (
    manage,
    lock_property,
    read_property,
    check_version,
    validate_people,
    retain_contacts,
    today,
)


def rows(db, query, locked=False):
    if locked:
        query = query.with_for_update().execution_options(populate_existing=True)
    return list(db.scalars(query))


def fresh(db, model, id):
    snapshot = db.info.get("phase7_locked_facts")
    if snapshot is not None:
        cached = snapshot.get(model, id)
        if cached is not None:
            return cached
    return db.scalar(
        select(model)
        .where(model.id == id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )


def current_distribution(db, receipt_id, locked=False):
    query = select(UtilityCurrentDistribution).where(
        UtilityCurrentDistribution.receipt_id == receipt_id
    )
    if locked:
        query = query.with_for_update().execution_options(populate_existing=True)
    return db.scalar(query)


def scalar_dict(obj):
    def value(v):
        if isinstance(v, (datetime, date)):
            return v.isoformat()
        if isinstance(v, Decimal):
            return str(v)
        return v

    return {c.name: value(getattr(obj, c.name)) for c in obj.__table__.columns}


def audit(db, user, obj, action, before=None, extra=None):
    db.flush()
    db.add(
        AuditEvent(
            actor_id=user.id,
            action=action,
            entity_type=obj.__tablename__,
            entity_id=obj.id,
            details=json.dumps(
                {"before": before, "after": scalar_dict(obj), "context": extra},
                ensure_ascii=False,
                default=str,
            ),
        )
    )


def get_account(db, user, id, write=False):
    account = db.get(ServiceAccount, id)
    if account is None:
        raise HTTPException(404, "No se encontró el servicio o no tiene acceso.")
    if write:
        manage(user)
        lock_property(db, user, account.property_id)
        account = fresh(db, ServiceAccount, id)
    else:
        read_property(db, user, account.property_id)
    return account


def latest_configuration(db, account_id, locked=False):
    configs = rows(
        db,
        select(UtilityConfiguration)
        .where(UtilityConfiguration.account_id == account_id)
        .order_by(UtilityConfiguration.revision),
        locked,
    )
    return configs[-1] if configs else None


def config_dict(db, obj):
    if obj is None:
        return None
    result = scalar_dict(obj)
    participants = rows(
        db,
        select(UtilityConfigurationUnit)
        .where(UtilityConfigurationUnit.configuration_id == obj.id)
        .order_by(UtilityConfigurationUnit.unit_id),
    )
    result["unit_ids"] = [u.unit_id for u in participants]
    result["percentages"] = [
        {"unit_id": u.unit_id, "percentage": str(u.percentage)}
        for u in participants
        if u.percentage is not None
    ]
    return result


def account_dict(db, obj):
    return {
        **scalar_dict(obj),
        "type_name": db.get(UtilityType, obj.type_id).name,
        "configuration": config_dict(db, latest_configuration(db, obj.id)),
    }


def create_type(db, user, data, id=None):
    if user.role != "general_admin":
        raise HTTPException(
            403, "Solo el administrador general puede cambiar los tipos de servicios."
        )
    duplicate = db.scalar(
        select(UtilityType).where(
            func.lower(UtilityType.name) == data.name.lower(),
            UtilityType.id != (id or 0),
        )
    )
    if duplicate:
        raise HTTPException(409, "Ya existe ese tipo de servicio.")
    obj = db.get(UtilityType, id) if id else UtilityType()
    if obj is None:
        raise HTTPException(404, "No se encontró el tipo de servicio.")
    before = scalar_dict(obj) if id else None
    for key, value in data.model_dump().items():
        setattr(obj, key, value)
    db.add(obj)
    audit(db, user, obj, "update" if id else "create", before)
    db.commit()
    return scalar_dict(obj)


def create_configuration(db, user, account, data, commit=True):
    check_version(account, data.expected_version)
    if not account.is_active:
        raise HTTPException(
            409, "Active el servicio antes de crear una nueva configuración."
        )
    if account.measurement_kind == "individual" and len(data.unit_ids) > 1:
        raise HTTPException(
            422,
            "Un servicio individual puede corresponder a un cuarto o a la casa completa.",
        )
    units = rows(db, select(Unit).where(Unit.id.in_(data.unit_ids)), True)
    if {u.id for u in units} != set(data.unit_ids) or any(
        u.property_id != account.property_id for u in units
    ):
        raise HTTPException(422, "Seleccione cuartos de esta propiedad.")
    people = [
        id
        for id in [
            data.owner_person_id,
            data.provider_payer_id,
            data.reimbursement_person_id,
        ]
        if id is not None
    ]
    validate_people(db, user, account.property_id, people)
    retain_contacts(db, account.property_id, people)
    previous = latest_configuration(db, account.id, True)
    obj = UtilityConfiguration(
        account_id=account.id,
        revision=previous.revision + 1 if previous else 1,
        created_by=user.id,
        **data.model_dump(exclude={"unit_ids", "percentages", "expected_version"}),
    )
    db.add(obj)
    db.flush()
    percentages = {p.unit_id: p.percentage for p in data.percentages}
    db.add_all(
        UtilityConfigurationUnit(
            configuration_id=obj.id, unit_id=id, percentage=percentages.get(id)
        )
        for id in data.unit_ids
    )
    account.version += 1
    audit(
        db,
        user,
        obj,
        "configure",
        extra={
            "unit_ids": data.unit_ids,
            "percentages": data.percentages,
            "previous_configuration_id": previous.id if previous else None,
        },
    )
    if commit:
        db.commit()
    return obj


def create_account(db, user, property_id, data):
    manage(user)
    lock_property(db, user, property_id)
    type_ = db.get(UtilityType, data.type_id)
    if type_ is None or not type_.is_active:
        raise HTTPException(422, "Seleccione un tipo de servicio activo.")
    obj = ServiceAccount(
        property_id=property_id, version=1, **data.model_dump(exclude={"configuration"})
    )
    if not obj.is_active:
        raise HTTPException(
            422,
            "Registre primero el servicio activo; después podrá deshabilitarlo conservando su historial.",
        )
    db.add(obj)
    db.flush()
    create_configuration(db, user, obj, data.configuration, commit=False)
    audit(db, user, obj, "create")
    db.commit()
    return obj


def update_account(db, user, id, data):
    obj = get_account(db, user, id, True)
    check_version(obj, data.expected_version)
    used = db.scalar(
        select(UtilityReceipt.id)
        .where(UtilityReceipt.account_id == id)
        .with_for_update()
    ) or db.scalar(
        select(UtilityMeter.id).where(UtilityMeter.account_id == id).with_for_update()
    )
    values = data.model_dump(exclude_unset=True, exclude={"expected_version"})
    for key in ["label", "provider", "type_id", "is_active"]:
        if key in values and values[key] is None:
            raise HTTPException(422, "Complete los campos obligatorios del servicio.")
    if used and any(
        k in values and values[k] != getattr(obj, k)
        for k in ["provider", "account_number", "type_id", "measure_unit"]
    ):
        raise HTTPException(
            409,
            "Este servicio ya tiene historial. Conserve proveedor, suministro, tipo y unidad de medida; registre otro servicio si cambiaron.",
        )
    if "type_id" in values and db.get(UtilityType, values["type_id"]) is None:
        raise HTTPException(422, "Seleccione un tipo de servicio existente.")
    before = scalar_dict(obj)
    for key, value in values.items():
        setattr(obj, key, value)
    obj.version += 1
    audit(db, user, obj, "update", before)
    db.commit()
    return obj


def meter_context(db, user, id, write=False):
    meter = db.get(UtilityMeter, id)
    if meter is None:
        raise HTTPException(404, "No se encontró el medidor o no tiene acceso.")
    account = get_account(db, user, meter.account_id, write)
    return (fresh(db, UtilityMeter, id) if write else meter), account


def meter_dict(db, obj):
    result = scalar_dict(obj)
    result["is_active"] = obj.installed_on <= today() and (
        obj.retired_on is None or obj.retired_on >= today()
    )
    result["measure_unit"] = db.get(ServiceAccount, obj.account_id).measure_unit
    result["unit_label"] = unit_label(db, obj.unit_id)
    return result


def unit_label(db, id):
    unit = db.get(Unit, id) if id else None
    return f"{unit.code} · {unit.name}" if unit else "Casa completa"


def create_meter(db, user, account_id, data):
    account = get_account(db, user, account_id, True)
    if not account.is_active or not account.measure_unit:
        raise HTTPException(
            422,
            "El servicio debe estar activo y tener unidad de medida antes de registrar medidores.",
        )
    if data.installed_on < account.start_date:
        raise HTTPException(
            422, "La instalación no puede ser anterior al inicio del servicio."
        )
    configuration = latest_configuration(db, account_id, True)
    participants = rows(
        db,
        select(UtilityConfigurationUnit).where(
            UtilityConfigurationUnit.configuration_id == configuration.id
        ),
        True,
    )
    if data.unit_id is not None and data.unit_id not in [
        p.unit_id for p in participants
    ]:
        raise HTTPException(422, "Seleccione un cuarto incluido en este servicio.")
    meters = rows(
        db,
        select(UtilityMeter).where(
            UtilityMeter.account_id == account_id, UtilityMeter.unit_id == data.unit_id
        ),
        True,
    )
    previous = next((m for m in meters if m.id == data.replaces_id), None)
    if data.replaces_id:
        if previous is None or previous.retired_on is not None:
            raise HTTPException(
                409,
                "Seleccione un medidor vigente del mismo servicio y espacio para reemplazarlo.",
            )
        last = rows(
            db, select(MeterReading).where(MeterReading.meter_id == previous.id), True
        )
        if data.installed_on < previous.installed_on or any(
            r.recorded_on > data.installed_on for r in last
        ):
            raise HTTPException(
                422,
                "El reemplazo no puede dejar lecturas anteriores fuera de la vigencia del medidor.",
            )
    if any(
        m.id != data.replaces_id
        and (m.retired_on is None or m.retired_on >= data.installed_on)
        for m in meters
    ):
        raise HTTPException(
            409,
            "Ya existe un medidor de este espacio durante esas fechas. Utilice reemplazar o registre su retiro.",
        )
    if previous:
        before = scalar_dict(previous)
        previous.retired_on = data.installed_on
        previous.version += 1
        audit(db, user, previous, "replace", before)
    obj = UtilityMeter(
        account_id=account_id, version=1, **data.model_dump(exclude={"initial_value"})
    )
    db.add(obj)
    db.flush()
    if data.initial_value is not None:
        db.add(
            MeterReading(
                meter_id=obj.id,
                recorded_on=obj.installed_on,
                value=data.initial_value,
                version=1,
                notes="Lectura inicial del medidor",
            )
        )
    account.version += 1
    audit(db, user, obj, "create")
    db.commit()
    return obj


def retire_meter(db, user, id, data):
    obj, account = meter_context(db, user, id, True)
    manage(user, active=True)
    check_version(obj, data.expected_version)
    existing = rows(db, select(MeterReading).where(MeterReading.meter_id == id), True)
    if obj.retired_on is not None:
        raise HTTPException(409, "Este medidor ya tiene un retiro registrado.")
    if data.retired_on < obj.installed_on or any(
        r.recorded_on > data.retired_on for r in existing
    ):
        raise HTTPException(
            422,
            "El retiro debe ser posterior a la instalación y no dejar lecturas fuera de vigencia.",
        )
    before = scalar_dict(obj)
    obj.retired_on = data.retired_on
    obj.version += 1
    account.version += 1
    audit(db, user, obj, "retire", before, {"reason": data.reason})
    db.commit()
    return obj


def save_reading(db, user, meter_id, data, id=None):
    meter, account = meter_context(db, user, meter_id, True)
    if not id and not account.is_active:
        raise HTTPException(
            409, "El servicio está deshabilitado; conserve y consulte su historial."
        )
    existing = rows(
        db,
        select(MeterReading)
        .where(MeterReading.meter_id == meter_id)
        .order_by(MeterReading.recorded_on),
        True,
    )
    obj = (
        next((r for r in existing if r.id == id), None)
        if id
        else MeterReading(meter_id=meter_id, version=1)
    )
    if obj is None:
        raise HTTPException(404, "No se encontró la lectura.")
    if id:
        manage(user, active=True)
        check_version(obj, data.expected_version)
    if (
        data.recorded_on < meter.installed_on
        or meter.retired_on is not None
        and data.recorded_on > meter.retired_on
    ):
        raise HTTPException(
            422, "La lectura debe corresponder al periodo de vigencia del medidor."
        )
    for r in existing:
        if r.id == id:
            continue
        if r.recorded_on == data.recorded_on:
            raise HTTPException(409, "Ya existe una lectura para este medidor y fecha.")
        if (
            r.recorded_on < data.recorded_on
            and r.value > data.value
            or r.recorded_on > data.recorded_on
            and r.value < data.value
        ):
            raise HTTPException(
                422,
                "La lectura no es compatible con los valores anteriores o posteriores. Para un medidor nuevo utilice reemplazar.",
            )
    before = scalar_dict(obj) if id else None
    for key, value in data.model_dump(exclude={"expected_version", "reason"}).items():
        setattr(obj, key, value)
    if id:
        obj.version += 1
    account.version += 1
    db.add(obj)
    audit(
        db,
        user,
        obj,
        "correct" if id else "create",
        before,
        {"reason": getattr(data, "reason", None)},
    )
    db.commit()
    return obj


def readings_dict(db, meter_id):
    readings = rows(
        db,
        select(MeterReading)
        .where(MeterReading.meter_id == meter_id)
        .order_by(MeterReading.recorded_on),
    )
    return [
        {
            **scalar_dict(r),
            "consumption_since_previous": (
                str(r.value - readings[i - 1].value) if i else None
            ),
        }
        for i, r in enumerate(readings)
    ]


def receipt_context(db, user, id, write=False):
    obj = db.get(UtilityReceipt, id)
    if obj is None:
        raise HTTPException(404, "No se encontró el recibo o no tiene acceso.")
    account = get_account(db, user, obj.account_id, write)
    return (fresh(db, UtilityReceipt, id) if write else obj), account


def latest_revision(db, receipt_id, locked=False):
    revisions = rows(
        db,
        select(UtilityReceiptRevision)
        .where(UtilityReceiptRevision.receipt_id == receipt_id)
        .order_by(UtilityReceiptRevision.revision),
        locked,
    )
    return revisions[-1]


def check_duplicate_receipt(db, account_id, data, exclude=None):
    receipts = rows(
        db, select(UtilityReceipt).where(UtilityReceipt.account_id == account_id), True
    )
    for receipt in receipts:
        if receipt.id == exclude:
            continue
        previous = latest_revision(db, receipt.id, True)
        if (
            (previous.period_start, previous.period_end)
            == (data.period_start, data.period_end)
            or data.external_reference
            and previous.external_reference == data.external_reference
        ):
            raise HTTPException(
                409,
                "Ya se registró un recibo de este suministro con la misma referencia o periodo. Revise el existente para evitar duplicarlo.",
            )


def create_receipt(db, user, account_id, data):
    account = get_account(db, user, account_id, True)
    if not account.is_active:
        raise HTTPException(
            409, "Active el servicio antes de registrar un nuevo recibo."
        )
    if data.period_start < account.start_date:
        raise HTTPException(
            422, "El periodo no puede comenzar antes de la vigencia del servicio."
        )
    check_duplicate_receipt(db, account_id, data)
    obj = UtilityReceipt(account_id=account_id, version=1)
    db.add(obj)
    db.flush()
    rev = UtilityReceiptRevision(
        receipt_id=obj.id, revision=1, created_by=user.id, **data.model_dump()
    )
    db.add(rev)
    audit(db, user, obj, "create", extra={"receipt": data.model_dump()})
    db.commit()
    return obj


def correct_receipt(db, user, id, data):
    obj, account = receipt_context(db, user, id, True)
    check_version(obj, data.expected_version)
    if current_distribution(db, id, True) is not None:
        manage(user, active=True)
    if data.period_start < account.start_date:
        raise HTTPException(
            422, "El periodo no puede comenzar antes de la vigencia del servicio."
        )
    check_duplicate_receipt(db, account.id, data, exclude=id)
    previous = latest_revision(db, id, True)
    rev = UtilityReceiptRevision(
        receipt_id=id,
        revision=previous.revision + 1,
        created_by=user.id,
        **data.model_dump(exclude={"expected_version"}),
    )
    db.add(rev)
    obj.version += 1
    audit(
        db,
        user,
        obj,
        "correct",
        extra={"previous_revision_id": previous.id, "receipt": data.model_dump()},
    )
    db.commit()
    return obj


def receipt_dict(db, obj):
    revision = latest_revision(db, obj.id)
    account = db.get(ServiceAccount, obj.account_id)
    distributions = rows(
        db,
        select(UtilityDistribution)
        .where(UtilityDistribution.receipt_revision_id == revision.id)
        .order_by(UtilityDistribution.id),
    )
    current = db.get(UtilityCurrentDistribution, obj.id)
    current_obj = (
        db.get(UtilityDistribution, current.distribution_id) if current else None
    )
    state = distributions[-1].status if distributions else "draft"
    if (
        current_obj
        and current_obj.receipt_revision_id != revision.id
        and state == "draft"
    ):
        state = "needs_review"
    return {
        **scalar_dict(revision),
        "id": obj.id,
        "revision_id": revision.id,
        "version": obj.version,
        "account_id": obj.account_id,
        "property_id": account.property_id,
        "account_label": account.label,
        "provider": account.provider,
        "type_name": db.get(UtilityType, account.type_id).name,
        "distribution_status": state,
        "current_distribution_id": current.distribution_id if current else None,
        "latest_distribution_id": distributions[-1].id if distributions else None,
        "payment_recorded": False,
    }
