using BitMiracle.LibTiff.Classic;
using DOCXEditorAPIServices.Models;
using DOCXEditorAPIServices.Providers;
using DOCXEditorAPIServices.Services;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json.Linq;
using SkiaSharp;
using Syncfusion.EJ2.DocumentEditor;
using Syncfusion.EJ2.SpellChecker;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using WDocument = Syncfusion.DocIO.DLS.WordDocument;
using WFormatType = Syncfusion.DocIO.FormatType;

namespace DOCXEditorAPIServices.Controllers
{
    // Partial class — the section-catalog feature (GetSections /
    // SaveSection) lives in SectionController.cs so the main controller
    // file stays focused on the editor API.
    [Route("api/[controller]")]
    public partial class DocumentEditorController : Controller
    {
        private readonly IWebHostEnvironment _hostingEnvironment;
        private readonly string _path;
        private readonly AzureOpenAIProvider _azureOpenAIProvider;
        private readonly RagService _ragService;

        public DocumentEditorController(
            IWebHostEnvironment hostingEnvironment,
            AzureOpenAIProvider azureOpenAIProvider,
            RagService ragService)
        {
            _hostingEnvironment = hostingEnvironment;
            _path = Startup.path;
            _azureOpenAIProvider = azureOpenAIProvider;
            _ragService = ragService;
        }
        /// <summary>
        /// Receives chat messages from the client application and forwards them to Azure OpenAI.
        /// </summary>
        [HttpPost("Process")]
        [EnableCors("AllowAllOrigins")]
        [ProducesResponseType(typeof(ChatResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<ChatResponse>> Process([FromBody] ChatRequest? request)
        {
            if (request == null)
            {
                return BadRequest("Request cannot be null.");
            }

            if (request.Messages == null || request.Messages.Count == 0)
            {
                return BadRequest("At least one message is required.");
            }

            try
            {
                var generatedText = await _azureOpenAIProvider.CompleteChatAsync(request);

                if (generatedText.StartsWith("Azure OpenAI is not configured.", StringComparison.OrdinalIgnoreCase))
                {
                    return StatusCode(StatusCodes.Status503ServiceUnavailable, new
                    {
                        Message = generatedText
                    });
                }

                return Ok(new ChatResponse
                {
                    Text = generatedText
                });
            }
            catch (Exception ex)
            {
                return StatusCode(StatusCodes.Status500InternalServerError,
                    new
                    {
                        Message = "An error occurred while communicating with Azure OpenAI.",
                        Details = ex.Message
                    });
            }
        }

        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("Import")]
        public string? Import(IFormCollection data)
        {
            if (data.Files.Count == 0)
                return string.Empty;
            Stream stream = new MemoryStream();
            IFormFile file = data.Files[0];
            int index = file.FileName.LastIndexOf('.');
            string type = index > -1 && index < file.FileName.Length - 1 ?
                file.FileName.Substring(index) : ".docx";
            file.CopyTo(stream);
            stream.Position = 0;

            //Hooks MetafileImageParsed event.
            WordDocument.MetafileImageParsed += OnMetafileImageParsed;
            WordDocument document = WordDocument.Load(stream, GetFormatType(type.ToLower()));
            //Unhooks MetafileImageParsed event.
            WordDocument.MetafileImageParsed -= OnMetafileImageParsed;

            string json = Newtonsoft.Json.JsonConvert.SerializeObject(document);
            document.Dispose();
            return json;
        }

        //Converts Metafile to raster image.
        private static void OnMetafileImageParsed(object sender, MetafileImageParsedEventArgs args)
        {
            if (args.IsMetafile)
            {
            //MetaFile image conversion(EMF and WMF)
            //You can write your own method definition for converting metafile to raster image using any third-party image converter.
            args.ImageStream = ConvertMetafileToRasterImage(args.MetafileStream);
            }
            else
            {
            //TIFF image conversion
            args.ImageStream = TiffToPNG(args.MetafileStream);

            }
        }

        /// <summary>
        /// Converts the supplied HTML string into SFDT so it can be opened
        /// in the editor.
        /// </summary>
        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("LoadString")]
        public string LoadString([FromBody] InputParameter data)
        {
            // You can also load HTML file/string from server side.
            Syncfusion.EJ2.DocumentEditor.WordDocument document =
                Syncfusion.EJ2.DocumentEditor.WordDocument.LoadString(data.content, FormatType.Html);
            string json = Newtonsoft.Json.JsonConvert.SerializeObject(document);
            document.Dispose();
            return json;
        }

        /// <summary>
        /// Request body for POST /LoadString.
        /// </summary>
        public class InputParameter
        {
            public string content { get; set; } = string.Empty;
        }

        // Converting Tiff to Png image using Bitmiracle https://www.nuget.org/packages/BitMiracle.LibTiff.NET
        private static MemoryStream TiffToPNG(Stream tiffStream)
        {
            MemoryStream imageStream = new MemoryStream();
            using (Tiff tif = Tiff.ClientOpen("in-memory", "r", tiffStream, new TiffStream()))
            {
            // Find the width and height of the image
            FieldValue[] value = tif.GetField(BitMiracle.LibTiff.Classic.TiffTag.IMAGEWIDTH);
            int width = value[0].ToInt();

            value = tif.GetField(BitMiracle.LibTiff.Classic.TiffTag.IMAGELENGTH);
            int height = value[0].ToInt();

            // Read the image into the memory buffer
            int[] raster = new int[height * width];
            if (!tif.ReadRGBAImage(width, height, raster))
            {
                throw new Exception("Could not read image");
            }

            // Create a bitmap image using SkiaSharp.
            using (SKBitmap sKBitmap = new SKBitmap(width, height, SKImageInfo.PlatformColorType, SKAlphaType.Premul))
            {
                // Convert a RGBA value to byte array.
                byte[] bitmapData = new byte[sKBitmap.RowBytes * sKBitmap.Height];
                for (int y = 0; y < sKBitmap.Height; y++)
                {
                    int rasterOffset = y * sKBitmap.Width;
                    int bitsOffset = (sKBitmap.Height - y - 1) * sKBitmap.RowBytes;

                    for (int x = 0; x < sKBitmap.Width; x++)
                    {
                        int rgba = raster[rasterOffset++];
                        bitmapData[bitsOffset++] = (byte)((rgba >> 16) & 0xff);
                        bitmapData[bitsOffset++] = (byte)((rgba >> 8) & 0xff);
                        bitmapData[bitsOffset++] = (byte)(rgba & 0xff);
                        bitmapData[bitsOffset++] = (byte)((rgba >> 24) & 0xff);
                    }
                }

                // Convert a byte array to SKColor array.
                SKColor[] sKColor = new SKColor[bitmapData.Length / 4];
                int index = 0;
                for (int i = 0; i < bitmapData.Length; i++)
                {
                    sKColor[index] = new SKColor(bitmapData[i + 2], bitmapData[i + 1], bitmapData[i], bitmapData[i + 3]);
                    i += 3;
                    index += 1;
                }

                // Set the SKColor array to SKBitmap.
                sKBitmap.Pixels = sKColor;

                // Save the SKBitmap to PNG image stream.
                sKBitmap.Encode(SKEncodedImageFormat.Png, 100).SaveTo(imageStream);
                imageStream.Flush();
            }
            }
            return imageStream;
        }

       private static Stream ConvertMetafileToRasterImage(Stream ImageStream)
        {
            //Here we are loading a default raster image as fallback.
            Stream imgStream = GetManifestResourceStream("ImageNotFound.jpg");
            return imgStream;
            //To do : Write your own logic for converting metafile to raster image using any third-party image converter(Syncfusion doesn't provide any image converter).
        }

        private static Stream GetManifestResourceStream(string fileName)
        {
            System.Reflection.Assembly execAssembly = typeof(WDocument).Assembly;
            string[] resourceNames = execAssembly.GetManifestResourceNames();
            foreach (string resourceName in resourceNames)
            {
                if (resourceName.EndsWith("." + fileName))
                {
                    fileName = resourceName;
                    break;
                }
            }
            return execAssembly.GetManifestResourceStream(fileName) ?? Stream.Null;
        }

        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("SpellCheck")]
        public string SpellCheck([FromBody] SpellCheckJsonData spellChecker)
        {
            try
            {
                SpellChecker spellCheck = new SpellChecker();
                spellCheck.GetSuggestions(spellChecker.LanguageID, spellChecker.TexttoCheck, spellChecker.CheckSpelling, spellChecker.CheckSuggestion, spellChecker.AddWord);
                return Newtonsoft.Json.JsonConvert.SerializeObject(spellCheck);
            }
            catch
            {
                return "{\"SpellCollection\":[],\"HasSpellingError\":false,\"Suggestions\":null}";
            }
        }

        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("SpellCheckByPage")]
        public string SpellCheckByPage([FromBody] SpellCheckJsonData spellChecker)
        {
            try
            {
                SpellChecker spellCheck = new SpellChecker();
                spellCheck.CheckSpelling(spellChecker.LanguageID, spellChecker.TexttoCheck);
                return Newtonsoft.Json.JsonConvert.SerializeObject(spellCheck);
            }
            catch
            {
                return "{\"SpellCollection\":[],\"HasSpellingError\":false,\"Suggestions\":null}";
            }
        }

