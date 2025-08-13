module.exports = async function (context, req) {
    const apiKey = process.env["AZURE_OPENAI_KEY_VAULT_KEY"];
    const endpoint = process.env["AZURE_OPENAI_KEY_VAULT_ENDPOINT"];
    const deploymentName = process.env["AZURE_OPENAI_DEPLOYMENT_NAME"];

    context.log("Azure Function received request.");
    context.log(`Environment variables check:
    - AZURE_OPENAI_KEY_VAULT_KEY: ${apiKey ? 'Found' : 'Not Found'}
    - AZURE_OPENAI_KEY_VAULT_ENDPOINT: ${endpoint ? 'Found' : 'Not Found'}
    - AZURE_OPENAI_DEPLOYMENT_NAME: ${deploymentName ? 'Found' : 'Not Found'}
    `);

    if (!apiKey) {
        context.log("Error: AZURE_OPENAI_KEY_VAULT_KEY is missing from environment variables.");
        context.res = {
            status: 500,
            body: { message: "Server configuration error: API key not found. Please check your App Service environment variables." }
        };
        return;
    }

    if (!endpoint) {
        context.log("Error: AZURE_OPENAI_KEY_VAULT_ENDPOINT is missing from environment variables.");
        context.res = {
            status: 500,
            body: { message: "Server configuration error: Endpoint not found. Please check your App Service environment variables." }
        };
        return;
    }

    if (!deploymentName) {
        context.log("Error: AZURE_OPENAI_DEPLOYMENT_NAME is missing from environment variables.");
        context.res = {
            status: 500,
            body: { message: "Server configuration error: Deployment name not found. Please check your App Service environment variables." }
        };
        return;
    }

    const userMessage = req.body.userMessage;
    const chatHistory = req.body.chatHistory;

    try {
        const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2024-02-15-preview`;
        
        const payload = {
            messages: chatHistory,
            stream: false
        };

        context.log(`Attempting to call OpenAI API at: ${url}`);
        
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
            context.log(`OpenAI API responded with status ${response.status}: ${JSON.stringify(error)}`);
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
        context.log("Successfully retrieved response from OpenAI API.");

    } catch (error) {
        context.log(`An unexpected error occurred: ${error.message}`);
        context.res = {
            status: 500,
            body: { message: `An unexpected error occurred: ${error.message}` }
        };
    }
};

