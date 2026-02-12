import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { chargeCredits, hasEnoughCredits, getBalance } from '../services/credit.js';
import { CreditTransactionType } from '@prisma/client';

const router = Router();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ChatRequest {
  message: string;
  conversationHistory?: ChatMessage[];
}

/**
 * POST /api/chat
 * Send a message to the chatbot and get a response
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { message, conversationHistory = [] }: ChatRequest = req.body;
    // @ts-ignore - userId set by auth middleware
    const userId = req.userId;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Message is required',
      });
    }

    // Check if user has enough credits (1 credit per chat session)
    if (userId) {
      const hasCredits = await hasEnoughCredits(userId, 1);
      if (!hasCredits) {
        return res.status(402).json({
          success: false,
          message: 'Insufficient credits',
          error: 'INSUFFICIENT_CREDITS',
          required: 1,
        });
      }
    }

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'OpenAI API key is not configured',
      });
    }

    // Build messages array with system prompt
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a helpful Pantry Chef assistant. You help users with:
- Recipe recommendations and cooking tips
- Meal planning and preparation advice
- Nutrition information and healthy eating
- Ingredient substitutions and shopping tips
- Cooking techniques and kitchen hacks

Be friendly, concise, and practical. Focus on actionable advice.`,
      },
      // Include recent conversation history (limit to last 10 messages to manage context)
      ...conversationHistory.slice(-10),
      {
        role: 'user',
        content: message,
      },
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-nano-2025-08-07',
      messages: messages as any,
      max_completion_tokens: 2000,
      reasoning_effort: 'low' as any,
    });

    const assistantMessage = completion.choices[0]?.message?.content;

    if (!assistantMessage) {
      console.error('No message content in completion:', completion);
      throw new Error('No response from OpenAI');
    }

    // Charge credits after successful completion (only if first message in session)
    let newBalance: number | undefined;
    if (userId && conversationHistory.length === 0) {
      await chargeCredits(
        userId,
        1,
        CreditTransactionType.CHAT_SESSION,
        'Chat session started'
      );
      newBalance = await getBalance(userId);
    }

    return res.json({
      success: true,
      message: assistantMessage,
      ...(newBalance !== undefined && { creditsCharged: 1, balance: newBalance }),
      usage: {
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
      },
    });
  } catch (error: any) {
    console.error('Chat error:', error);

    // Handle specific OpenAI errors
    if (error?.status === 401) {
      return res.status(500).json({
        success: false,
        message: 'OpenAI API key is invalid',
      });
    }

    if (error?.status === 429) {
      return res.status(429).json({
        success: false,
        message: 'Rate limit exceeded. Please try again later.',
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to process chat message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

export default router;
