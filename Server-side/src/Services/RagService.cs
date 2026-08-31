using System;
using System.ClientModel;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Azure;
using Azure.AI.OpenAI;
using DOCXEditorAPIServices.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using OpenAI;
using OpenAI.Chat;
using OpenAI.Embeddings;
using Syncfusion.DocumentChunking;

namespace DOCXEditorAPIServices.Services
{
    /// <summary>
    /// Retrieval-Augmented Generation service ported verbatim from the
    /// reference "Program - Reference File.cs" minimal-API sample.
    ///
    /// Responsibilities:
    ///   - Index uploaded files (chunk + embed + persist) into a local
    ///     JSON vector store under wwwroot/rag/store/knowledge-store.json.
    ///   - List the files that have been processed.
    ///   - Retrieve the top-K most-relevant chunks for a question
    ///     (cosine similarity over the stored embeddings).
    ///   - Answer a question by building a context block from the
    ///     retrieved chunks and asking the Azure OpenAI chat model to
    ///     ground its answer strictly in that context.
    ///
    /// All chunking is done through Syncfusion's DocumentChunking
    /// library (ChunkingService), which produces IChunk objects with
    /// metadata + citation information. The local JSON store is a simple
    /// flat-file implementation suitable for a single-node POC; the
    /// public API surface (Upload / Chat) matches the reference sample
    /// so the React client can call it unchanged.
    /// </summary>
    public sealed class RagService
    {
        private readonly EmbeddingClient _embeddingClient;
        private readonly ChatClient _chatClient;

        private readonly string _uploadFolder;
        private readonly string _jsonStorePath;

        // Single concurrent-access lock around the JSON store. The
        // reference used a SemaphoreSlim(1,1); kept here for parity.
        private readonly SemaphoreSlim _storeLock = new(1, 1);

        // File extensions supported by the Syncfusion chunking library
        // via the various SourceChunkingOptions subclasses (Word / PDF /
        // PowerPoint / Excel / Markdown). Matches the reference list.
        private static readonly HashSet<string> SupportedExtensions =
            new(StringComparer.OrdinalIgnoreCase)
            {
                ".pdf",
                ".doc",
                ".docx",
                ".xls",
                ".xlsx",
                ".ppt",
                ".pptx",
                ".md",
                ".markdown",
                ".txt"
            };

        public RagService(
            string embeddingEndpoint,
            string embeddingApiKey,
            string embeddingDeploymentName,
            string chatEndpoint,
            string chatApiKey,
            string chatDeploymentName,
            IWebHostEnvironment hostingEnvironment)
        {
            // All credential values come from appsettings.json
            // (AzureOpenAI section) via the DI factory in Startup.cs,
            // so switching Azure OpenAI resources requires only an
            // appsettings edit — no code changes.
            if (string.IsNullOrWhiteSpace(embeddingEndpoint))
                throw new InvalidOperationException(
                    "AzureOpenAI:EmbeddingEndpoint is missing in appsettings.json.");

            if (string.IsNullOrWhiteSpace(embeddingApiKey))
                throw new InvalidOperationException(
                    "AzureOpenAI:EmbeddingApiKey is missing in appsettings.json.");

            if (string.IsNullOrWhiteSpace(embeddingDeploymentName))
                throw new InvalidOperationException(
                    "AzureOpenAI:EmbeddingDeploymentName is missing in appsettings.json.");

            if (string.IsNullOrWhiteSpace(chatEndpoint))
                throw new InvalidOperationException(
                    "AzureOpenAI:ChatEndpoint is missing in appsettings.json.");

            if (string.IsNullOrWhiteSpace(chatApiKey))
                throw new InvalidOperationException(
                    "AzureOpenAI:ChatApiKey is missing in appsettings.json.");

            if (string.IsNullOrWhiteSpace(chatDeploymentName))
                throw new InvalidOperationException(
                    "AzureOpenAI:ChatDeploymentName is missing in appsettings.json.");

            // Embedding resource (vectorizes chunks + questions).
            AzureOpenAIClient embeddingClientWrapper = new(
                new Uri(embeddingEndpoint),
                new AzureKeyCredential(embeddingApiKey));

            _embeddingClient = embeddingClientWrapper.GetEmbeddingClient(embeddingDeploymentName);

            // Chat resource (grounded answers for the AI Assistant).
            // May be a DIFFERENT Azure OpenAI resource than the
            // embedding one, or the same endpoint/key if configured so.
            AzureOpenAIClient chatClientWrapper = new(
                new Uri(chatEndpoint),
                new AzureKeyCredential(chatApiKey));

            _chatClient = chatClientWrapper.GetChatClient(chatDeploymentName);

            // ------------------------------------------------------------
            // Local storage root: wwwroot/rag
            //   wwwroot/rag/uploads/                <- raw uploaded files
            //   wwwroot/rag/store/knowledge-store.json <- vector store
            // ------------------------------------------------------------
            string webRoot = hostingEnvironment.WebRootPath;

            if (string.IsNullOrWhiteSpace(webRoot))
            {
                webRoot = Path.Combine(hostingEnvironment.ContentRootPath, "wwwroot");
            }

            string ragRoot = Path.Combine(webRoot, "rag");

            _uploadFolder = Path.Combine(ragRoot, "uploads");
            _jsonStorePath = Path.Combine(ragRoot, "store", "knowledge-store.json");

            Directory.CreateDirectory(_uploadFolder);
            Directory.CreateDirectory(Path.GetDirectoryName(_jsonStorePath)!);
        }

