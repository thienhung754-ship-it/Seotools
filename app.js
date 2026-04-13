/* =============================================
   FinSEO Pro — Core Application Logic
   ============================================= */

// ─── State ───────────────────────────────────
let state = {
  apiKey: '', // Sẽ được quản lý qua Vercel Environment Variables
  apiUrl: '/api/generate',
  fileContent: '',
  fileName: '',
  currentTab: 'upload',
  currentArticle: 0,
  articles: [],
  history: JSON.parse(localStorage.getItem('finseo_history') || '[]'),
  generating: false
};

// ─── Init ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateApiStatus();
  initModal();

  // Load saved api key
  if (state.apiKey) {
    document.getElementById('inputApiKey').value = state.apiKey;
  }
  if (state.apiUrl) {
    document.getElementById('inputApiUrl').value = state.apiUrl;
  }
});

function updateApiStatus() {
  const el = document.getElementById('apiStatus');
  const label = el.querySelector('.status-label');
  if (state.apiKey) {
    el.classList.add('connected');
    label.textContent = 'Đã kết nối AI';
  } else {
    el.classList.remove('connected');
    label.textContent = 'Chưa kết nối';
  }
}

// ─── Modal ────────────────────────────────────
function initModal() {
  // History modal
  document.getElementById('btnHistory').addEventListener('click', () => {
    renderHistory();
    document.getElementById('modalHistory').classList.add('active');
  });
  document.getElementById('closeHistory').addEventListener('click', () => {
    document.getElementById('modalHistory').classList.remove('active');
  });
  document.getElementById('modalHistory').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) document.getElementById('modalHistory').classList.remove('active');
  });
}
function openModal() {
  document.getElementById('modalApiKey').classList.add('active');
}
function closeModal() {
  document.getElementById('modalApiKey').classList.remove('active');
}
function saveKey() {
  const url = document.getElementById('inputApiUrl').value.trim();
  const key = document.getElementById('inputApiKey').value.trim();
  if (!key) { showToast('Vui lòng nhập API Key!', 'error'); return; }
  if (!url) { showToast('Vui lòng nhập API Base URL!', 'error'); return; }
  
  state.apiKey = key;
  state.apiUrl = url;
  localStorage.setItem('finseo_api_key', key);
  localStorage.setItem('finseo_api_url', url);
  updateApiStatus();
  closeModal();
  showToast('✅ Đã lưu cấu hình AI thành công!', 'success');
}

// ─── Tab Switch ───────────────────────────────
function switchTab(tab) {
  state.currentTab = tab;
  document.getElementById('tabUpload').classList.toggle('active', tab === 'upload');
  document.getElementById('tabPaste').classList.toggle('active', tab === 'paste');
  document.getElementById('uploadArea').style.display = tab === 'upload' ? 'block' : 'none';
  document.getElementById('pasteArea').style.display  = tab === 'paste'  ? 'block' : 'none';
}

// ─── File Handling ────────────────────────────
function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
}
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}
function clearFile(e) {
  e.stopPropagation();
  state.fileContent = '';
  state.fileName = '';
  document.getElementById('fileInfo').style.display = 'none';
  document.getElementById('fileInput').value = '';
}

async function processFile(file) {
  const allowed = ['.txt', '.docx', '.pdf', '.html', '.md'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!allowed.includes(ext)) {
    showToast('Hỗ trợ .txt, .docx, .pdf, .html, .md', 'error');
    return;
  }
  state.fileName = file.name;
  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileInfo').style.display = 'block';

  if (ext === '.txt' || ext === '.md' || ext === '.html') {
    state.fileContent = await file.text();
  } else if (ext === '.pdf') {
    showToast('⏳ Đang đọc nội dung PDF...', 'info');
    try {
      state.fileContent = await extractPDF(file);
    } catch (e) {
      showToast('❌ PDF lỗi hoặc dạng ảnh Scan, vui lòng Copy dán chữ trực tiếp!', 'error');
      clearFile({ stopPropagation:()=>{} });
      return;
    }
  } else {
    showToast('⏳ Đang đọc nội dung Word...', 'info');
    try {
      state.fileContent = await extractDOCX(file);
    } catch (e) {
      showToast('❌ File Word này bị lỗi, vui lòng Copy dán chữ trực tiếp!', 'error');
      clearFile({ stopPropagation:()=>{} });
      return;
    }
  }
  showToast(`✅ Đã nạp thành công: ${file.name}`, 'success');
}

