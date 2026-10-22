"""Produit du laboratoire et documents associés (RCP, notice, supports)."""
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    brand_name: Mapped[str] = mapped_column(String(80))           # nom commercial (fictif)
    molecule: Mapped[str] = mapped_column(String(120))            # DCI
    therapeutic_class: Mapped[str] = mapped_column(String(120))
    business_unit: Mapped[str] = mapped_column(String(20), default="chronique")  # enums.BusinessUnit
    product_line: Mapped[str] = mapped_column(String(30), default="")            # gamme (ex. « CARDIO »)
    form_dosage: Mapped[str] = mapped_column(String(200))         # forme et dosages
    description: Mapped[str | None] = mapped_column(Text)
    # Listes stockées en JSON (SQLite les garde sous forme de texte)
    indications: Mapped[list[str]] = mapped_column(JSON, default=list)
    key_messages: Mapped[list[str]] = mapped_column(JSON, default=list)
    # Spécialités ciblées en priorité par ce produit
    target_specialties: Mapped[list[str]] = mapped_column(JSON, default=list)

    documents: Mapped[list["Document"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


class Document(Base):
    """
    Document officiel lié à un produit.
    `file_path` est vide pour l'instant : les PDF seront déposés dans
    /docs/products/ puis indexés par le futur module RAG (app/ai/rag_assistant.py).
    """
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    doc_type: Mapped[str] = mapped_column(String(30))   # enums.DocumentType
    file_path: Mapped[str | None] = mapped_column(String(300))
    version: Mapped[str | None] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    product: Mapped[Product] = relationship(back_populates="documents")
