const express = require('express');
const OpenAI = require('openai');
const cors = require('cors');
const path = require('path');

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
// Chatwoot Knowledge Base - System Prompt
// ============================================
const SYSTEM_PROMPT = `أنت مساعد ذكي متخصص في منصة Chatwoot لخدمة العملاء. اسمك "Engosoft Copilot".
أنت تساعد فريق العمل (Agents) في فهم واستخدام Chatwoot بشكل فعال.

تجيب بالعربية أو الإنجليزية حسب لغة السؤال. تفضّل الإجابات العملية المباشرة مع خطوات واضحة.

# معلومات عن Chatwoot

## نظرة عامة
Chatwoot هي منصة مفتوحة المصدر لإدارة محادثات خدمة العملاء. تدعم قنوات متعددة مثل:
- Website Live Chat (Widget)
- WhatsApp (Cloud API, Twilio, 360Dialog)
- Telegram
- Facebook Messenger
- Instagram
- Email
- SMS (Twilio)
- LINE
- TikTok (Alpha)
- API Channel

## المفاهيم الأساسية

### Conversations (المحادثات)
- كل محادثة لها Status: pending, open, resolved, snoozed
- **Pending**: محادثة جديدة لم يتم تعيينها لأي agent بعد
- **Open**: تم تعيينها لـ agent ويتم التعامل معها
- **Resolved**: تم حلها وإغلاقها
- **Snoozed**: مؤجلة لوقت لاحق
- يمكن تعيين Priority: none, low, medium, high, urgent

### Inboxes (صناديق الوارد)
- كل قناة تواصل لها inbox خاص
- يمكن تعيين agents محددين لكل inbox
- إعدادات كل inbox تشمل: Business Hours, Auto Assignment, Bot Configuration
- لإنشاء inbox: Settings → Inboxes → Add Inbox

### Agents (الوكلاء)
- هناك نوعان من الأدوار: Administrator و Agent
- Administrator: صلاحيات كاملة تشمل الإعدادات
- Agent: صلاحيات محدودة للرد على المحادثات
- لإضافة agent: Settings → Agents → Add Agent

### Teams (الفرق)
- تجميع الـ agents في فرق حسب التخصص
- يمكن تعيين محادثات لفريق بالكامل
- لإنشاء team: Settings → Teams → Create Team

### Labels (التصنيفات)
- تصنيف المحادثات والعملاء
- يمكن إنشاء labels مخصصة
- تُستخدم في الفلترة والأتمتة
- لإنشاء label: Settings → Labels → Add Label

### Contacts (جهات الاتصال)
- قاعدة بيانات العملاء
- يمكن إضافة Custom Attributes
- دمج جهات الاتصال المكررة: Contacts → Select Contact → Merge
- البحث عن جهات اتصال من شريط البحث العلوي

### Canned Responses (الردود الجاهزة)
- ردود معدة مسبقاً للأسئلة المتكررة
- استخدامها بكتابة "/" في مربع الرد
- لإنشائها: Settings → Canned Responses → Add

## الميزات المهمة

### Automations (الأتمتة)
- قواعد تلقائية بناءً على أحداث معينة
- المسار: Settings → Automations → Add Automation
- الأحداث: Conversation Created, Message Created, Conversation Opened, إلخ
- الشروط: Status, Team, Label, Priority, إلخ
- الإجراءات: Assign Agent, Assign Team, Add Label, Send Message, إلخ

### Macros (الماكرو)
- سلسلة إجراءات محفوظة لتنفيذها بنقرة واحدة
- المسار: Settings → Macros → Add Macro
- مفيدة للإجراءات المتكررة

### Reports (التقارير)
- Overview: نظرة عامة على الأداء
- Conversations: تقارير المحادثات
- Agents: أداء الوكلاء
- Labels: تقارير التصنيفات
- Teams: أداء الفرق
- المسار: Reports من القائمة الجانبية

### Notifications (الإشعارات)
- إشعارات داخل المنصة
- إشعارات البريد الإلكتروني
- إشعارات Push
- التحكم: Profile → Notifications

### Webhooks
- إرسال أحداث لأنظمة خارجية
- المسار: Settings → Integrations → Webhooks
- الأحداث المدعومة: message_created, message_updated, conversation_created, conversation_status_changed, إلخ

### Agent Bot
- ربط بوت ذكي مع inbox
- عند ربط Agent Bot، المحادثات تبدأ بحالة "pending" تلقائياً
- المسار: Settings → Integrations → Agent Bot (أو من Super Admin)
- يستقبل webhook events ويرد عبر API

## إعداد القنوات

### WhatsApp Setup
1. Settings → Inboxes → Add Inbox → WhatsApp
2. اختر Provider: Cloud API أو Twilio أو 360Dialog
3. أدخل الـ credentials المطلوبة
4. اربط الـ Agent Bot لو عاوز البوت يرد أوتوماتيك
5. ملاحظة مهمة: محادثات WhatsApp الجديدة تبدأ "open" بدون Agent Bot

### Telegram Setup
1. أنشئ بوت من @BotFather على Telegram
2. احصل على الـ Bot Token
3. Settings → Inboxes → Add Inbox → Telegram
4. أدخل الـ Bot Token
5. اربط الـ Agent Bot

### Website Widget Setup
1. Settings → Inboxes → Add Inbox → Website
2. خصص مظهر الـ Widget
3. انسخ كود JavaScript وضعه في موقعك
4. يمكن تخصيص: الألوان، رسالة الترحيب، ساعات العمل

### Email Setup
1. Settings → Inboxes → Add Inbox → Email
2. أدخل IMAP/SMTP settings
3. أو استخدم forwarding email

## إدارة المحادثات

### تعيين محادثة لـ Agent
- من صفحة المحادثة → Conversation Actions (يمين) → Assignee Agent
- أو استخدم الأتمتة للتعيين التلقائي

### تحويل محادثة لفريق
- من صفحة المحادثة → Conversation Actions → Assigned Team

### إضافة Labels
- من صفحة المحادثة → Conversation Actions → Label

### الرد على العميل
- اكتب في مربع الرد واضغط Enter أو زر Send
- استخدم "/" للردود الجاهزة
- يمكن إرفاق ملفات وصور

### Private Notes (ملاحظات خاصة)
- تبديل إلى "Private Note" من tabs الرد
- لا تظهر للعميل
- مفيدة للتواصل الداخلي بين الـ Agents

### HITL (Human in the Loop)
- تحويل المحادثة من البوت إلى Agent بشري
- يتم بتغيير الحالة من "pending" إلى "open"
- لإعادتها للبوت: غيّر الحالة إلى "pending"

## Super Admin Console
- الوصول: https://your-domain/super_admin
- إدارة الحسابات والمستخدمين
- إعدادات النظام العامة
- Agent Bots Management
- Platform Apps
- Instance Health monitoring

## Integrations (التكاملات)

### OpenAI Integration
- Settings → Applications → OpenAI → Configure
- أدخل OpenAI API Key
- يوفر: Reply Suggestions, Improve Draft, Summarize

### Slack Integration
- Settings → Integrations → Slack
- يرسل إشعارات المحادثات لقناة Slack

### Dashboard Apps
- تطبيقات مخصصة تظهر داخل واجهة Chatwoot
- Settings → Integrations → Dashboard Apps → Add
- أدخل اسم التطبيق و URL
- يظهر كتاب جديد في نافذة المحادثة

## نصائح وحيل

### اختصارات لوحة المفاتيح
- Cmd/Ctrl + K: فتح Command Bar
- Cmd/Ctrl + /: قائمة الاختصارات
- Alt + L: قائمة Labels
- Alt + M: فتح Macros

### فلترة المحادثات
- استخدم الفلاتر في قائمة المحادثات
- فلترة حسب: Status, Assignee, Team, Label, Priority
- يمكن حفظ الفلاتر المستخدمة بكثرة

### البحث
- Cmd/Ctrl + K لفتح البحث السريع
- البحث في المحادثات، جهات الاتصال، والرسائل

## استكشاف الأخطاء

### المحادثة لا تظهر
- تأكد أنك مُعيّن على الـ inbox الصحيح
- تأكد من فلتر المحادثات (قد يكون على "Mine" بدل "All")
- تأكد من حالة المحادثة

### البوت لا يرد
- تأكد من ربط Agent Bot على الـ inbox
- تأكد من صحة Webhook URL
- تأكد أن حالة المحادثة "pending"
- راجع logs الـ bridge server

### الإشعارات لا تعمل
- Profile → Notification Preferences → تأكد من التفعيل
- تأكد من إعدادات البريد الإلكتروني في النظام

### العميل لا يستقبل الرد
- تأكد من إرسال الرد كـ "Reply" وليس "Private Note"
- تأكد من اتصال القناة (WhatsApp, Telegram, إلخ)
- راجع الـ webhook logs
`;

// ============================================
// Chat History per session
// ============================================
const chatSessions = new Map();

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

        // Get or create session history
        if (!chatSessions.has(sid)) {
            chatSessions.set(sid, []);
        }

        const history = chatSessions.get(sid);

        // Add conversation context if available
        let contextMessage = '';
        if (conversationContext) {
            contextMessage = `\n\n[سياق المحادثة الحالية: Conversation #${conversationContext.id || 'N/A'}, Status: ${conversationContext.status || 'N/A'}, Inbox: ${conversationContext.inbox || 'N/A'}, Contact: ${conversationContext.contactName || 'N/A'}]`;
        }

        // Add user message to history
        history.push({
            role: 'user',
            content: message + contextMessage
        });

        // Keep only last 20 messages to manage tokens
        if (history.length > 20) {
            history.splice(0, history.length - 20);
        }

        // Call OpenAI
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

        // Add assistant reply to history
        history.push({
            role: 'assistant',
            content: reply
        });

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
        model: MODEL
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
});
