export type ImageDebugArtifact = {
  generationId: string;
  originalLogo: Buffer;
  processedLogo: Buffer;
  prompt: string;
  request: Record<string, unknown>;
  attempts: Array<Record<string, unknown>>;
};
