"""
Analyse des ventes (données de marché type IMS, fictives), avec les formules des laboratoires :

- Part de marché (PM)        = ventes du produit × 100 / ventes du marché
- Quota produit (QP)         = ventes locales du produit × 100 / ventes nationales du produit
- Quota marché (QM)          = ventes locales du marché × 100 / ventes nationales du marché
- Indice d'évolution (IE)    = PM période n × 100 / PM période n-1   (> 100 : gain de parts de marché)
- Indice de pénétration (IP) = PM locale × 100 / PM nationale        (> 100 : mieux implanté qu'au national)
- Évolution des ventes       = (ventes n / ventes n-1 − 1) × 100     (même chose pour le marché)

La période n est le cumul depuis janvier (YTD) ou un mois donné ; n-1 = les mêmes mois de l'année
précédente. Les données arrivent avec un mois de décalage (le mois en cours n'est jamais disponible).
"""
from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import MarketProduct, Product, SalesRecord, User
from app.models.enums import Role
from app.schemas.sales import (
    CompetitorSales,
    DelegateSales,
    MonthSales,
    ProductChoice,
    SalesMetrics,
    SalesOut,
    TerritorySales,
)
from app.seed_data.territories import territories_of_region
from app.services import access
from app.services.dates import MONTHS_FR, period_label, previous_periods


def _ratio(a: float, b: float) -> float | None:
    return round(100 * a / b, 2) if b else None


def _evol(a: float, b: float) -> float | None:
    return round(100 * (a / b - 1), 2) if b else None


def _shift_year(period: str, years: int = -1) -> str:
    return f"{int(period[:4]) + years:04d}{period[4:]}"


class _Sums:
    """Ventes agrégées : valeur[(territoire, nôtre ?, mois)] → montant, pour des calculs rapides."""

    def __init__(self, rows):
        self.data: dict[tuple[str, bool, str], float] = defaultdict(float)
        for territory, ours, period, value in rows:
            self.data[(territory, ours, period)] += value

    def total(self, territories: set[str] | None, ours: bool | None, months: list[str]) -> float:
        return sum(
            v for (t, o, p), v in self.data.items()
            if p in months and (territories is None or t in territories) and (ours is None or o == ours)
        )


def _metrics(s: _Sums, territories: set[str] | None, cur: list[str], prev: list[str],
             national: tuple[float, float, float | None]) -> SalesMetrics:
    """Indicateurs d'un périmètre ; `national` = (ventes produit, ventes marché, PM) au national."""
    value, value_prev = s.total(territories, True, cur), s.total(territories, True, prev)
    market, market_prev = s.total(territories, None, cur), s.total(territories, None, prev)
    nat_value, nat_market, nat_pm = national
    pm, pm_prev = _ratio(value, market), _ratio(value_prev, market_prev)
    return SalesMetrics(
        value=round(value), value_prev=round(value_prev),
        market_value=round(market), market_value_prev=round(market_prev),
        qp=_ratio(value, nat_value), qm=_ratio(market, nat_market),
        pm=pm, pm_prev=pm_prev,
        ie=_ratio(pm, pm_prev) if pm is not None and pm_prev else None,
        ip=_ratio(pm, nat_pm) if pm is not None and nat_pm else None,
        evol=_evol(value, value_prev), evol_market=_evol(market, market_prev),
    )


def last_available_month(db: Session) -> str:
    last = db.scalar(select(func.max(SalesRecord.period)))
    if last is None:
        raise HTTPException(404, "Aucune donnée de ventes : relancez le seed")
    return last


def _months_for(period: str, last_month: str) -> tuple[list[str], list[str], str, str]:
    """Mois de la période n, de la période n-1, et leurs libellés."""
    if period == "ytd":
        cur = previous_periods(last_month, int(last_month[5:]))
        first, last = MONTHS_FR[int(cur[0][5:]) - 1], MONTHS_FR[int(cur[-1][5:]) - 1]
        year = int(last_month[:4])
        label = f"Cumul {first} → {last} {year}" if len(cur) > 1 else f"Cumul {last} {year}"
        compare = f"{first} → {last} {year - 1}" if len(cur) > 1 else f"{last} {year - 1}"
    else:
        cur = [period]
        label, compare = period_label(period).capitalize(), period_label(_shift_year(period))
    return cur, [_shift_year(p) for p in cur], label, compare


def _scope_delegates(db: Session, user: User, delegue_id: int | None) -> list[User]:
    ids = access.resolve_delegue_ids(db, user, delegue_id)
    return list(db.scalars(select(User).where(User.id.in_(ids)).order_by(User.name)))