        // ------------------------------------------------------------
        // Public API
        // ------------------------------------------------------------

        /// <summary>
        /// Returns true if the file extension is one of the supported
        /// chunking targets (Word / PDF / PowerPoint / Excel / Markdown).
        /// </summary>
        public bool IsSupportedFile(string fileName)
        {
            string extension = Path.GetExtension(fileName);
            return SupportedExtensions.Contains(extension);
        }

        /// <summary>
        /// Saves the uploaded file to disk, chunks it with the
        /// Syncfusion DocumentChunking library, embeds each chunk,
        /// and upserts the resulting records into the local JSON store
        /// (replacing any previous records for the same source file).
        /// </summary>
        public async Task GenerateChunk(MemoryStream memoryStream)
        {
            // Chunk using current Syncfusion RAG chunking library.
            // Dispatches to Word / PDF / PowerPoint / Excel / Markdown
            // chunking options based on file extension.
            IReadOnlyList<IChunk> chunks = ChunkDocument(memoryStream);

            // Convert to local records with embeddings
            List<LocalChunkRecord> records = new();

            foreach (IChunk chunk in chunks)
            {
                string searchableText =
                    BuildSearchableText(
                        chunk,
                        "Document.docx");

                float[] embedding =
                    await GenerateEmbeddingAsync(
                        searchableText);
                string safeFileName = "Document.docx";
                string fileExtension = chunk.Metadata?.FileType ?? Path.GetExtension(safeFileName);
                

                records.Add(new LocalChunkRecord
                {
                    Id = chunk.ChunkId,
                    SourceName = safeFileName,
                    FileExtension = fileExtension,
                    ChunkIndex = chunk.ChunkIndex,
                    Content = chunk.Content,
                    Embedding = embedding,
                    MetadataAttributes = chunk.Metadata?.Attributes ?? new Dictionary<string, object>(),
                    CitationDisplay = chunk.Citation?.DisplayText ?? "",
                    CitationDetails = chunk.Citation?.LocationDetails ?? new Dictionary<string, object>()
                });
            }

            // Merge into local JSON store (replaces prior records for
            // this source file so re-uploads don't duplicate chunks).
            await UpsertLocalChunkStoreAsync(records, "Document.docx");
        }

        /// <summary>
        /// Lists the distinct source file names currently indexed in
        /// the local JSON store.
        /// </summary>
        public async Task<List<string>> GetProcessedFilesAsync()
        {
            await _storeLock.WaitAsync();

            try
            {
                List<LocalChunkRecord> records = await LoadChunkStoreInternalAsync();

                return records
                    .Select(r => r.SourceName)
                    .Where(name => !string.IsNullOrWhiteSpace(name))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(name => name)
                    .ToList();
            }
            finally
            {
                _storeLock.Release();
            }
        }

