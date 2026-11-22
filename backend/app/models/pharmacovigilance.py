"""
Cas de pharmacovigilance : un effet indésirable ou une « situation particulière »
repéré dans un compte-rendu de visite, à déclarer à l'équipe de pharmacovigilance
du laboratoire DANS LES 24 HEURES.

Cycle de vie :
    a_declarer ──(le délégué relit la déclaration pré-remplie et l'envoie)──► declaree

Chaque cas est lié à une alerte « pharmacovigilance » (affichée dans le tableau de bord) :
quand le cas est déclaré, l'alerte passe en « traitée ».

Les 4 informations minimales de la procédure :
    1. un produit du laboratoire         → product_id (product_in_text = cité dans la phrase)
    2. un effet ou une situation          → event + situations
    3. un patient identifiable            → patient_details (âge, sexe, initiales...)
    4. un notificateur identifiable       → le médecin de la visite (doctor_id)
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PharmacovigilanceCase(Base):
    __tablename__ = "pv_cases"

    id: Mapped[int] = mapped_column(primary_key=True)
    alert_id: Mapped[int | None] = mapped_column(ForeignKey("alerts.id"), unique=True)
    visit_id: Mapped[int] = mapped_column(ForeignKey("visits.id"), index=True)
    delegue_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctors.id"))
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"))
    # True si le produit est nommé dans la phrase ; False s'il est déduit des produits présentés
    product_in_text: Mapped[bool] = mapped_column(Boolean, default=True)

    kind: Mapped[str] = mapped_column(String(30))              # enums.PvCaseKind
    event: Mapped[str] = mapped_column(String(200))            # ex. « éruption cutanée, démangeaisons »
    situations: Mapped[str] = mapped_column(String(200), default="")  # codes enums.PvSituation, séparés par « , »
    seriousness: Mapped[str] = mapped_column(String(20))       # "non_grave" | "grave"
    excerpt: Mapped[str] = mapped_column(Text)                 # phrase du compte-rendu
    patient_details: Mapped[str | None] = mapped_column(String(200))  # ex. « femme, 34 ans »

    # Délai de 24 h : il court à partir du moment où le délégué a eu l'information (la visite)
    known_at: Mapped[datetime] = mapped_column(DateTime)
    deadline_at: Mapped[datetime] = mapped_column(DateTime)

    status: Mapped[str] = mapped_column(String(20), default="a_declarer", index=True)  # enums.PvCaseStatus
    declared_at: Mapped[datetime | None] = mapped_column(DateTime)
    declared_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    declaration_text: Mapped[str | None] = mapped_column(Text)  # texte effectivement envoyé
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    visit: Mapped["Visit"] = relationship()  # noqa: F821
    doctor: Mapped["Doctor"] = relationship()  # noqa: F821
    product: Mapped["Product | None"] = relationship()  # noqa: F821
    delegue: Mapped["User"] = relationship(foreign_keys=[delegue_id])  # noqa: F821
    declared_by: Mapped["User | None"] = relationship(foreign_keys=[declared_by_id])  # noqa: F821

    @property
    def situation_codes(self) -> list[str]:
        return [c for c in (self.situations or "").split(",") if c]
