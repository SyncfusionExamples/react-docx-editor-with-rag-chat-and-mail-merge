using Azure;
using Azure.AI.OpenAI;
using DOCXEditorAPIServices.Models;
using Microsoft.Extensions.Options;
using OpenAI.Chat;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace DOCXEditorAPIServices.Providers
{
    public class AzureOpenAIProvider
    {
        private readonly AzureOpenAIOptions _settings;

        public AzureOpenAIProvider(IOptions<AzureOpenAIOptions> options)
        {
            _settings = options.Value;
        }

        public async Task<string> CompleteChatAsync(ChatRequest request)
        {
            if (request == null)
                throw new ArgumentNullException(nameof(request));

            if (request.Messages == null || request.Messages.Count == 0)
                throw new ArgumentException("At least one chat message is required.");

            // Prefer the dedicated chat resource (ChatEndpoint/ChatApiKey/
            // ChatDeploymentName). Fall back to the shared Endpoint/ApiKey/
            // DeploymentName keys when the chat-specific keys are missing.
            string chatEndpoint = string.IsNullOrWhiteSpace(_settings.ChatEndpoint)
                ? _settings.Endpoint
                : _settings.ChatEndpoint;
            string chatApiKey = string.IsNullOrWhiteSpace(_settings.ChatApiKey)
                ? _settings.ApiKey
                : _settings.ChatApiKey;
            string chatDeploymentName = string.IsNullOrWhiteSpace(_settings.ChatDeploymentName)
                ? _settings.DeploymentName
                : _settings.ChatDeploymentName;

            if (string.IsNullOrWhiteSpace(chatEndpoint) ||
                string.IsNullOrWhiteSpace(chatApiKey) ||
                string.IsNullOrWhiteSpace(chatDeploymentName))
            {
                return "Azure OpenAI is not configured. Set AzureOpenAI:ChatEndpoint, AzureOpenAI:ChatApiKey, and AzureOpenAI:ChatDeploymentName (or the shared Endpoint/ApiKey/DeploymentName) in appsettings.json.";
            }

            AzureOpenAIClient chatClientWrapper = new(
              new Uri(chatEndpoint),
              new AzureKeyCredential(chatApiKey));

            var chatClient = chatClientWrapper.GetChatClient(chatDeploymentName);

            var chatMessages = new List<OpenAI.Chat.ChatMessage>();

            foreach (var message in request.Messages)
            {
                var role = message.Role?.ToLowerInvariant() ?? "user";

                switch (role)
                {
                    case "system":
                        chatMessages.Add(new OpenAI.Chat.SystemChatMessage(message.Content ?? string.Empty));
                        break;

                    case "assistant":
                        chatMessages.Add(new OpenAI.Chat.AssistantChatMessage(message.Content ?? string.Empty));
                        break;

                    case "user":
                    default:
                        chatMessages.Add(new OpenAI.Chat.UserChatMessage(message.Content));
                        break;
                }
            }

            var options = new OpenAI.Chat.ChatCompletionOptions();

            if (request.Temperature.HasValue)
                options.Temperature = request.Temperature.Value;

            if (request.TopP.HasValue)
                options.TopP = request.TopP.Value;

            if (request.FrequencyPenalty.HasValue)
                options.FrequencyPenalty = request.FrequencyPenalty.Value;

            if (request.PresencePenalty.HasValue)
                options.PresencePenalty = request.PresencePenalty.Value;

            if (request.StopSequences != null)
            {
                foreach (var stop in request.StopSequences)
                {
                    options.StopSequences.Add(stop);
                }
            }

            
            OpenAI.Chat.ChatCompletion completion = await chatClient.CompleteChatAsync(chatMessages, options);

            return completion.Content.Count > 0 ? completion.Content[0].Text : string.Empty;
        }
    }

    public class AzureOpenAIOptions
    {
        public string Endpoint { get; set; } = string.Empty;

        public string ApiKey { get; set; } = string.Empty;

        public string DeploymentName { get; set; } = string.Empty;

        // Dedicated chat resource (preferred for chat completions).
        public string ChatEndpoint { get; set; } = string.Empty;

        public string ChatApiKey { get; set; } = string.Empty;

        public string ChatDeploymentName { get; set; } = string.Empty;
    }
}