async function extractPDF(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const typedarray = new Uint8Array(e.target.result);
        const loadingTask = pdfjsLib.getDocument(typedarray);
        const pdf = await loadingTask.promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map(item => item.str);
          text += strings.join(' ') + '\n';
        }
        if (!text || text.trim().length < 10) reject(new Error('Empty PDF Content'));
        resolve(text.trim());
      } catch(err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

async function extractDOCX(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const result = await mammoth.extractRawText({arrayBuffer: arrayBuffer});
        if (!result.value || result.value.trim().length < 50) reject(new Error('Empty DOCX'));
        resolve(result.value.trim());
      } catch(e) {
        reject(e);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ─── Main Generate Function ───────────────────
async function generateSEO() {
  if (state.generating) return;

  // Get content
  let rawContent = '';
  if (state.currentTab === 'upload') {
    rawContent = state.fileContent;
  } else {
    rawContent = document.getElementById('pasteInput').value.trim();
  }

  if (!rawContent || rawContent.length < 10) {
    showToast('⚠️ Nội dung quá ngắn. Nhập thêm chữ đi bạn!', 'error');
    return;
  }

  // Key đã được quản lý bởi Vercel Serverless Function, không cần check ở Client.

  const keyword   = document.getElementById('keyword').value.trim();
  const tone      = document.getElementById('tone').value;
  const length    = document.getElementById('length').value;
  const numArt    = parseInt(document.getElementById('numArticles').value);

  // Set loading state
  state.generating = true;
  setLoading(true);
  showOutput(false);

  try {
    const result = await callAI(rawContent, keyword, tone, length, numArt);
    state.articles = result.articles;
    state.currentArticle = 0;
    saveHistory(result); // Lưu lịch sử ngay khi có kết quả
    renderResults(result);
    showOutput(true);
    
    // Tự động cuộn xuống phần kết quả
    setTimeout(() => {
        document.getElementById('resultsArea').scrollIntoView({ behavior: 'smooth' });
    }, 300);

    showToast(`✅ Đã tạo ${numArt} bài SEO hoàn chỉnh!`, 'success');
  } catch (err) {
    console.error(err);
    showToast(`❌ Lỗi: ${err.message}`, 'error');
  } finally {
    state.generating = false;
    setLoading(false);
  }
}

function setLoading(on) {
  const btn = document.getElementById('btnGenerate');
  btn.disabled = on;
  btn.querySelector('.btn-text').style.display = on ? 'none' : 'flex';
  btn.querySelector('.btn-loader').style.display = on ? 'flex' : 'none';
}

function showOutput(show) {
  document.getElementById('emptyState').style.display  = show ? 'none' : 'flex';
  document.getElementById('resultsArea').style.display = show ? 'flex' : 'none';
  document.getElementById('scoreAreaLeft').style.display = show ? 'block' : 'none';
}

// ─── AI API Call ──────────────────────────
async function callAI(content, keyword, tone, length, numArticles) {
  const toneMap = {
    professional: 'Chuyên nghiệp & phân tích sâu, ngôn từ học thuật tài chính',
    news: 'Tin tức nóng, khẩn cấp, cập nhật nhanh, ngắn gọn súc tích',
    editorial: 'Bình luận chuyên sâu, có quan điểm rõ ràng, trích dẫn chuyên gia',
    report: 'Báo cáo thị trường, số liệu cụ thể, so sánh, xu hướng'
  };
  const lengthMap = {
    short: 'Tin vắn/ngắn: 400-600 từ',
    medium: 'Bài tiêu chuẩn: 800-1200 từ',
    long: 'Bài chuyên sâu (Long-form): 1500-2000 từ'
  };

  const prompt = `Bạn là Tổng biên tập kiêm Chuyên gia SEO Content của "Tạp chí Kinh tế - Tài chính" hàng đầu Việt Nam. Nhiệm vụ: Xây dựng ${numArticles} bài báo SEO hoàn chỉnh, sắc bén, chuyên sâu từ dữ liệu thô sau.

NỘI DUNG THÔ (Tài liệu gốc):
${content.slice(0, 15000)}

YÊU CẦU CHI TIẾT VỀ MẶT NỘI DUNG:
- Từ khoá SEO chính: "${keyword || 'tự động trích xuất từ nội dung'}"
- Tone: ${toneMap[tone]} (Tuyệt đối khách quan, sắc bén, đánh giá đa chiều, KHÔNG dùng từ ngữ lăng xê/PR sáo rỗng, KHÔNG dùng đại từ ngôi thứ nhất).
- Độ dài mỗi bài: ${lengthMap[length]}
- Số lượng bài: ${numArticles} bài ${numArticles > 1 ? '(Lưu ý: mỗi bài phải có góc độ phân tích hoàn toàn độc lập, dàn bài khác nhau)' : ''}.

TIÊU CHUẨN TẠP CHÍ & TRÌNH BÀY HTML BẮT BUỘC:
1. Mở bài (Sapo): Phải đậm chất báo chí, 2-3 câu hook ngay vào vấn đề trọng tâm, tổng hợp số liệu/fact nổi bật nhất.
2. Từ vựng & Số liệu: Sử dụng thuật ngữ Kinh tế - Tài chính chuyên nghiệp. Mọi con số, sự kiện, tỷ lệ hoặc tên tổ chức lớn TRONG BÀI HTML PHẢI ĐƯỢC BÔI ĐẬM (<strong>).
3. Bố cục HTML: Chia nhỏ đoạn văn (3-5 câu/đoạn). Bắt buộc phải có các thẻ <h2>, <h3> để ngắt ý. Sử dụng danh sách liệt kê (<ul><li>) để trình bày các lợi ích, rủi ro, hoặc các điểm chính.
4. Tiêu đề (Title): 50-60 ký tự, chứa từ khoá, mang tính thời sự hoặc phân tích chuyên sâu. Tuyệt đối không giật tít câu view rẻ tiền.
5. Meta description: 150-160 ký tự, tóm tắt chính xác luận điểm bài báo, chứa từ khoá.
6. Kết luận: Có chiều sâu, gợi mở xu hướng hoặc đúc kết giá trị cốt lõi. No call-to-action rẻ tiền.
7. Internal Linking: Đề xuất Tags chuẩn để hệ thống tự link.

CHẤM ĐIỂM SEO (Bắt buộc phân tích - ĐÓNG VAI TRƯỞNG BAN BIÊN TẬP NHIỆT TÌNH, KHÍCH LỆ):
Hãy chấm điểm bài viết một cách khách quan nhưng mang tính động viên cao. Nếu bài viết đã đạt chuẩn cơ bản, hãy mạnh tay cho điểm cao (dao động từ 8.5 đến 9.8) để khích lệ người viết.
- keyword_density: /2 (Chấm nới tay nếu từ khoá xuất hiện tự nhiên).
- title_quality: /2 (Tiêu đề hấp dẫn là cho điểm gần tối đa).
- meta_quality: /1.5 (Meta description chuẩn là có điểm cao).
- content_structure: /2 (Cấu trúc rõ ràng, dễ nhìn).
- readability: /1.5 (Văn phong lưu loát, dễ đọc).
- financial_accuracy: /1 (Thuật ngữ chuẩn xác).

TRẢ VỀ JSON THUẦN KHÔNG CÓ MARKDOWN, THEO ĐÚNG CẤU TRÚC SAU:
{
  "articles": [
    {
      "type": "Tên dạng bài (VD: Tin phân tích, Report thị trường...)",
      "title": "Tiêu đề SEO",
      "meta_description": "Meta description 150-160 ký tự",
      "slug": "url-slug-seo",
      "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
      "excerpt": "Đoạn trích 2-3 câu giới thiệu bài",
      "content_html": "Toàn bộ nội dung bài viết dưới dạng HTML với <h2>, <h3>, <p>, <strong>, <ul>, <li>",
      "seo_score": {
        "total": 8.5,
        "keyword_density": 1.5,
        "title_quality": 1.8,
        "meta_quality": 1.2,
        "content_structure": 1.8,
        "readability": 1.2,
        "financial_accuracy": 1.0,
        "improvements": ["Gợi ý cải thiện 1", "Gợi ý cải thiện 2", "Gợi ý cải thiện 3"]
      }
    }
  ],
  "detected_keywords": ["từ khoá 1", "từ khoá 2", "từ khoá 3"],
  "topic_category": "Danh mục (VD: Ngân hàng, Chứng khoán, Bất động sản...)"
}`;

  const systemPrompt = 'Bạn là chuyên gia SEO content tài chính. Bạn chỉ được phép trả về JSON thuần (không bọc trong markdown tick) theo đúng cấu trúc được yêu cầu.';
  const isGeminiNative = state.apiKey.trim().startsWith('AIza');
  
  let res, raw = '';
  let attempt = 0;
  const maxRetries = 3;

    try {
      res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: systemPrompt + "\n\n" + prompt 
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      break;
    } catch (e) {
      attempt++;
      if (attempt >= maxRetries) throw e;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }

  const data = await res.json();
  raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  let parsed;
  try {
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```json\s*/,'').replace(/\s*```$/,'').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error('Gemini trả về dữ liệu không đúng định dạng. Hãy thử lại.');
  }

  if (!parsed?.articles?.length) throw new Error('Không có bài viết nào được tạo ra.');
  return parsed;
}

// ─── Render Results ───────────────────────────
function renderResults(data) {
  const { articles, detected_keywords, topic_category } = data;

  // Score overview (use first article)
  renderScoreOverview(articles[0].seo_score, detected_keywords, topic_category);

  // Article tabs
  const tabsEl = document.getElementById('articlesTabs');
  tabsEl.innerHTML = articles.map((a, i) =>
    `<button class="article-tab ${i===0?'active':''}" id="tab${i}" onclick="switchArticle(${i})">${a.type || `Bài ${i+1}`}</button>`
  ).join('');

  // Articles content
  renderArticle(articles[0], 0, articles.length);
}

function renderScoreOverview(score, keywords, category) {
  const total = score.total || 0;
  const color = total >= 8 ? 'var(--green)' : total >= 6 ? '#ff9f0a' : 'var(--red)';
  const label = total >= 8 ? 'Xuất sắc' : total >= 6 ? 'Khá tốt' : 'Cần cải thiện';

  const circumference = 2 * Math.PI * 38;
  const progress = circumference - (total / 10) * circumference;

  const criteria = [
    { name: 'Mật độ từ khoá', key: 'keyword_density',    max: 2 },
    { name: 'Chất lượng tiêu đề', key: 'title_quality',  max: 2 },
    { name: 'Meta description', key: 'meta_quality',      max: 1.5 },
    { name: 'Cấu trúc nội dung', key: 'content_structure',max: 2 },
    { name: 'Dễ đọc', key: 'readability',                 max: 1.5 },
    { name: 'Chuyên môn', key: 'financial_accuracy', max: 1 },
  ];

  document.getElementById('scoreOverview').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div style="flex:1; min-width:0; margin-right:12px;">
        <div style="font-size:15px;font-weight:600;margin-bottom:4px;color:var(--text);">Chất lượng Nội dung</div>

      </div>
      <div class="score-circle-wrap" style="flex-shrink:0;">
        <div class="score-circle">
          <svg width="80" height="80" viewBox="0 0 90 90">
            <circle cx="45" cy="45" r="38" fill="none" stroke="var(--border)" stroke-width="6"/>
            <circle cx="45" cy="45" r="38" fill="none" stroke="${color}" stroke-width="6"
              stroke-dasharray="${circumference}" stroke-dashoffset="${progress}"
              stroke-linecap="round" style="transition:stroke-dashoffset 1s ease"/>
          </svg>
          <div class="score-circle-text" style="color:var(--text)">
            ${total}<div class="score-circle-label">/10</div>
          </div>
        </div>
        <div class="score-label" style="color:${color}">${label}</div>
      </div>
    </div>
    <div class="criteria-list">
      ${criteria.map(c => {
        const val = score[c.key] || 0;
        const pct = Math.round((val/c.max)*100);
        return `
          <div class="criterion-item">
            <div class="criterion-header">
              <span class="criterion-name">${c.name}</span>
              <span class="criterion-score">${val}/${c.max}</span>
            </div>
            <div class="criterion-bar">
              <div class="criterion-fill" style="width:${pct}%;"></div>
            </div>
          </div>`;
      }).join('')}
    </div>
    ${score.improvements?.length ? `
      <div class="seo-tips">
        <div class="seo-tips-title" style="display:flex; justify-content:space-between; align-items:center;">
          <div>💡 Gợi ý cải thiện</div>
          <button id="btnAutoFix" onclick="autoFixArticle()" style="cursor:pointer; background:var(--primary); color:white; border:none; border-radius:4px; padding:4px 8px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:4px; transition:0.2s;">
             ✨ AI Tự Sửa
          </button>
        </div>
        ${score.improvements.map(tip => `
          <div class="seo-tip-item"><span class="tip-icon">→</span>${tip}</div>
        `).join('')}
      </div>` : ''}
  `;
}

function switchArticle(idx) {
  state.currentArticle = idx;
  // Update tabs
  document.querySelectorAll('.article-tab').forEach((t, i) => {
    t.classList.toggle('active', i === idx);
  });
  // Re-render score for selected article
  const art = state.articles[idx];
  renderScoreOverview(art.seo_score, null, null);
  renderArticle(art, idx, state.articles.length);
}

function renderArticle(article, idx, total) {
  const el = document.getElementById('articlesContent');

  el.innerHTML = `
    <div class="article-content">
      <div style="background:var(--bg-hover);padding:10px 16px;border-radius:var(--radius-sm);margin-bottom:24px;font-size:13px;color:var(--text-dim);display:flex;align-items:center;gap:8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        Bạn có thể click trực tiếp vào các nội dung bên dưới (Tiêu đề, Meta, Body) để chỉnh sửa trước khi Copy hoặc Xuất File.
      </div>

      <!-- Title -->
      <div class="article-section">
        <div class="article-field-label">Tiêu đề (H1)</div>
        <div class="article-field-content" contenteditable="true" id="field_title_${idx}">
          ${escHtml(article.title || '')}
        </div>
        <button class="copy-btn" onclick="copyEditable('field_title_${idx}', this, false)">Copy</button>
      </div>

      <!-- Meta -->
      <div class="article-section">
        <div class="article-field-label" style="display:flex; justify-content:space-between">
          <div>Meta Description</div>
          <div id="metaCount${idx}" style="font-size:11px; color:var(--text-muted)">0 ký tự</div>
        </div>
        <div class="article-field-content" contenteditable="true" id="field_meta_${idx}">
          ${escHtml(article.meta_description || '')}
        </div>
        <button class="copy-btn" onclick="copyEditable('field_meta_${idx}', this, false)">Copy</button>
      </div>

      <!-- Slug + Tags -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="article-section">
          <div class="article-field-label">URL Slug</div>
          <div class="article-field-content" contenteditable="true" id="field_slug_${idx}" style="font-family:monospace;font-size:13px;color:var(--text-dim)">
            /${escHtml(article.slug || '')}
          </div>
          <button class="copy-btn" onclick="copyEditable('field_slug_${idx}', this, false)">Copy</button>
        </div>
        <div class="article-section">
          <div class="article-field-label">Tags</div>
          <div class="article-field-content">
            ${(article.tags||[]).map(t=>`<span style="display:inline-block;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:12px;color:var(--text);margin:2px">${escHtml(t)}</span>`).join('')}
          </div>
        </div>
      </div>

      <!-- Body -->
      <div class="article-section">
        <div class="article-field-label" style="display:flex; justify-content:space-between; align-items:center;">
          <div>Nội dung bài viết (WYSIWYG)</div>
          <button class="copy-btn" onclick="copyEditable('bodyContent${idx}', this, true)" style="position:static;">Copy HTML</button>
        </div>
        
        <!-- Editor Toolbar -->
        <div class="editor-toolbar" style="display: flex; gap: 4px; padding: 8px; background: var(--bg-hover); border: 1px solid var(--border); border-bottom: none; border-radius: var(--radius-sm) var(--radius-sm) 0 0; flex-wrap: wrap;">
          <button type="button" onclick="document.execCommand('formatBlock', false, 'H1')" style="cursor:pointer; padding: 4px 8px; font-weight:bold; font-size:13px; border: 1px solid var(--border); background: var(--bg-card); border-radius: 4px; color: var(--text);">H1</button>
          <button type="button" onclick="document.execCommand('formatBlock', false, 'H2')" style="cursor:pointer; padding: 4px 8px; font-weight:bold; font-size:13px; border: 1px solid var(--border); background: var(--bg-card); border-radius: 4px; color: var(--text);">H2</button>
          <button type="button" onclick="document.execCommand('formatBlock', false, 'H3')" style="cursor:pointer; padding: 4px 8px; font-weight:bold; font-size:13px; border: 1px solid var(--border); background: var(--bg-card); border-radius: 4px; color: var(--text);">H3</button>
          <div style="width:1px; background:var(--border); margin: 0 4px;"></div>
          <button type="button" onclick="document.execCommand('bold', false, null)" style="cursor:pointer; padding: 4px 8px; font-weight: bold; border: 1px solid var(--border); background: var(--bg-card); border-radius: 4px; color: var(--text);" title="In đậm (Ctrl+B)">B</button>
          <button type="button" onclick="document.execCommand('italic', false, null)" style="cursor:pointer; padding: 4px 8px; font-style: italic; font-family: serif; border: 1px solid var(--border); background: var(--bg-card); border-radius: 4px; color: var(--text);" title="In nghiêng (Ctrl+I)">I</button>
          <button type="button" onclick="document.execCommand('underline', false, null)" style="cursor:pointer; padding: 4px 8px; text-decoration: underline; border: 1px solid var(--border); background: var(--bg-card); border-radius: 4px; color: var(--text);" title="Gạch chân (Ctrl+U)">U</button>
          <div style="width:1px; background:var(--border); margin: 0 4px;"></div>
          <button type="button" onclick="document.execCommand('justifyLeft', false, null)" style="cursor:pointer; padding: 4px 8px; border: 1px solid var(--border); background: var(--bg-card); border-radius: 4px; color: var(--text);" title="Căn trái">Trái</button>
          <button type="button" onclick="document.execCommand('justifyCenter', false, null)" style="cursor:pointer; padding: 4px 8px; border: 1px solid var(--border); background: var(--bg-card); border-radius: 4px; color: var(--text);" title="Căn giữa">Giữa</button>
          <button type="button" onclick="document.execCommand('justifyRight', false, null)" style="cursor:pointer; padding: 4px 8px; border: 1px solid var(--border); background: var(--bg-card); border-radius: 4px; color: var(--text);" title="Căn phải">Phải</button>
          <button type="button" onclick="document.execCommand('justifyFull', false, null)" style="cursor:pointer; padding: 4px 8px; border: 1px solid var(--border); background: var(--bg-card); border-radius: 4px; color: var(--text);" title="Căn đều hai bên">Đều</button>
          <div style="width:1px; background:var(--border); margin: 0 4px;"></div>
          <button type="button" onclick="const url=prompt('Nhập link hình ảnh:'); if(url) document.execCommand('insertImage', false, url);" style="cursor:pointer; padding: 4px 8px; border: 1px solid var(--border); background: var(--bg-card); border-radius: 4px; color: var(--text);" title="Chèn ảnh">🖼️ Ảnh</button>
        </div>

        <div class="article-field-content body-content" contenteditable="true" id="bodyContent${idx}" style="border-top-left-radius: 0; border-top-right-radius: 0;">
          ${article.content_html || ''}
        </div>
        <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-top:8px; text-align:right;" id="wordCount${idx}">
          Đang tính số từ...
        </div>
      </div>

      <!-- Actions -->
      <div class="article-actions">
        <button class="action-btn action-btn-primary" onclick="exportWord(${idx})">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="15" y2="15"></line></svg>
          Gửi lên ban duyệt (Xuất Word)
        </button>
        <button class="action-btn action-btn-secondary" onclick="exportHTML(${idx})">
          Biên tập lại CMS (Xuất HTML)
        </button>
      </div>
    </div>
  `;

  // Init word count
  setTimeout(() => {
    const editor = document.getElementById('bodyContent' + idx);
    const wc = document.getElementById('wordCount' + idx);
    if (!editor || !wc) return;
    const updateWc = () => {
      // Body count
      const text = editor.textContent || '';
      const words = text.split(' ').filter(w => w.trim().length > 0);
      wc.innerText = 'Tổng số: ' + words.length + ' từ';
    };
    
    // Meta count
    const metaInp = document.getElementById('field_meta_' + idx);
    const metaWc = document.getElementById('metaCount' + idx);
    if(metaInp && metaWc) {
      const upMeta = () => {
        const len = metaInp.innerText.length;
        metaWc.innerText = len + ' ký tự (Chuẩn: 150-160)';
        metaWc.style.color = (len >= 140 && len <= 170) ? '#10b981' : 'var(--text-muted)';
      };
      metaInp.addEventListener('input', upMeta);
      upMeta();
    }
    editor.addEventListener('input', updateWc);
    editor.addEventListener('keyup', updateWc);
    updateWc();
  }, 100);
}

// ─── Copy / Export ────────────────────────────
function copyEditable(elementId, btn, isHtml = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = isHtml ? el.innerHTML : el.innerText;
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✓ Đã Copy';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = isHtml ? 'Copy HTML' : 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
}

function exportWord(idx) {
  const title = document.getElementById(`field_title_${idx}`)?.innerText || 'Bai_Viet';
  const contentHTML = document.getElementById(`bodyContent${idx}`)?.innerHTML || '';
  
  const header = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>${title}</title>
    <style>
      body { font-family: 'Times New Roman', serif; font-size: 14pt; line-height: 1.5; }
      h1, h2, h3 { color: #e62020; font-weight: bold; margin-top: 18pt; margin-bottom: 6pt; }
      h1 { font-size: 18pt; }
      p { margin-bottom: 12pt; }
    </style></head><body>`;
  const footer = "</body></html>";
  const sourceHTML = header + "<h1>" + title + "</h1>" + contentHTML + footer;
  
  // Create blob
  const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `BanThao_${title.substring(0, 30).trim().replace(/\s+/g,'_')}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📥 Đã xuất trọn vẹn ra File Word!', 'success');
}

function exportHTML(idx) {
  const art = state.articles[idx];
  if (!art) return;
  const title = document.getElementById(`field_title_${idx}`)?.innerText || art.title;
  const meta = document.getElementById(`field_meta_${idx}`)?.innerText || art.meta_description;
  const htmlContent = document.getElementById(`bodyContent${idx}`)?.innerHTML || art.content_html;

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="description" content="${escHtml(meta)}">
<title>${escHtml(title)}</title>
</head>
<body>
<article>
<h1>${escHtml(title)}</h1>
${htmlContent}
</article>
</body>
</html>`;
  downloadFile(`bai-seo-${idx+1}.html`, html, 'text/html');
  showToast('📥 Đã xuất file HTML!', 'success');
}

// ─── History Logic ────────────────────────────
function saveHistory(result) {
  const item = {
    id: Date.now(),
    date: new Date().toLocaleString('vi-VN'),
    title: result.articles[0].title,
    score: result.articles[0].seo_score?.total || 0,
    data: result
  };
  state.history.unshift(item);
  if (state.history.length > 50) state.history.pop();
  localStorage.setItem('finseo_history', JSON.stringify(state.history));
}

function renderHistory() {
  const list = document.getElementById('historyList');
  if (!state.history.length) {
    list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;">Chưa có bản nháp nào được lưu.</div>';
    return;
  }
  list.innerHTML = state.history.map((h, idx) => `
    <div class="history-item" onclick="loadHistoryItem(${idx})">
      <div class="history-title">${escHtml(h.title)}</div>
      <div class="history-meta">
        <span>🕒 ${h.date}</span>
        <span style="color:var(--primary);font-weight:600;">Điểm SEO: ${h.score}/10</span>
      </div>
    </div>
  `).join('');
}

function loadHistoryItem(idx) {
  const item = state.history[idx];
  state.articles = item.data.articles;
  state.currentArticle = 0;
  
  const category = item.data.topic_category || '';
  const keywords = item.data.detected_keywords || [];
  
  // Render results via generic renderResults is tricky if variables scope changed. We can just call renderResults manually.
  document.getElementById('emptyState').style.display  = 'none';
  document.getElementById('resultsArea').style.display = 'flex';
  document.getElementById('scoreAreaLeft').style.display = 'block';
  
  renderScoreOverview(state.articles[0].seo_score, keywords, category);
  const tabsEl = document.getElementById('articlesTabs');
  tabsEl.innerHTML = state.articles.map((a, i) =>
    `<button class="article-tab ${i===0?'active':''}" id="tab${i}" onclick="switchArticle(${i})">${a.type || `Bài ${i+1}`}</button>`
  ).join('');
  renderArticle(state.articles[0], 0, state.articles.length);

  document.getElementById('modalHistory').classList.remove('active');
  showToast('Đã tải lại bài viết từ Lịch Sử', 'success');
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Helpers ──────────────────────────────────
function escHtml(str) {
  return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) {
  return (str||'').replace(/'/g,'&#39;').replace(/\n/g,' ');
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ─── Rescore Selection ──────────────────────────────
async function reScoreSelected() {
  if (state.articles.length === 0) return;
  const idx = state.currentArticle;
  const art = state.articles[idx];

  const currentTitle = document.getElementById(`field_title_${idx}`)?.innerText || art.title;
  const currentMeta = document.getElementById(`field_meta_${idx}`)?.innerText || art.meta_description;
  const currentHtml = document.getElementById(`bodyContent${idx}`)?.innerHTML || art.content_html;
  const keyword = art.detected_keywords?.[0] || 'SEO';

  const prompt = `Bạn là Trưởng ban biên tập. Xin hãy CHẤM ĐIỂM SEO cho bài báo sau MỘT CÁCH TÀN NHẪN VÀ KHẮT KHE NHẤT CÓ THỂ. Chấm theo thang điểm 10. Trừ điểm mạnh tay, tạo điểm trung bình từ 6.0 đến 8.5.

Từ khóa chính: "${keyword}"
Tiêu đề: ${currentTitle}
Meta: ${currentMeta}
Nội dung: ${currentHtml.slice(0, 8000)}

TRẢ VỀ JSON THUẦN KHÔNG CÓ MARKDOWN THAM KHẢO CẤU TRÚC (Tuyệt đối điểm thành phần không vượt quá mẫu):
{
  "total": 6.8,
  "keyword_density": 1.2, // tối đa 2.0
  "title_quality": 1.3, // tối đa 2.0
  "meta_quality": 0.8, // tối đa 1.5
  "content_structure": 1.5, // tối đa 2.0
  "readability": 0.9, // tối đa 1.5
  "financial_accuracy": 0.8, // tối đa 1.0
  "improvements": ["Gợi ý rát mặt 1", "Gợi ý 2..."]
}`;

  showToast('Đang nhờ Trưởng ban biên tập đọc lại...', 'info');
  const btn = document.getElementById('btnRescore');
  if(btn) { btn.disabled = true; btn.style.opacity = '0.5'; }

  try {
    const isGeminiNative = state.apiKey.trim().startsWith('AIza');
    let res;
    
    // Auto Retry Logic
    for(let attempt = 1; attempt <= 3; attempt++){
      res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt })
      });
      if(res.ok) break;
      if(attempt === 3) {
        const err = await res.json();
        throw new Error(err.error || res.status);
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }

    const data = await res.json();
    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const newScore = JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());
    
    art.seo_score = newScore;
    renderScoreOverview(newScore, art.topic_category, art.detected_keywords);
    showToast('Đã xemét xong bản thảo mới!', 'success');
  } catch(e) {
    showToast('Lỗi xem lại: ' + e.message, 'error');
  } finally {
    if(btn) { btn.disabled = false; btn.style.opacity = '1'; }
  }
}

