/**
 * Tests du catalogue médicaments (logique pure, sans navigateur).
 * Lancer : `npm test` dans le dossier frontend.
 */
import { describe, expect, it } from "vitest";

import type { Product } from "@/api/types";
import { filterProducts, gammesOf, packshotUrl, productSlug, wrapIndex } from "@/lib/catalogue";

/** Produit minimal pour les tests. */
function product(id: number, brand_name: string, molecule: string, product_line: string, extra: Partial<Product> = {}): Product {
  return {
    id,
    brand_name,
    molecule,
    therapeutic_class: "",
    business_unit: "chronique",
    product_line,
    form_dosage: "",
    description: null,
    indications: [],
    key_messages: [],
    target_specialties: [],
    documents: [],
    ...extra,
  };
}

const CATALOGUE = [
  product(1, "Cardiovex", "Amlodipine", "CARDIO", { indications: ["Hypertension artérielle"] }),
  product(2, "Statilia", "Atorvastatine", "CARDIO"),
  product(3, "Gastrozen", "Oméprazole", "GASTRO", { target_specialties: ["Gastro-entérologue"] }),
];

describe("filterProducts", () => {
  it("renvoie tout sans filtre", () => {
    expect(filterProducts(CATALOGUE, null, "")).toHaveLength(3);
  });

  it("filtre par gamme", () => {
    expect(filterProducts(CATALOGUE, "CARDIO", "").map((p) => p.brand_name)).toEqual(["Cardiovex", "Statilia"]);
  });

  it("cherche sans tenir compte des accents ni des majuscules", () => {
    expect(filterProducts(CATALOGUE, null, "OMEPRAZOLE").map((p) => p.id)).toEqual([3]);
  });

  it("cherche aussi dans les indications et les spécialités", () => {
    expect(filterProducts(CATALOGUE, null, "hypertension").map((p) => p.id)).toEqual([1]);
    expect(filterProducts(CATALOGUE, null, "gastro-enterologue").map((p) => p.id)).toEqual([3]);
  });

  it("combine gamme et recherche (tous les mots doivent être trouvés)", () => {
    expect(filterProducts(CATALOGUE, "GASTRO", "amlodipine")).toEqual([]);
    expect(filterProducts(CATALOGUE, null, "statilia atorva").map((p) => p.id)).toEqual([2]);
  });
});

describe("gammesOf", () => {
  it("compte les produits par gamme avec un libellé lisible", () => {
    expect(gammesOf(CATALOGUE)).toEqual([
      { code: "CARDIO", label: "Cardiologie", count: 2 },
      { code: "GASTRO", label: "Gastro-entérologie", count: 1 },
    ]);
  });
});

describe("visuels", () => {
  it("transforme le nom commercial en nom de fichier", () => {
    expect(productSlug("Gastrozen")).toBe("gastrozen");
    expect(productSlug("Écho Plus")).toBe("echo-plus");
  });

  it("pointe vers l'image générée si elle existe, sinon rien (boîte dessinée)", () => {
    expect(packshotUrl({ brand_name: "Cardiovex" })).toBe("/products/cardiovex.webp");
    expect(packshotUrl({ brand_name: "Inconnu" })).toBeNull();
  });
});

describe("wrapIndex (mode présentation)", () => {
  it("boucle aux deux extrémités", () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(1, 3)).toBe(1);
  });
});
