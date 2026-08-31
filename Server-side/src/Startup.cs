using System.Collections.Generic;
using System.IO;
using DOCXEditorAPIServices.Providers;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Newtonsoft.Json;
using Syncfusion.EJ2.SpellChecker;
using Microsoft.AspNetCore.Http;

namespace DOCXEditorAPIServices
{
    public class Startup
    {
        internal static string path = string.Empty;

        public Startup(IConfiguration configuration, IWebHostEnvironment env)
        {
            var builder = new ConfigurationBuilder()
                .SetBasePath(env.ContentRootPath)
                .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
                .AddJsonFile($"appsettings.{env.EnvironmentName}.json", optional: true)
                .AddEnvironmentVariables();

            Configuration = builder.Build();

            path = Configuration["SPELLCHECK_DICTIONARY_PATH"] ?? string.Empty;
            string jsonFileName = Configuration["SPELLCHECK_JSON_FILENAME"] ?? string.Empty;
            //check the spell check dictionary path environment variable value and assign default data folder
            //if it is null.
            path = string.IsNullOrEmpty(path) ? Path.Combine(env.ContentRootPath, "App_Data") : Path.Combine(env.ContentRootPath, path);
            //Set the default spellcheck.json file if the json filename is empty.
            jsonFileName = string.IsNullOrEmpty(jsonFileName) ? Path.Combine(path, "spellcheck.json") : Path.Combine(path, jsonFileName);
            if (File.Exists(jsonFileName))
            {
                string jsonImport = File.ReadAllText(jsonFileName);
                List<DictionaryData>? spellChecks = JsonConvert.DeserializeObject<List<DictionaryData>>(jsonImport);
                List<DictionaryData> spellDictCollection = new List<DictionaryData>();
                string? personalDictPath = null;
                //construct the dictionary file path using customer provided path and dictionary name
                if (spellChecks != null)
                {
                    foreach (var spellCheck in spellChecks)
                    {
                        spellDictCollection.Add(new DictionaryData(spellCheck.LanguadeID, Path.Combine(path, spellCheck.DictionaryPath), Path.Combine(path, spellCheck.AffixPath)));
                        personalDictPath = Path.Combine(path, spellCheck.PersonalDictPath);
                    }
                }
                SpellChecker.InitializeDictionaries(spellDictCollection, personalDictPath, 3);
            }
        }

        public IConfiguration Configuration { get; }
        readonly string MyAllowSpecificOrigins = "MyPolicy";
        // This method gets called by the runtime. Use this method to add services to the container.
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddMemoryCache();
            services.AddEndpointsApiExplorer();

            services.AddControllers().AddJsonOptions(options =>
            {
                options.JsonSerializerOptions.PropertyNamingPolicy = null;
            });

            services.Configure<AzureOpenAIOptions>(Configuration.GetSection("AzureOpenAI"));
            services.AddSingleton<AzureOpenAIProvider>();

            // RAG (Retrieval-Augmented Generation) pipeline. RagService owns
            // the chunking + embedding + retrieval + grounded chat flow
            // for the AI Assistant feature (DocumentEditorController's
            // /AskQuestion endpoint). All Azure OpenAI credentials are
            // read from the AzureOpenAI section of appsettings.json:
            //
            //   EmbeddingEndpoint / EmbeddingApiKey /
            //   EmbeddingDeploymentName  -> vector search
            //
            //   ChatEndpoint / ChatApiKey / ChatDeploymentName
            //                          -> grounded answers
            //
            // Changing credentials only requires editing the JSON —
            // no rebuild or code change is needed.
            services.AddSingleton(sp =>
            {
                IConfiguration cfg = sp.GetRequiredService<IConfiguration>();

                return new DOCXEditorAPIServices.Services.RagService(
                    cfg["AzureOpenAI:EmbeddingEndpoint"] ?? string.Empty,
                    cfg["AzureOpenAI:EmbeddingApiKey"] ?? string.Empty,
                    cfg["AzureOpenAI:EmbeddingDeploymentName"] ?? string.Empty,
                    cfg["AzureOpenAI:ChatEndpoint"] ?? string.Empty,
                    cfg["AzureOpenAI:ChatApiKey"] ?? string.Empty,
                    cfg["AzureOpenAI:ChatDeploymentName"] ?? string.Empty,
                    sp.GetRequiredService<IWebHostEnvironment>());
            });

            // "AllowAllOrigins" CORS policy is what the RAG controller
            // enables on its routes. The existing DocumentEditorController
            // already uses this name on its [EnableCors] attributes, so
            // re-register it under the same name here keeps both working.
            services.AddCors(options =>
            {
                options.AddPolicy("AllowAllOrigins",
                builder =>
                {
                    builder.AllowAnyOrigin()
                      .AllowAnyMethod()
                      .AllowAnyHeader();
                });
                options.AddPolicy(MyAllowSpecificOrigins,
                builder =>
                {
                    builder.AllowAnyOrigin()
                      .AllowAnyMethod()
                      .AllowAnyHeader();
                });
            });
            services.Configure<GzipCompressionProviderOptions>(options => options.Level = System.IO.Compression.CompressionLevel.Optimal);
            services.AddResponseCompression();
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            //Register Syncfusion license
            string licenseKey = "";
            Syncfusion.Licensing.SyncfusionLicenseProvider.RegisterLicense(licenseKey);

            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseHsts();
            }
            app.UseHttpsRedirection();

            // ------------------------------------------------------------
            // Block direct HTTP access to local RAG storage inside wwwroot.
            // RagService persists uploaded files under wwwroot/rag/uploads
            // and the vector store under wwwroot/rag/store. Without this
            // guard, UseStaticFiles() would happily serve those files to
            // anyone who knows the URL — leaking uploaded documents and
            // the embedding store. The RAG endpoints (/api/upload,
            // /api/chat) are the only intended access path.
            // ------------------------------------------------------------
            app.Use(async (context, next) =>
            {
                if (context.Request.Path.StartsWithSegments("/rag/uploads", System.StringComparison.OrdinalIgnoreCase) ||
                    context.Request.Path.StartsWithSegments("/rag/store", System.StringComparison.OrdinalIgnoreCase))
                {
                    context.Response.StatusCode = Microsoft.AspNetCore.Http.StatusCodes.Status403Forbidden;
                    await context.Response.WriteAsync("Forbidden");
                    return;
                }

                await next();
            });

            app.UseDefaultFiles();
            app.UseStaticFiles();
            app.UseRouting();
            app.UseAuthorization();
            app.UseCors(MyAllowSpecificOrigins);
            app.UseResponseCompression();
            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllers().RequireCors(MyAllowSpecificOrigins);
                endpoints.MapFallbackToFile("index.html");
            });
        }
    }
}