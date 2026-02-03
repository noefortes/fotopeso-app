import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface WeightReading {
  weight: number;
  unit: "kg" | "lbs";
  confidence: number;
}

export async function analyzeScaleImage(imageBuffer: Buffer, mimeType: string = 'image/jpeg'): Promise<WeightReading> {
  try {
    const systemPrompt = `You are an expert at reading digital scale displays. 
Analyze this image of a digital scale and extract the weight reading.
Look for numerical displays, LED displays, LCD displays, or any weight measurements shown.
Pay close attention to decimal points and units (kg, lbs, stones, etc.).
Respond with JSON in this exact format: 
{'weight': number, 'unit': string, 'confidence': number}
Where:
- weight is the numerical value as a decimal number
- unit is the unit of measurement (kg, lbs, st, etc.)
- confidence is between 0 and 1 indicating how confident you are in the reading`;

    const contents = [
      {
        inlineData: {
          data: imageBuffer.toString("base64"),
          mimeType: mimeType,
        },
      },
      systemPrompt,
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            weight: { type: "number" },
            unit: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["weight", "unit", "confidence"],
        },
      },
      contents: contents,
    });

    const rawJson = response.text;

    if (rawJson) {
      const data: WeightReading = JSON.parse(rawJson);
      
      // Validate the response
      if (typeof data.weight !== 'number' || data.weight <= 0) {
        throw new Error("Invalid weight reading detected");
      }
      
      if (data.confidence < 0.3) {
        throw new Error("Low confidence in weight reading. Please ensure the scale display is clearly visible and well-lit.");
      }
      
      // Normalize unit to standard values
      let normalizedUnit: "kg" | "lbs" = "lbs";
      const unitLower = data.unit.toLowerCase();
      
      if (unitLower.includes("kg") || unitLower.includes("kilo")) {
        normalizedUnit = "kg";
      } else if (unitLower.includes("lb") || unitLower.includes("pound")) {
        normalizedUnit = "lbs";
      }
      
      return {
        ...data,
        unit: normalizedUnit
      };
    } else {
      throw new Error("No response from AI model");
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to analyze scale image: ${error.message}`);
    }
    throw new Error("Failed to analyze scale image: Unknown error");
  }
}

export async function generateProgressImage(
  userName: string, 
  currentWeight: number, 
  weightLost: number, 
  unit: string,
  profileImageUrl?: string
): Promise<Buffer> {
  try {
    const prompt = `Create a clean, modern social media post image for weight loss progress sharing.
The image should include:
- User name: "${userName}"
- Current weight: "${currentWeight} ${unit}"
- Weight lost: "${weightLost} ${unit}" (show as achievement)
- Clean gradient background (purple to blue)
- Modern typography
- Progress celebration theme
- Instagram/TikTok story format (9:16 aspect ratio)
- Professional health/fitness app branding
Style: Modern, minimalist, motivational, health-focused`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No image generated");
    }

    const content = candidates[0].content;
    if (!content || !content.parts) {
      throw new Error("No content parts in response");
    }

    for (const part of content.parts) {
      if (part.inlineData && part.inlineData.data) {
        return Buffer.from(part.inlineData.data, "base64");
      }
    }

    throw new Error("No image data found in response");
  } catch (error) {
    throw new Error(`Failed to generate progress image: ${error}`);
  }
}
