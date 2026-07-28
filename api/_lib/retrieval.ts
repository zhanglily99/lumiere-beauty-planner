import knowledgeData from "./knowledge.json" with { type: "json" };

export type KnowledgeChunk = {
  id: string;
  title: string;
  tags: string[];
  content: string;
};

const chunks = knowledgeData as KnowledgeChunk[];

/**
 * Chinese text has no whitespace between words, so naive keyword splitting
 * does not work well. Character bigrams (2-character shingles) give a
 * lightweight, dependency-free approximation of semantic overlap that is
 * good enough for a small, curated knowledge base like this one.
 */
function bigrams(text: string): Set<string> {
  const clean = text.replace(/\s+/g, "");
  const grams = new Set<string>();
  for (let i = 0; i < clean.length - 1; i += 1) {
    grams.add(clean.slice(i, i + 2));
  }
  return grams;
}

function jaccardLikeSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const gram of a) {
    if (b.has(gram)) intersection += 1;
  }
  return intersection / Math.sqrt(a.size * b.size);
}

export function retrieveKnowledge(query: string, topK = 3): KnowledgeChunk[] {
  const queryGrams = bigrams(query);
  if (!queryGrams.size) return [];

  const scored = chunks.map((chunk) => {
    const chunkGrams = bigrams(`${chunk.title} ${chunk.tags.join(" ")} ${chunk.content}`);
    return { chunk, score: jaccardLikeSimilarity(queryGrams, chunkGrams) };
  });

  return scored
    .filter((item) => item.score > 0.025)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((item) => item.chunk);
}
