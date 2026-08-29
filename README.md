# React DOCX Editor with AI Capabilities

## Introduction

The sample uses Syncfusion<sup style="font-size:70%">&reg;</sup> [React DOCX Editor](https://www.syncfusion.com/docx-editor-sdk/react-docx-editor?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) (Document Editor) on the client and **Syncfusion DocumentEditor / DocIO server-side libraries** for document processing. AI requests are sent from the React client to the ASP.NET Core API, which communicates with **Azure OpenAI** using the deployment configured on the server.

The sample demonstrates:

- Editing DOCX documents in a browser.
- Importing DOCX and other supported document formats into Syncfusion DocumentEditor SFDT.
- Exporting edited documents to common document formats and PDF.
- AI-assisted generation, rephrasing, translation, grammar improvement, and chat.
- Insert fields and Mail merge using a JSON data payload.

---

## Prerequisites

Install the following before running the sample:

1. **.NET 10 SDK**
2. **Node.js and npm**
3. A valid **Syncfusion license key** for the Syncfusion components used by the sample.
4. An **Azure OpenAI** resource with a deployed chat-capable model if the AI features are required.


---

# How to Run This Sample

The client and server are separate applications, so run them in **two terminals**.

## 1. Start the ASP.NET Core Server

Open a terminal in:

```text
Server-side/
```

Restore the server dependencies:

```bash
dotnet restore
```

Start the API:

```bash
dotnet run
```

The included launch profile configures the application to run at:

```text
http://localhost:62870/
```

When the server is running successfully, keep this terminal open and use this Web API URL in Client-side/src/service-config.js file.
```json
export const API_BASE_URL = 'http://localhost:62870';
```
If the server is moved to another host or port, update `API_BASE_URL` accordingly.

### Server configuration

Before using the AI features, update:

```text
Server-side/src/appsettings.json
```

Set:

```json
"AzureOpenAI": {
  "Endpoint": "<YOUR_AZURE_OPENAI_ENDPOINT>",
  "ApiKey": "<YOUR_AZURE_OPENAI_API_KEY>",
  "DeploymentName": "<YOUR_DEPLOYMENT_NAME>"
}
```

### Syncfusion license

`Startup.cs` contains the Syncfusion license registration:

```csharp
Syncfusion.Licensing.SyncfusionLicenseProvider.RegisterLicense(licenseKey);
```

Replace the empty `licenseKey` value with your valid Syncfusion license key, or configure the application using the supported licensing approach for your environment.

---

## 2. Start the React Client

Open a second terminal in:

```text
Client-side/
```

Install the client dependencies:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Vite will print the local development URL in the terminal, typically similar to:

```text
http://localhost:5173/
```

Open that URL in a browser.

---

# Main Sample Features

## Document Editing

The sample uses Syncfusion React DocumentEditor to provide browser-based DOCX editing.

The application loads the bundled large DOCX sample:

```text
Client-side/public/templates/DOCX_Fidelity_Complex_Tables_1000_Pages.docx
```

The client sends this file to the `/api/DocumentEditor/Import` API, receives SFDT, and opens the result in the editor.

The sample also enables asynchronous opening for the large document so the initial pages can be displayed incrementally.

---

## AI Features

AI functionality is routed through:

```text
POST /api/DocumentEditor/Process
```

The client sends a chat-style request to the ASP.NET Core API. The server forwards the messages to the configured Azure OpenAI deployment and returns the generated text.

The UI demonstrates AI tasks including:

- Generate
- Rephrase
- Translate
- Grammar
- AI chat
- Document summarization

The client-side AI request helper is implemented in:

```text
Client-side/src/ai-models.js
```

and the server-side Azure OpenAI integration is implemented in:

```text
Server-side/src/Controllers/AzureOpenAIProvider.cs
```

---

# Web APIs

The APIs below are implemented by the sample.

Base URL:

```text
http://localhost:62870/api/DocumentEditor/
```

| HTTP Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/DocumentEditor/Process` | Sends chat/AI prompts to Azure OpenAI and returns generated text |
| `POST` | `/api/DocumentEditor/Import` | Imports a document and converts it to Syncfusion SFDT |
| `POST` | `/api/DocumentEditor/LoadString` | Converts supplied HTML content to SFDT |
| `POST` | `/api/DocumentEditor/SpellCheck` | Performs spell checking and returns suggestions |
| `POST` | `/api/DocumentEditor/SpellCheckByPage` | Performs page-level spell checking |
| `POST` | `/api/DocumentEditor/MailMerge` | Executes a mail merge against the supplied document and JSON data |
| `POST` | `/api/DocumentEditor/SystemClipboard` | Processes clipboard content while preserving formatting |
| `POST` | `/api/DocumentEditor/RestrictEditing` | Generates the hash values required for document editing restrictions |
| `POST` | `/api/DocumentEditor/LoadDefault` | Loads the server-side default DOCX file |
| `POST` | `/api/DocumentEditor/LoadDocument` | Loads a DOCX from a server path or HTTP/HTTPS URL |
| `POST` | `/api/DocumentEditor/Save` | Saves document content on the server |
| `POST` | `/api/DocumentEditor/ExportSFDT` | Converts SFDT document content to a downloadable document format |
| `POST` | `/api/DocumentEditor/Export` | Exports an uploaded document to the requested output format |
| `GET` / `POST` | `/api/DocumentEditor/GetSections` | Reads the persisted section catalog |
| `POST` / `GET` | `/api/DocumentEditor/SeedSections` | Creates the built-in section entries when they are not present |
| `POST` | `/api/DocumentEditor/SaveSection` | Uploads a DOCX section and persists it in the section catalog |

---
## Resources

- **Product page:**   [Syncfusion® React DOCX Editor](https://www.syncfusion.com/docx-editor-sdk/react-docx-editor?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) 

- **Documentation:**   [Syncfusion® React DOCX Editor - Documentation](https://help.syncfusion.com/document-processing/word/word-processor/react/overview?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) 

- **Online demo:**   [Syncfusion® React DOCX Editor - Online demo](https://document.syncfusion.com/demos/docx-editor/react/#/tailwind3/document-editor/default?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) 

## Support and feedback 

For any other queries, reach our [Syncfusion® support team](https://support.syncfusion.com/?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) or post the queries through the [community forums](https://www.syncfusion.com/forums?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples). 

Request new feature through [Syncfusion® feedback portal](https://www.syncfusion.com/feedback?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples). 

## License

This is a commercial product and requires a paid license for possession or use Syncfusion's licensed software, including this component, is subject to the terms and conditions of [Syncfusion's EULA](https://www.syncfusion.com/license/studio/34.1.29/syncfusion_essential_studio_eula.pdf?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples). You can purchase a licnense [here](https://www.syncfusion.com/sales/products?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) or start a free 30\-day trial [here](https://www.syncfusion.com/account/manage-trials/start-trials?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples). 