        /// <summary>
        /// Retrieves the top-K most-relevant chunks for the question
        /// (cosine similarity over stored embeddings) and asks the
        /// Azure OpenAI chat model to answer STRICTLY using that
        /// context. Returns a polite "not found" message when the
        /// store is empty or no chunks are relevant.
        /// </summary>
        /// <remarks>
        /// The heading path of the most-relevant heading paragraph
        /// (Citations.LocationDetails["headingPath"]) is returned
        /// SEPARATELY from the answer text so the client can locate
        /// the heading in the editor, insert a temporary bookmark
        /// there, and render a clickable "Source" hyperlink.
        /// </remarks>
        public async Task<(string Answer, string HeadingPath)> AskQuestionAsync(string question)
        {

            List<LocalChunkRecord> chunks = await RetrieveRelevantChunksAsync(question, topK: 10);

            if (chunks.Count == 0)
                return ("I could not find relevant content in the uploaded knowledge files.", string.Empty);

            // Build the context block fed to the chat model. Mirrors the
            // reference Program.cs formatting verbatim so the chat
            // prompt structure is preserved.
            string context = string.Join(
                Environment.NewLine + "--------------------" + Environment.NewLine,
                chunks.Select(chunk =>
$"""
Chunk Index: {chunk.ChunkIndex}
Metadata:
{MetadataAttributesToString(chunk.MetadataAttributes)}
Citation: {chunk.CitationDisplay}
Citation Details: {MetadataAttributesToString(chunk.CitationDetails)}
Score: {chunk.Score:F4}

{chunk.Content}
"""));

            string prompt =
$"""
You are an enterprise RAG assistant.

Rules:
1. Use only the supplied context.
2. Do not invent information.
3. If the answer is not available in the context, say:
   "I could not find that information in the knowledge base."
4. If multiple chunks are relevant, summarize them clearly.
5. Keep the answer concise but complete.
6. Do NOT mention file names, chunk indexes, citations, scores, or
   source/heading references inside the answer body. The source is
   added separately by the client below the answer.

Context:

{context}

Question:

{question}
""";

            // Get AI response from the chat deployment configured in
            // appsettings.json (AzureOpenAI:ChatDeploymentName).
            ClientResult<ChatCompletion> chatResult = await _chatClient.CompleteChatAsync(prompt);

            string answer = chatResult.Value.Content.Count > 0
                ? (chatResult.Value.Content[0].Text ?? string.Empty)
                : string.Empty;

            // The chunks are ordered by relevance, and the heading
            // paragraphs carry a "headingPath" locator in their citation
            // location details. Return the most-relevant heading path
            // separately so the client can create a temporary bookmark
            // in the heading paragraph and link to it from the answer.
            string headingPath = chunks
                .Select(GetHeadingPath)
                .FirstOrDefault(path => !string.IsNullOrWhiteSpace(path))
                ?? string.Empty;

            return (answer, headingPath);
        }

        // ------------------------------------------------------------
        // Chunking
        // ------------------------------------------------------------

        /// <summary>
        /// Builds a "searchable text" representation of a chunk by
        /// concatenating the source file name, all metadata attributes,
        /// the citation display text + location details, and the chunk
        /// content. This is what gets embedded and compared at retrieval
        /// time, so retrieval can match on metadata + citation context
        /// in addition to the raw chunk text.
        /// </summary>
        private static string BuildSearchableText(
            IChunk chunk,
            string sourceName)
        {
            var builder = new StringBuilder();

            builder.AppendLine($"Source file: {sourceName}");

            if (chunk.Metadata?.Attributes != null)
            {
                foreach (KeyValuePair<string, object> attribute
                         in chunk.Metadata.Attributes)
                {
                    if (string.IsNullOrWhiteSpace(attribute.Key) ||
                        attribute.Value == null)
                    {
                        continue;
                    }

                    string? value =
                        ConvertMetadataValueToString(attribute.Value);

                    if (string.IsNullOrWhiteSpace(value))
                    {
                        continue;
                    }

                    builder.AppendLine($"{attribute.Key}: {value}");
                }
            }

            if (chunk.Citation != null)
            {
                builder.AppendLine($"Citation: {chunk.Citation.DisplayText}");

                if (chunk.Citation.LocationDetails != null)
                {
                    foreach (KeyValuePair<string, object> detail
                             in chunk.Citation.LocationDetails)
                    {
                        if (string.IsNullOrWhiteSpace(detail.Key) ||
                            detail.Value == null)
                        {
                            continue;
                        }

                        string? value =
                            ConvertMetadataValueToString(detail.Value);

                        if (string.IsNullOrWhiteSpace(value))
                        {
                            continue;
                        }

                        builder.AppendLine($"{detail.Key}: {value}");
                    }
                }
            }

            builder.AppendLine();
            builder.AppendLine(chunk.Content);

            return builder.ToString();
        }

