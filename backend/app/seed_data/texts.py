"""
Textes « terrain » utilisés pour générer des comptes-rendus crédibles.

`{p}` est remplacé par le nom du produit présenté, `{slot}` par un créneau.
"""

# Commentaires libres par catégorie d'objection (voir enums.OBJECTION_CATEGORIES)
OBJECTION_COMMENTS: dict[str, list[str]] = {
    "prix_eleve": [
        "Trouve {p} trop cher pour ses patients sans couverture médicale",
        "Prix trop élevé par rapport au générique, surtout pour un traitement au long cours",
        "Ses patients RAMED / AMO Tadamon ne peuvent pas suivre à ce prix",
    ],
    "prefere_generique": [
        "Le patient préfère le générique, moins cher en pharmacie",
        "Le pharmacien substitue systématiquement par le générique",
        "Prescrit en DCI, laisse le choix au pharmacien",
    ],
    "concurrent_satisfaisant": [
        "Pas de rupture chez le concurrent, aucune raison de changer",
        "Satisfait du produit concurrent, bons retours patients",
        "Le concurrent est passé la semaine dernière avec des échantillons",
    ],
    "etudes_locales": [
        "Besoin d'études cliniques locales sur la population marocaine",
        "Demande des données d'efficacité publiées récentes",
        "Veut voir une étude comparative face au leader",
    ],
    "effets_indesirables": [
        "Craint les œdèmes des membres inférieurs à forte dose",
        "Inquiet de la tolérance digestive chez les patients âgés",
        "A eu des retours de patients sur des troubles digestifs",
    ],
    "remboursement": [
        "Taux de remboursement CNOPS jugé insuffisant",
        "Patients se plaignent du reste à charge AMO",
    ],
    "disponibilite": [
        "Produit souvent introuvable dans les pharmacies du quartier",
        "Rupture signalée par deux pharmacies voisines le mois dernier",
    ],
    "habitudes": [
        "Habitué à son traitement actuel depuis des années",
        "Ne change pas un traitement qui marche chez ses patients stabilisés",
    ],
    "posologie": [
        "Préférerait une forme à prise unique quotidienne",
        "La forme sirop n'est pas pratique pour les grands enfants",
    ],
}

# Notes libres d'une visite réalisée (tonalité positive / neutre / réservée)
NOTES_POSITIVE = [
    "Médecin très réceptif, a demandé la documentation complète sur {p}.",
    "Confirme prescrire {p} régulièrement, bons retours de ses patients.",
    "Bonne discussion scientifique, intéressé par les nouveaux dosages de {p}.",
    "A accepté de tester {p} chez ses nouveaux patients ce mois-ci.",
    "Très bon accueil. Souhaite être invité à la prochaine soirée scientifique.",
    "Le docteur a cité {p} comme son premier choix dans cette indication.",
    "Échange de 15 min au calme, a posé plusieurs questions sur la posologie de {p}.",
]
NOTES_NEUTRAL = [
    "Salle d'attente pleine, entretien écourté. Message clé sur {p} passé rapidement.",
    "Visite rapide entre deux consultations, a pris les échantillons.",
    "Le docteur écoute mais reste sur ses habitudes de prescription.",
    "Vu en fin de consultation, à revoir avec l'étude clinique.",
    "La secrétaire conseille de passer plutôt {slot}, moins d'attente.",
    "Discussion courte, demande de repasser après la période de garde.",
    "Rencontré au cabinet, son associé était aussi présent : à ajouter dans la base.",
]
NOTES_RESERVED = [
    "Peu disponible, réticent face aux visites médicales cette période.",
    "Pas convaincu par {p}, reste fidèle au concurrent.",
    "Accueil froid, a rappelé qu'il ne reçoit les délégués que sur rendez-vous.",
    "Le docteur estime que {p} n'apporte rien de plus que le générique.",
]

NEXT_STEPS = [
    "Remettre l'étude comparative de {p}",
    "Apporter des échantillons de {p}",
    "Inviter à la soirée scientifique du mois prochain",
    "Présenter le nouveau dosage de {p}",
    "Faire le point sur les retours patients sous {p}",
    "Organiser un staff avec l'équipe de la clinique",
    "Relancer sur la prescription de {p} chez les nouveaux patients",
    "Apporter le support promotionnel mis à jour",
]

CANCEL_REASONS = [
    "Médecin absent (congé)",
    "Rendez-vous annulé par le secrétariat",
    "Urgence à l'hôpital, médecin indisponible",
    "Cabinet fermé exceptionnellement",
    "Médecin en formation (congrès)",
    "Retard sur la tournée, visite reportée",
]

# Notes contenant volontairement une mention d'effet indésirable.
# Elles serviront à démontrer le futur module de pharmacovigilance
# (app/ai/pharmacovigilance.py). Liste reprise dans seed_duplicates.md.
PHARMACOVIGILANCE_NOTES: list[tuple[str, str]] = [
    ("Amoxira", "Le docteur signale qu'une patiente de 34 ans a présenté une éruption cutanée avec démangeaisons 2 jours après le début d'Amoxira. Traitement arrêté."),
    ("Cardiovex", "Mentionne deux patients âgés avec œdèmes des chevilles importants sous Cardiovex 10 mg, il a réduit la dose à 5 mg."),
    ("Glucanor", "Un patient se plaint de diarrhées persistantes sous Glucanor 1000 mg depuis 3 semaines, le médecin envisage la forme LP."),
    ("Statilia", "Le Dr rapporte des douleurs musculaires intenses chez un patient de 61 ans sous Statilia 40 mg, CPK demandées."),
    ("Artrinol", "Patient hospitalisé pour douleurs épigastriques et méléna après 10 jours d'Artrinol sans protection gastrique."),
    ("Respiflow", "Une maman rapporte des palpitations et tremblements chez son enfant de 7 ans après plusieurs bouffées de Respiflow."),
    ("Gestavia", "Une patiente enceinte se plaint de constipation et nausées importantes sous Gestavia, la gynécologue hésite à continuer."),
]