def sales_analysis(db: Session, user: User, product_id: int | None = None, period: str = "ytd",
                   delegue_id: int | None = None) -> SalesOut:
    """Analyse des ventes d'un produit (ou de tout le portefeuille) sur le périmètre de l'utilisateur."""
    last_month = last_available_month(db)
    months = list(reversed(previous_periods(last_month, 12)))
    if period != "ytd" and period not in months:
        raise HTTPException(400, "Mois non disponible")
    cur, prev, label, compare = _months_for(period, last_month)

    products = list(db.scalars(select(Product).order_by(Product.brand_name)))
    ours = {mp.product_id: mp for mp in db.scalars(select(MarketProduct).where(MarketProduct.product_id.isnot(None)))}
    if product_id is not None and product_id not in ours:
        raise HTTPException(404, "Produit sans données de marché")
    market_codes = [ours[product_id].market_code] if product_id else [mp.market_code for mp in ours.values()]

    # Toutes les ventes utiles (périodes n et n-1, + 12 mois pour le graphique), agrégées en mémoire
    needed = sorted(set(cur) | set(prev) | set(months))
    rows = db.execute(
        select(SalesRecord.territory, MarketProduct.product_id.isnot(None), SalesRecord.period,
               SalesRecord.value, MarketProduct.id)
        .join(MarketProduct, MarketProduct.id == SalesRecord.market_product_id)
        .where(MarketProduct.market_code.in_(market_codes), SalesRecord.period.in_(needed))
    ).all()
    sums = _Sums((t, bool(o), p, v) for t, o, p, v, _ in rows)

    nat_value, nat_market = sums.total(None, True, cur), sums.total(None, None, cur)
    national_ref = (nat_value, nat_market, _ratio(nat_value, nat_market))
    national = _metrics(sums, None, cur, prev, national_ref)

    delegates = _scope_delegates(db, user, delegue_id)
    delegate_rows, scope_territories = [], set()
    for d in delegates:
        territories = territories_of_region(d.region)
        scope_territories |= set(territories)
        delegate_rows.append(DelegateSales(
            delegue_id=d.id, name=d.name, region=d.region,
            **_metrics(sums, set(territories), cur, prev, national_ref).model_dump(),
            territories=[
                TerritorySales(territory=t, **_metrics(sums, {t}, cur, prev, national_ref).model_dump())
                for t in territories
            ],
        ))
    scope = _metrics(sums, scope_territories, cur, prev, national_ref)

    # Concurrents (et nos produits) sur le périmètre affiché
    by_product: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    market_by_code: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    entries = {mp.id: mp for mp in db.scalars(select(MarketProduct).where(MarketProduct.market_code.in_(market_codes)))}
    for t, _, p, v, mp_id in rows:
        if t in scope_territories:
            key = "cur" if p in cur else "prev" if p in prev else None
            if key:
                by_product[mp_id][key] += v
                market_by_code[entries[mp_id].market_code][key] += v
    competitors = []
    for mp_id, mp in entries.items():
        v = by_product[mp_id]
        m = market_by_code[mp.market_code]
        pm, pm_prev = _ratio(v["cur"], m["cur"]), _ratio(v["prev"], m["prev"])
        competitors.append(CompetitorSales(
            name=mp.name, laboratory=mp.laboratory, market_name=mp.market_name, is_ours=mp.product_id is not None,
            value=round(v["cur"]), pm=pm, evol=_evol(v["cur"], v["prev"]),
            ie=_ratio(pm, pm_prev) if pm is not None and pm_prev else None,
        ))
    competitors.sort(key=lambda c: (c.market_name, -c.value))

    monthly = []
    for p in reversed(months):
        value, market = sums.total(scope_territories, True, [p]), sums.total(scope_territories, None, [p])
        monthly.append(MonthSales(period=p, label=period_label(p), value=round(value), market_value=round(market),
                                  pm=_ratio(value, market)))

    product = next((p for p in products if p.id == product_id), None)
    return SalesOut(
        product_id=product_id,
        product_name=product.brand_name if product else "Tout le portefeuille",
        market_name=ours[product_id].market_name if product_id else "Marchés de nos 10 produits",
        period=period,
        period_label=label,
        compare_label=compare,
        last_month=last_month,
        national=national,
        scope_label=delegates[0].name if user.role == Role.DELEGUE or len(delegates) == 1 else "Équipe",
        scope=scope,
        delegates=delegate_rows,
        competitors=competitors,
        monthly=monthly,
        months=months,
        products=[ProductChoice(id=p.id, name=p.brand_name, market_name=ours[p.id].market_name)
                  for p in products if p.id in ours],
    )


