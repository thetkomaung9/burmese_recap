# RecapMM Studio — English → Myanmar Movie Recap & Smart Sync Web Platform

Modern full-stack web studio and searchable discovery catalog for turning English-narrated movie recaps into natural spoken **Burmese (Myanmar) Movie Recaps**, referenced and upgraded from [`tharlaimar/recap-en-to-mm`](https://github.com/tharlaimar/recap-en-to-mm.git).

Repository: [`https://github.com/thetkomaung9/myanmarmovierecap.git`](https://github.com/thetkomaung9/myanmarmovierecap.git)

---

## မြန်မာဘာသာဖြင့် အကျဉ်းချုပ် (Overview in Burmese)

**RecapMM Studio** သည် English ဇာတ်လမ်းအကျဉ်း (Movie Recap) ဗီဒီယိုများနှင့် စာသားများကို မြန်မာနောက်ခံစကားပြော (Spoken Burmese Narrator) အဖြစ် သဘာဝကျကျ ဘာသာပြန်ဆိုခြင်း၊ အသံထုတ်လုပ်ခြင်း (TTS)၊ **30fps Smart Sync** အချိန်ညှိခြင်းနှင့် ဗီဒီယိုထုတ်ယူခြင်း (Final Video Render & Download) တို့ကို Web Browser ပေါ်မှတစ်ဆင့် တစ်နေရာတည်းတွင် ပြုလုပ်နိုင်သော စနစ်ဖြစ်ပါသည်။

### အဓိက လုပ်ဆောင်ချက်များ
1. **Recap Catalog & Advanced Search** — မြန်မာခေါင်းစဉ်၊ English ခေါင်းစဉ်၊ ဒါရိုက်တာ၊ ဇာတ်ကောင်အမည်များနှင့် ဇာတ်လမ်းတွင်း ပြောစကားတစ်ကြောင်းချင်းစီအထိ အသေးစိတ် ရှာဖွေနိုင်ခြင်း၊ အမျိုးအစား (Sci-Fi, Horror, Crime, K-Drama, Survival) နှင့် Aspect Ratio (`16:9`, `9:16`, `1:1`) အလိုက် ခွဲခြားကြည့်ရှုနိုင်ခြင်း။
2. **Story Context Memory (`build_story_context`)** — ဘာသာမပြန်မီ Gemini AI က ဇာတ်လမ်းတစ်ခုလုံးကို အရင်ဖတ်ရှုပြီး ဇာတ်ကောင်အမည်များ၊ ဆွေမျိုးတော်စပ်ပုံ အခေါ်အဝေါ်များ (သူ၊ သူမ၊ အစ်ကို၊ ညီမ) နှင့် ဇာတ်လမ်းအချိတ်အဆက်များကို မှတ်သားထားပေးခြင်း။
3. **Spoken Burmese Narrator Translation & Foreign-Script Guard** — စာသားအတိုင်း တိုက်ရိုက်ဘာသာပြန်ခြင်းမျိုး မဟုတ်ဘဲ မြန်မာဇာတ်လမ်းပြောသူတစ်ဦး၏ သဘာဝကျသော အပြောစကားဟန်ဖြင့် ဘာသာပြန်ပေးခြင်းနှင့် မြန်မာစာသားထဲသို့ တခြားဘာသာစာလုံးများ (ဥပမာ Georgian စာလုံး) မှားယွင်းပါဝင်လာပါက အလိုအလျောက် စစ်ဆေးဖယ်ရှားပေးခြင်း။
4. **30fps V2 Smart Sync Engine** — စာပိုင်းတစ်ခုချင်းစီ၏ အသံအရှည်နှင့် မူရင်းဗီဒီယို အပိုင်းအခြားကို အလယ်မှတ် (`v2_full_coverage_midpoint`) ဖြင့် အတိအကျ ချိတ်ဆက်ပေးပြီး `1.25x` အမြန်နှုန်းထက် မကျော်စေဘဲ Frame အရေအတွက်ကို တွက်ချက်ပေးခြင်း။
5. **Interactive Production Studio & Final Video Download** — Preview ပေါ်တွင် မြန်မာခေါင်းစဉ်၊ Channel Logo၊ `အပိုင်း (၁)` စာသားနှင့် မူရင်းစာတန်းထိုးဖျောက်သည့် Blur Box များကို စိတ်ကြိုက် ဆွဲရွှေ့ပြင်ဆင်နိုင်ပြီး Final Project Video (`.webm` / `.mp4`)၊ `smart_sync_plan.json` နှင့် `.SRT` ဖိုင်များကို တိုက်ရိုက် Download ဆွဲနိုင်ခြင်း။
6. **Generate Video from Text (Veo 3 & Free Studio Synthesizer)** — စာသား (Text Prompt) ရိုက်ထည့်ရုံဖြင့် `16:9` (Landscape) သို့မဟုတ် `9:16` (Portrait) ဗီဒီယိုအခန်းများကို ထုတ်လုပ်နိုင်ခြင်း။

---

## Key Features (English)

- **Recap Catalog & Multi-Dimensional Search**: Filter by category, aspect ratio (`16:9`, `9:16`, `1:1`), narrator voice persona (`Thiha` Male / `Nilar` Female), and origin country, or search inside timestamped English and Burmese narration lines.
- **3-Pane Production Studio**:
  - **Left Pane**: Voice & Smart Sync controls (`my-MM-ThihaNeural` / `my-MM-NilarNeural`, speed `-50%` to `+100%`, volume `50%–300%` with dB gain readout, `Short pauses ~0.25s`, `Max Video Speed 1.25x`, `Max Video Slow 1.35x`).
  - **Center Pane**: Interactive aspect-ratio canvas supporting `Blur background`, `Black bars`, `Crop to fill`, `Horizontal Flip ↔`, `Zoom 1.00x–1.25x`, draggable Myanmar Title, Logo, Episode badge (`အပိုင်း ၁`), and mouse-drawn Watermark Blur Boxes.
  - **Right Pane**: Overlay styling, Burmese numeral episode splitter (`၀၁၂၃၄၅၆၇၈၉`), and 1-click Final Video & Artifact export.
- **Sync Workbench & Story Context Memory**: Inspect and inline-edit every atomic sync unit (`ID 00001`..`ID N`), run Per-ID Gemini Alignment Audits, verify Unicode Myanmar script integrity, and manage the 7-pillar Story Context Memory.
- **Final Project Video Render & Text-to-Video Generation**: Render and download the complete composited recap video (`final_edge_tts_smart_sync.webm` / `.mp4`) or generate new `16:9` / `9:16` scenes from text via Veo 3 (`veo-3.1-fast-generate-preview`) with an automatic free-tier Canvas + Burmese TTS fallback.

---

## Local Setup & Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/thetkomaung9/myanmarmovierecap.git
   cd myanmarmovierecap
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   Copy `.env.example` to `.env` and set your `GEMINI_API_KEY`:
   ```bash
   cp .env.example .env
   ```

4. **Start the full-stack server (Express + Vite on Port 3000)**
   ```bash
   npm run dev
   ```

5. **Production build**
   ```bash
   npm run build
   npm start
   ```
