import { SERVICE_URL } from './service-config.js';

export async function getAzureChatAIRequest(options) {
    try {
        const response = await fetch(
            `${SERVICE_URL}Process`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(options)
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
