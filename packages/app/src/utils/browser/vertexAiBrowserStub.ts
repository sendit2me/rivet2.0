export class VertexAI {
  constructor() {
    throw new Error(
      'Google Vertex AI credential-based execution is not supported in browser builds. Use a Google API key instead.',
    );
  }
}
