/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { GoogleGenAI } from "@google/genai";
import { cleanBase64 } from "../utils";

// Helper to ensure we always get a fresh instance with the latest key
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to create a blank black image for the video start frame
const createBlankImage = (width: number, height: number): string => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
  }
  const dataUrl = canvas.toDataURL('image/png');
  return cleanBase64(dataUrl);
};

export const generateStyleSuggestion = async (text: string): Promise<string> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a single, creative, short (10-15 words) visual art direction description for a cinematic text animation of the word/phrase: "${text}". 
      Focus on material, lighting, and environment. 
      Examples: "Formed by fluffy white clouds in a deep blue sky", "Glowing neon signs reflected in a rainy street", "Carved from ancient stone in a mossy forest".
      Output ONLY the description.`
    });
    return response.text?.trim() || "";
  } catch (e) {
    console.error("Failed to generate style suggestion", e);
    return "";
  }
};

interface TextImageOptions {
  text: string;
  style: string;
  typographyPrompt?: string;
  referenceImage?: string; // Full Data URL
}

export const generateTextImage = async ({ text, style, typographyPrompt, referenceImage }: TextImageOptions): Promise<{ data: string, mimeType: string }> => {
  const ai = getAI();
  const parts: any[] = [];
  
  const typoInstruction = typographyPrompt && typographyPrompt.trim().length > 0 
    ? typographyPrompt 
    : "High-quality, creative typography that perfectly matches the visual environment. Legible and artistic.";

  if (referenceImage) {
    const [mimeTypePart, data] = referenceImage.split(';base64,');
    parts.push({
      inlineData: {
        data: data,
        mimeType: mimeTypePart.replace('data:', '')
      }
    });
    
    parts.push({ 
      text: `Analyze the visual style, color palette, lighting, and textures of this reference image. 
      Create a NEW high-resolution cinematic image featuring the text "${text}" written in the center. 
      Typography Instruction: ${typoInstruction}.
      The text should look like it perfectly belongs in the world of the reference image.
      Additional style instructions: ${style}.` 
    });
  } else {
    parts.push({ 
      text: `A hyper-realistic, cinematic, high-resolution image featuring the text "${text}". 
      Typography Instruction: ${typoInstruction}. 
      Visual Style: ${style}. 
      The typography must be legible, artistic, and centered. Lighting should be dramatic and atmospheric. 8k resolution, detailed texture.` 
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "1K"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return { 
          data: part.inlineData.data, 
          mimeType: part.inlineData.mimeType || 'image/png' 
        };
      }
    }
    throw new Error("No image generated");
  } catch (error: any) {
    throw error;
  }
};

const pollForVideo = async (operation: any) => {
  const ai = getAI();
  let op = operation;
  const startTime = Date.now();
  const MAX_WAIT_TIME = 180000; 

  while (!op.done) {
    if (Date.now() - startTime > MAX_WAIT_TIME) {
      throw new Error("Video generation timed out.");
    }
    await sleep(5000); 
    op = await ai.operations.getVideosOperation({ operation: op });
  }
  return op;
};

const fetchVideoBlob = async (uri: string) => {
  try {
    const url = new URL(uri);
    url.searchParams.append('key', process.env.API_KEY || '');
    
    const videoResponse = await fetch(url.toString());
    if (!videoResponse.ok) {
      throw new Error(`Failed to fetch video content: ${videoResponse.statusText}`);
    }
    const blob = await videoResponse.blob();
    return URL.createObjectURL(blob);
  } catch (e: any) {
    const fallbackUrl = `${uri}${uri.includes('?') ? '&' : '?'}key=${process.env.API_KEY}`;
    const videoResponse = await fetch(fallbackUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to fetch video content: ${videoResponse.statusText}`);
    }
    const blob = await videoResponse.blob();
    return URL.createObjectURL(blob);
  }
};

export const generateTextVideo = async (text: string, imageBase64: string, imageMimeType: string, promptStyle: string): Promise<string> => {
  const ai = getAI();

  if (!imageBase64) throw new Error("Image generation failed, cannot generate video.");

  const cleanImageBase64 = cleanBase64(imageBase64);

  const maxRevealRetries = 1; 
  for (let i = 0; i <= maxRevealRetries; i++) {
    try {
      const startImage = createBlankImage(1280, 720);
      const revealPrompt = `Cinematic transition. The text "${text}" gradually forms and materializes from darkness. ${promptStyle}. High quality, 8k, smooth motion.`;

      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: revealPrompt,
        image: {
          imageBytes: startImage,
          mimeType: 'image/png'
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9',
          lastFrame: {
            imageBytes: cleanImageBase64,
            mimeType: imageMimeType
          }
        }
      });

      const op = await pollForVideo(operation);

      if (!op.error && op.response?.generatedVideos?.[0]?.video?.uri) {
        return await fetchVideoBlob(op.response.generatedVideos[0].video.uri);
      }
      
      if (op.error) {
        if (i < maxRevealRetries) {
          await sleep(3000);
          continue; 
        }
        throw new Error(op.error.message);
      }
    } catch (error: any) {
      if (i === maxRevealRetries) throw error;
      await sleep(3000);
    }
  }

  throw new Error("Unable to generate video.");
};
