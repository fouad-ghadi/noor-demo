"""
╔══════════════════════════════════════════════════════════════════════╗
║  IA n°5 — RECOMMANDATIONS : qui visiter, quand, avec quels produits  ║
║  Statut : à implémenter                                              ║
╚══════════════════════════════════════════════════════════════════════╝

Objectif
    Proposer chaque semaine au délégué une liste priorisée de visites.

Signaux déjà disponibles (couche services)
    - `stats_service.doctors_to_revisit(db, delegue_id)` : médecins A/B non vus depuis 30 j ;
    - `doctor_service.get_doctor_detail(...).slot_stats` : réceptivité par créneau
      (matin / midi / après-midi) calculée sur l'historique ;
    - statuts de prescription par produit (DoctorProductStatus) : cibler les
      « occasionnels » et les « non prescripteurs » des produits de leur spécialité ;
    - objections passées (VisitObjection) : éviter un produit qui a reçu « prix trop élevé »
      trois fois de suite, ou préparer l'argumentaire ;
    - objectifs du mois (objective_service.get_progress) : prioriser les produits en retard.

Approche proposée
    1. Version 1 : score à base de règles, avec des raisons lisibles (`reasons`).
    2. Version 2 : modèle appris (probabilité de visite réussie selon le créneau,
       probabilité de conversion en prescripteur...).
    Toujours expliquer la recommandation : le délégué doit comprendre « pourquoi ».
"""
from sqlalchemy.orm import Session

from app.ai.schemas import VisitRecommendation
from app.models import User


def recommend(db: Session, user: User, delegue_id: int | None = None, limit: int = 10) -> list[VisitRecommendation]:
    """Liste priorisée de visites à faire. À implémenter."""
    raise NotImplementedError("Recommandations non implémentées")
