import type { Express, Request, Response } from "express";
import express from "express";
import crypto from "crypto";
import { storage } from "../storage";
import { analyzeScaleImage } from "../gemini";
import { convertWeight } from "@shared/utils";

interface RespondIOWebhookPayload {
  event: string;
  data: {
    messageId?: string;
    conversationId?: string;
    contactId?: string;
    content?: string;
    timestamp?: number;
    channel?: string;
    contact?: {
      id: string;
      name?: string;
      phone?: string;
      email?: string;
    };
    message?: {
      id: string;
      type: string;
      content?: string;
      attachments?: Array<{
        type: string;
        url: string;
        mimeType?: string;
      }>;
    };
  };
}

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  if (!secret) {
    console.warn('[WEBHOOK] No webhook secret configured - skipping signature verification');
    return true;
  }
  
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');
  return signature === digest;
}

async function handleIncomingMessage(payload: RespondIOWebhookPayload) {
  const { data } = payload;
  const phoneNumber = data.contact?.phone;
  
  if (!phoneNumber) {
    console.log('[WEBHOOK] No phone number in message, skipping');
    return;
  }

  const user = await storage.getUserByWhatsAppPhone(phoneNumber);
  
  if (!user) {
    console.log('[WEBHOOK] No user found for phone:', phoneNumber);
    return { 
      reply: "Hi! It looks like this number isn't connected to FotoPeso. Please connect your WhatsApp in the app settings first." 
    };
  }

  if (user.whatsappStatus === 'expired') {
    console.log('[WEBHOOK] User WhatsApp access expired:', user.id);
    return { 
      reply: "Your WhatsApp trial has expired. Please upgrade your plan to continue using WhatsApp integration." 
    };
  }

  const message = data.message;
  
  if (message?.type === 'image' && message.attachments?.[0]?.url) {
    const imageUrl = message.attachments[0].url;
    
    try {
      const imageResponse = await fetch(imageUrl);
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      
      const result = await analyzeScaleImage(imageBuffer);
      
      if (result.weight) {
        const weightInKg = convertWeight(result.weight, result.unit || 'kg', 'kg');
        
        await storage.createWeightEntry({
          userId: user.id,
          weight: weightInKg.toString(),
          unit: 'kg',
          photoUrl: imageUrl,
        });

        await storage.createWhatsAppInteraction({
          userId: user.id,
          messageType: 'photo_response',
          direction: 'inbound',
          status: 'delivered',
          cost: '0',
          metadata: { content: 'Image received', imageUrl },
        });

        await storage.createWhatsAppInteraction({
          userId: user.id,
          messageType: 'photo_response',
          direction: 'outbound',
          status: 'sent',
          cost: '0.005',
          metadata: { content: `Weight detected: ${result.weight} ${result.unit}` },
        });

        return { 
          reply: `✅ Weight recorded: ${result.weight} ${result.unit}\n\nYour weight has been saved to your FotoPeso account!` 
        };
      } else {
        return { 
          reply: `❌ Could not detect weight from the image. Please make sure:\n• The scale display is clearly visible\n• The image is well-lit\n• The numbers are in focus` 
        };
      }
    } catch (error) {
      console.error('[WEBHOOK] Error processing scale image:', error);
      return { 
        reply: '❌ Error processing your image. Please try again.' 
      };
    }
  } else if (message?.content) {
    const content = message.content.toLowerCase().trim();
    
    if (content === 'help' || content === 'ajuda') {
      return {
        reply: `📱 *FotoPeso WhatsApp Commands*\n\n• Send a scale photo to record your weight\n• Reply "status" to see your progress\n• Reply "help" to see this message\n\nYou can also use the app at fotopeso.com.br`
      };
    } else if (content === 'status') {
      const entries = await storage.getUserWeightEntries(user.id);
      const latestEntry = entries[0];
      
      if (latestEntry) {
        const displayUnit = (user.weightUnit || 'kg') as 'kg' | 'lbs';
        const displayWeight = convertWeight(parseFloat(latestEntry.weight), 'kg', displayUnit);
        
        return {
          reply: `📊 *Your Progress*\n\nCurrent weight: ${displayWeight.toFixed(1)} ${displayUnit}\nLast updated: ${new Date(latestEntry.createdAt || '').toLocaleDateString('pt-BR')}\n\nView detailed charts at fotopeso.com.br`
        };
      } else {
        return {
          reply: `You haven't recorded any weights yet. Send a photo of your scale to get started!`
        };
      }
    } else {
      return {
        reply: `Please send a photo of your scale to record your weight, or reply "help" for more options.`
      };
    }
  }

  return null;
}

export function registerRespondIOWebhook(app: Express) {
  app.post('/api/webhooks/respondio',
    express.json({
      verify: (req: any, res, buf) => {
        // Store raw body for signature verification
        req.rawBody = buf.toString('utf8');
      }
    }),
    async (req: Request & { rawBody?: string }, res: Response) => {
    try {
      console.log('[WEBHOOK] === INCOMING REQUEST ===');
      console.log('[WEBHOOK] Headers:', JSON.stringify(req.headers, null, 2));
      console.log('[WEBHOOK] Body:', JSON.stringify(req.body, null, 2));
      
      const signature = req.headers['x-respond-signature'] as string;
      const webhookSecret = process.env.RESPONDIO_WEBHOOK_SECRET || '';
      
      const payload = req.rawBody || JSON.stringify(req.body);
      const isValid = verifyWebhookSignature(payload, signature, webhookSecret);
      
      if (!isValid) {
        console.error('[WEBHOOK] Invalid signature - ACCEPTING ANYWAY FOR DEBUG');
        console.error('[WEBHOOK] Expected secret:', webhookSecret ? 'SET' : 'NOT SET');
        console.error('[WEBHOOK] Received signature:', signature);
        // TEMP: Accept requests without valid signature for debugging
        // return res.status(401).json({ error: 'Invalid signature' });
      }

      const webhookPayload = req.body as RespondIOWebhookPayload;
      console.log('[WEBHOOK] Received event:', webhookPayload.event);

      switch (webhookPayload.event) {
        case 'message.created':
          const response = await handleIncomingMessage(webhookPayload);
          
          if (response?.reply) {
            return res.status(200).json({
              type: 'text',
              text: response.reply
            });
          }
          break;

        case 'contact.created':
          console.log('[WEBHOOK] New contact created:', webhookPayload.data.contact);
          break;

        case 'conversation.closed':
          console.log('[WEBHOOK] Conversation closed:', webhookPayload.data.conversationId);
          break;

        default:
          console.log('[WEBHOOK] Unhandled event type:', webhookPayload.event);
      }

      res.sendStatus(200);
      
    } catch (error) {
      console.error('[WEBHOOK] Error processing webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  console.log('📱 [WEBHOOK] Respond.io webhook endpoint registered at /api/webhooks/respondio');
}