        /// <summary>
        /// Chunks a file using the Syncfusion DocumentChunking library,
        /// dispatching to the appropriate SourceChunkingOptions subclass
        /// based on the file extension.
        /// </summary>
        private IReadOnlyList<IChunk> ChunkDocument(MemoryStream stream)
        {

            var chunkingService = new ChunkingService();



            SourceChunkingOptions? sourceOptions = new WordChunkingOptions
            {
                ChunkingMode = WordChunkingMode.Auto
            };
                
            var options = new ChunkingOptions
            {
                MaxTokens = 450,
                OverlapTokens = 40,
                IncludeMetadata = true,
                IncludeCitation = true,
                SourceOptions = sourceOptions
            };

            IChunkingResult result =
                chunkingService.Chunk(
                    stream, "Document.docx",
                    options);

            return result.Chunks;
        }

        // ------------------------------------------------------------
        // Embeddings
        // ------------------------------------------------------------

        private async Task<float[]> GenerateEmbeddingAsync(string text)
        {
            var response = await _embeddingClient.GenerateEmbeddingAsync(text);
            OpenAIEmbedding embedding = response.Value;
            return embedding.ToFloats().ToArray();
        }

        // ------------------------------------------------------------
        // Local JSON store
        // ------------------------------------------------------------

        private async Task UpsertLocalChunkStoreAsync(
            List<LocalChunkRecord> newRecords,
            string sourceName)
        {
            await _storeLock.WaitAsync();

            try
            {
                List<LocalChunkRecord> existing = await LoadChunkStoreInternalAsync();

                // Replace previous records for same source file
                existing.RemoveAll(x =>
                    string.Equals(x.SourceName, sourceName, StringComparison.OrdinalIgnoreCase));

                existing.AddRange(newRecords);

                await SaveChunkStoreInternalAsync(existing);
            }
            finally
            {
                _storeLock.Release();
            }
        }

        private async Task<List<LocalChunkRecord>> RetrieveRelevantChunksAsync(
            string question,
            int topK = 10)
        {
            float[] questionVector = await GenerateEmbeddingAsync(question);

            await _storeLock.WaitAsync();

            try
            {
                List<LocalChunkRecord> records = await LoadChunkStoreInternalAsync();

                if (records.Count == 0)
                    return new List<LocalChunkRecord>();

                List<(LocalChunkRecord Record, double Score)> scored = new();

                foreach (LocalChunkRecord record in records)
                {
                    if (record.Embedding == null || record.Embedding.Length == 0)
                        continue;

                    double score = CosineSimilarity(questionVector, record.Embedding);
                    scored.Add((record, score));
                }

                return scored
                    .OrderByDescending(x => x.Score)
                    .Take(topK)
                    .Select(x =>
                    {
                        x.Record.Score = x.Score;
                        return x.Record;
                    })
                    .ToList();
            }
            finally
            {
                _storeLock.Release();
            }
        }

        private async Task<List<LocalChunkRecord>> LoadChunkStoreInternalAsync()
        {
            if (!File.Exists(_jsonStorePath))
                return new List<LocalChunkRecord>();

            string json = await File.ReadAllTextAsync(_jsonStorePath, Encoding.UTF8);

            if (string.IsNullOrWhiteSpace(json))
                return new List<LocalChunkRecord>();

            List<LocalChunkRecord>? records =
                JsonSerializer.Deserialize<List<LocalChunkRecord>>(json);

            return records ?? new List<LocalChunkRecord>();
        }

