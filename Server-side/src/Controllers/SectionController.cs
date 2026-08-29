using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Syncfusion.EJ2.DocumentEditor;

namespace DOCXEditorAPIServices.Controllers
{
    // Partial class split out from DocumentEditorController to keep the
    // section-catalog (Add Section Template) feature self-contained.
    //
    // Persisted layout:
    //   Server-side/src/wwwroot/Data/sections.json
    //   Server-side/src/wwwroot/Data/sections/<slug>.docx   (bytes)
    //
    // `sections.json` is a JSON array of catalog entries:
    //   [ { "id": 1, "text": "Cover Page", "key": "coverPage", "sfdt": "{...}" } ]
    //
    // On startup the React client calls GET /GetSections to read this
    // catalog and merges it with the static listData (builtin templates),
    // so user-added sections survive page refreshes.

    public partial class DocumentEditorController : Controller
    {
        // Resolves to Server-side/src/wwwroot/Data
        private string SectionsDataFolder => Path.Combine(_hostingEnvironment.ContentRootPath, "wwwroot", "Data");
        private string SectionsFilePath => Path.Combine(SectionsDataFolder, "sections.json");

        /// <summary>
        /// Returns the persisted user-added section catalog as a JSON array.
        /// The React client reads this on startup so the Sections panel
        /// shows every persisted entry (builtin + user-added) after a
        /// page refresh.
        /// </summary>
        /// <remarks>
        /// Returns the raw JSON string with Content-Type application/json
        /// instead of using Ok(object). The earlier `Ok(new { sections =
        /// List<object> })` path deserialized each entry with Newtonsoft
        /// (giving JObject) and then re-serialized with System.Text.Json
        /// (the default MVC serializer), which doesn't understand
        /// Newtonsoft's JToken hierarchy — so every scalar property got
        /// serialized as an empty array ([ ]) and the client saw blank
        /// section names + missing SFDT. Returning raw JSON bypasses both
        /// serializers and preserves the on-disk file verbatim.
        /// </remarks>
        [AcceptVerbs("Get", "Post")]
        [EnableCors("AllowAllOrigins")]
        [Route("GetSections")]
        public ContentResult GetSections()
        {
            try
            {
                if (!System.IO.File.Exists(SectionsFilePath))
                {
                    return Content("{\"sections\":[]}", "application/json");
                }
                string json = System.IO.File.ReadAllText(SectionsFilePath);
                // Wrap the on-disk array as { "sections": [ ... ] }.
                string wrapped = "{\"sections\":" + json + "}";
                return Content(wrapped, "application/json");
            }
            catch (Exception ex)
            {
                return Content("{\"error\":\"" + ex.Message.Replace("\"", "\\\"") + "\",\"sections\":[]}", "application/json");
            }
        }

