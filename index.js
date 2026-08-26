/* ============================================================
 * ST API Probe v0.1.0
 * 只读探测扩展 — 检测酒馆内部 API 可用性与结构
 * 不修改任何数据，不注册聊天区 UI，不干预生成流程
 * ============================================================ */

const PROBE_VERSION = '0.1.0';

/* 探测报告容器 */
const report = {
    version: PROBE_VERSION,
    time: new Date().toISOString(),
    ua: navigator.userAgent,
    modules: {},
    events: {},
    settings: {},
    samples: {},
    errors: [],
};

/* 保存成功导入的引用，供后续探测使用 */
const mod = {};

/* ---------- 工具：安全动态导入 ---------- */
async function probeImport(label, path, wantedKeys) {
    try {
        const m = await import(path);
        const present = [];
        const missing = [];

        for (const key of wantedKeys) {
            if (key in m) {
                present.push(`${key}:${typeof m[key]}`);
                mod[key] = m[key];
            } else {
                missing.push(key);
            }
        }

        report.modules[label] = {
            path,
            status: 'OK',
            allExports: Object.keys(m).slice(0, 60),
            present,
            missing,
        };
        return m;
    } catch (err) {
        report.modules[label] = {
            path,
            status: 'FAIL',
            reason: String(err && err.message ? err.message : err),
        };
        return null;
    }
}

/* ---------- 工具：安全取值 ---------- */
function safeShape(obj, depth = 1) {
    if (obj === null || obj === undefined) return String(obj);
    const t = typeof obj;
    if (t !== 'object') return t;
    if (Array.isArray(obj)) {
        return depth <= 0
            ? `array[${obj.length}]`
            : { __array: obj.length, sample: obj.length ? safeShape(obj[0], depth - 1) : null };
    }
    if (depth <= 0) return 'object';
    const out = {};
    for (const k of Object.keys(obj).slice(0, 40)) {
        try {
            out[k] = safeShape(obj[k], depth - 1);
        } catch {
            out[k] = 'unreadable';
        }
    }
    return out;
}

/* ---------- 阶段一：模块可用性 ---------- */
async function probeModules() {
    await probeImport('script.js', '../../../../script.js', [
        'eventSource',
        'event_types',
        'chat',
        'characters',
        'this_chid',
        'saveSettingsDebounced',
        'getRequestHeaders',
        'name1',
        'name2',
    ]);

    await probeImport('extensions.js', '../../../extensions.js', [
        'extension_settings',
        'getContext',
        'renderExtensionTemplateAsync',
    ]);

    await probeImport('tokenizers.js', '../../../tokenizers.js', [
        'getTokenCount',
        'getTokenCountAsync',
        'getTextTokens',
        'tokenizers',
    ]);

    await probeImport('openai.js', '../../../openai.js', [
        'oai_settings',
        'promptManager',
        'chat_completion_sources',
    ]);

    await probeImport('world-info.js', '../../../world-info.js', [
        'world_info',
        'selected_world_info',
        'getSortedEntries',
        'world_names',
    ]);

    await probeImport('power-user.js', '../../../power-user.js', [
        'power_user',
    ]);
}

/* ---------- 阶段二：事件表 ---------- */
function probeEvents() {
    if (!mod.event_types) {
        report.events.status = 'event_types 未导入，跳过';
        return;
    }

    const keys = Object.keys(mod.event_types);
    report.events.total = keys.length;
    report.events.all = keys.map(k => `${k} = "${mod.event_types[k]}"`);

    // 标出我们关心的候选
    const interest = keys.filter(k =>
        /PROMPT|GENERAT|WORLD|MESSAGE|CHAT_CHANGED|TOKEN|STREAM/i.test(k)
    );
    report.events.ofInterest = interest.map(k => `${k} = "${mod.event_types[k]}"`);
}

/* ---------- 阶段三：设置对象结构 ---------- */
function probeSettings() {
    if (mod.extension_settings) {
        report.settings.extension_settings_keys = Object.keys(mod.extension_settings);
        // 正则规则存在哪、什么结构
        const regexLike = Object.keys(mod.extension_settings)
            .filter(k => /regex/i.test(k));
        report.settings.regexKeys = regexLike;
        for (const k of regexLike) {
            report.settings[`regex_shape_${k}`] = safeShape(mod.extension_settings[k], 3);
        }
    } else {
        report.settings.extension_settings = 'NOT IMPORTED';
    }

    if (mod.oai_settings) {
        const keys = Object.keys(mod.oai_settings);
        report.settings.oai_settings_count = keys.length;
        report.settings.oai_settings_keys = keys.slice(0, 80);
        // 预设条目集合在哪
        const promptLike = keys.filter(k => /prompt/i.test(k));
        report.settings.oai_promptKeys = promptLike;
        for (const k of promptLike) {
            report.settings[`oai_shape_${k}`] = safeShape(mod.oai_settings[k], 2);
        }
    } else {
        report.settings.oai_settings = 'NOT IMPORTED';
    }

    if (mod.world_info) {
        report.settings.world_info_shape = safeShape(mod.world_info, 2);
    }
    if (mod.selected_world_info) {
        report.settings.selected_world_info = safeShape(mod.selected_world_info, 2);
    }

    if (mod.getContext) {
        try {
            const ctx = mod.getContext();
            report.settings.getContext_keys = Object.keys(ctx);
        } catch (err) {
            report.errors.push(`getContext() 调用失败: ${err.message}`);
        }
    }
}

