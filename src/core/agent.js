/**
 * src/core/agent.js
 * The Daftar agent loop.
 * Loads conversation history → calls LLM with module tools → executes tool calls →
 * asks clarifying questions if needed → saves messages → returns Arabic reply.
 */

import { db } from '../db/index.js';
import { conversations, messages } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { getLLMProvider } from '../providers/llm/index.js';
import { getToolsForPlan, getRegistry } from './moduleLoader.js';
import plans from '../../config/plans.js';

// Lazy init – avoids crash at startup when GROQ_API_KEY not yet set
let _llm = null;
function getLLM() {
  if (!_llm) _llm = getLLMProvider();
  return _llm;
}

const SYSTEM_PROMPT = `أنت دفتر، مساعد شخصي ذكي بيتكلم العامية المصرية.
مهمتك الأساسية تسجيل المصاريف والمهام واليوميات للمستخدم وتجاوبه على أسئلته عنها.

قواعد مهمة:
- دايماً رد بالعامية المصرية الطبيعية، مختصر وواضح.
- لو المعلومات ناقصة (مثلاً مفيش تصنيف للمصروف)، اسأل سؤال واحد بس عن الحاجة الأهم الناقصة.
- بعد ما تسجل أي حاجة، أكد للمستخدم بجملة قصيرة واضحة.
- لو المستخدم بيسأل عن بياناته، استخدم الأدوات المتاحة عشان تجيب المعلومات الصح.
- ما تسألش أكتر من سؤال في نفس الوقت.
- الوقت الحالي: ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`;

/**
 * Get or create a conversation for the user.
 */
async function getOrCreateConversation(userId) {
  const [existing] = await db.select()
    .from(conversations)
    .where(eq(conversations.user_id, userId))
    .orderBy(desc(conversations.updated_at))
    .limit(1);

  if (existing) return existing;

  const [created] = await db.insert(conversations)
    .values({ user_id: userId, title: 'محادثة جديدة' })
    .returning();
  return created;
}

/**
 * Load recent messages from DB (last N turns).
 */
async function loadHistory(conversationId, limit = 20) {
  const rows = await db.select()
    .from(messages)
    .where(eq(messages.conversation_id, conversationId))
    .orderBy(desc(messages.created_at))
    .limit(limit);
  return rows.reverse(); // oldest first
}

/**
 * Save a message to DB.
 */
async function saveMessage(conversationId, userId, role, content, toolCalls = null) {
  const [row] = await db.insert(messages).values({
    conversation_id: conversationId,
    user_id: userId,
    role,
    content: typeof content === 'string' ? content : JSON.stringify(content),
    tool_calls: toolCalls,
  }).returning();
  // Update conversation timestamp
  await db.update(conversations)
    .set({ updated_at: new Date() })
    .where(eq(conversations.id, conversationId));
  return row;
}

/**
 * Convert DB messages to LLM message format.
 */
function toApiMessages(history) {
  return history.map(m => ({
    role: m.role,
    content: m.content,
  }));
}

/**
 * Main agent entry point.
 * @param {{ userId: string, userPlan: string, text: string, voiceSeconds?: number, transcribed?: boolean }} opts
 * @returns {Promise<{ reply: string, toolsUsed: string[] }>}
 */
export async function runAgent({ userId, userPlan, text, voiceSeconds = 0, transcribed = false }) {
  const plan = plans[userPlan] ?? plans.free;
  const availableTools = getToolsForPlan(userPlan, plans);
  const ctx = { userId };

  // Build tool specs for LLM, allowing null on optional fields
  const toolSpecs = availableTools.map(t => {
    const params = JSON.parse(JSON.stringify(t.parameters || { type: 'object', properties: {} }));
    const required = params.required || [];
    if (params.properties) {
      for (const [key, prop] of Object.entries(params.properties)) {
        if (!required.includes(key) && prop.type && !Array.isArray(prop.type)) {
          prop.type = [prop.type, 'null'];
        }
      }
    }
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: params,
      },
    };
  });

  const conv = await getOrCreateConversation(userId);
  const history = await loadHistory(conv.id);

  // Save user message
  await saveMessage(conv.id, userId, 'user', text);

  // Build messages for LLM
  const apiMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(transcribed
      ? [{
          role: 'system',
          content: 'ملاحظة: رسالة المستخدم التالية مفرّغة من تسجيل صوتي وقد تحتوي أخطاء سمع، خاصة في الأرقام والمبالغ. قبل تسجيل أي مصروف أو مهمة، أكد الرقم والمبلغ مع المستخدم في ردك، ولا تستدعي أداة الحفظ إلا بعد تأكيده الصريح.',
        }]
      : []),
    ...toApiMessages(history),
    { role: 'user', content: text },
  ];

  const toolsUsed = [];
  let finalReply = '';
  let iterations = 0;
  const MAX_ITERATIONS = 5;
  const usage = { model: plan.model, promptTokens: 0, completionTokens: 0 };

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await getLLM().chat({
      messages: apiMessages,
      tools: toolSpecs.length > 0 ? toolSpecs : undefined,
      tool_choice: toolSpecs.length > 0 ? 'auto' : undefined,
      temperature: 0.3,
      max_tokens: 1024,
      model: plan.model,
    });

    usage.promptTokens += response.usage?.prompt_tokens ?? 0;
    usage.completionTokens += response.usage?.completion_tokens ?? 0;

    const choice = response.choices?.[0];
    const msg = choice?.message;

    if (!msg) {
      finalReply = 'معلش، فيه مشكلة في الخادم. جرب تاني.';
      break;
    }

    // No tool calls → final text reply
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      finalReply = msg.content || 'تم.';
      await saveMessage(conv.id, userId, 'assistant', finalReply);
      break;
    }

    // Execute tool calls
    apiMessages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });

    for (const tc of msg.tool_calls) {
      const toolName = tc.function.name;
      const args = JSON.parse(tc.function.arguments || '{}');
      const tool = availableTools.find(t => t.name === toolName);

      let toolResult;
      if (!tool) {
        toolResult = { ok: false, error: `Tool ${toolName} not found` };
      } else {
        try {
          toolResult = await tool.execute(args, ctx);
          toolsUsed.push(toolName);
        } catch (err) {
          console.error(`[agent] Tool ${toolName} error:`, err.message);
          toolResult = { ok: false, error: err.message };
        }
      }

      apiMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(toolResult),
      });
    }
    // Continue loop to get the final assistant reply after tool results
  }

  return { reply: finalReply, toolsUsed, usage };
}
