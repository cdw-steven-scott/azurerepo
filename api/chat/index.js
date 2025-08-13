module.exports = async function (context, req) {
    // Retrieve the API key from a secure environment variable, not hardcoded.
    const apiKey = process.env["AZURE_OPENAI_KEY_VAULT_KEY"];
    const endpoint = process.env["AZURE_OPENAI_KEY_VAULT_ENDPOINT"];
    const deploymentName = "chatdeploy"; // Your deployment name

    const userMessage = req.body.userMessage;
    const chatHistory = req.body.chatHistory;

    if (!apiKey || !endpoint) {
        context.res = {
            status: 500,
            body: "Server configuration error: API key or endpoint not found."
        };
        return;
    }

    try {
        const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`;
        
        const payload = {
            messages: [...chatHistory, { role: "user", content: userMessage }],
            stream: false
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const error = await response.json();
            context.res = {
                status: response.status,
                body: { message: `OpenAI API Error: ${error.message}` }
            };
            return;
        }

        const data = await response.json();
        const aiResponse = data.choices[0].message.content;

        context.res = {
            status: 200,
            body: { message: aiResponse }
        };

    } catch (error) {
        context.res = {
            status: 500,
            body: { message: `An unexpected error occurred: ${error.message}` }
        };
    }
};
