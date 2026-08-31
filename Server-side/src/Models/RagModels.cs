using System.Collections.Generic;

namespace DOCXEditorAPIServices.Models
{
    // RAG (Retrieval-Augmented Generation) request/response DTOs.
    //
    // These intentionally live SEPARATE from the existing ChatRequest /
    // ChatResponse models (used by the DocumentEditorController's
    // /Process endpoint) so the two pipelines never collide. The RAG
    // endpoints exposed by RagController use these typed shapes:
    //
    //   POST /api/upload  -> RagUploadResponse | RagUploadErrorResponse
    //   POST /api/chat    -> RagChatResponse   | RagChatErrorResponse
    //
    // The LocalChunkRecord is the persisted chunk shape stored in the
    // on-disk JSON knowledge store (wwwroot/rag/store/knowledge-store.json).

    /// <summary>
    /// Request body for POST /api/chat. Mirrors the reference Program.cs
    /// ChatRequest shape (a single question string).
    /// </summary>
    public class RagChatRequest
    {
        public string Question { get; set; } = string.Empty;
    }

    /// <summary>
    /// Successful response for POST /api/chat and /AskQuestion.
    /// </summary>
    public class RagChatResponse
    {
        public string Answer { get; set; } = string.Empty;

        /// <summary>
        /// Heading path (e.g. "1. New heading") of the most-relevant
        /// heading paragraph among the retrieved chunks, taken from
        /// Citations.LocationDetails["headingPath"]. Empty when no
        /// retrieved chunk carried a heading locator. The client uses
        /// this to locate the heading in the document, insert a
        /// temporary bookmark there, and render a "Source" hyperlink
        /// at the bottom of the answer that navigates to it.
        /// </summary>
        public string HeadingPath { get; set; } = string.Empty;
    }

    /// <summary>
    /// Error response for POST /api/chat.
    /// </summary>
    public class RagChatErrorResponse
    {
        public string Error { get; set; } = string.Empty;
    }

    /// <summary>
    /// Successful response for POST /api/upload. Contains the list of
    /// file names that were actually indexed (unsupported files are
    /// skipped server-side).
    /// </summary>
    public class RagUploadResponse
    {
        public List<string> Files { get; set; } = new();
    }

    /// <summary>
    /// Error response for POST /api/upload.
    /// </summary>
    public class RagUploadErrorResponse
    {
        public string Error { get; set; } = string.Empty;
    }

    /// <summary>
    /// Persisted chunk record stored in the local JSON knowledge store.
    /// Each record carries the chunk text, its source file, a vector
    /// embedding (for cosine-similarity retrieval), and optional
    /// citation/metadata pulled from the Syncfusion DocumentChunking
    /// library. <see cref="Score"/> is populated only at retrieval time.
    /// </summary>
    public sealed class LocalChunkRecord
    {
        public string Id { get; set; } = string.Empty;

        public string SourceName { get; set; } = string.Empty;

        public string FileExtension { get; set; } = string.Empty;

        public int ChunkIndex { get; set; }

        public string Content { get; set; } = string.Empty;

        public float[] Embedding { get; set; } = System.Array.Empty<float>();

        public IReadOnlyDictionary<string, object> MetadataAttributes { get; set; }
            = new Dictionary<string, object>();

        public string CitationDisplay { get; set; } = string.Empty;

        public IReadOnlyDictionary<string, object> CitationDetails { get; set; }
            = new Dictionary<string, object>();

        // Retrieval-time only. Populated by RetrieveRelevantChunksAsync
        // so the chat prompt builder can include the similarity score
        // in the context block; never persisted to the JSON store.
        public double Score { get; set; }
    }
}
