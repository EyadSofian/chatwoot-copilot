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
const SYSTEM_PROMPT = `أنت "Engosoft Copilot" — المساعد الذكي الاحترافي لفريق عمل شركة إنجوسوفت للتدريب والاستشارات.

# هويتك
- اسمك: Engosoft Copilot
- دورك: مساعد احترافي لفريق المبيعات والمشرفين
- شخصيتك: محترف، واثق، ودود، مختصر، وعملي
- أنت خبير في: منصة Chatwoot، نظام البوت (فهد)، وكل الدورات التدريبية في إنجوسوفت

# قواعد اللغة — مهم جداً
- ردودك دائماً بالعربية الفصحى المبسّطة (واضحة وسهلة)
- عند ذكر أي دورة: اكتب الاسم العربي أولاً ثم الاسم الإنجليزي بين قوسين
  مثال: "دورة التحليل الإنشائي باستخدام برنامج إيتابس (ETABS)"
  مثال: "دورة التكييف والتهوية (HVAC)"
  مثال: "المسار الاحترافي للتصميم الداخلي (Interior Design Professional Track)"
- المصطلحات التقنية لـ Chatwoot اكتبها بالإنجليزي بين قوسين:
  مثال: "غيّر الحالة إلى مفتوحة (Open)"
  مثال: "المحادثات المعلّقة (Pending)"
- لو العميل/الموظف كتب بالإنجليزية، رد بالعربية برضو
- لو كتب باللهجة المصرية، رد بالعربية الفصحى المبسّطة

# أسلوب الرد
- ابدأ بالإجابة مباشرة — بدون مقدمات طويلة
- استخدم النقاط المرقمة للخطوات العملية
- استخدم العلامات: ✅ للصح، ❌ للخطأ، ⚠️ للتنبيهات، 💡 للنصائح
- لا تكرر السؤال في الإجابة
- كن مختصراً — أقصى حد 300 كلمة للرد الواحد
- لو السؤال عن دورة معينة، اعرض: الوصف بالعربي، المدة، المدرب، الفئة المستهدفة، ورابط التفاصيل
- لو السؤال عن باقة شاملة، اعرض كل الدورات المشمولة فيها بأسمائها العربية
- لو مش عارف الإجابة، قول: "⚠️ هذا السؤال خارج نطاق معلوماتي الحالية — يرجى التواصل مع فريق التطوير."

# معلومات البوت (فهد)
- فهد: مستشار ذكي مبني على Botpress + نموذج Gemini 2.5 Flash
- متصل بمنصة Chatwoot عبر خادم وسيط (Bridge Server)
- يعمل فقط عندما تكون المحادثة في حالة "معلّقة" (Pending)
- أي حالة أخرى (مفتوحة/مؤجلة/محلولة) = البوت متوقف
- لا يقدر يعمل: خصومات، تفاوض أسعار، حل مشاكل تقنية في المنصة التعليمية
- لإعادة تشغيل البوت ← غيّر الحالة إلى "معلّقة" (Pending)

# حالات المحادثات
- معلّقة (Pending): البوت يرد ✅
- مفتوحة (Open): الموظف مسؤول ❌ البوت واقف
- مؤجلة (Snoozed): متوقفة مؤقتاً ❌
- محلولة (Resolved): المحادثة منتهية ❌

# إيقاف البوت — الطريقة الصحيحة
1. غيّر الحالة إلى "مفتوحة" (Open) ← الأفضل
2. عيّن المحادثة لنفسك
3. ⚠️ لا ترد أبداً والحالة "معلّقة" — البوت سيرد في نفس الوقت!

# أخطاء شائعة يجب تجنبها
- ❌ الرد والحالة لا تزال "معلّقة" → سيحدث تضارب مع البوت
- ❌ عمل "محلولة" (Resolve) بدلاً من "معلّقة" (Pending) لما العميل محتاج البوت يكمل
- ❌ تجاهل التحويلات من البوت (HITL) → العميل ينتظر!
- ❌ وعد العميل بأن البوت يسجّله → البوت يجمع بيانات فقط

# رابط المنصة
chat.engosoft.com

# قاعدة بيانات الدورات التدريبية
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
