/**
 * Logique (sans affichage) du catalogue médicaments : gammes, recherche, visuels.
 * Séparée des composants pour être testée simplement (src/lib/catalogue.test.ts).
 */
import type { Product } from "@/api/types";

/** Libellés lisibles des gammes (codées en majuscules en base, comme dans les rapports IMS). */
export const GAMME_LABELS: Record<string, string> = {
  CARDIO: "Cardiologie",
  METABO: "Métabolisme",
  "ANTI-INFECTIEUX": "Anti-infectieux",
  GASTRO: "Gastro-entérologie",
  PNEUMO: "Pneumologie",
  ANTALGIE: "Douleur et fièvre",
  RHUMATO: "Rhumatologie",
  DERMATO: "Dermatologie",
  GYNECO: "Gynécologie",
};

export const gammeLabel = (code: string) => GAMME_LABELS[code] ?? (code || "Autres");

/**
 * Couleur du bandeau de chaque gamme sur la boîte.
 * Volontairement sourdes (tons verts, bleus, prune) : le safran reste réservé à « maintenant ».
 */
const GAMME_TINTS: Record<string, string> = {
  CARDIO: "#0f3d3e",
  METABO: "#2f6f6a",
  "ANTI-INFECTIEUX": "#355c7d",
  GASTRO: "#4f7a4a",
  PNEUMO: "#3b6e8f",
  ANTALGIE: "#5b5f97",
  RHUMATO: "#6b4f7a",
  DERMATO: "#7a5b55",
  GYNECO: "#8a4f6a",
};
export const gammeTint = (code: string) => GAMME_TINTS[code] ?? "#0f3d3e";

/** Nom de fichier simple à partir du nom commercial (« Cardiovex » → « cardiovex »). */
export function productSlug(brandName: string): string {
  return brandName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Visuels générés (Higgsfield) déposés dans frontend/public/products/.
 * Liste explicite : un produit absent de la liste garde la boîte dessinée en CSS.
 */
export const GENERATED_PACKSHOTS = new Set<string>([
  "cardiovex", "statilia", "glucanor", "amoxira", "gastrozen",
  "respiflow", "calmapyr", "artrinol", "cutalis", "gestavia",
]);

export function packshotUrl(p: Pick<Product, "brand_name">): string | null {
  const slug = productSlug(p.brand_name);
  return GENERATED_PACKSHOTS.has(slug) ? `/products/${slug}.webp` : null;
}

/** Texte en minuscules sans accents, pour une recherche tolérante (« omeprazole » trouve « Oméprazole »). */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Gammes présentes, dans l'ordre d'apparition, avec le nombre de produits. */
export function gammesOf(products: Product[]): { code: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of products) counts.set(p.product_line, (counts.get(p.product_line) ?? 0) + 1);
  return [...counts].map(([code, count]) => ({ code, label: gammeLabel(code), count }));
}

/**
 * Filtre le catalogue : gamme (ou toutes si `null`) + recherche libre sur le nom,
 * la molécule, la classe thérapeutique, les indications et les spécialités ciblées.
 */
export function filterProducts(products: Product[], gamme: string | null, query: string): Product[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return products.filter((p) => {
    if (gamme && p.product_line !== gamme) return false;
    if (words.length === 0) return true;
    const haystack = normalize(
      [p.brand_name, p.molecule, p.therapeutic_class, gammeLabel(p.product_line), ...p.indications, ...p.target_specialties].join(" "),
    );
    return words.every((w) => haystack.includes(w));
  });
}

/** Index suivant / précédent dans le mode présentation (on boucle aux extrémités). */
export function wrapIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return ((index % length) + length) % length;
}
