# Mail Merge, AI‑Powered Editing and RAG Chat in React DOCX Editor

## Introduction

This sample demonstrates how the Syncfusion<sup style="font-size:70%">&reg;</sup> [React DOCX Editor](https://www.syncfusion.com/docx-editor-sdk/react-docx-editor?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) (Document Editor) provides a DOCX editing workspace with AI assistance, mail merge, reusable section templates, and document-aware RAG (Retrieval-Augmented Generation) chat. The ASP.NET Core backend handles document conversion, mail merge processing, Azure OpenAI requests, and document indexing/retrieval.


## Sample Demonstrates

- Using **Azure OpenAI** for AI-assisted document editing and chat.
- Performing **server-side mail merge** using JSON data.
- Creating and persisting reusable **document section templates**.
- Implementing **RAG-based document chat** using Syncfusion DocumentChunking and Azure OpenAI embeddings.
- Returning the relevant document heading from RAG responses so the client can navigate the user to the cited source section.

## Prerequisites

Before running the sample, install or configure the following:

- **Node.js 18 or later** and npm.
- **.NET 10 SDK**.
- An **Azure OpenAI** resource with:
  - A chat model deployment.
  - An embedding model deployment.
- A valid **Syncfusion license**

### Azure OpenAI Configuration

Update the Azure OpenAI settings in:

```text
Server-side/src/appsettings.json
```

Configure:

```json
"AzureOpenAI": {
  "EmbeddingEndpoint": "<embedding-resource-endpoint>",
  "EmbeddingApiKey": "<embedding-api-key>",
  "EmbeddingDeploymentName": "<embedding-deployment-name>",
  "ChatEndpoint": "<chat-resource-endpoint>",
  "ChatApiKey": "<chat-api-key>",
  "ChatDeploymentName": "<chat-deployment-name>"
}
```

## How to Run This Sample

The sample contains separate React and ASP.NET Core applications.

### 1. Start the ASP.NET Core Server

Open a terminal in:

```text
Server-side/
```

Restore the .NET dependencies:

```bash
dotnet restore
```

Configure the Azure OpenAI settings in:

```text
Server-side/src/appsettings.json
```

Run the API:

```bash
dotnet run --project src/DOCXEditorAPIServices_NET10.csproj
```

The configured development URL is:

```text
http://localhost:62870
```

### 2. Start the React Client

The client is configured to use:

```text
http://localhost:62870
```

through:

```text
Client-side/src/service-config.js
```

If the ASP.NET Core API is hosted at another URL, update `API_BASE_URL` in that file.

Open another terminal in:

```text
Client-side/
```

Install the npm dependencies:

```bash
npm install
```

Start the React development server:

```bash
npm run dev
```

Open the URL displayed by Vite in the terminal.


## Sample Features

| Feature | Brief Description |
| --- | --- |
| DOCX Document Editing | Provides a rich document editing experience using Syncfusion React DocumentEditor. |
| AI-Assisted Editing | Sends AI prompts and messages from the React AI UI to Azure OpenAI through the ASP.NET Core API. |
| Mail Merge | Converts the current document to DOCX, executes a server-side mail merge using JSON data, and opens the merged result back in the editor. |
| Reusable Sections | Uploads DOCX files as reusable sections and persists their SFDT representation in the server-side section catalog. |
| RAG Document Chat | Chunks document content, generates embeddings, retrieves relevant chunks, and uses Azure OpenAI to generate grounded answers. |
| Source Navigation | Returns the relevant heading path with the RAG response so the client can navigate to the corresponding document section. |

## Demo

The following GIF demonstrates Mail Merge, AI-Powered Editing, and RAG Chat in Syncfusion React DOCX Editor.

![Mail Merge, AI-Powered Editing and RAG Chat in Syncfusion React DOCX Editor](/images/MailMerge-AIPoweredEditing-and-RAG-Chat-in-React-DOCX-Editor.gif)

## APIs Used by the React Sample

The React application communicates with the ASP.NET Core backend through:

```text
/api/DocumentEditor/
```

| HTTP Method | API | Usage in the React Sample |
| --- | --- | --- |
| `POST` | `/api/DocumentEditor/Process` | Sends AI prompts/messages from the React AI assistance UI to Azure OpenAI through the server. |
| `POST` | `/api/DocumentEditor/Import` | Converts an uploaded document to SFDT so it can be opened or inserted in the DocumentEditor. |
| `POST` | `/api/DocumentEditor/LoadString` | Converts generated HTML content to SFDT for opening in the DocumentEditor during AI-assisted editing. |
| `GET` | `/api/DocumentEditor/GetSections` | Retrieves the persisted reusable section catalog when the React application starts. |
| `POST` | `/api/DocumentEditor/SaveSection` | Uploads a DOCX section, converts it to SFDT, and persists it in the section catalog. |
| `POST` | `/api/DocumentEditor/MailMerge` | Executes a server-side mail merge using the current DOCX document and JSON data, then returns the merged document as SFDT. |
| `POST` | `/api/DocumentEditor/AskQuestion` | Performs document-aware RAG retrieval and returns an Azure OpenAI-generated answer together with the relevant heading path. |


## Resources

- **Product page:**   [Syncfusion® React DOCX Editor](https://www.syncfusion.com/docx-editor-sdk/react-docx-editor?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) 

- **Documentation:**   [Syncfusion® React DOCX Editor - Documentation](https://help.syncfusion.com/document-processing/word/word-processor/react/overview?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) 

- **Online demo:**   [Syncfusion® React DOCX Editor - Online demo](https://document.syncfusion.com/demos/docx-editor/react/#/tailwind3/document-editor/default?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) 

## Support and feedback 

For any other queries, reach our [Syncfusion® support team](https://support.syncfusion.com/?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) or post the queries through the [community forums](https://www.syncfusion.com/forums?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples). 

Request new feature through [Syncfusion® feedback portal](https://www.syncfusion.com/feedback?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples). 

## License

This is a commercial product and requires a paid license for possession or use Syncfusion's licensed software, including this component, is subject to the terms and conditions of [Syncfusion's EULA](https://www.syncfusion.com/license/studio/syncfusion_essential_studio_eula.pdf?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples). You can purchase a licnense [here](https://www.syncfusion.com/sales/products?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples) or start a free 30\-day trial [here](https://www.syncfusion.com/account/manage-trials/start-trials?utm_source=github&utm_medium=listing&utm_campaign=github-github-documenteditor-examples). 
