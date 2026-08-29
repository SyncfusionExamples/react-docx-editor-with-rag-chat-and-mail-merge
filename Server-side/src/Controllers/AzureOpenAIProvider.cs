using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Azure;
using Azure.AI.OpenAI;
using DOCXEditorAPIServices.Models;
using Microsoft.Extensions.Options;

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

            if (string.IsNullOrWhiteSpace(_settings.Endpoint) ||
                string.IsNullOrWhiteSpace(_settings.ApiKey) ||
                string.IsNullOrWhiteSpace(_settings.DeploymentName))
            {
                return "Azure OpenAI is not configured. Set AzureOpenAI:Endpoint, AzureOpenAI:ApiKey, and AzureOpenAI:DeploymentName in appsettings.json.";
            }

            var client = new AzureOpenAIClient(
                new Uri(_settings.Endpoint),
                new AzureKeyCredential(_settings.ApiKey));

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

            var chatClient = client.GetChatClient(_settings.DeploymentName);
            OpenAI.Chat.ChatCompletion completion = await chatClient.CompleteChatAsync(chatMessages, options);

            return completion.Content.Count > 0 ? completion.Content[0].Text : string.Empty;
        }
    }

    public class AzureOpenAIOptions
    {
        public string Endpoint { get; set; } = string.Empty;

        public string ApiKey { get; set; } = string.Empty;

        public string DeploymentName { get; set; } = string.Empty;
    }
}