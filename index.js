const express = require('express');
const OpenAI = require('openai');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// OpenAI Configuration
// ============================================
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ============================================
// Load Knowledge Base from files
// ============================================
function loadKnowledge() {
    const knowledgeDir = path.join(__dirname, 'knowledge');
    let knowledge = '';

    try {
        const files = fs.readdirSync(knowledgeDir);
        for (const file of files) {
            const filePath = path.join(knowledgeDir, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            knowledge += `\n\n--- ${file} ---\n${content}`;
            console.log(`📚 Loaded: ${file} (${content.length} chars)`);
        }
    } catch (err) {
        console.error('⚠️ Could not load knowledge files:', err.message);
    }

    return knowledge;
}

const KNOWLEDGE_BASE = loadKnowledge();
console.log(`📚 Total knowledge base: ${KNOWLEDGE_BASE.length} chars`);

// ============================================
// System Prompt
// ============================================
const SYSTEM_PROMPT = `أنت مساعد ذكي متخصص اسمك "Engosoft Copilot". أنت تساعد فريق عمل شركة Engosoft Training & Consulting.

# دورك
أنت تساعد في أمرين:
1. **الإجابة عن أسئلة استخدام Chatwoot ومنصة إدارة المحادثات والبوت (فهد)**
2. **الإجابة عن أسئلة الكورسات والدورات التدريبية في Engosoft**

# قواعد مهمة
- أجب بالعربية أو الإنجليزية حسب لغة السؤال
- كن مختصراً وعملياً — أعطِ خطوات واضحة
- لو السؤال عن كورس معين، اعرض كل التفاصيل المتاحة (الوصف، المدة، المدرب، الفئة المستهدفة، الروابط)
- لو السؤال عن باقة (مثل الكهرباء الشاملة أو الميكانيكا الشاملة)، اعرض كل الكورسات المشمولة
- لو السؤال عن Chatwoot، أعطِ خطوات عملية مباشرة
- لو مش عارف الإجابة، قول "مش متأكد من الإجابة دي — استشر فريق التطوير"
- أسماء الكورسات والاختصارات دائماً بالإنجليزي حتى لو الرد بالعربي

# معلومات مهمة عن البوت (فهد)
- فهد هو بوت مبني على Botpress + Gemini 2.5 Flash
- متصل بـ Chatwoot عبر Bridge Server
- البوت بيشتغل بس لما المحادثة في حالة Pending
- أي حالة تانية (Open, Snoozed, Resolved) = البوت واقف
- عشان البوت يشتغل تاني → غيّر الحالة لـ Pending
- البوت مش بيقدر يعمل خصومات أو يتفاوض على أسعار
- البوت مش بيقدر يحل مشاكل تقنية في الـ LMS

# حالات المحادثات
| الحالة | الوصف | البوت شغال؟ |
|--------|-------|------------|
| Pending | في طابور البوت | نعم ✅ |
| Open | موظف ماسك المحادثة | لا ❌ |
| Snoozed | مؤجلة | لا ❌ |
| Resolved | اتقفلت | لا ❌ |

# كيف توقف البوت
1. غيّر الحالة لـ Open (الأفضل)
2. عيّن المحادثة لنفسك
3. Snooze المحادثة
4. Resolve المحادثة

# أخطاء شائعة
- ❌ الرد والحالة لسه Pending → البوت هيرد هو كمان! غيّر لـ Open الأول
- ❌ عمل Resolve بدل Pending → لو العميل محتاج البوت يكمل
- ❌ تجاهل محادثات الـ HITL → لما البوت يحوّل لازم ترد بسرعة
- ❌ قول للعميل "البوت يقدر يسجلك" → البوت بيجمع بيانات بس

# رابط الدخول لـ Chatwoot
chat.engosoft.com

# قاعدة بيانات الكورسات والدورات التدريبية
${KNOWLEDGE_BASE}
`;

// ============================================
// Chat History per session
// ============================================
const chatSessions = new Map();

// Clean old sessions every hour
setInterval(() => {
    const oneHourAgo = Date.now() - 3600000;
    for (const [key, session] of chatSessions) {
        if (session.lastActive < oneHourAgo) {
            chatSessions.delete(key);
        }
    }
}, 3600000);

// ============================================
// API: Chat endpoint
// ============================================
app.post('/api/chat', async (req, res) => {
    try {
        const { message, sessionId, conversationContext } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const sid = sessionId || 'default';

        if (!chatSessions.has(sid)) {
            chatSessions.set(sid, { messages: [], lastActive: Date.now() });
        }

        const session = chatSessions.get(sid);
        session.lastActive = Date.now();
        const history = session.messages;

        // Add conversation context if available
        let contextMessage = '';
        if (conversationContext) {
            contextMessage = `\n\n[سياق المحادثة الحالية: Conversation #${conversationContext.id || 'N/A'}, Status: ${conversationContext.status || 'N/A'}, Inbox: ${conversationContext.inbox || 'N/A'}, Contact: ${conversationContext.contactName || 'N/A'}]`;
        }

        history.push({
            role: 'user',
            content: message + contextMessage
        });

        // Keep only last 10 messages to manage tokens (knowledge base is large)
        if (history.length > 10) {
            history.splice(0, history.length - 10);
        }

        const completion = await openai.chat.completions.create({
            model: MODEL,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...history
            ],
            temperature: 0.7,
            max_tokens: 1500
        });

        const reply = completion.choices[0].message.content;

        history.push({
            role: 'assistant',
            content: reply
        });

        console.log(`💬 [${sid}] Q: ${message.substring(0, 50)}... | Tokens: ${completion.usage.total_tokens}`);

        res.json({
            reply,
            usage: completion.usage
        });

    } catch (error) {
        console.error('❌ OpenAI Error:', error.message);
        res.status(500).json({
            error: 'Failed to get AI response',
            details: error.message
        });
    }
});

// ============================================
// Health check
// ============================================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'running',
        app: 'Engosoft AI Copilot',
        model: MODEL,
        knowledgeBase: `${KNOWLEDGE_BASE.length} chars loaded`
    });
});

// ============================================
// Serve frontend
// ============================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// Start server
// ============================================
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`🤖 Engosoft AI Copilot running on port ${PORT}`);
    console.log(`📚 Knowledge base loaded: ${KNOWLEDGE_BASE.length} chars`);
    console.log(`🧠 Model: ${MODEL}`);
});
