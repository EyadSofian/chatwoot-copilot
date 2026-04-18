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
// n8n Webhook — Customer Lookup
// ============================================
const N8N_CUSTOMER_LOOKUP_URL =
    process.env.N8N_CUSTOMER_LOOKUP_URL ||
    'https://n8n.engosoft.com/webhook/ops-customer-lookup';

/**
 * يجيب بيانات العميل من Odoo عن طريق n8n
 * @param {string} phone - رقم التليفون كما ورد في الرسالة
 * @returns {object|null} - بيانات العميل أو null لو مفيش
 */
async function fetchCustomerByPhone(phone) {
    try {
        const res = await fetch(N8N_CUSTOMER_LOOKUP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone }),
            signal: AbortSignal.timeout(10000) // 10s timeout
        });

        if (!res.ok) return null;

        const data = await res.json();
        return data?.found ? data : null;
    } catch (err) {
        console.warn('⚠️ n8n customer lookup failed:', err.message);
        return null;
    }
}

/**
 * يطلع رقم التليفون من الرسالة (مصري / سعودي / دولي)
 * @param {string} message
 * @returns {string|null}
 */
function extractPhone(message) {
    // شيل المسافات الأول، ابحث عن الرقم، رجّعه نظيف
    const cleaned = message.replace(/\s+/g, '');
    const match = cleaned.match(/(\+966\d{9}|\+20\d{10}|00966\d{9}|0020\d{10}|01[0-9]{9})/);
    return match ? match[0] : null;
}

/**
 * يحوّل بيانات العميل لـ context نص يُحقن في الـ system prompt
 * @param {object} data - الـ response من n8n
 * @returns {string}
 */
function buildCustomerContext(data) {
    const c = data.customer || {};
    const f = data.financial || {};
    const s = data.salesperson || {};
    const events = data.events || {};
    const products = (data.products_purchased || [])
        .map(p => `  • ${p.product_name} (${p.qty_delivered}/${p.qty_ordered} وُصّلت)`)
        .join('\n');

    const invoicesSummary = (data.invoices || [])
        .slice(0, 5)
        .map(i => `  • ${i.number} — ${i.amount_total} جنيه — ${i.payment_status}`)
        .join('\n');

    const completedEvents = (events.completed_list || [])
        .map(e => `  • ${e.name}`)
        .join('\n');

    const pendingEvents = (events.pending_list || [])
        .map(e => `  • ${e.name}`)
        .join('\n');

    return `
---
[بيانات العميل من Odoo]
الاسم: ${c.name || '—'}
الهاتف: ${c.phone || '—'} | الموبايل: ${c.mobile || '—'}
البريد: ${c.email || '—'} | المدينة: ${c.city || '—'}
موظف المبيعات: ${s.name || '—'}

المالية:
  إجمالي الفواتير: ${f.total_invoiced || 0} جنيه
  المدفوع: ${f.total_paid || 0} جنيه
  المتبقي: ${f.total_due || 0} جنيه
  عدد الفواتير: ${f.invoice_count || 0}

أحدث الفواتير:
${invoicesSummary || '  لا توجد فواتير'}

المنتجات المشتراة:
${products || '  لا توجد منتجات'}

الإيفنتات المنتهية (${events.completed || 0}):
${completedEvents || '  لا يوجد'}

الإيفنتات المتبقية (${events.pending || 0}):
${pendingEvents || '  لا يوجد'}
---`;
}

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

        // ── Odoo Customer Lookup ──────────────────────────────
        let customerContext = '';
        const detectedPhone = extractPhone(message);
        if (detectedPhone) {
            console.log(`📞 Phone detected: ${detectedPhone} — querying n8n...`);
            const customerData = await fetchCustomerByPhone(detectedPhone);
            if (customerData) {
                customerContext = buildCustomerContext(customerData);
                console.log(`✅ Customer found: ${customerData.customer?.name}`);
            } else {
                customerContext = `\n---\n[بحث Odoo: لم يُعثر على عميل بالرقم ${detectedPhone}]\n---`;
                console.log(`❌ No customer found for: ${detectedPhone}`);
            }
        }

        // ── Conversation Context (Chatwoot) ───────────────────
        let chatwootContext = '';
        if (conversationContext) {
            chatwootContext = `\n[سياق Chatwoot: Conversation #${conversationContext.id || 'N/A'}, Status: ${conversationContext.status || 'N/A'}, Inbox: ${conversationContext.inbox || 'N/A'}, Contact: ${conversationContext.contactName || 'N/A'}]`;
        }

        history.push({
            role: 'user',
            content: message + customerContext + chatwootContext
        });

        // Keep only last 10 messages to manage tokens
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