        public class SpellCheckJsonData
        {
            public int LanguageID { get; set; }
            public string TexttoCheck { get; set; } = string.Empty;
            public bool CheckSpelling { get; set; }
            public bool CheckSuggestion { get; set; }
            public bool AddWord { get; set; }

        }
        public class UploadDocument
        {
            public string DocumentName { get; set; } = string.Empty;
        }

        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("MailMerge")]
        public string MailMerge([FromBody] ExportData exportData)
        {
            byte[] data;
            // Input validation
            if (exportData == null || string.IsNullOrEmpty(exportData.documentData))
            {
                throw new ArgumentException("Document data cannot be null or empty.");
            }

            try
            {
                string cleanBase64 = exportData.documentData.Contains(',') ? exportData.documentData.Split(',')[1] : exportData.documentData;
                data = Convert.FromBase64String(cleanBase64);
                using (MemoryStream stream = new MemoryStream())
                {
                    stream.Write(data, 0, data.Length);
                    stream.Position = 0;

                    using (Syncfusion.DocIO.DLS.WordDocument document = new Syncfusion.DocIO.DLS.WordDocument(stream, Syncfusion.DocIO.FormatType.Docx))
                    {
                        document.MailMerge.RemoveEmptyGroup = true;
                        document.MailMerge.RemoveEmptyParagraphs = true;
                        document.MailMerge.ClearFields = true;
                        document.MailMerge.Execute(GetJsonData(exportData.mailMergeData));
                        document.Save(stream, Syncfusion.DocIO.FormatType.Docx);
                    }

                    stream.Position = 0;
                    Syncfusion.EJ2.DocumentEditor.WordDocument wordDocument = Syncfusion.EJ2.DocumentEditor.WordDocument.Load(stream, Syncfusion.EJ2.DocumentEditor.FormatType.Docx);
                    string sfdtText = Newtonsoft.Json.JsonConvert.SerializeObject(wordDocument);
                    wordDocument?.Dispose();
                    return sfdtText;
                }
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException("Error processing mail merge: " + ex.Message, ex);
            }
        }

        /// <summary>
        /// Request body for POST /MailMerge.
        /// </summary>
        public class ExportData
        {
            public string fileName { get; set; } = string.Empty;
            public string documentData { get; set; } = string.Empty;
            public string mailMergeData { get; set; } = string.Empty;
        }

        #region Helper methods for Mail Merge JSON Data
        /// <summary>
        /// Prepares the data table from JSON data for processing.
        /// </summary>
        private static List<object> GetJsonData(string mailMergeData)
        {
            //Reads the JSON object from JSON file.
            JObject jsonObject = JObject.Parse(mailMergeData);
            //Converts JSON object to Dictionary.
            IDictionary<string, object?> data = GetData(jsonObject);
            return data.Values.First() as List<object> ?? new List<object>();
        }

        /// <summary>
        /// Gets data from JSON object.
        /// </summary>
        /// <param name="jsonObject">JSON object.</param>
        /// <returns>Dictionary of data.</returns>
        private static IDictionary<string, object?> GetData(JObject jsonObject)
        {
            Dictionary<string, object?> dictionary = new Dictionary<string, object?>();
            foreach (var item in jsonObject)
            {
                object? keyValue = null;
                if (item.Value is JArray)
                    keyValue = GetData((JArray)item.Value);
                else if (item.Value is JToken)
                    keyValue = ((JToken)item.Value).ToObject<string>();
                dictionary.Add(item.Key, keyValue);
            }
            return dictionary;
        }
        /// <summary>
        /// Gets array of items from JSON array.
        /// </summary>
        /// <param name="jArray">JSON array.</param>
        /// <returns>List of objects.</returns>
        private static List<object> GetData(JArray jArray)
        {
            List<object> jArrayItems = new List<object>();
            foreach (var item in jArray)
            {
                object? keyValue = null;
                if (item is JObject)
                    keyValue = GetData((JObject)item);
                jArrayItems.Add(keyValue!);
            }
            return jArrayItems;
        }
        #endregion

        public class CustomParameter
        {
            public string content { get; set; } = string.Empty;
            public string type { get; set; } = string.Empty;
        }

        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("SystemClipboard")]
        public string SystemClipboard([FromBody]CustomParameter param)
        {
            if (param.content != null && param.content != "")
            {
                try
                {
                    //Hooks MetafileImageParsed event.
                    WordDocument.MetafileImageParsed += OnMetafileImageParsed;
                    WordDocument document = WordDocument.LoadString(param.content, GetFormatType(param.type.ToLower()));
                    //Unhooks MetafileImageParsed event.
                    WordDocument.MetafileImageParsed -= OnMetafileImageParsed;
                    string json = Newtonsoft.Json.JsonConvert.SerializeObject(document);
                    document.Dispose();
                    return json;
                }
                catch (Exception)
                {
                    return "";
                }
            }
            return "";
        }

        public class CustomRestrictParameter
        {
            public string passwordBase64 { get; set; } = string.Empty;
            public string saltBase64 { get; set; } = string.Empty;
            public int spinCount { get; set; }
        }
        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("RestrictEditing")]
        public string[] RestrictEditing([FromBody]CustomRestrictParameter param)
        {
            if (string.IsNullOrEmpty(param.passwordBase64))
                return Array.Empty<string>();
            return WordDocument.ComputeHash(param.passwordBase64, param.saltBase64, param.spinCount);
        }


        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("LoadDefault")]
        public string LoadDefault()
        {
            Stream stream = System.IO.File.OpenRead("App_Data/GettingStarted.docx");
            stream.Position = 0;

            WordDocument document = WordDocument.Load(stream, FormatType.Docx);
            string json = Newtonsoft.Json.JsonConvert.SerializeObject(document);
            document.Dispose();
            return json;
        }

        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("LoadDocument")]
        public string LoadDocument([FromForm] UploadDocument uploadDocument)
        {
            string documentPath = Path.Combine(_path, uploadDocument.DocumentName);
            Stream? stream = null;
            if (System.IO.File.Exists(documentPath))
            {
                byte[] bytes = System.IO.File.ReadAllBytes(documentPath);
                stream = new MemoryStream(bytes);
            }
            else
            {
                bool result = Uri.TryCreate(uploadDocument.DocumentName, UriKind.Absolute, out Uri? uriResult)
                    && (uriResult.Scheme == Uri.UriSchemeHttp || uriResult.Scheme == Uri.UriSchemeHttps);
                if (result)
                {
                    stream = GetDocumentFromURL(uploadDocument.DocumentName).Result;
                    if (stream != null)
                        stream.Position = 0;
                }
            }
            if (stream == null)
            {
                return string.Empty;
            }

            WordDocument document = WordDocument.Load(stream, FormatType.Docx);
            string json = Newtonsoft.Json.JsonConvert.SerializeObject(document);
            document.Dispose();
            return json;
        }
        async Task<MemoryStream?> GetDocumentFromURL(string url)
        {
            var client = new HttpClient(); ;
            var response = await client.GetAsync(url);
            var rawStream = await response.Content.ReadAsStreamAsync();
            if (response.IsSuccessStatusCode)
            {
                MemoryStream docStream = new MemoryStream();
                rawStream.CopyTo(docStream);
                return docStream;
            }
            else { return null; }
        }

        internal static FormatType GetFormatType(string format)
        {
            if (string.IsNullOrEmpty(format))
                throw new NotSupportedException("EJ2 DocumentEditor does not support this file format.");
            switch (format.ToLower())
            {
                case ".dotx":
                case ".docx":
                case ".docm":
                case ".dotm":
                    return FormatType.Docx;
                case ".dot":
                case ".doc":
                    return FormatType.Doc;
                case ".rtf":
                    return FormatType.Rtf;
                case ".txt":
                    return FormatType.Txt;
                case ".xml":
                    return FormatType.WordML;
                case ".html":
                    return FormatType.Html;
                default:
                    throw new NotSupportedException("EJ2 DocumentEditor does not support this file format.");
            }
        }
        internal static WFormatType GetWFormatType(string format)
        {
            if (string.IsNullOrEmpty(format))
                throw new NotSupportedException("EJ2 DocumentEditor does not support this file format.");
            switch (format.ToLower())
            {
                case ".dotx":
                    return WFormatType.Dotx;
                case ".docx":
                    return WFormatType.Docx;
                case ".docm":
                    return WFormatType.Docm;
                case ".dotm":
                    return WFormatType.Dotm;
                case ".dot":
                    return WFormatType.Dot;
                case ".doc":
                    return WFormatType.Doc;
                case ".rtf":
                    return WFormatType.Rtf;
                case ".html":
                    return WFormatType.Html;
                case ".txt":
                    return WFormatType.Txt;
                case ".xml":
                    return WFormatType.WordML;
                case ".odt":
                    return WFormatType.Odt;
                default:
                    throw new NotSupportedException("EJ2 DocumentEditor does not support this file format.");
            }
        }

        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("Save")]
        public void Save([FromBody] SaveParameter data)
        {
            string name = data.FileName;
            string format = RetrieveFileType(name);
            if (string.IsNullOrEmpty(name))
            {
                name = "Document1.doc";
            }
            WDocument document = WordDocument.Save(data.Content);
            FileStream fileStream = new FileStream(name, FileMode.OpenOrCreate, FileAccess.ReadWrite);
            document.Save(fileStream, GetWFormatType(format));
            document.Close();
            fileStream.Close();
        }

        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("ExportSFDT")]
        public FileStreamResult ExportSFDT([FromBody] SaveParameter data)
        {
            string name = data.FileName;
            string format = RetrieveFileType(name);
            if (string.IsNullOrEmpty(name))
            {
                name = "Document1.doc";
            }
            WDocument document = WordDocument.Save(data.Content);
            return SaveDocument(document, format, name);
        }

        /// <summary>
        /// Answers a question about the document currently open in the
        /// editor, using the RAG pipeline (retrieval-augmented generation).
        ///
        /// Chunking strategy (avoids re-chunking on every question):
        ///   - IsContentChanged = true: the live document has changed since
        ///     it was last indexed, so the SFDT is converted to DOCX and
        ///     re-chunked + re-embedded (GenerateChunk) before answering.
        ///   - IsContentChanged = false: the document is unchanged, so the
        ///     question is answered directly from the chunks already
        ///     persisted in the JSON knowledge store.
        /// </summary>
        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("AskQuestion")]
        [ProducesResponseType(typeof(RagChatResponse), StatusCodes.Status200OK)]
        [ProducesResponseType(typeof(RagChatErrorResponse), StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> AskQuestion([FromBody] QuestionParameter? data)
        {
            if (data == null || string.IsNullOrWhiteSpace(data.Question))
            {
                return BadRequest(new RagChatErrorResponse
                {
                    Error = "Question is required."
                });
            }

            // Re-chunk only when the document content changed since it
            // was last indexed. Unchanged content is answered from the
            // chunks already stored in the JSON knowledge store.
            if (data.IsContentChanged && !string.IsNullOrWhiteSpace(data.SfdtContent))
            {
                WDocument document = WordDocument.Save(data.SfdtContent);
                MemoryStream stream = SaveDocument(document, ".docx");

                await _ragService.GenerateChunk(stream);
            }

            // The heading path is returned separately so the client can
            // bookmark the heading paragraph and render a "Source"
            // hyperlink that navigates to it.
            (string answer, string headingPath) = await _ragService.AskQuestionAsync(data.Question);

            return Ok(new RagChatResponse
            {
                Answer = answer,
                HeadingPath = headingPath
            });
        }

        private string RetrieveFileType(string name)
        {
            int index = name.LastIndexOf('.');
            string format = index > -1 && index < name.Length - 1 ?
                name.Substring(index) : ".doc";
            return format;
        }

        /// <summary>
        /// Request body for POST /AskQuestion.
        /// </summary>
        public class QuestionParameter
        {
            /// <summary>
            /// Serialized SFDT of the document currently open in the editor.
            /// Only required when <see cref="IsContentChanged"/> is true.
            /// </summary>
            public string SfdtContent { get; set; } = string.Empty;

            /// <summary>
            /// True when the document content changed since it was last
            /// indexed, so the server re-chunks it before answering. When
            /// false, the answer comes from the already-persisted chunks.
            /// </summary>
            public bool IsContentChanged { get; set; }

            /// <summary>
            /// The user's question to answer from the document.
            /// </summary>
            public string Question { get; set; } = string.Empty;
        }

        public class SaveParameter
        {
            public string Content { get; set; } = string.Empty;
            public string FileName { get; set; } = string.Empty;
        }

        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("Export")]
        public FileStreamResult? Export(IFormCollection data)
        {
            if (data.Files.Count == 0)
            return null;
            string fileName = this.GetValue(data, "filename");
            string name = fileName;
            string format = RetrieveFileType(name);
            if (string.IsNullOrEmpty(name))
            {
                name = "Document1";
            }
            WDocument document = this.GetDocument(data);
            return SaveDocument(document, format, fileName);
        }

        private MemoryStream SaveDocument(WDocument document, string format)
        {
            MemoryStream docStream = new MemoryStream();
            WFormatType type = GetWFormatType(format);
            document.Save(docStream, type);
            document.Close();
            docStream.Position = 0;
            return docStream;
        }




        private FileStreamResult SaveDocument(WDocument document, string format, string fileName)
        {
            Stream stream = new MemoryStream();
            string contentType = "";
            if (format == ".pdf")
            {
                contentType = "application/pdf";
            }
            else
            {
                WFormatType type = GetWFormatType(format);
                switch (type)
                {
                    case WFormatType.Rtf:
                        contentType = "application/rtf";
                        break;
                    case WFormatType.WordML:
                        contentType = "application/xml";
                        break;
                    case WFormatType.Html:
                        contentType = "application/html";
                        break;
                    case WFormatType.Dotx:
                        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.template";
                        break;
                    case WFormatType.Docx:
                        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                        break;
                    case WFormatType.Doc:
                        contentType = "application/msword";
                        break;
                    case WFormatType.Dot:
                        contentType = "application/msword";
                        break;
                }
                document.Save(stream, type);
            }
            document.Close();
            stream.Position = 0;
            return new FileStreamResult(stream, contentType)
            {
                FileDownloadName = fileName
            };
        }

        private string GetValue(IFormCollection data, string key)
        {
            if (data.ContainsKey(key))
            {
                string[]? values = data[key];
                if (values != null && values.Length > 0)
                {
                    return values[0];
                }
            }
            return "";
        }
        private WDocument GetDocument(IFormCollection data)
        {
            Stream stream = new MemoryStream();
            IFormFile file = data.Files[0];
            file.CopyTo(stream);
            stream.Position = 0;

            WDocument document = new WDocument(stream, WFormatType.Docx);
            stream.Dispose();
            return document;
        }
    }
}