# ---------------------------------------------------------------------------
# Pour le copilote (recommandations) : produits qui perdent des parts de marché
# ---------------------------------------------------------------------------

def evolution_index_by_territory(db: Session) -> dict[tuple[str, int], float]:
    """{(territoire, product_id): indice d'évolution YTD} — < 100 = le produit perd des parts de marché."""
    try:
        last_month = last_available_month(db)
    except HTTPException:
        return {}
    cur, prev, _, _ = _months_for("ytd", last_month)
    data: dict[tuple[str, str, str], dict[str, float]] = defaultdict(lambda: defaultdict(float))
    rows = db.execute(
        select(SalesRecord.territory, MarketProduct.market_code, MarketProduct.product_id,
               SalesRecord.period, SalesRecord.value)
        .join(MarketProduct, MarketProduct.id == SalesRecord.market_product_id)
        .where(SalesRecord.period.in_(cur + prev))
    )
    for territory, code, product_id, period, value in rows:
        key = "cur" if period in cur else "prev"
        data[(territory, code, "marche")][key] += value
        if product_id is not None:
            data[(territory, code, str(product_id))][key] += value
    result = {}
    for (territory, code, who), v in data.items():
        m = data[(territory, code, "marche")]
        if who != "marche" and m["cur"] and m["prev"] and v["prev"]:
            result[(territory, int(who))] = round(100 * (v["cur"] / m["cur"]) / (v["prev"] / m["prev"]), 1)
    return result


# ---------------------------------------------------------------------------
# Objectifs de ventes par produit et zones à fort potentiel (page « Analyse des ventes »)
# ---------------------------------------------------------------------------
# Objectif de DÉMONSTRATION (fictif) : ventes de l'an dernier sur les mêmes mois + une croissance demandée.
GROWTH_TARGET = {"chronique": 10.0, "aigue": 8.0}
NEAR_PCT = 98   # entre 98 et 100 % de l'objectif : « proche »


def _fr(x: float, digits: int = 1) -> str:
    """12.34 → « 12,3 » (virgule décimale, comme dans l'interface)."""
    return f"{x:.{digits}f}".replace(".", ",")


def _fr_money(value: float) -> str:
    """Montant lisible : « 18,1 M DH », « 612 k DH »."""
    if abs(value) >= 1_000_000:
        return f"{_fr(value / 1_000_000)} M DH"
    if abs(value) >= 1_000:
        return f"{round(value / 1000)} k DH"
    return f"{round(value)} DH"


