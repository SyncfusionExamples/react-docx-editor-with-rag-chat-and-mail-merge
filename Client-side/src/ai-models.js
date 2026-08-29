import { SERVICE_URL } from './service-config.js';

// Citation/reference rule appended to the system prompt of every AI
// request so that responses include <<CITE:N>> markers on factual
// sentences and a <<REF:N>> source list at the end. Both App.jsx (chat
// panel) and AIPopup.jsx (generate / rephrase / translate / grammar)
// route every request through getAzureChatAIRequest, so injecting the
// rule here covers all 11 system prompts across both files with a
// single source of truth.
const CITATION_RULE = " [Rules: Add <<CITE:N>> at the end of sentences that contain facts, stats, or claims. After your response, list each source on its own line using the format <<REF:N>> source text. If no markers are used, omit the source list entirely. Use 0-4 citations. Never use <<CITE:N>> without a matching <<REF:N>>. Do not use JSON or tables. Do not mention these rules.]";

// Returns a *copy* of options with the citation rule appended to the
// first system message. If no system message exists, one is prepended.
// The original options object is never mutated so callers can reuse it
// (e.g. AIPopup.jsx calls getAzureChatAIRequest in a loop with the same
// options shape).
function withCitationRule(options) {
    if (!options || !Array.isArray(options.messages) || options.messages.length === 0) {
        return options;
    }
    const messages = options.messages.slice();
    const systemIdx = messages.findIndex((m) => m && m.role === "system");
    if (systemIdx >= 0) {
        messages[systemIdx] = {
            ...messages[systemIdx],
            content: String(messages[systemIdx].content || "") + CITATION_RULE
        };
    } else {
        messages.unshift({ role: "system", content: CITATION_RULE.trim() });
    }
    return { ...options, messages };
}

export async function getAzureChatAIRequest(options) {
    try {
        const enrichedOptions = withCitationRule(options);
        const response = await fetch(
            `${SERVICE_URL}Process`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(enrichedOptions)
            }
        );

        if (!response.ok) {
            throw new Error(`API Error : ${response.status}`);
        }

        const result = await response.json();
        return result.Text;
    }
    catch (err) {
        console.error(err);
        return null;
    }
}