// ─── Auto Fix Article ────────────────────────────────
async function autoFixArticle() {
  if (state.articles.length === 0) return;
  const idx = state.currentArticle;
  const art = state.articles[idx];

  const currentTitle = document.getElementById(`field_title_${idx}`)?.innerText || art.title;
  const currentMeta = document.getElementById(`field_meta_${idx}`)?.innerText || art.meta_description;
  const currentHtml = document.getElementById(`bodyContent${idx}`)?.innerHTML || art.content_html;
  const keyword = art.detected_keywords?.[0] || 'SEO';
  const improvements = art.seo_score?.improvements?.join('\n- ') || '';

  const prompt = `Bạn là Chuyên gia SEO Content đẳng cấp. Hãy VIẾT LẠI bài báo này để giải quyết TRIỆT ĐỂ tất cả các LỖI sau đây mà Trưởng ban biên tập vừa chỉ trích:
- ${improvements}

TỪ KHÓA BẮT BUỘC (Phải chèn thêm nếu thiếu): "${keyword}"

NHÁP CŨ ĐANG BỊ LỖI:
Tiêu đề: ${currentTitle}
Meta: ${currentMeta}
Nội dung: ${currentHtml.slice(0, 8000)}

QUY TẮC SỬA CHỮA:
- Bố cục văn bản phải chia đoạn ngắn, dùng thẻ <p>, <h2>, <h3>, <ul>, <li> hợp lý.
- Con số, tỷ lệ, tên tổ chức phải được <strong> in đậm </strong>.
- Trả về JSON thuần không có Markdown.

{
  "title": "[Tiêu đề mới đã sửa lỗi, giật tít hơn]",
  "meta_description": "[Meta description mới đã sửa lỗi, chứa từ khóa]",
  "content_html": "[Toàn bộ nội dung HTML mới đã sửa toàn bộ các lỗi]"
}`;

  showToast('Đang đập đi xây lại theo gợi ý...', 'info');
  const btn = document.getElementById('btnAutoFix');
  if(btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.innerHTML = 'Đang sửa...'; }

  try {
    const isGeminiNative = state.apiKey.trim().startsWith('AIza');
    let res;
    
    for(let attempt = 1; attempt <= 3; attempt++){
      if (isGeminiNative) {
        res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + state.apiKey.trim(), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, responseMimeType: "application/json" }
          })
        });
      } else {
        res = await fetch(state.apiUrl.replace(/[/]+$/, '') + '/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.apiKey.trim() },
          body: JSON.stringify({ model: 'gpt-4o', messages: [{role:'user', content: prompt}], response_format: {type:'json_object'} })
        });
      }
      if(res.ok) break;
      if(attempt === 3) throw new Error('API Error: ' + res.status);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }

    const data = await res.json();
    let raw = isGeminiNative ? data.candidates?.[0]?.content?.parts?.[0]?.text : data.choices?.[0]?.message?.content;
    const fixedData = JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());
    
    // Cập nhật ngược lại vào UI
    art.title = fixedData.title;
    art.meta_description = fixedData.meta_description;
    art.content_html = fixedData.content_html;
    
    document.getElementById(`field_title_${idx}`).innerText = art.title;
    document.getElementById(`field_meta_${idx}`).innerText = art.meta_description;
    document.getElementById(`bodyContent${idx}`).innerHTML = art.content_html;
    
    // Auto trigger rescore để xem điểm mới
    await reScoreSelected();
    showToast('Đã sửa và chấm điểm xong bản mới!', 'success');
  } catch(e) {
    showToast('Lỗi tự động sửa: ' + e.message, 'error');
  } finally {
    if(btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = '✨ AI Tự Sửa'; }
  }
}