        /// <summary>
        /// Accepts a docx upload + display name, converts it to SFDT via
        /// WordDocument.Load, writes a catalog entry (id/text/key/sfdt)
        /// into wwwroot/Data/sections.json, and returns the new entry.
        /// </summary>
        [AcceptVerbs("Post")]
        [HttpPost]
        [EnableCors("AllowAllOrigins")]
        [Route("SaveSection")]
        public IActionResult SaveSection([FromForm] string sectionName, IFormCollection files)
        {
            if (files.Files == null || files.Files.Count == 0)
            {
                return BadRequest(new { Message = "No file uploaded." });
            }
            if (string.IsNullOrWhiteSpace(sectionName))
            {
                return BadRequest(new { Message = "Section name is required." });
            }

            try
            {
                Directory.CreateDirectory(SectionsDataFolder);

                IFormFile file = files.Files[0];
                using Stream stream = new MemoryStream();
                file.CopyTo(stream);
                stream.Position = 0;

                // Convert docx → SFDT using the same Syncfusion path as Import.
                WordDocument document = WordDocument.Load(stream, FormatType.Docx);
                string sfdt = JsonConvert.SerializeObject(document);
                document.Dispose();

                // Load existing catalog (or start new).
                List<JObject> catalog;
                if (System.IO.File.Exists(SectionsFilePath))
                {
                    string existing = System.IO.File.ReadAllText(SectionsFilePath);
                    catalog = JsonConvert.DeserializeObject<List<JObject>>(existing) ?? new List<JObject>();
                }
                else
                {
                    catalog = new List<JObject>();
                }

                // Build a stable id: max(existing) + 1, or 100 to stay
                // clear of the builtin template ids (1-6).
                int nextId = catalog.Count > 0
                    ? Math.Max(100, catalog.Max(s => (int?)s["id"] ?? 100)) + 1
                    : 100;

                string key = System.Text.RegularExpressions.Regex.Replace(
                    sectionName.Trim().ToLowerInvariant(),
                    @"[^a-z0-9]+", "_");
                key = System.Text.RegularExpressions.Regex.Replace(key, @"^_+|_+$", "");
                if (string.IsNullOrEmpty(key)) key = "section";

                var entry = new JObject
                {
                    ["id"] = nextId,
                    ["text"] = sectionName.Trim(),
                    ["key"] = key + "_" + nextId,
                    ["sfdt"] = sfdt
                };
                catalog.Add(entry);

                System.IO.File.WriteAllText(
                    SectionsFilePath,
                    JsonConvert.SerializeObject(catalog, Formatting.Indented));

                // Return the new entry as raw JSON. Same reason as
                // GetSections: Ok(JObject) goes through System.Text.Json
                // which serializes JObject properties as empty arrays.
                // JsonConvert.SerializeObject keeps the Newtonsoft-friendly
                // shape intact.
                return Content(JsonConvert.SerializeObject(entry), "application/json");
            }
            catch (Exception ex)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { Message = ex.Message });
            }
        }

        /// <summary>
        /// Seeds the builtin section catalog (Document Intro, Key
        /// Responsibilities, Major Work Area, Document Conclusion) into
        /// wwwroot/Data/sections.json on first request. The 4 entries
        /// are generated from short HTML strings via
        /// WordDocument.LoadString(..., FormatType.Html) so the SFDT is
        /// available for instant `paste()` without bundling large SFDT
        /// blobs in the client. Any user-added entries already in the
        /// file are preserved. Subsequent calls are no-ops once the
        /// builtin ids 1-4 are present.
        /// </summary>
        [AcceptVerbs("Post", "Get")]
        [EnableCors("AllowAllOrigins")]
        [Route("SeedSections")]
        public IActionResult SeedSections()
        {
            try
            {
                Directory.CreateDirectory(SectionsDataFolder);

                // Built-in section definitions (id, name, html body).
                // Ids 1-4 stay clear of the user-added ids (100+).
                var builtin = new (int id, string name, string html)[]
                {
                    (1, "Document Intro",
                        "<h1>Document Introduction</h1><p>This section introduces the document and sets the context for the reader.</p>"),
                    (2, "Key Responsibilities",
                        "<h2>Key Responsibilities</h2><ul><li>Design and architecture</li><li>Implementation and delivery</li><li>Review and quality assurance</li></ul>"),
                    (3, "Major Work Area",
                        "<h2>Major Work Area</h2><p>Summarize the primary scope of work, including objectives, milestones, and outcomes.</p>"),
                    (4, "Document Conclusion",
                        "<h2>Conclusion</h2><p>Close the document with a summary of results, next steps, and acknowledgements.</p>")
                };

                List<JObject> catalog;
                if (System.IO.File.Exists(SectionsFilePath))
                {
                    string existing = System.IO.File.ReadAllText(SectionsFilePath);
                    catalog = JsonConvert.DeserializeObject<List<JObject>>(existing) ?? new List<JObject>();
                }
                else
                {
                    catalog = new List<JObject>();
                }

                // Don't clobber builtin ids that already exist.
                var existingIds = new HashSet<int>(
                    catalog.Select(s => (int?)s["id"] ?? 0));
                bool addedAny = false;

                foreach (var (id, name, html) in builtin)
                {
                    if (existingIds.Contains(id)) continue;

                    WordDocument doc = WordDocument.LoadString(html, FormatType.Html);
                    string sfdt = JsonConvert.SerializeObject(doc);
                    doc.Dispose();

                    string key = System.Text.RegularExpressions.Regex.Replace(
                        name.ToLowerInvariant(),
                        @"[^a-z0-9]+", "_");
                    key = System.Text.RegularExpressions.Regex.Replace(key, @"^_+|_+$", "");
                    if (string.IsNullOrEmpty(key)) key = "section";

                    catalog.Add(new JObject
                    {
                        ["id"] = id,
                        ["text"] = name,
                        ["key"] = key,
                        ["sfdt"] = sfdt
                    });
                    addedAny = true;
                }

                if (addedAny)
                {
                    // Sort ascending by id so builtins appear first in the ListView.
                    catalog = catalog
                        .OrderBy(s => (int?)s["id"] ?? int.MaxValue)
                        .ToList();
                    System.IO.File.WriteAllText(
                        SectionsFilePath,
                        JsonConvert.SerializeObject(catalog, Formatting.Indented));
                }

                return Ok(new { Seeded = addedAny, Count = catalog.Count });
            }
            catch (Exception ex)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { Message = ex.Message });
            }
        }
    }
}
