import assert from "node:assert/strict";
import test from "node:test";
import { evidenceGaps } from "../lib/evals/evidence";

const page = "O Estádio Major Antônio Couto Pereira tem capacidade para 40.502 torcedores e recebeu 19 jogos do Campeonato Brasileiro de pontos corridos na temporada, segundo levantamento publicado em setembro.";
const src = { "https://exemplo.com.br/couto": page };

test("a claim that the source really makes is supported", () => {
  assert.deepEqual(evidenceGaps([{ claim: "O Couto Pereira tem capacidade para 40.502 torcedores", source_url: "https://exemplo.com.br/couto", confidence: "high" }], src), []);
});

test("a claim with a figure the source does not contain is flagged, even when the link looks right", () => {
  const g = evidenceGaps([{ claim: "O Couto Pereira tem capacidade para 52.000 torcedores", source_url: "https://exemplo.com.br/couto", confidence: "high" }], src);
  assert.deepEqual(g.map((x) => x.problem), ["claim_not_in_source"]);
});

test("a claim whose subject is not in the source at all is flagged", () => {
  const g = evidenceGaps([{ claim: "A empresa fatura bilhões com exportação de grãos para a Ásia", source_url: "https://exemplo.com.br/couto" }], src);
  assert.deepEqual(g.map((x) => x.problem), ["claim_not_in_source"]);
});

test("a source that was never read is a gap, and claiming high confidence on it is a gap of its own", () => {
  const g = evidenceGaps([
    { claim: "Tem 200 funcionários", source_url: "https://linkedin.example/empresa", confidence: "medium" },
    { claim: "Tem 200 funcionários", source_url: "https://linkedin.example/empresa", confidence: "high" },
    { claim: "Tem 200 funcionários" },
  ], src);
  assert.deepEqual(g.map((x) => x.problem), ["source_not_retrieved", "confidence_without_source", "no_source"]);
});
