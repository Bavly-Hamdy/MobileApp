/**
 * Gemini API Client
 * Handles all interactions with Google's Gemini API
 */

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason: string;
  }>;
}

interface GeminiRequest {
  contents: Array<{
    parts: Array<{
      text: string;
    }>;
  }>;
  generationConfig?: {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
  };
}

// Direct API key configuration
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// In-memory cache for recent queries
const queryCache = new Map<string, { response: string; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const REQUEST_THROTTLE = 1000; // 1 second between requests
let lastRequestTime = 0;

/**
 * Throttle requests to respect API rate limits
 */
const throttleRequest = async (): Promise<void> => {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < REQUEST_THROTTLE) {
    const waitTime = REQUEST_THROTTLE - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
};

/**
 * Get cached response if available and not expired
 */
const getCachedResponse = (query: string): string | null => {
  const cached = queryCache.get(query);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('🎯 Returning cached response for:', query.substring(0, 50) + '...');
    return cached.response;
  }
  if (cached) {
    queryCache.delete(query);
  }
  return null;
};

/**
 * Cache a response for future use
 */
const cacheResponse = (query: string, response: string): void => {
  queryCache.set(query, { response, timestamp: Date.now() });
  console.log('💾 Cached response for:', query.substring(0, 50) + '...');
};

/**
 * Make a request to Gemini API with exponential backoff retry
 */
const makeGeminiRequest = async (
  payload: GeminiRequest,
  retryCount = 0
): Promise<GeminiResponse> => {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured.');
  }

  const maxRetries = 2;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  console.log('→ Gemini request:', { 
    url, 
    payload: JSON.stringify(payload, null, 2),
    attempt: retryCount + 1,
    maxRetries: maxRetries + 1
  });
  
  try {
    await throttleRequest();
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('← Gemini response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorData = await response.clone().json().catch(() => ({}));
      console.error('← Gemini error response:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      if (response.status === 429) {
        throw new Error('API_RATE_LIMIT_EXCEEDED');
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${JSON.stringify(errorData)}`);
    }

    const data: GeminiResponse = await response.json();
    console.log('← Gemini success response:', {
      candidatesCount: data.candidates?.length || 0,
      firstResponse: data.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 100) + '...'
    });
    
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No response candidates from Gemini API');
    }

    return data;
  } catch (error) {
    console.error(`❌ Gemini API request failed (attempt ${retryCount + 1}):`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      url,
      retryCount
    });
    
    // Don't retry if we hit the rate limit - wait until next minute instead
    if (error instanceof Error && error.message === 'API_RATE_LIMIT_EXCEEDED') {
      throw new Error('RATE_LIMIT_EXCEEDED');
    }
    
    if (retryCount < maxRetries) {
      // Exponential backoff: wait 2^retryCount seconds
      const backoffTime = Math.pow(2, retryCount) * 1000;
      console.log(`⏳ Retrying in ${backoffTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
      return makeGeminiRequest(payload, retryCount + 1);
    }
    
    throw error;
  }
};

/**
 * Send a message to Gemini and get a response
 * @param prompt - The user's message/prompt
 * @param deepThinking - Whether to use deep thinking mode
 * @returns Promise<string> - The AI response
 */
export const askGemini = async (
  prompt: string,
  deepThinking = false
): Promise<string> => {
  try {
    console.log('🤖 askGemini called:', { 
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      deepThinking 
    });

    // Check cache first
    const cacheKey = `${prompt}_${deepThinking}`;
    const cachedResponse = getCachedResponse(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    const systemPrompt = deepThinking 
      ? "You are an expert medical assistant. Analyze problems systematically but keep your final output focused, highly concise, and direct. Provide brief, actionable, and structured recommendations without excessive fluff. Support both Arabic and English."
      : "You are a professional medical assistant. Provide highly concise, direct, and specific responses that get straight to the point. Do not write long essays; keep your answers brief, actionable, and structured using clean Markdown. Support both Arabic and English.";

    const payload: GeminiRequest = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        temperature: deepThinking ? 0.7 : 0.9,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4096,
      }
    };

    const response = await makeGeminiRequest(payload);
    const responseText = response.candidates[0].content.parts[0].text;
    
    // Cache the response
    cacheResponse(cacheKey, responseText);
    
    console.log('✅ askGemini successful:', {
      responseLength: responseText.length,
      preview: responseText.substring(0, 100) + '...'
    });
    
    return responseText;
  } catch (error) {
    console.error('💥 Error in askGemini:', error);
    if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
      throw new Error('تم تجاوز الحد المسموح به من الطلبات. يرجى الانتظار لمدة دقيقة والمحاولة مرة أخرى.');
    }
    throw new Error('حدث خطأ أثناء الاتصال بـ Gemini. الرجاء المحاولة لاحقًا.');
  }
};

