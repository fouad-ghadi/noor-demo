"""Utilisateur de l'application : délégué médical ou superviseur."""
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), unique=True)
    # ⚠️ DÉMO UNIQUEMENT : mot de passe en clair, pas de vraie sécurité.
    password: Mapped[str] = mapped_column(String(60), default="demo")
    role: Mapped[str] = mapped_column(String(20))          # voir enums.Role
    region: Mapped[str] = mapped_column(String(60))
    phone: Mapped[str | None] = mapped_column(String(30))
    # Pour un délégué : son superviseur. Pour le superviseur : None.
    supervisor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    supervisor: Mapped["User | None"] = relationship(remote_side=[id], back_populates="team")
    team: Mapped[list["User"]] = relationship(back_populates="supervisor")
