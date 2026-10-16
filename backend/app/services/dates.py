"""Fonctions utilitaires sur les dates (mois, jours ouvrés, semaines)."""
from datetime import date, datetime, timedelta

MONTHS_FR = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]


def now() -> datetime:
    """Heure actuelle (point unique, pratique si on veut « figer » la date de démo)."""
    return datetime.now().replace(microsecond=0)


def period_of(d: date | datetime) -> str:
    """date(2026, 10, 16) -> "2026-10"."""
    return f"{d.year:04d}-{d.month:02d}"


def period_label(period: str) -> str:
    """"2026-10" -> "octobre 2026"."""
    year, month = period.split("-")
    return f"{MONTHS_FR[int(month) - 1]} {year}"


def month_bounds(period: str) -> tuple[datetime, datetime]:
    """Renvoie [début, fin[ du mois : ("2026-10") -> (1er oct. 00:00, 1er nov. 00:00)."""
    year, month = (int(x) for x in period.split("-"))
    start = datetime(year, month, 1)
    end = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
    return start, end


def previous_periods(period: str, count: int) -> list[str]:
    """Les `count` derniers mois jusqu'à `period` inclus, du plus ancien au plus récent."""
    year, month = (int(x) for x in period.split("-"))
    result = []
    for _ in range(count):
        result.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return list(reversed(result))


def is_working_day(d: date) -> bool:
    """Lundi à vendredi (les jours fériés ne sont pas gérés dans la démo)."""
    return d.weekday() < 5


def working_days_between(start: date, end: date) -> int:
    """Nombre de jours ouvrés dans [start, end] (bornes incluses)."""
    days = 0
    current = start
    while current <= end:
        if is_working_day(current):
            days += 1
        current += timedelta(days=1)
    return days


def elapsed_fraction(period: str, today: date) -> float:
    """
    Part du mois déjà écoulée, en jours ouvrés (0.0 → 1.0).
    Sert à calculer l'objectif « au prorata » : à mi-mois, on attend ~50 % de l'objectif.
    """
    start, end = month_bounds(period)
    last_day = (end - timedelta(days=1)).date()
    if today < start.date():
        return 0.0
    if today > last_day:
        return 1.0
    total = working_days_between(start.date(), last_day)
    elapsed = working_days_between(start.date(), today)
    return elapsed / total if total else 1.0


def week_start(d: date) -> date:
    """Lundi de la semaine contenant `d`."""
    return d - timedelta(days=d.weekday())
