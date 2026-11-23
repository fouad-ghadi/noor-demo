import { describe, expect, it } from "vitest";

import { appendPhrase } from "./reportPhrases";

describe("appendPhrase", () => {
  it("remplace {p} par le produit présenté", () => {
    expect(appendPhrase("", "Intéressé par {p}.", "Amoxira")).toBe("Intéressé par Amoxira.");
  });
  it("ajoute à la suite des notes existantes", () => {
    expect(appendPhrase("Bon accueil. ", "Intéressé par {p}.")).toBe("Bon accueil. Intéressé par le produit.");
  });
  it("accorde « de {p} » : du produit, d'Amoxira, de Cardiovex", () => {
    const phrase = "Questions sur la posologie de {p}.";
    expect(appendPhrase("", phrase)).toBe("Questions sur la posologie du produit.");
    expect(appendPhrase("", phrase, "Amoxira")).toBe("Questions sur la posologie d'Amoxira.");
    expect(appendPhrase("", phrase, "Cardiovex")).toBe("Questions sur la posologie de Cardiovex.");
  });
});
