import scifiImg from '../assets/images/recap_scifi_chronos_1791562664486.jpg';
import horrorImg from '../assets/images/recap_horror_mist_1791562684831.jpg';
import heistImg from '../assets/images/recap_heist_vault_1791562696743.jpg';
import kdramaImg from '../assets/images/recap_kdrama_penthouse_1791562708092.jpg';
import survivalImg from '../assets/images/recap_survival_arctic_1791562721066.jpg';

import {
  AtomicSyncUnit,
  EdgeVoiceId,
  OutputRatio,
  ProductionOverlays,
  StoryContextMemory,
  recalculateSmartSyncUnits,
} from '../utils/smartSyncEngine';

export type RecapCategory =
  | 'Sci-Fi & Thriller'
  | 'Horror & Mystery'
  | 'Crime & Heist'
  | 'K-Drama Suspense'
  | 'Survival & Disaster';

export interface MovieRecapProject {
  id: string;
  englishTitle: string;
  myanmarTitle: string;
  category: RecapCategory;
  myanmarCategory: string;
  subgenres: string[];
  releaseYear: number;
  director: string;
  originCountry: string;
  sourceDurationMinutes: number;
  recapDurationMinutes: number;
  episodeCount: number;
  voicePersona: EdgeVoiceId;
  edgeRatePercent: number;
  maxVideoSpeed: number;
  maxVideoSlow: number;
  syncStatus: 'Published Ready' | 'Smart Sync Verified' | 'Audit Complete';
  syncAccuracyPercent: number;
  thumbnailUrl: string;
  loglineEn: string;
  loglineMm: string;
  storyContext: StoryContextMemory;
  overlays: ProductionOverlays;
  units: AtomicSyncUnit[];
}

function createUnits(
  rawRows: Array<{
    start: number;
    end: number;
    source_text: string;
    translation: string;
    auditStatus?: AtomicSyncUnit['auditStatus'];
    auditNote?: string;
  }>,
  edgeRatePercent = 5,
  shortPauses = true
): AtomicSyncUnit[] {
  const initial: AtomicSyncUnit[] = rawRows.map((row, idx) => ({
    id: idx + 1,
    start: row.start,
    end: row.end,
    video_start: row.start,
    video_end: row.end,
    source_text: row.source_text,
    translation: row.translation,
    ttsDuration: 4.2,
    speedFactor: 1.0,
    frameCount30fps: 126,
    syncDriftMs: 0,
    syncAction: 'EXACT_LOCK',
    auditStatus: row.auditStatus || 'VERIFIED',
    auditNote: row.auditNote || '1:1 ID verified · Natural Burmese narrator register',
  }));
  return recalculateSmartSyncUnits(initial, {
    edgeRatePercent,
    shortPauses,
    maxVideoSpeed: 1.25,
    maxVideoSlow: 1.35,
  });
}

