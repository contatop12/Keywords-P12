import { describe, it, expect } from "vitest";
import {
  readKnobs,
  tierForScore,
  scoreItem,
  buildMotivo,
  evaluateItems,
} from "./keywordEvaluator";

const knobs = readKnobs(() => undefined); // defaults
const ctx = { cpcMedian: 5 };

describe("tierForScore", () => {
  it("0.70+ é oportunidade excelente", () => {
    expect(tierForScore(0.7, knobs)).toBe("oportunidade_excelente");
    expect(tierForScore(0.95, knobs)).toBe("oportunidade_excelente");
  });
  it("0.45..0.69 é otimo", () => {
    expect(tierForScore(0.45, knobs)).toBe("otimo");
    expect(tierForScore(0.69, knobs)).toBe("otimo");
  });
  it("0.20..0.44 é talvez", () => {
    expect(tierForScore(0.2, knobs)).toBe("talvez");
    expect(tierForScore(0.44, knobs)).toBe("talvez");
  });
  it("abaixo de 0.20 é negativar", () => {
    expect(tierForScore(0.19, knobs)).toBe("negativar");
    expect(tierForScore(0, knobs)).toBe("negativar");
  });
});

describe("scoreItem", () => {
  it("palavra forte (volume alto + crescendo + concorrência baixa) tem score alto", () => {
    const item = {
      media_pesquisas: 4000,
      mudanca_tres_meses: "18%",
      mudanca_ano_anterior: "10%",
      grau_concorrencia: 20,
      maior_lance_topo: 3,
      menor_lance_topo: 2,
    };
    const { score_total } = scoreItem(item, ctx, knobs);
    expect(score_total).toBeGreaterThanOrEqual(0.7);
  });

  it("apenas CPC abaixo da mediana (1 sinal fraco) NÃO chega a excelente", () => {
    const item = {
      media_pesquisas: 100,
      grau_concorrencia: 80,
      maior_lance_topo: 3,
      menor_lance_topo: 2.9,
    };
    const { score_total } = scoreItem(item, ctx, knobs);
    expect(tierForScore(score_total, knobs)).not.toBe("oportunidade_excelente");
  });

  it("dado faltante não pune: divide só pelos filtros com dado", () => {
    const item = { media_pesquisas: 5000 };
    const { score_total, filtros } = scoreItem(item, ctx, knobs);
    expect(score_total).toBe(1);
    expect(filtros.find((f) => f.nome === "Crescimento 3 meses")?.ok).toBe(false);
  });

  it("retorna os 7 filtros nomeados", () => {
    const { filtros } = scoreItem({ media_pesquisas: 1000 }, ctx, knobs);
    expect(filtros.map((f) => f.nome)).toEqual([
      "Volume forte",
      "Volume base",
      "Crescimento 3 meses",
      "Não declina (ano)",
      "Concorrência baixa",
      "CPC eficiente",
      "Leilão estável",
    ]);
  });
});

describe("buildMotivo", () => {
  it("lista os filtros aprovados e a nota", () => {
    const filtros = [
      { nome: "Volume forte", peso: 3, ok: true },
      { nome: "Crescimento 3 meses", peso: 3, ok: true },
      { nome: "CPC eficiente", peso: 1, ok: false },
    ];
    const m = buildMotivo(0.75, filtros, 3100);
    expect(m).toContain("0.75");
    expect(m).toContain("volume forte");
    expect(m).toContain("crescimento 3 meses");
    expect(m).not.toContain("cpc eficiente");
  });

  it("sem filtros aprovados, explica sinal fraco com volume", () => {
    const m = buildMotivo(0.05, [{ nome: "Volume forte", peso: 3, ok: false }], 120);
    expect(m).toContain("120");
    expect(m.toLowerCase()).toContain("nenhum");
  });
});

describe("evaluateItems (integração)", () => {
  const readEnv = () => undefined;

  it("palavra forte vira oportunidade_excelente", async () => {
    const { items } = await evaluateItems(
      readEnv,
      [
        {
          name: "implante dentário",
          media_pesquisas: 4000,
          mudanca_tres_meses: "20%",
          mudanca_ano_anterior: "5%",
          grau_concorrencia: 15,
          maior_lance_topo: 3,
          menor_lance_topo: 2,
        },
      ],
      [],
      "odonto"
    );
    const cls = (items[0] as { classificacao: { tier: string; score_total: number; filtros: unknown[] } })
      .classificacao;
    expect(cls.tier).toBe("oportunidade_excelente");
    expect(cls.score_total).toBeGreaterThanOrEqual(0.7);
    expect(cls.filtros.length).toBe(7);
  });

  it("palavra fraca (1 sinal) NÃO vira excelente — regressão do bug", async () => {
    const { items } = await evaluateItems(
      readEnv,
      [{ name: "x", media_pesquisas: 80, grau_concorrencia: 90, maior_lance_topo: 0.5, menor_lance_topo: 0.4 }],
      [],
      "odonto"
    );
    const cls = (items[0] as { classificacao: { tier: string } }).classificacao;
    expect(cls.tier).not.toBe("oportunidade_excelente");
  });
});
