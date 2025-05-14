import { KnownModel, ollamaInference } from "../modules/ollama";
import { groqRequest } from "../modules/groq-llama3";
import { gptRequest } from "../modules/openai";

export async function imageDescription(src: Uint8Array, model: KnownModel = 'moondream:1.8b-v2-fp16'): Promise<string> {
    return ollamaInference({
        model: model,
        messages: [{
            role: 'system',
            content: 'You are a very advanced model and your task is to describe the image as precisely as possible. Transcribe any text you see.'
        }, {
            role: 'user',
            content: 'Describe the scene',
            images: [src],
        }]
    });
}

export async function llamaFind(question: string, images: string): Promise<string> {
    return new Promise((resolve) => {
        // 全局超时保护
        const globalTimeout = setTimeout(() => {
            console.log("Global timeout triggered - request taking too long");
            resolve("Request timed out. Please try again.");
        }, 40000); // 40秒全局超时
        
        try {
            const controller = new AbortController();
            const requestTimeout = setTimeout(() => {
                console.log("Request timeout triggered - aborting fetch");
                controller.abort();
            }, 30000); // 30秒请求超时
            
            console.log("Starting llamaFind request");
            groqRequest(
                `
                    You are a smart AI that need to read through description of a images and answer user's questions.
                    This are the provided images:
                    ${images}
                    DO NOT mention the images, scenes or descriptions in your answer, just answer the question.
                    DO NOT try to generalize or provide possible scenarios.
                    ONLY use the information in the description of the images to answer the question.
                    BE concise and specific.
                `,
                question,
                { signal: controller.signal }
            ).then(response => {
                clearTimeout(requestTimeout);
                clearTimeout(globalTimeout);
                console.log("llamaFind request completed successfully");
                resolve(response);
            }).catch(error => {
                clearTimeout(requestTimeout);
                console.error("Error in llamaFind request:", error);
                resolve("Sorry, I couldn't process your request. Please try again.");
            });
        } catch (error) {
            clearTimeout(globalTimeout);
            console.error("Error setting up llamaFind request:", error);
            resolve("Failed to set up request. Please try again.");
        }
    });
}

export async function openAIFind(question: string, images: string): Promise<string> {
    return gptRequest(
             `
                You are a smart AI that need to read through description of a images and answer user's questions.

                This are the provided images:
                ${images}

                DO NOT mention the images, scenes or descriptions in your answer, just answer the question.
                DO NOT try to generalize or provide possible scenarios.
                ONLY use the information in the description of the images to answer the question.
                BE concise and specific.
            `
        ,
            question
    );
}