        private async Task SaveChunkStoreInternalAsync(List<LocalChunkRecord> records)
        {
            var options = new JsonSerializerOptions
            {
                WriteIndented = true
            };

            string json = JsonSerializer.Serialize(records, options);
            await File.WriteAllTextAsync(_jsonStorePath, json, Encoding.UTF8);
        }

        // ------------------------------------------------------------
        // Helpers
        // ------------------------------------------------------------

        /// <summary>
        /// Pretty-prints a metadata dictionary as "Key: Value" lines,
        /// or "None" when the dictionary is null/empty. Used by the
        /// chat prompt builder and the searchable-text builder.
        /// </summary>
        private static string MetadataAttributesToString(
            IReadOnlyDictionary<string, object>? attributes)
        {
            if (attributes == null ||
                attributes.Count == 0)
            {
                return "None";
            }

            var builder = new StringBuilder();

            foreach (KeyValuePair<string, object> attribute
                     in attributes)
            {
                if (string.IsNullOrWhiteSpace(attribute.Key) ||
                    attribute.Value == null)
                {
                    continue;
                }

                string? value =
                    ConvertMetadataValueToString(attribute.Value);

                if (string.IsNullOrWhiteSpace(value))
                {
                    continue;
                }

                builder.Append(attribute.Key);
                builder.Append(": ");
                builder.AppendLine(value);
            }

            return builder.Length > 0
                ? builder.ToString().TrimEnd()
                : "None";
        }

        /// <summary>
        /// Extracts the heading path from a chunk's citation location
        /// details. The Syncfusion chunker stores heading-paragraph
        /// locators under the "headingPath" key in
        /// Citation.LocationDetails (e.g. "1. New heading"). Returns
        /// null when the chunk has no heading locator.
        /// </summary>
        private static string? GetHeadingPath(LocalChunkRecord record)
        {
            if (record.CitationDetails == null)
                return null;

            foreach (KeyValuePair<string, object> detail
                     in record.CitationDetails)
            {
                if (!string.Equals(detail.Key, "headingPath", StringComparison.OrdinalIgnoreCase) ||
                    detail.Value == null)
                {
                    continue;
                }

                string? value = ConvertMetadataValueToString(detail.Value);

                return string.IsNullOrWhiteSpace(value) ? null : value;
            }

            return null;
        }

        /// <summary>
        /// Converts a metadata attribute value (which may be a
        /// System.Text.Json.JsonElement after deserialization) into a
        /// human-readable string. Falls back to ToString() for any
        /// other type.
        /// </summary>
        private static string? ConvertMetadataValueToString(
            object value)
        {
            if (value is JsonElement element)
            {
                return element.ValueKind switch
                {
                    JsonValueKind.String =>
                        element.GetString(),

                    JsonValueKind.Number =>
                        element.GetRawText(),

                    JsonValueKind.True =>
                        bool.TrueString,

                    JsonValueKind.False =>
                        bool.FalseString,

                    JsonValueKind.Null =>
                        null,

                    JsonValueKind.Undefined =>
                        null,

                    _ =>
                        element.GetRawText()
                };
            }

            return value.ToString();
        }

        /// <summary>
        /// Cosine similarity between two float vectors. Returns 0 when
        /// the vectors have different lengths or either norm is zero.
        /// </summary>
        private static double CosineSimilarity(float[] left, float[] right)
        {
            if (left.Length != right.Length)
                return 0;

            double dot = 0;
            double normLeft = 0;
            double normRight = 0;

            for (int i = 0; i < left.Length; i++)
            {
                dot += left[i] * right[i];
                normLeft += left[i] * left[i];
                normRight += right[i] * right[i];
            }

            double denominator = Math.Sqrt(normLeft) * Math.Sqrt(normRight);

            if (denominator == 0)
                return 0;

            return dot / denominator;
        }
    }
}
