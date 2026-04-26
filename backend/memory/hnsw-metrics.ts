export type DistanceMetric = "euclidean" | "cosine" | "inner_product";

export function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return sum;
}

export function cosineDistance(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 2;
  return 1 - dotProduct / denominator;
}

export function innerProductDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return -sum;
}

export function createDistanceFunction(metric: DistanceMetric): (a: Float32Array, b: Float32Array) => number {
  switch (metric) {
    case "euclidean":
      return euclideanDistance;
    case "cosine":
      return cosineDistance;
    case "inner_product":
      return innerProductDistance;
    default:
      throw new Error(`Unknown metric: ${metric}`);
  }
}