def scorecard(db: Session, user: User, delegue_id: int | None = None) -> "SalesScorecard":
    from app.models import Doctor
    from app.models.enums import PrescribingStatus
    from app.schemas.sales import PmPoint, ProductScore, SalesScorecard, TerritoryPotential
    from sqlalchemy.orm import selectinload

    last_month = last_available_month(db)
    cur, prev, label, _ = _months_for("ytd", last_month)
    months = list(reversed(previous_periods(last_month, 12)))
    delegates = _scope_delegates(db, user, delegue_id)
    scope = {t for d in delegates for t in territories_of_region(d.region)}
    ids = [d.id for d in delegates]

    products = {p.id: p for p in db.scalars(select(Product))}
    entries = list(db.scalars(select(MarketProduct)))
    ours = {mp.product_id: mp for mp in entries if mp.product_id is not None}
    code_of = {mp.id: mp.market_code for mp in entries}
    # ventes[(territoire, code marché, product_id ou 0 = tout le marché, mois)]
    sums: dict[tuple[str, str, int, str], float] = defaultdict(float)
    for territory, mp_id, pid, period, value in db.execute(
        select(SalesRecord.territory, SalesRecord.market_product_id, MarketProduct.product_id,
               SalesRecord.period, SalesRecord.value)
        .join(MarketProduct, MarketProduct.id == SalesRecord.market_product_id)
        .where(SalesRecord.period.in_(sorted(set(cur) | set(prev) | set(months))))
    ):
        code = code_of[mp_id]
        sums[(territory, code, 0, period)] += value
        if pid is not None:
            sums[(territory, code, pid, period)] += value

    def total(territories, code, pid, periods) -> float:
        return sum(v for (t, c, p, m), v in sums.items()
                   if c == code and p == pid and m in periods and (territories is None or t in territories))

    rows = []
    for pid, mp in ours.items():
        p = products[pid]
        value, value_prev = total(scope, mp.market_code, pid, cur), total(scope, mp.market_code, pid, prev)
        market, market_prev = total(scope, mp.market_code, 0, cur), total(scope, mp.market_code, 0, prev)
        growth = GROWTH_TARGET.get(p.business_unit, 7.0)
        objective = value_prev * (1 + growth / 100)
        attainment = round(100 * value / objective, 1) if objective else 0.0
        pm, pm_prev = _ratio(value, market), _ratio(value_prev, market_prev)
        status = "atteint" if attainment >= 100 else "proche" if attainment >= NEAR_PCT else "en_retard"
        evol = _evol(value, value_prev)
        why = (f"Objectif : ventes de l'an dernier + {growth:g} %. Réalisé : {attainment:.0f} % "
               f"(ventes {'+' if (evol or 0) >= 0 else ''}{_fr(evol or 0)} % sur un an")
        why += f", part de marché {_fr(pm)} % contre {_fr(pm_prev)} %)." if pm is not None and pm_prev else ")."
        rows.append(ProductScore(
            product_id=pid, name=p.brand_name, market_name=mp.market_name, value=round(value),
            objective=round(objective), growth_target_pct=growth, attainment_pct=attainment, status=status,
            pm=pm, pm_prev=pm_prev, ie=_ratio(pm, pm_prev) if pm is not None and pm_prev else None,
            pm_series=[PmPoint(period=m, pm=_ratio(total(scope, mp.market_code, pid, [m]),
                                                   total(scope, mp.market_code, 0, [m]))) for m in reversed(months)],
            why=why,
        ))
    rows.sort(key=lambda r: r.attainment_pct)

    # Zones à fort potentiel : ventes à conquérir si notre part rejoignait la part nationale, marché par marché
    doctors = list(db.scalars(select(Doctor).where(Doctor.delegue_id.in_(ids), Doctor.segment.in_(["A", "B"]))
                              .options(selectinload(Doctor.prescriptions))))
    territories = []
    for t in sorted(scope):
        market_t, ours_t, gap, nat_parts = 0.0, 0.0, 0.0, []
        for pid, mp in ours.items():
            m = total({t}, mp.market_code, 0, cur)
            v = total({t}, mp.market_code, pid, cur)
            nat_pm = total(None, mp.market_code, pid, cur) / (total(None, mp.market_code, 0, cur) or 1)
            market_t += m
            ours_t += v
            gap += max(0.0, nat_pm * m - v)
            nat_parts.append((nat_pm * m, m))
        national_pm = _ratio(sum(a for a, _ in nat_parts), sum(b for _, b in nat_parts))
        pm = _ratio(ours_t, market_t)
        docs = [d for d in doctors if d.territory == t]
        non_presc = sum(1 for d in docs if not any(ps.status == PrescribingStatus.REGULIER for ps in d.prescriptions))
        why = [f"Marché local : {_fr_money(market_t)} depuis janvier",
               (f"Notre part : {_fr(pm)} % contre {_fr(national_pm)} % au national" if pm is not None and national_pm
                else "Part de marché non disponible"),
               f"{len(docs)} médecins A ou B, dont {non_presc} ne prescrivent encore aucun de nos produits régulièrement"]
        territories.append(TerritoryPotential(
            territory=t, market_value=round(market_t), pm=pm, national_pm=national_pm,
            ip=_ratio(pm, national_pm) if pm is not None and national_pm else None,
            gap_value=round(gap), doctors_ab=len(docs), non_prescribers=non_presc,
            score=round(gap / 1000 + non_presc * 2, 1), why=why,
        ))
    territories.sort(key=lambda x: -x.score)

    late = [r for r in rows if r.status == "en_retard"]
    summary = (f"{len(late)} produit{'s' if len(late) > 1 else ''} en retard sur l'objectif"
               + (f" ({', '.join(r.name for r in late[:3])})" if late else "")
               + (f". Territoire au plus fort potentiel : {territories[0].territory}, environ "
                  f"{_fr_money(territories[0].gap_value)} à conquérir." if territories else "."))
    return SalesScorecard(
        period_label=label,
        objective_rule=("Objectifs fictifs de démonstration : ventes des mêmes mois de l'an dernier + 10 % "
                        "(produits chroniques) ou + 8 % (produits aigus)."),
        products=rows, territories=territories[:6], summary=summary,
    )
