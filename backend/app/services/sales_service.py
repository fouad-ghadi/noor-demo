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
