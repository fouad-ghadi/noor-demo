import { describe, expect, it } from "vitest";

import { appendPhrase } from "./reportPhrases";

describe("appendPhrase", () => {
  it("remplace {p} par le produit présenté", () => {
    expect(appendPhrase("", "Intéressé par {p}.", "Amoxira")).toBe("Intéressé par Amoxira.");
  });
  it("ajoute à la suite des notes existantes", () => {
    expect(appendPhrase("Bon accueil. ", "Intéressé par {p}.")).toBe("Bon accueil. Intéressé par le produit.");
  });
});
