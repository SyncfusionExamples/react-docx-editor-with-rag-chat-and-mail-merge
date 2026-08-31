using System.Linq;
using System.Threading.Tasks;
using DOCXEditorAPIServices.Models;
using DOCXEditorAPIServices.Services;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace DOCXEditorAPIServices.Controllers
{
    /// <summary>
    /// RAG (Retrieval-Augmented Generation) endpoints ported from the
    /// reference "Program - Reference File.cs" minimal-API sample.
    ///
    /// Routes (match the reference sample exactly so the React client
    /// can call them unchanged):
    ///   GET  /api/files   -> { files: [ "name.docx", ... ] }
    ///   POST /api/upload  -> RagUploadResponse | RagUploadErrorResponse
    ///   POST /api/chat    -> RagChatResponse   | RagChatErrorResponse
    ///
    /// All chunking / embedding / retrieval / chat logic lives in
    /// <see cref="RagService"/>. This controller is a thin HTTP layer:
    /// it validates the request, forwards to the service, and maps
    /// the result into the appropriate DTO.
    ///
    /// Direct HTTP access to the local RAG storage (wwwroot/rag/uploads
    /// and wwwroot/rag/store) is intentionally blocked — see the
    /// middleware in Startup.cs.
    /// </summary>
    [Route("api")]
    [EnableCors("AllowAllOrigins")]
    public class RagController : Controller
    {
        private readonly RagService _ragService;

        public RagController(RagService ragService)
        {
            _ragService = ragService;
        }

        /// <summary>
        /// Returns the list of file names that have been successfully
        /// indexed into the local RAG knowledge store.
        /// </summary>
        [HttpGet("files")]
        [ProducesResponseType(typeof(object), StatusCodes.Status200OK)]
        public async Task<IActionResult> GetFiles()
        {
            var files = await _ragService.GetProcessedFilesAsync();

            return Ok(new
            {
                files
            });
        }

        /// <summary>
        /// Accepts multipart/form-data file uploads, indexes each
        /// supported file (chunk + embed + persist), and returns the
        /// list of file names that were actually indexed. Unsupported
        /// file types are silently skipped; if NONE of the uploaded
        /// files are supported, returns 400 with a helpful message.
        /// </summary>
        [HttpPost("upload")]
        [ProducesResponseType(typeof(RagUploadResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(RagUploadErrorResponse), StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> Upload()
        {
            if (!Request.HasFormContentType)
            {
                return BadRequest(new RagUploadErrorResponse
                {
                    Error = "Invalid upload request."
                });
            }

            IFormCollection form = await Request.ReadFormAsync();
            IFormFileCollection files = form.Files;

            if (files.Count == 0)
            {
                return BadRequest(new RagUploadErrorResponse
                {
                    Error = "Please upload at least one supported file."
                });
            }

            var uploadedFiles = new System.Collections.Generic.List<string>();

            foreach (IFormFile file in files)
            {
                if (!_ragService.IsSupportedFile(file.FileName))
                    continue;

                string safeFileName = System.IO.Path.GetFileName(file.FileName);

                await _ragService.IndexUploadedFileAsync(file, safeFileName);

                uploadedFiles.Add(safeFileName);
            }

            if (uploadedFiles.Count == 0)
            {
                return BadRequest(new RagUploadErrorResponse
                {
                    Error = "No supported files were uploaded. Supported formats: .pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .md, .markdown, .txt"
                });
            }

            return Ok(new RagUploadResponse
            {
                Files = uploadedFiles
            });
        }

        /// <summary>
        /// Retrieves the most-relevant chunks for the question (cosine
        /// similarity) and asks the Azure OpenAI chat model to answer
        /// strictly from that context. Returns 400 if the question is
        /// missing/blank.
        /// </summary>
        [HttpPost("chat")]
        [ProducesResponseType(typeof(RagChatResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(RagChatErrorResponse), StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> Chat([FromBody] RagChatRequest? request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.Question))
            {
                return BadRequest(new RagChatErrorResponse
                {
                    Error = "Question is required."
                });
            }

            string answer = await _ragService.AskQuestionAsync(request.Question);

            return Ok(new RagChatResponse
            {
                Answer = answer
            });
        }
    }
}
