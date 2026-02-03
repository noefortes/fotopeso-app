import type { Express } from "express";
import multer from "multer";
import { isAuthenticated } from "../auth";
import { analyzeScaleImage } from "../gemini";
import { resolveMarket } from "../utils/marketResolver";
import { convertWeight, type WeightUnit } from "../../shared/utils";

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

export function registerWeightDetectionRoutes(app: Express) {
  // AI weight detection endpoint
  app.post('/api/detect-weight', isAuthenticated, upload.single('photo'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('Processing weight detection for image:', {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        });
      }

      // Resolve market from request
      const market = resolveMarket(req);
      
      // Use Gemini AI to analyze the scale image
      const result = await analyzeScaleImage(req.file.buffer, req.file.mimetype);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('AI analysis result:', result);
        console.log('Market:', market.id);
      }

      if (!result.weight || !result.unit) {
        return res.status(422).json({ 
          message: "Could not detect weight reading from the image. Please ensure the scale display is clearly visible." 
        });
      }

      // For Brazilian market (fotopeso.com.br), always convert to kg
      let finalWeight = result.weight;
      let finalUnit = result.unit as WeightUnit;
      
      if (market.id === 'br' && finalUnit !== 'kg') {
        finalWeight = convertWeight(result.weight, finalUnit, 'kg');
        finalUnit = 'kg';
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`Brazilian market: Converted ${result.weight} ${result.unit} to ${finalWeight} kg`);
        }
      }

      res.json({
        weight: finalWeight,
        unit: finalUnit,
        confidence: result.confidence || 0.5,
        message: "Weight detected successfully"
      });

    } catch (error) {
      console.error("Weight detection error:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to analyze image" 
      });
    }
  });
}