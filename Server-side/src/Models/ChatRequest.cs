using System.Collections.Generic;

namespace DOCXEditorAPIServices.Models
{
    public class ChatRequest
    {
        public List<ChatMessageRequest> Messages { get; set; } = new();

        // Present in the original React payload.
        public string? Model { get; set; }

        public float? Temperature { get; set; }

        public float? TopP { get; set; }

        public int? MaxTokens { get; set; }

        public float? FrequencyPenalty { get; set; }

        public float? PresencePenalty { get; set; }

        public List<string>? StopSequences { get; set; }
    }

    public class ChatMessageRequest
    {
        public string Role { get; set; } = string.Empty;

        public string Content { get; set; } = string.Empty;
    }

    public class ChatResponse
    {
        public string Text { get; set; } = string.Empty;
    }
}