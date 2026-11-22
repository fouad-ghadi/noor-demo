"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°9 — ANALYSE DES VENTES : « CE QUE NOOR EN DÉDUIT »              ║
║  Statut : implémenté (règles expliquées sur les données de marché)    ║
╚══════════════════════════════════════════════════════════════════════╝

À partir des ventes du marché (type IMS, cumul depuis janvier, comparé à l'an dernier),
NOOR tire trois conclusions pour le délégué, chacune avec ses chiffres :

1. Zones à prioriser : (territoire, produit) où notre part de marché (PM) baisse
   (indice d'évolution IE < 97). Classées par ventes « perdues » :
   (PM de l'an dernier − PM actuelle) × taille du marché local.
2. Produits en croissance (IE ≥ 105) : l'effort paie, à consolider.
3. Médecins à revoir : dans les zones à prioriser, les médecins de la bonne spécialité,
   à potentiel A ou B, qui ne prescrivent pas (ou peu) le produit, les moins vus récemment d'abord.
"""
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.ai.schemas import SalesInsight, SalesInsights
from app.models import Doctor, MarketProduct, Product, SalesRecord, User
from app.models.enums import PrescribingStatus
from app.seed_data.territories import territories_of_region
from app.services import access
from app.services.dates import now
from app.services.doctor_service import last_visit_dates
from app.services.sales_service import _months_for, last_available_month

LOSING_IE, GROWING_IE = 97, 105
HABIT = {PrescribingStatus.NON_PRESCRIPTEUR: "ne prescrit pas", PrescribingStatus.OCCASIONNEL: "prescrit occasionnellement"}
RECENT_DAYS = 10      # un médecin vu il y a moins de 10 jours n'est pas « à revoir »
ZONES_PER_PRODUCT = 2  # pour varier les conclusions


def _fmt_dh(value: float) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f} M DH".replace(".", ",")
    return f"{value / 1000:.0f} k DH"


def _pct(value: float) -> str:
    return f"{value:.1f} %".replace(".", ",")


def _territory_product_metrics(db: Session, territories: set[str]) -> tuple[dict, str]:
    """{(territoire, product_id): {pm, pm_prev, market, value, value_prev}} sur le cumul de l'année."""
    last_month = last_available_month(db)
    cur, prev, label, _ = _months_for("ytd", last_month)
    sums: dict[tuple, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    rows = db.execute(
        select(SalesRecord.territory, MarketProduct.market_code, MarketProduct.product_id,
               SalesRecord.period, SalesRecord.value)
        .join(MarketProduct, MarketProduct.id == SalesRecord.market_product_id)
        .where(SalesRecord.period.in_(cur + prev), SalesRecord.territory.in_(territories))
    )
    for territory, code, product_id, period, value in rows:
        key = "cur" if period in cur else "prev"
        sums[(territory, code, None)][key] += value
        if product_id is not None:
            sums[(territory, code, product_id)][key] += value
    metrics = {}
    for (territory, code, pid), v in sums.items():
        if pid is None:
            continue
        m = sums[(territory, code, None)]
        if not (m["cur"] and m["prev"] and v["prev"]):
            continue
        pm, pm_prev = 100 * v["cur"] / m["cur"], 100 * v["prev"] / m["prev"]
        metrics[(territory, pid)] = {"pm": pm, "pm_prev": pm_prev, "ie": 100 * pm / pm_prev,
                                     "market": m["cur"], "value": v["cur"], "value_prev": v["prev"]}
    return metrics, label


def insights(db: Session, user: User, delegue_id: int | None = None) -> SalesInsights:
    ids = access.resolve_delegue_ids(db, user, delegue_id)
    delegates = list(db.scalars(select(User).where(User.id.in_(ids))))
    territories = {t for d in delegates for t in territories_of_region(d.region)}
    metrics, label = _territory_product_metrics(db, territories)
    products = {p.id: p for p in db.scalars(select(Product))}

    zones, growth = [], []
    for (territory, pid), m in metrics.items():
        p = products[pid]
        why = [f"Part de marché {_pct(m['pm'])} contre {_pct(m['pm_prev'])} l'an dernier (indice d'évolution {m['ie']:.0f})",
               f"Marché local : {_fmt_dh(m['market'])} depuis janvier"]
        if m["ie"] < LOSING_IE:
            lost = (m["pm_prev"] - m["pm"]) / 100 * m["market"]
            why.append(f"Environ {_fmt_dh(lost)} de ventes perdues face aux concurrents")
            zones.append(SalesInsight(kind="zone_a_prioriser", title=f"Prioriser {territory} pour {p.brand_name}",
                                      why=why, territory=territory, product_id=pid, impact=round(lost)))
        elif m["ie"] >= GROWING_IE:
            gain = (m["pm"] - m["pm_prev"]) / 100 * m["market"]
            why.append(f"Environ {_fmt_dh(gain)} de ventes gagnées : continuer l'effort")
            growth.append(SalesInsight(kind="produit_en_croissance", title=f"{p.brand_name} progresse à {territory}",
                                       why=why, territory=territory, product_id=pid, impact=round(gain)))
    zones.sort(key=lambda z: -z.impact)
    growth.sort(key=lambda g: -g.impact)
    per_product: dict[int, int] = defaultdict(int)
    kept = []
    for z in zones:
        if per_product[z.product_id] < ZONES_PER_PRODUCT:
            kept.append(z)
            per_product[z.product_id] += 1
    zones, growth = kept[:5], growth[:3]
    if not zones:
        # Rien ne baisse nettement : on signale quand même les 2 indices les plus faibles (< 100), à surveiller
        weakest = sorted(((m["ie"], key, m) for key, m in metrics.items() if m["ie"] < 100), key=lambda x: x[0])[:2]
        for ie, (territory, pid), m in weakest:
            lost = (m["pm_prev"] - m["pm"]) / 100 * m["market"]
            zones.append(SalesInsight(
                kind="zone_a_surveiller", title=f"Surveiller {products[pid].brand_name} à {territory}",
                why=[f"Part de marché {_pct(m['pm'])} contre {_pct(m['pm_prev'])} l'an dernier (indice d'évolution {ie:.0f})",
                     "Légère baisse : pas encore une alerte, mais à suivre"],
                territory=territory, product_id=pid, impact=round(lost)))

    # Médecins à revoir dans les zones prioritaires
    doctor_insights = []
    if zones:
        doctors = list(db.scalars(
            select(Doctor).where(Doctor.delegue_id.in_(ids), Doctor.territory.in_({z.territory for z in zones}),
                                 Doctor.segment.in_(["A", "B"]))
            .options(selectinload(Doctor.prescriptions))))
        last = last_visit_dates(db, [d.id for d in doctors])
        today = now().date()
        seen = set()
        for z in zones:
            p = products[z.product_id]
            for d in doctors:
                if d.territory != z.territory or d.specialty not in p.target_specialties or d.id in seen:
                    continue
                status = next((ps.status for ps in d.prescriptions if ps.product_id == p.id),
                              PrescribingStatus.NON_PRESCRIPTEUR)
                if status == PrescribingStatus.REGULIER:
                    continue
                days = (today - last[d.id].date()).days if d.id in last else None
                if days is not None and days < RECENT_DAYS:
                    continue
                why = [f"{d.specialty}, potentiel {d.segment}, {HABIT[PrescribingStatus(status)]} {p.brand_name}",
                       f"{p.brand_name} perd des parts à {d.territory}"]
                why.append(f"Dernière visite il y a {days} jours" if days is not None else "Jamais visité")
                impact = z.impact * (1.5 if d.segment == "A" else 1) * (1 + min(days or 90, 90) / 90)
                doctor_insights.append(SalesInsight(kind="medecin_a_revoir", title=f"{d.full_name} ({d.district})",
                                                    why=why, territory=d.territory, product_id=p.id,
                                                    doctor_id=d.id, impact=round(impact)))
                seen.add(d.id)
        doctor_insights.sort(key=lambda x: -x.impact)
        doctor_insights = doctor_insights[:6]

    if zones and zones[0].kind == "zone_a_prioriser":
        top = zones[0]
        summary = (f"Priorité : {products[top.product_id].brand_name} à {top.territory}, où il perd le plus de parts. "
                   f"{len(doctor_insights)} médecins à revoir pour regagner du terrain.")
    if zones and zones[0].kind == "zone_a_surveiller":
        summary = (f"Aucun produit ne perd nettement de parts sur vos territoires. À surveiller : "
                   f"{products[zones[0].product_id].brand_name} à {zones[0].territory}.")
    elif not zones:
        summary = "Aucun produit ne perd nettement de parts de marché sur vos territoires : continuer ainsi."
    if growth:
        summary += f" Bonne nouvelle : {products[growth[0].product_id].brand_name} progresse à {growth[0].territory}."
    return SalesInsights(period_label=label, summary=summary, zones=zones, growth=growth, doctors=doctor_insights)