export const INITIAL_RECAP_CATALOG: MovieRecapProject[] = [
  {
    id: 'chronos-station-2348',
    englishTitle: 'The Astraea Paradox',
    myanmarTitle: 'အာကာသစခန်းပေါ်က အချိန်ကွဲကြောင်း ပဟေဠိ',
    category: 'Sci-Fi & Thriller',
    myanmarCategory: 'သိပ္ပံနှင့် သည်းထိတ်ရင်ဖို',
    subgenres: ['Time Loop', 'Orbital Mystery', 'Hard Sci-Fi'],
    releaseYear: 2025,
    director: 'Denis Vance',
    originCountry: 'Hollywood',
    sourceDurationMinutes: 138,
    recapDurationMinutes: 16.4,
    episodeCount: 2,
    voicePersona: 'my-MM-ThihaNeural',
    edgeRatePercent: 5,
    maxVideoSpeed: 1.25,
    maxVideoSlow: 1.35,
    syncStatus: 'Smart Sync Verified',
    syncAccuracyPercent: 99.8,
    thumbnailUrl: scifiImg,
    loglineEn:
      'Alone aboard Orbital Station Astraea, chief engineer Elena discovers a fractured holographic timeline predicting the crew’s disappearance 72 hours before it happens.',
    loglineMm:
      'အာကာသစခန်း အက်စ်ထရီယာပေါ်မှာ တစ်ယောက်တည်းကျန်ခဲ့တဲ့ အင်ဂျင်နီယာချုပ် အယ်လီနာတစ်ယောက် သူမတို့အဖွဲ့သားတွေ ပျောက်ဆုံးမယ့်အရေးကို ၇၂ နာရီကြိုတင်ပြသနေတဲ့ အချိန်ကွဲကြောင်းပုံရိပ်ကို ရှာတွေ့သွားတဲ့အခါ...',
    storyContext: {
      characters: [
        'Elena Rostova (Chief Orbital Engineer / အင်ဂျင်နီယာချုပ် အယ်လီနာ)',
        'Commander Marcus Vance (Missing Mission Lead / ကပ္ပတိန် မားကပ်စ်)',
        'ARIA-9 (Station Diagnostic Kernel / စခန်းထိန်းချုပ်ရေး စနစ်)',
      ],
      relationships: [
        'Elena is Marcus’s former protégé who stayed on watch in Sector 4',
        'ARIA-9 is bound by classified Earth Command overrides',
      ],
      places: [
        'Astraea Orbital Research Station (အက်စ်ထရီယာ အာကာသသုတေသနစခန်း)',
        'Chronos Core Chamber (အချိန်ဗဟိုချက်ခန်းမ)',
        'Low Earth Orbit Sector 9',
      ],
      terms: [
        'Temporal Fracture (အချိန်ကွဲကြောင်း)',
        'Tachyon Echo (အချိန်လှိုင်း ပဲ့တင်သံ)',
        'Zero-Hour Lockdown (အရေးပေါ် ပိတ်ဆို့မှု)',
      ],
      plot_state: [
        'Day 412 of orbital solitude: telemetry sensors detect a 3-year timeline discrepancy',
        'Elena unlocks Commander Marcus’s helmet recorder left beside the console',
        'She realizes the distress signal is being transmitted by her own future self',
      ],
      name_consistency: [
        'Elena -> အယ်လီနာ (Pronoun: သူမ)',
        'Marcus -> မားကပ်စ် (Title: ကပ္ပတိန် မားကပ်စ်)',
        'Astraea Station -> အက်စ်ထရီယာ စခန်း',
      ],
      unresolved: [
        'Whether cutting power to the Chronos Core erases the surviving Earth colony',
      ],
    },
    overlays: {
      zoomFactor: 1.05,
      mirrorVideo: true,
      voiceVolumePercent: 125,
      shortPauses: true,
      outputRatio: '16:9',
      frameFill: 'blur',
      blurStrength: 18,
      blurBoxes: [
        {
          id: 'blur-sub-1',
          x: 0.5,
          y: 0.91,
          w: 0.64,
          h: 0.09,
          label: 'Source Hardcoded Subtitles',
        },
      ],
      titleText: 'အာကာသစခန်းပေါ်က အချိန်ကွဲကြောင်း ပဟေဠိ',
      titleSize: 44,
      titlePos: [0.5, 0.1],
      logoEnabled: true,
      logoTextOrUrl: 'RECAP MM · HD',
      logoPos: [0.86, 0.08],
      logoWidthFrac: 0.16,
      logoOpacity: 0.9,
      extraText: 'အပိုင်း (၁)',
      extraTextSize: 32,
      extraTextOpacity: 0.95,
      extraTextPos: [0.14, 0.86],
      episodeSplitMinutes: 10,
      currentEpisodeIndex: 1,
    },
    units: createUnits([
      {
        start: 0.0,
        end: 4.3,
        source_text:
          'Four hundred miles above Earth, chief engineer Elena wakes up to a silent alarm flashing across Astraea Station.',
        translation:
          'ကမ္ဘာမြေပြင်အထက် မိုင်လေးရာအကွာက အက်စ်ထရီယာ အာကာသစခန်းပေါ်မှာ အင်ဂျင်နီယာချုပ် အယ်လီနာတစ်ယောက် အသံတိတ်အချက်ပေးမီးတွေ လင်းနေတာကို ရုတ်တရက် တွေ့လိုက်ရပါတယ်။',
      },
      {
        start: 4.5,
        end: 8.9,
        source_text:
          'When she steps into the main bridge, the holographic timeline fractures into glowing amber shards right before her eyes.',
        translation:
          'သူမ ပင်မထိန်းချုပ်ခန်းထဲကို လှမ်းဝင်လိုက်တဲ့အချိန်မှာပဲ အချိန်ပြဟိုလိုဂရမ်မျက်နှာပြင်ကြီးက သူမမျက်စိရှေ့တင်ပဲ အက်ကွဲကြောင်းတွေ ပေါ်လာခဲ့တာပါ။',
      },
      {
        start: 9.2,
        end: 13.6,
        source_text:
          'The display shows years 2348 through 2351 collapsing into a single critical anomaly event.',
        translation:
          'အဲ့ဒီမျက်နှာပြင်ပေါ်မှာတော့ ၂၃၄၈ ခုနှစ်ကနေ ၂၃၅၁ ခုနှစ်အထိ အချိန်ကာလတွေက ပုံမှန်မဟုတ်တဲ့ ကွဲကြောင်းတစ်ခုထဲကို ပေါင်းစည်းပြိုလဲနေကြောင်း ပြသနေပါတယ်။',
      },
      {
        start: 13.9,
        end: 18.2,
        source_text:
          'Beside the console sits Commander Marcus’s sealed flight helmet, even though Marcus vanished six months ago.',
        translation:
          'ထူးဆန်းတာက လွန်ခဲ့တဲ့ခြောက်လကတည်းက ပျောက်ဆုံးသွားခဲ့တဲ့ ကပ္ပတိန်မားကပ်စ်ရဲ့ အာကာသဦးထုပ်က စက်ခုံဘေးမှာ ဒီအတိုင်း ပြန်ရောက်နေတာပဲ ဖြစ်ပါတယ်။',
      },
      {
        start: 18.5,
        end: 22.8,
        source_text:
          'As Elena touches the center of the glowing fracture, the glass vibrates with a recorded message in her own voice.',
        translation:
          'အယ်လီနာလည်း လင်းလက်နေတဲ့ အက်ကွဲကြောင်းဗဟိုချက်ကို လက်နဲ့ထိကြည့်လိုက်တဲ့အခါ သူမရဲ့ကိုယ်ပိုင်အသံနဲ့ မှတ်တမ်းတင်ထားတဲ့ သတိပေးချက်တစ်ခု ထွက်ပေါ်လာခဲ့ပါတော့တယ်။',
      },
      {
        start: 23.1,
        end: 27.6,
        source_text:
          'The recording warns her not to open the airlock when the rescue shuttle docks at midnight.',
        translation:
          'အဲ့ဒီအသံဖိုင်ထဲမှာတော့ သန်းခေါင်ယံအချိန် ကယ်ဆယ်ရေးယာဉ် လာချိတ်ဆက်တဲ့အခါ တံခါးကို လုံးဝမဖွင့်ပေးဖို့ သူမကိုယ်တိုင်က အတန်တန် သတိပေးထားခဲ့တာပါ။',
      },
      {
        start: 27.9,
        end: 32.3,
        source_text:
          'Checking the external cameras, she spots an identical Astraea Station drifting out of the orbital shadow.',
        translation:
          'ဒါနဲ့ သူမလည်း အပြင်ဘက်ကင်မရာတွေကို စစ်ဆေးကြည့်လိုက်တဲ့အခါ အမှောင်ထုထဲကနေ သူမတို့စခန်းနဲ့ တစ်ပုံစံတည်းတူနေတဲ့ နောက်ထပ်စခန်းတစ်ခု မျောပါလာတာကို မြင်လိုက်ရပါတယ်။',
      },
      {
        start: 32.6,
        end: 37.0,
        source_text:
          'Now Elena has less than twelve minutes to sever the reactor bridge before both timelines collide.',
        translation:
          'အခုချိန်မှာတော့ အယ်လီနာအနေနဲ့ အချိန်ကာလနှစ်ခု မတိုက်မိခင်မှာ စွမ်းအင်တံတားကို ဖြတ်တောက်ဖို့ အချိန် ဆယ့်နှစ်မိနစ်တောင် မကျန်တော့ပါဘူး။',
      },
    ]),
  },
  {
    id: 'blackwood-hollow-1924',
    englishTitle: 'Lantern in the Hollow',
    myanmarTitle: 'မြူနှင်းကြားက တောင်ပေါ်စံအိမ်ရဲ့ လျှို့ဝှက်ချက်',
    category: 'Horror & Mystery',
    myanmarCategory: 'သရဲနှင့် ပဟေဠိ',
    subgenres: ['Folk Horror', 'Supernatural Mystery', 'Period Thriller'],
    releaseYear: 2024,
    director: 'klara Lindqvist',
    originCountry: 'Nordic / European',
    sourceDurationMinutes: 114,
    recapDurationMinutes: 14.2,
    episodeCount: 1,
    voicePersona: 'my-MM-NilarNeural',
    edgeRatePercent: 0,
    maxVideoSpeed: 1.25,
    maxVideoSlow: 1.35,
    syncStatus: 'Published Ready',
    syncAccuracyPercent: 99.6,
    thumbnailUrl: horrorImg,
    loglineEn:
      'Sent to appraise a remote mountain timber house before winter, archivist Clara learns why the villagers insist a single lantern must stay lit behind the front window every dusk.',
    loglineMm:
      'ဆောင်းရာသီမဝင်ခင် တောင်ပေါ်က သစ်သားအိမ်အိုကြီးကို စစ်ဆေးဖို့ ရောက်လာတဲ့ ကလာရာတစ်ယောက် ညနေစောင်းတိုင်း ပြတင်းပေါက်မှာ မီးအိမ်တစ်လုံး မပျက်မကွက်ထွန်းထားရတဲ့ နောက်ကွယ်က အကြောင်းအရင်းကို သိလိုက်ရတဲ့အခါ...',
    storyContext: {
      characters: [
        'Clara Holm (Estate Archivist / မော်ကွန်းထိန်း ကလာရာ)',
        'Jonas (Old Caretaker / အိမ်စောင့်အဘိုးအို ဂျိုးနပ်စ်)',
        'The Miller’s Daughter (Apparition in the Mist / မြူနှင်းထဲက မိန်းကလေး)',
      ],
      relationships: [
        'Clara inherited the ledger of debts from her late uncle',
        'Jonas guarded the threshold for forty winters',
      ],
      places: [
        'Blackwood Timber Manor (တောင်ပေါ်သစ်သားစံအိမ်အို)',
        'The Cobblestone Crossing (ကျောက်ခင်းလမ်းချိုး)',
        'Grey Peak Valley (မီးခိုးရောင် တောင်ကြား)',
      ],
      terms: [
        'Dusk Watch (ညနေစောင်း မီးအိမ်စောင့်ချိန်)',
        'Threshold Bell (အိမ်ဝင်ပေါက် ခေါင်းလောင်း)',
      ],
      plot_state: [
        'Clara arrives at dusk as heavy mountain fog swallows the valley',
        'Jonas leaves a brass lantern burning in the right porch window',
        'Footsteps on the wet cobblestones stop directly outside the locked oak door',
      ],
      name_consistency: [
        'Clara -> ကလာရာ (Pronoun: သူမ)',
        'Jonas -> အဘိုးအို ဂျိုးနပ်စ်',
      ],
      unresolved: [
        'What happens if the lantern oil runs dry before the third bell',
      ],
    },
    overlays: {
      zoomFactor: 1.04,
      mirrorVideo: true,
      voiceVolumePercent: 115,
      shortPauses: true,
      outputRatio: '9:16',
      frameFill: 'blur',
      blurStrength: 20,
      blurBoxes: [],
      titleText: 'မြူနှင်းကြားက တောင်ပေါ်စံအိမ်ရဲ့ လျှို့ဝှက်ချက်',
      titleSize: 42,
      titlePos: [0.5, 0.14],
      logoEnabled: true,
      logoTextOrUrl: 'RECAP MM · SHORT',
      logoPos: [0.82, 0.06],
      logoWidthFrac: 0.18,
      logoOpacity: 0.85,
      extraText: 'ဇာတ်သိမ်းပိုင်း အပြည့်အစုံ',
      extraTextSize: 28,
      extraTextOpacity: 0.9,
      extraTextPos: [0.5, 0.86],
      episodeSplitMinutes: 0,
      currentEpisodeIndex: 1,
    },
    units: createUnits([
      {
        start: 0.0,
        end: 4.4,
        source_text:
          'As thick mountain fog rolls down the valley at dusk, Clara follows the wet cobblestone path toward the isolated timber house.',
        translation:
          'ညနေစောင်းအချိန် တောင်ကြားတစ်လျှောက် မြူနှင်းတွေ အုံ့ဆိုင်းလာချိန်မှာတော့ ကလာရာတစ်ယောက် စိုစွတ်နေတဲ့ ကျောက်ခင်းလမ်းလေးအတိုင်း တောင်ပေါ်က သစ်သားအိမ်အိုကြီးဆီကို လျှောက်လာခဲ့ပါတယ်။',
      },
      {
        start: 4.7,
        end: 9.0,
        source_text:
          'Every house in the village below had already bolted its shutters, leaving only a single warm lantern glowing inside the manor window.',
        translation:
          'တောင်ခြေရွာထဲက အိမ်တိုင်းဟာ တံခါးတွေကို အသေပိတ်ထားကြပေမယ့် ဒီသစ်သားအိမ်ကြီးရဲ့ ပြတင်းပေါက်မှာတော့ ဝါကျင့်ကျင့် မီးအိမ်လေးတစ်လုံးက လင်းနေဆဲပါပဲ။',
      },
      {
        start: 9.3,
        end: 13.7,
        source_text:
          'Inside, the old caretaker Jonas warns her never to blow out the flame before sunrise, no matter who knocks.',
        translation:
          'အိမ်ထဲရောက်တဲ့အခါ အိမ်စောင့်အဘိုးအို ဂျိုးနပ်စ်က ဘယ်သူပဲလာပြီး တံခါးခေါက်ခေါက် မိုးမလင်းမချင်း ဒီမီးအိမ်ကို လုံးဝမငြှိမ်းမိစေဖို့ သူမကို သတိပေးခဲ့ပါတယ်။',
      },
      {
        start: 14.0,
        end: 18.4,
        source_text:
          'At midnight, a draft from the cellar extinguishes the hallway candles, and slow footsteps echo across the wet stones outside.',
        translation:
          'သန်းခေါင်ယံရောက်တဲ့အချိန်မှာတော့ မြေအောက်ခန်းက လေအေးတွေတိုက်ခတ်လာပြီး အပြင်ဘက်ကျောက်ခင်းလမ်းပေါ်ကနေ တစ်လှမ်းချင်းလျှောက်လာတဲ့ ခြေသံတွေကို စကြားလာရပါတော့တယ်။',
      },
      {
        start: 18.7,
        end: 23.1,
        source_text:
          'When Clara peers through the frosted glass, she sees someone standing in the mist wearing her own winter coat.',
        translation:
          'ကလာရာလည်း ရေခဲရိုက်နေတဲ့ ပြတင်းပေါက်မှန်ကနေ အသာလေးချောင်းကြည့်လိုက်တဲ့အခါ မြူနှင်းထုထဲမှာ သူမရဲ့အနွေးထည်အတိုင်း ဝတ်ဆင်ထားတဲ့ လူရိပ်တစ်ခု ရပ်နေတာကို တွေ့လိုက်ရပါတယ်။',
      },
    ]),
  },
  {
    id: 'chamber-nine-heist',
    englishTitle: 'Vault Chamber 09',
    myanmarTitle: 'မြေအောက်ဘဏ်တိုက် အမှတ် (၉) စီးနင်းမှုကြီး',
    category: 'Crime & Heist',
    myanmarCategory: 'အက်ရှင်နှင့် မှုခင်း',
    subgenres: ['Bank Heist', 'Tactical Thriller', 'Neo-Noir'],
    releaseYear: 2025,
    director: 'Matteo Rossini',
    originCountry: 'Hollywood',
    sourceDurationMinutes: 126,
    recapDurationMinutes: 18.0,
    episodeCount: 3,
    voicePersona: 'my-MM-ThihaNeural',
    edgeRatePercent: 8,
    maxVideoSpeed: 1.25,
    maxVideoSlow: 1.35,
    syncStatus: 'Smart Sync Verified',
    syncAccuracyPercent: 99.9,
    thumbnailUrl: heistImg,
    loglineEn:
      'Locked inside Zurich’s subterranean Chamber 09 during a citywide blackout, structural architect Julian must crack his own unbreakable vault door from the outside in.',
    loglineMm:
      'တစ်မြို့လုံး မီးပျက်နေတဲ့အချိန် ဇူးရစ်မြို့ရဲ့ မြေအောက်ဘဏ်တိုက် အမှတ် ၉ ထဲမှာ ပိတ်မိသွားတဲ့ ဗိသုကာပညာရှင် ဂျူလီယန်တစ်ယောက် သူကိုယ်တိုင် တည်ဆောက်ခဲ့တဲ့ သံမဏိတံခါးကြီးကို ဘယ်လိုဖောက်ထွက်မလဲ...',
    storyContext: {
      characters: [
        'Julian Mercer (Vault Architect / ဘဏ်တိုက်ဗိသုကာပညာရှင် ဂျူလီယန်)',
        'Inspector Keller (Federal Negotiator / စုံထောက်မှူး ကဲလား)',
        'Elena Vane (Acoustic Cracker / သော့ဖောက်ကျွမ်းကျင်သူ အယ်လီနာ)',
      ],
      relationships: [
        'Julian designed Chamber 09 ten years ago with a hidden acoustic resonance flaw',
        'Keller suspects Julian allowed himself to be captured on purpose',
      ],
      places: [
        'Chamber 09 Subterranean Vault (မြေအောက်ဘဏ်တိုက်ခန်း အမှတ် ၉)',
        'Zurich Reserve Conduit (ဇူးရစ် မြေအောက်ရေပြွန်လမ်းကြောင်း)',
      ],
      terms: [
        'Barometric Seal (လေဖိအားသုံး သံမဏိသော့)',
        'Acoustic tumblers (အသံလှိုင်းသုံး သော့ချက်များ)',
      ],
      plot_state: [
        'Julian stands before the 40-ton circular steel vault door in Chamber 09',
        'Oxygen reserves inside the lower corridor drop to forty minutes',
        'He uses the turbine vibration from the subway line above to align the third locking wheel',
      ],
      name_consistency: [
        'Julian -> ဂျူလီယန် (Pronoun: သူ)',
        'Keller -> စုံထောက်မှူး ကဲလား',
        'Chamber 09 -> အခန်းအမှတ် (၉)',
      ],
      unresolved: [
        'What is stored inside the unnumbered deposit box at the center of Chamber 09',
      ],
    },
    overlays: {
      zoomFactor: 1.06,
      mirrorVideo: true,
      voiceVolumePercent: 130,
      shortPauses: true,
      outputRatio: '16:9',
      frameFill: 'blur',
      blurStrength: 18,
      blurBoxes: [
        {
          id: 'blur-heist-1',
          x: 0.85,
          y: 0.92,
          w: 0.22,
          h: 0.07,
          label: 'Studio Timecode Stamp',
        },
      ],
      titleText: 'မြေအောက်ဘဏ်တိုက် အမှတ် (၉) စီးနင်းမှုကြီး',
      titleSize: 46,
      titlePos: [0.5, 0.11],
      logoEnabled: true,
      logoTextOrUrl: 'RECAP MM · CRIME',
      logoPos: [0.85, 0.07],
      logoWidthFrac: 0.16,
      logoOpacity: 0.92,
      extraText: 'အပိုင်း (၁)',
      extraTextSize: 32,
      extraTextOpacity: 0.95,
      extraTextPos: [0.15, 0.86],
      episodeSplitMinutes: 8,
      currentEpisodeIndex: 1,
    },
    units: createUnits([
      {
        start: 0.0,
        end: 4.1,
        source_text:
          'Sixty feet beneath the streets of Zurich, architect Julian stands alone in front of the massive steel door of Chamber 09.',
        translation:
          'ဇူးရစ်မြို့ရဲ့ မြေပြင်အောက် ပေခြောက်ဆယ်အနက်မှာတော့ ဗိသုကာပညာရှင် ဂျူလီယန်တစ်ယောက် အခန်းအမှတ် ၉ ရဲ့ ဧရာမသံမဏိတံခါးကြီးရှေ့မှာ တစ်ယောက်တည်း ရပ်နေခဲ့ပါတယ်။',
      },
      {
        start: 4.3,
        end: 8.6,
        source_text:
          'Ten years ago, Julian designed this forty-ton vault to withstand both explosives and thermal drills.',
        translation:
          'လွန်ခဲ့တဲ့ဆယ်နှစ်က ဒီတန်ချိန်လေးဆယ်လေးတဲ့ ဘဏ်တိုက်တံခါးကြီးကို မိုင်းဗုံးတွေ၊ အပူချိန်မြင့် လွန်သွားတွေနဲ့တောင် ဖောက်လို့မရအောင် သူကိုယ်တိုင် ဒီဇိုင်းဆွဲခဲ့တာပါ။',
      },
      {
        start: 8.9,
        end: 13.4,
        source_text:
          'Now the security grid has locked him down in the flooded service tunnel with less than forty minutes of breathable air.',
        translation:
          'အခုချိန်မှာတော့ လုံခြုံရေးစနစ်က သူ့ကို ရေဝင်နေတဲ့ မြေအောက်ဥမင်ထဲမှာ ပိတ်ချလိုက်ပြီး အသက်ရှူစရာလေကလည်း မိနစ်လေးဆယ်စာတောင် မကျန်တော့ပါဘူး။',
      },
      {
        start: 13.7,
        end: 18.0,
        source_text:
          'Removing his gloves, Julian places his fingers against the cold steel wheel and waits for the midnight express train above.',
        translation:
          'ဒါပေမဲ့ ဂျူလီယန်ဟာ လက်အိတ်ကိုချွတ်ပြီး အေးစက်နေတဲ့ သံမဏိဘီးပေါ် လက်တင်ထားရင်း အပေါ်ထပ်က သန်းခေါင်ယံအမြန်ရထား ဖြတ်သွားမယ့်အချိန်ကို စိတ်ရှည်လက်ရှည် စောင့်နေခဲ့ပါတယ်။',
      },
      {
        start: 18.3,
        end: 22.7,
        source_text:
          'As the train rumbles overhead, the exact low-frequency vibration releases the hidden third pin inside the lock.',
        translation:
          'အပေါ်ကနေ ရထားဖြတ်သွားတဲ့ တုန်ခါမှုလှိုင်းက သူတမင်ထည့်သွင်းတည်ဆောက်ထားခဲ့တဲ့ တတိယမြောက် လျှို့ဝှက်သော့ချက်ကို အတိအကျ ပွင့်ထွက်သွားစေခဲ့ပါတော့တယ်။',
      },
    ]),
  },
  {
    id: 'seoul-glass-penthouse',
    englishTitle: 'Rain Over Seocho Penthouse',
    myanmarTitle: 'မိုးညထဲက ပန့်ဟောက်စ်အပေါ်ဆုံးထပ်က အမှန်တရား',
    category: 'K-Drama Suspense',
    myanmarCategory: 'ကိုရီးယား သည်းထိတ်ရင်ဖို',
    subgenres: ['Chaebol Mystery', 'Legal Thriller', 'Revenge Drama'],
    releaseYear: 2025,
    director: 'Park Jin-woo',
    originCountry: 'Korea',
    sourceDurationMinutes: 118,
    recapDurationMinutes: 15.5,
    episodeCount: 2,
    voicePersona: 'my-MM-NilarNeural',
    edgeRatePercent: 4,
    maxVideoSpeed: 1.25,
    maxVideoSlow: 1.35,
    syncStatus: 'Published Ready',
    syncAccuracyPercent: 99.7,
    thumbnailUrl: kdramaImg,
    loglineEn:
      'During a torrential rainstorm in Seoul, prosecutor Seo Yoon-ah confronts Chairman Kang in his 60th-floor glass penthouse carrying the original handwritten ledger.',
    loglineMm:
      'ဆိုးလ်မြို့မှာ မိုးသည်းထန်စွာရွာသွန်းနေတဲ့ ညတစ်ညမှာ အစိုးရရှေ့နေ ဆောယွန်းအာတစ်ယောက် ဥက္ကဋ္ဌကြီးဂန်ရဲ့ အထပ် ၆၀ ပန့်ဟောက်စ်အခန်းထဲကို မူရင်းလျှို့ဝှက်စာရင်းစာအုပ်နဲ့အတူ ရောက်ရှိလာတဲ့အခါ...',
    storyContext: {
      characters: [
        'Seo Yoon-ah (Special Prosecutor / အထူးရှေ့နေ ဆောယွန်းအာ)',
        'Chairman Kang Tae-shik (Haneul Group Head / ဥက္ကဋ္ဌကြီး ဂန်ထယ်ရှစ်)',
        'Secretary Min (Chief Legal Aide / အတွင်းရေးမှူး မင်း)',
      ],
      relationships: [
        'Yoon-ah’s father was the chief auditor blamed for the 2016 collapse',
        'Chairman Kang kept the black ledger locked in his private study',
      ],
      places: [
        'Seocho 60th-Floor Glass Penthouse (ဆောချို အထပ် ၆၀ ပန့်ဟောက်စ်)',
        'Seoul Central District Prosecutor’s Office (ဆိုးလ်ဗဟို တရားရုံးချုပ်)',
      ],
      terms: [
        'Black Ledger (လျှို့ဝှက် ရန်ပုံငွေစာရင်းစာအုပ်)',
        'Emergency Injunction (အရေးပေါ် တရားရုံးတားဝရမ်း)',
      ],
      plot_state: [
        'Chairman Kang confronts Yoon-ah in the rain-streaked penthouse living room',
        'He offers to clear her father’s name in exchange for the ledger',
        'Yoon-ah reveals the ledger in his hand is a decoy while the real pages are already streaming to the press',
      ],
      name_consistency: [
        'Seo Yoon-ah -> ဆောယွန်းအာ (Pronoun: သူမ)',
        'Chairman Kang -> ဥက္ကဋ္ဌကြီး ဂန်',
      ],
      unresolved: [
        'Who tipped off Yoon-ah about the hidden safe code inside the gallery painting',
      ],
    },
    overlays: {
      zoomFactor: 1.05,
      mirrorVideo: true,
      voiceVolumePercent: 120,
      shortPauses: true,
      outputRatio: '1:1',
      frameFill: 'blur',
      blurStrength: 16,
      blurBoxes: [],
      titleText: 'ပန့်ဟောက်စ်အပေါ်ဆုံးထပ်က အမှန်တရား',
      titleSize: 40,
      titlePos: [0.5, 0.1],
      logoEnabled: true,
      logoTextOrUrl: 'RECAP MM · K-DRAMA',
      logoPos: [0.84, 0.07],
      logoWidthFrac: 0.17,
      logoOpacity: 0.9,
      extraText: 'အပိုင်း (၂) · ဇာတ်သိမ်း',
      extraTextSize: 30,
      extraTextOpacity: 0.95,
      extraTextPos: [0.5, 0.88],
      episodeSplitMinutes: 10,
      currentEpisodeIndex: 2,
    },
    units: createUnits([
      {
        start: 0.0,
        end: 4.3,
        source_text:
          'Rain lashes against the floor-to-ceiling glass of the sixtieth-floor penthouse as Chairman Kang steps in front of Yoon-ah.',
        translation:
          'ဆိုးလ်မြို့ရဲ့ အထပ်ခြောက်ဆယ်မြောက် ပန့်ဟောက်စ်မှန်ချပ်ကြီးတွေကို မိုးရေတွေ তীব্রစွာ ရိုက်ခတ်နေချိန်မှာပဲ ဥက္ကဋ္ဌကြီးဂန်က ယွန်းအာရဲ့ရှေ့မှာ လာရပ်လိုက်ပါတယ်။',
      },
      {
        start: 4.5,
        end: 8.8,
        source_text:
          'Holding the black leather notebook, he asks how she managed to bypass his private security detail.',
        translation:
          'သူ့လက်ထဲမှာတော့ အနက်ရောင်မှတ်စုစာအုပ်ကို ကိုင်ထားရင်း သူ့ရဲ့အထူးလုံခြုံရေးအဖွဲ့ကို သူမ ဘယ်လိုကျော်ဖြတ်ပြီး ရောက်လာတာလဲဆိုပြီး မေးခွန်းထုတ်လိုက်ပါတယ်။',
      },
      {
        start: 9.1,
        end: 13.5,
        source_text:
          'Sitting calmly on the sofa, Yoon-ah replies that his own chief secretary opened the private elevator for her.',
        translation:
          'ဆိုဖာပေါ်မှာ တည်တည်ငြိမ်ငြိမ်ထိုင်နေတဲ့ ယွန်းအာကတော့ ဥက္ကဋ္ဌကြီးရဲ့ အယုံကြည်ရဆုံး အတွင်းရေးမှူးကိုယ်တိုင် သီးသန့်ဓာတ်လှေကားကို ဖွင့်ပေးခဲ့တာပါလို့ ပြန်ဖြေလိုက်ပါတယ်။',
      },
      {
        start: 13.8,
        end: 18.2,
        source_text:
          'Before Kang can destroy the notebook, Yoon-ah smiles and tells him that the real ledger is already in the prosecutor general’s hands.',
        translation:
          'ဥက္ကဋ္ဌကြီးဂန်လည်း စာအုပ်ကို မီးရှို့ဖျက်ဆီးဖို့ ကြံလိုက်ပေမဲ့ သူ့လက်ထဲကစာအုပ်ဟာ အတုသာဖြစ်ပြီး မူရင်းစာရင်းအစစ်က တရားသူကြီးချုပ်ဆီ ရောက်နေပြီလို့ ယွန်းအာက ပြောချလိုက်ပါတော့တယ်။',
      },
    ]),
  },
  {
    id: 'polar-star-expedition',
    englishTitle: 'Icebreaker Polar Star',
    myanmarTitle: 'အာတိတ်ရေခဲပြင်မှာ ပိတ်မိသွားတဲ့ ပိုလာစတား သင်္ဘောကြီး',
    category: 'Survival & Disaster',
    myanmarCategory: 'ရှင်သန်ရေးနှင့် သဘာဝဘေးအန္တရာယ်',
    subgenres: ['Arctic Survival', 'Maritime Thriller', 'True-Inspired'],
    releaseYear: 2024,
    director: 'Henrik Solberg',
    originCountry: 'Nordic / European',
    sourceDurationMinutes: 132,
    recapDurationMinutes: 19.2,
    episodeCount: 2,
    voicePersona: 'my-MM-ThihaNeural',
    edgeRatePercent: 2,
    maxVideoSpeed: 1.25,
    maxVideoSlow: 1.35,
    syncStatus: 'Smart Sync Verified',
    syncAccuracyPercent: 99.8,
    thumbnailUrl: survivalImg,
    loglineEn:
      'Trapped in shifting blue pack ice north of Svalbard as polar night descends, the crew of the expedition vessel Polar Star must dynamite a channel before the hull crushes.',
    loglineMm:
      'အာတိတ်ဒေသရဲ့ နေမထွက်တဲ့ ဆောင်းတွင်းကြီးမှာ ရေခဲပြင်ထူကြီးကြား ပိတ်မိသွားတဲ့ ပိုလာစတား သင်္ဘောကြီးပေါ်က သင်္ဘောသားတွေ အသက်ရှင်ဖို့ ရုန်းကန်ကြရပုံကို ကြည့်ရှုရမှာပါ...',
    storyContext: {
      characters: [
        'Captain Soren Lind (Icebreaker Commander / သင်္ဘောကပ္ပတိန် ဆိုရန်)',
        'Astrid (Glaciologist / ရေခဲပြင်သုတေသီ အက်စထရစ်)',
        'Erik (Chief Machinist / စက်မှုချုပ် အဲရစ်ခ်)',
      ],
      relationships: [
        'Captain Soren promised to bring all fourteen crew members back to Tromsø',
        'Astrid discovered the sub-glacial methane pocket beneath the ice ridge',
      ],
      places: [
        'R/V Polar Star Tromsø (ပိုလာစတား ရေခဲခွဲသင်္ဘော)',
        'Svalbard Northern Pack Ice (မြောက်ဝင်ရိုးစွန်း ရေခဲပြင်ကျယ်)',
      ],
      terms: [
        'Pressure Ridge (ရေခဲဖိအားကြောင့် တွန့်ခေါက်တက်လာသော ရေခဲတံတိုင်း)',
        'Hull Stress Gauge (သင်္ဘောကိုယ်ထည် ဖိအားတိုင်းကိရိယာ)',
      ],
      plot_state: [
        'Polar Star is locked immobile in jagged blue pack ice as temperatures plunge to -42°C',
        'Two crewmen in orange survival suits plant thermal charges along the starboard ice shelf',
        'The hull plates groan under rising lateral ice pressure',
      ],
      name_consistency: [
        'Captain Soren -> ကပ္ပတိန် ဆိုရန်',
        'Polar Star -> ပိုလာစတား သင်္ဘော',
      ],
      unresolved: [
        'Whether the starboard rudder survived the first ice compression wave',
      ],
    },
    overlays: {
      zoomFactor: 1.05,
      mirrorVideo: true,
      voiceVolumePercent: 125,
      shortPauses: true,
      outputRatio: '16:9',
      frameFill: 'blur',
      blurStrength: 18,
      blurBoxes: [],
      titleText: 'အာတိတ်ရေခဲပြင်မှာ ပိတ်မိသွားတဲ့ ပိုလာစတား သင်္ဘောကြီး',
      titleSize: 42,
      titlePos: [0.5, 0.11],
      logoEnabled: true,
      logoTextOrUrl: 'RECAP MM · SURVIVAL',
      logoPos: [0.85, 0.08],
      logoWidthFrac: 0.16,
      logoOpacity: 0.9,
      extraText: 'အပိုင်း (၁)',
      extraTextSize: 32,
      extraTextOpacity: 0.95,
      extraTextPos: [0.14, 0.86],
      episodeSplitMinutes: 10,
      currentEpisodeIndex: 1,
    },
    units: createUnits([
      {
        start: 0.0,
        end: 4.5,
        source_text:
          'Under a freezing twilight sky north of Tromsø, the research vessel Polar Star sits locked inside a field of jagged blue sea ice.',
        translation:
          'မြောက်ဝင်ရိုးစွန်းအနီးက အေးစက်မှောင်မိုက်နေတဲ့ ကောင်းကင်အောက်မှာတော့ ပိုလာစတား သုတေသနသင်္ဘောကြီးဟာ ထူထပ်လှတဲ့ ရေခဲပြင်ကြီးကြားထဲမှာ လုံးဝလှုပ်မရအောင် ပိတ်မိနေခဲ့ပါတယ်။',
      },
      {
        start: 4.8,
        end: 9.2,
        source_text:
          'With temperatures plunging below minus forty degrees, the shifting ice pack begins crushing the steel hull from both sides.',
        translation:
          'အပူချိန်ကလည်း အနုတ်လေးဆယ်ဒီဂရီအောက်အထိ ထိုးကျသွားပြီး ရွေ့လျားနေတဲ့ ရေခဲတုံးကြီးတွေက သင်္ဘောရဲ့သံမဏိကိုယ်ထည်ကို ဘေးနှစ်ဖက်စလုံးကနေ ညှပ်ပြီးဖိချနေပါတော့တယ်။',
      },
      {
        start: 9.5,
        end: 13.9,
        source_text:
          'Captain Soren sends two engineers onto the ice under the warm deck floodlights to drill relief charges before the keel snaps.',
        translation:
          'ဒါကြောင့် ကပ္ပတိန်ဆိုရန်ဟာ သင်္ဘောဝမ်းဗိုက် မကျိုးပျက်သွားခင်မှာပဲ အင်ဂျင်နီယာနှစ်ယောက်ကို ရေခဲပြင်ပေါ်ဆင်းပြီး မိုင်းခွဲလမ်းဖောက်ဖို့ အရေးပေါ်စေလွှတ်လိုက်ရပါတယ်။',
      },
      {
        start: 14.2,
        end: 18.6,
        source_text:
          'Just as they arm the final detonator, a deep fracture opens directly beneath their boots across the frozen channel.',
        translation:
          'သူတို့နှစ်ယောက် နောက်ဆုံးမိုင်းခလုတ်ကို ဆင်နေတဲ့အချိန်မှာပဲ သူတို့နင်းထားတဲ့ ရေခဲပြင်အောက်ကနေ ကြီးမားတဲ့ အက်ကွဲကြောင်းကြီးတစ်ခု ရုတ်တရက် ပွင့်ထွက်လာခဲ့ပါတော့တယ်။',
      },
    ]),
  },
];