/**
 * Send a message to Gemini and stream the response chunk by chunk with automatic retries for temporary errors
 * @param prompt - The user's message/prompt
 * @param onChunk - Callback triggered when a new text chunk is received
 * @param deepThinking - Whether to use deep thinking mode
 * @param retryCount - Current retry attempt count (internal use)
 * @returns Promise<string> - The complete accumulated AI response
 */
export const askGeminiStream = async (
  prompt: string,
  onChunk: (chunk: string) => void,
  deepThinking = false,
  retryCount = 0
): Promise<string> => {
  const maxRetries = 3;

  try {
    console.log('🤖 askGeminiStream called:', { 
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      deepThinking,
      attempt: retryCount + 1
    });

    // Check cache first
    const cacheKey = `${prompt}_${deepThinking}`;
    const cachedResponse = getCachedResponse(cacheKey);
    if (cachedResponse && retryCount === 0) {
      onChunk(cachedResponse);
      return cachedResponse;
    }

    const systemPrompt = deepThinking 
      ? "You are an expert medical assistant. Analyze problems systematically but keep your final output focused, highly concise, and direct. Provide brief, actionable, and structured recommendations without excessive fluff. Support both Arabic and English."
      : "You are a professional medical assistant. Provide highly concise, direct, and specific responses that get straight to the point. Do not write long essays; keep your answers brief, actionable, and structured using clean Markdown. Support both Arabic and English.";

    const payload: GeminiRequest = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        temperature: deepThinking ? 0.7 : 0.9,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4096,
      }
    };

    if (!GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured.');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
    
    console.log('→ Gemini stream request:', { 
      url, 
      payload: JSON.stringify(payload, null, 2)
    });

    await throttleRequest();
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('← Gemini stream response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorData = await response.clone().json().catch(() => ({}));
      console.error('← Gemini stream error response:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });

      const isRateLimit = response.status === 429;
      const isUnavailable = response.status === 503;
      
      // If it's a temporary error (503/429/etc.), attempt a retry with backoff
      if ((isUnavailable || isRateLimit || response.status >= 500) && retryCount < maxRetries) {
        const backoffTime = Math.pow(2, retryCount) * 1500; // 1.5s, 3s, 6s...
        console.warn(`⏳ Temporary stream error ${response.status}. Retrying in ${backoffTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        return askGeminiStream(prompt, onChunk, deepThinking, retryCount + 1);
      }

      if (isRateLimit) {
        throw new Error('RATE_LIMIT_EXCEEDED');
      }
      if (isUnavailable) {
        throw new Error('SERVICE_UNAVAILABLE');
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          const dataStr = trimmed.slice(6).trim();
          if (!dataStr) continue;
          try {
            const parsed = JSON.parse(dataStr);
            const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (chunkText) {
              fullText += chunkText;
              onChunk(chunkText);
            }
          } catch (e) {
            console.error("Error parsing stream line:", trimmed, e);
          }
        }
      }
    }

    // Process any remaining text in the buffer
    if (buffer.trim().startsWith("data: ")) {
      const dataStr = buffer.trim().slice(6).trim();
      try {
        const parsed = JSON.parse(dataStr);
        const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (chunkText) {
          fullText += chunkText;
          onChunk(chunkText);
        }
      } catch (e) {
        // ignore incomplete final buffer
      }
    }
    
    if (!fullText) {
      throw new Error('No response candidates from Gemini API');
    }

    // Cache the response
    cacheResponse(cacheKey, fullText);
    
    console.log('✅ askGeminiStream successful:', {
      responseLength: fullText.length,
      preview: fullText.substring(0, 100) + '...'
    });
    
    return fullText;
  } catch (error) {
    console.error(`💥 Error in askGeminiStream (attempt ${retryCount + 1}):`, error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRateLimit = errorMessage === 'RATE_LIMIT_EXCEEDED' || errorMessage.includes('429');
    const isUnavailable = errorMessage === 'SERVICE_UNAVAILABLE' || errorMessage.includes('503') || errorMessage.toLowerCase().includes('unavailable');

    // Retry on generic network / fetch failures (e.g. TypeErrors)
    if (!isRateLimit && !isUnavailable && retryCount < maxRetries) {
      const backoffTime = Math.pow(2, retryCount) * 1500;
      console.warn(`⏳ Network or connection failed in stream. Retrying in ${backoffTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
      return askGeminiStream(prompt, onChunk, deepThinking, retryCount + 1);
    }

    if (isRateLimit) {
      throw new Error('تم تجاوز الحد المسموح به من الطلبات. يرجى الانتظار لمدة دقيقة والمحاولة مرة أخرى.');
    }
    if (isUnavailable) {
      throw new Error('النموذج يواجه ضغطًا كبيرًا حاليًا (الخدمة غير متوفرة مؤقتًا). يرجى المحاولة مرة أخرى بعد قليل.');
    }
    throw new Error('حدث خطأ أثناء الاتصال بـ Gemini. الرجاء المحاولة لاحقًا.');
  }
};



/**
 * Summarize a file using Gemini API
 * @param fileUrl - URL or content of the file to summarize
 * @returns Promise<string> - The file summary
 */
export const summarizeFile = async (fileUrl: string): Promise<string> => {
  try {
    console.log('📄 summarizeFile called:', { fileUrl: fileUrl.substring(0, 100) + '...' });

    const prompt = `Please analyze and summarize the following file content or URL: ${fileUrl}. Provide a clear, concise summary in both Arabic and English if applicable.`;
    
    const payload: GeminiRequest = {
      contents: [
        {
          parts: [
            { text: "You are a helpful assistant that can analyze and summarize files and documents." },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        topK: 20,
        topP: 0.8,
        maxOutputTokens: 1024,
      }
    };

    const response = await makeGeminiRequest(payload);
    const responseText = response.candidates[0].content.parts[0].text;
    
    console.log('✅ summarizeFile successful:', {
      responseLength: responseText.length,
      preview: responseText.substring(0, 100) + '...'
    });
    
    return responseText;
  } catch (error) {
    console.error('💥 Error in summarizeFile:', error);
    throw new Error('حدث خطأ أثناء تحليل الملف. الرجاء المحاولة لاحقًا.');
  }
};

/**
 * Health check function to test Gemini connectivity
 */
export const pingGemini = async (): Promise<{ status: string; message: string }> => {
  try {
    console.log('🏥 pingGemini: Testing Gemini connectivity...');
    
    const testPrompt = "Hello, please respond with 'OK' to confirm connectivity.";
    const response = await askGemini(testPrompt, false);
    
    return {
      status: 'success',
      message: `Gemini is responding: ${response.substring(0, 50)}...`
    };
  } catch (error) {
    console.error('🔴 pingGemini failed:', error);
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Clear the query cache (useful for testing or memory management)
 */
export const clearCache = (): void => {
  queryCache.clear();
};

/**
 * Get cache statistics for debugging
 */
export const getCacheStats = () => ({
  size: queryCache.size,
  entries: Array.from(queryCache.keys()).map(key => ({
    query: key.substring(0, 50) + '...',
    timestamp: queryCache.get(key)?.timestamp
  }))
});