/* ---------- 阶段四：tokenizer 实测 ---------- */
async function probeTokenizer() {
    const testText = 'Hello world 你好世界，这是一段测试文本。';

    if (typeof mod.getTokenCount === 'function') {
        try {
            const n = mod.getTokenCount(testText);
            report.samples.getTokenCount = {
                input: testText,
                result: n,
                resultType: typeof n,
                note: n instanceof Promise ? '返回 Promise，需 await' : '同步返回',
            };
        } catch (err) {
            report.samples.getTokenCount = `调用失败: ${err.message}`;
        }
    }

    if (typeof mod.getTokenCountAsync === 'function') {
        try {
            const n = await mod.getTokenCountAsync(testText);
            report.samples.getTokenCountAsync = { input: testText, result: n };
        } catch (err) {
            report.samples.getTokenCountAsync = `调用失败: ${err.message}`;
        }
    }
}

/* ---------- 阶段五：事件 payload 捕获 ---------- */
const captured = {};

function hookEvent(evtKey) {
    const evtName = mod.event_types?.[evtKey];
    if (!evtName || !mod.eventSource) return;

    try {
        mod.eventSource.on(evtName, (...args) => {
            if (captured[evtKey]) return; // 只抓第一次
            captured[evtKey] = {
                argCount: args.length,
                shapes: args.map(a => safeShape(a, 2)),
            };
            // 对 prompt 类事件额外抓一条样本
            if (/PROMPT/i.test(evtKey) && args[0]) {
                const p = args[0];
                const arr = Array.isArray(p) ? p : (p.chat || p.messages || null);
                if (Array.isArray(arr)) {
                    captured[evtKey].arrayLength = arr.length;
                    captured[evtKey].firstItem = safeShape(arr[0], 2);
                    captured[evtKey].firstItemPreview =
                        JSON.stringify(arr[0] ?? null).slice(0, 300);
                }
            }
            console.log(`[API Probe] 捕获事件 ${evtKey}`, captured[evtKey]);
            renderCaptured();
        });
        report.events[`hooked_${evtKey}`] = evtName;
    } catch (err) {
        report.errors.push(`hook ${evtKey} 失败: ${err.message}`);
    }
}

function probeEventPayloads() {
    if (!mod.event_types || !mod.eventSource) return;

    // 把所有名字里带这些关键词的事件都挂上，宁多勿漏
    const targets = Object.keys(mod.event_types).filter(k =>
        /PROMPT_READY|GENERATION_STARTED|GENERATION_AFTER|WORLD_INFO|MESSAGE_SENT|CHAT_CHANGED/i.test(k)
    );
    for (const k of targets) hookEvent(k);
    report.events.hookTargets = targets;
}

/* ---------- 报告渲染 ---------- */
function reportText() {
    const full = { ...report, capturedEvents: captured };
    return JSON.stringify(full, null, 2);
}

function renderCaptured() {
    const box = document.getElementById('probe_output');
    if (box) box.value = reportText();
    const badge = document.getElementById('probe_captured');
    if (badge) badge.textContent = String(Object.keys(captured).length);
}

function buildPanel() {
    const host = document.getElementById('extensions_settings2')
        || document.getElementById('extensions_settings');
    if (!host) return false;
    if (document.getElementById('probe_settings')) return true;

    const okCount = Object.values(report.modules).filter(m => m.status === 'OK').length;
    const totalCount = Object.keys(report.modules).length;

    const wrap = document.createElement('div');
    wrap.id = 'probe_settings';
    wrap.className = 'probe-block';
    wrap.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>API 探针 v${PROBE_VERSION}</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="probe-notice">
                    只读探测工具。不修改任何设置，不干预生成。
                    用完可以直接卸载。
                </div>
                <div class="probe-stat">
                    模块 <b>${okCount}/${totalCount}</b> 可用 ·
                    事件表 <b>${report.events.total ?? '—'}</b> 项 ·
                    已捕获 <b><span id="probe_captured">0</span></b> 个事件
                </div>
                <div class="probe-hint">
                    发一条消息触发事件捕获，然后点下面的复制按钮。
                </div>
                <textarea id="probe_output" class="probe-output" readonly rows="10"></textarea>
                <div class="probe-actions">
                    <button id="probe_copy" class="menu_button">复制完整报告</button>
                    <button id="probe_log" class="menu_button">打印到 Console</button>
                </div>
            </div>
        </div>
    `;
    host.appendChild(wrap);

    document.getElementById('probe_output').value = reportText();

    document.getElementById('probe_copy').addEventListener('click', async () => {
        const text = reportText();
        try {
            await navigator.clipboard.writeText(text);
            toastMini('报告已复制');
        } catch {
            const ta = document.getElementById('probe_output');
            ta.removeAttribute('readonly');
            ta.select();
            document.execCommand('copy');
            ta.setAttribute('readonly', 'readonly');
            toastMini('已复制（兼容模式）');
        }
    });

    document.getElementById('probe_log').addEventListener('click', () => {
        console.log('=== ST API Probe 完整报告 ===');
        console.log(reportText());
        toastMini('已打印到 Console');
    });

    return true;
}

function toastMini(msg) {
    const el = document.createElement('div');
    el.className = 'probe-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
}

/* ---------- 启动 ---------- */
async function boot() {
    console.log(`[API Probe v${PROBE_VERSION}] 开始探测`);

    await probeModules();
    probeEvents();
    probeSettings();
    await probeTokenizer();
    probeEventPayloads();

    console.log('[API Probe] 探测完成，报告已生成');
    console.log(reportText());

    let tries = 0;
    const timer = setInterval(() => {
        tries += 1;
        if (buildPanel() || tries > 40) clearInterval(timer);
    }, 500);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { boot(); }, { once: true });
} else {
    boot();
}
