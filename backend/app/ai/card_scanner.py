"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°4 — SCAN DE CARTE DE VISITE + DÉTECTION DE DOUBLONS            ║
║  Statut : à implémenter                                              ║
╚══════════════════════════════════════════════════════════════════════╝

Objectif
    Photographier la carte de visite d'un médecin pour créer sa fiche, en
    signalant s'il existe déjà (même médecin écrit autrement).

Données de test
    10 paires de quasi-doublons dans la base (Mohammed El Amrani / Mohamed Elamrani,
    Ouazzani / Wazzani, Benjelloun / Ben Jelloun...) : voir /seed_duplicates.md.

Pipeline proposé
    1. `read_card(image)` : OCR (Tesseract, PaddleOCR, ou modèle vision) → texte brut,
       puis extraction des champs (nom, spécialité, adresse, téléphone, email).
    2. `find_duplicates(doctor)` : comparer aux médecins existants :
       - téléphone normalisé (garder les 9 derniers chiffres : +212 522-251478 = 05 22 25 14 78),
       - nom normalisé (minuscules, sans accents ni espaces, « el »/« ben » détachés),
       - similarité phonétique / distance d'édition (Mohammed ~ Mohamed, Sqalli ~ Skalli).
       Utiliser `doctor_service.list_doctors` pour respecter le périmètre de l'utilisateur.
    3. Le frontend pré-remplit le formulaire « Nouveau médecin » (source="carte_de_visite")
       et affiche les doublons possibles avant l'enregistrement.

Côté frontend
    Bouton « 📷 Scanner une carte de visite » (désactivé) dans
    frontend/src/pages/doctors/DoctorFormPage.tsx.
"""
from sqlalchemy.orm import Session

from app.ai.schemas import CardScanRequest, CardScanResult, DuplicateMatch
from app.models import User
from app.schemas.doctor import DoctorBase


def read_card(image_base64: str) -> tuple[str, DoctorBase]:
    """Image → (texte brut, champs du médecin). À implémenter."""
    raise NotImplementedError("Lecture de carte de visite non implémentée")


def find_duplicates(db: Session, user: User, doctor: DoctorBase) -> list[DuplicateMatch]:
    """Cherche les médecins existants qui ressemblent à `doctor`. À implémenter."""
    raise NotImplementedError("Détection de doublons non implémentée")


def scan_card(db: Session, user: User, request: CardScanRequest) -> CardScanResult:
    """Point d'entrée appelé par l'API."""
    raw_text, doctor = read_card(request.image_base64)
    return CardScanResult(raw_text=raw_text, doctor=doctor, duplicates=find_duplicates(db, user, doctor))
