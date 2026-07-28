"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type View = "today" | "products" | "routines" | "calendar";
type Period = "morning" | "evening";
type Pace = "极速" | "日常" | "完整";
type SkinState =
  | "正常"
  | "偏干"
  | "偏油"
  | "起痘较多"
  | "泛红或刺痛"
  | "状态不确定";
type ProductStatus = "未开封" | "使用中" | "暂停使用" | "已空瓶";
type Stock = "充足" | "约一半" | "快用完";

type Product = {
  id: string;
  name: string;
  brand: string;
  category: string;
  image?: string;
  color: string;
  openDate: string;
  expiryMonths: number;
  status: ProductStatus;
  stock: Stock;
  tags: SkinState[];
  avoidTags: SkinState[];
  essential: boolean;
  fastEligible: boolean;
  usageCount: number;
  lastUsed?: string;
  note: string;
};

type Routine = {
  id: string;
  name: string;
  period: Period;
  time: string;
  days: number[];
  productIds: string[];
  enabled: boolean;
};

type UsageLog = {
  id: string;
  date: string;
  period: Period;
  routineName: string;
  productIds: string[];
  feeling: string;
  status: "completed" | "skipped";
};

type ItineraryKind =
  | "通勤"
  | "会议"
  | "户外"
  | "运动"
  | "约会"
  | "旅行"
  | "居家"
  | "聚会";

type Itinerary = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  kind: ItineraryKind;
  location: string;
  note: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type SpeechResultEventLike = {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type StoredState = {
  products: Product[];
  routines: Routine[];
  logs: UsageLog[];
  progress: Record<string, string[]>;
  itineraries?: Itinerary[];
};

type ProductForm = Omit<Product, "id" | "usageCount" | "lastUsed">;
type ItineraryForm = Omit<Itinerary, "id">;

const STORAGE_KEY = "lumiere-beauty-planner-v1";
const ASSISTANT_DOCK_STORAGE_KEY = "lumiere-assistant-dock-pos";

type DockPosition = { x: number; y: number };

type AssistantDockDragState = {
  dragging: boolean;
  moved: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

function getAssistantFabSize() {
  if (typeof window === "undefined") return 110;
  return window.innerWidth <= 720 ? 100 : 110;
}

function getDefaultAssistantDockPosition(): DockPosition {
  if (typeof window === "undefined") {
    return { x: 0, y: 0 };
  }

  const fabSize = getAssistantFabSize();
  const margin = window.innerWidth <= 720 ? 14 : 26;
  const bottomOffset = window.innerWidth <= 720 ? 88 : 26;

  return {
    x: window.innerWidth - margin - fabSize,
    y: window.innerHeight - bottomOffset - fabSize,
  };
}

function clampAssistantDockPosition(pos: DockPosition): DockPosition {
  if (typeof window === "undefined") return pos;

  const fabSize = getAssistantFabSize();
  const margin = 12;

  return {
    x: Math.min(Math.max(margin, pos.x), window.innerWidth - fabSize - margin),
    y: Math.min(Math.max(margin, pos.y), window.innerHeight - fabSize - margin),
  };
}

function readAssistantDockPosition(): DockPosition {
  if (typeof window === "undefined") {
    return { x: 0, y: 0 };
  }

  try {
    const stored = localStorage.getItem(ASSISTANT_DOCK_STORAGE_KEY);
    if (stored) {
      return clampAssistantDockPosition(JSON.parse(stored) as DockPosition);
    }
  } catch {
    // Fall back to the default corner position.
  }

  return getDefaultAssistantDockPosition();
}
const curatedProductImages: Record<string, string> = {
  "p-cleanser": "/products/cleanser-luxe.png",
  "p-hydra": "/products/serum-luxe.png",
  "p-balance": "/products/serum-luxe.png",
  "p-cream": "/products/cream-luxe.png",
  "p-sun": "/products/sunscreen-luxe.png",
};
const skinStates: SkinState[] = [
  "正常",
  "偏干",
  "偏油",
  "起痘较多",
  "泛红或刺痛",
  "状态不确定",
];
const categories = ["洁面", "精华", "乳霜", "防晒", "面膜", "彩妆", "工具"];
const itineraryKinds: ItineraryKind[] = [
  "通勤",
  "会议",
  "户外",
  "运动",
  "约会",
  "旅行",
  "居家",
  "聚会",
];
const dayOptions = [
  { label: "一", value: 1 },
  { label: "二", value: 2 },
  { label: "三", value: 3 },
  { label: "四", value: 4 },
  { label: "五", value: 5 },
  { label: "六", value: 6 },
  { label: "日", value: 0 },
];

const todayISO = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const dateWithOffset = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const seedItineraries: Itinerary[] = [
  {
    id: "trip-commute",
    title: "晨间通勤",
    date: dateWithOffset(0),
    startTime: "08:30",
    endTime: "09:10",
    kind: "通勤",
    location: "地铁与步行",
    note: "白天会在室内办公。",
  },
  {
    id: "trip-meeting",
    title: "客户方案会",
    date: dateWithOffset(0),
    startTime: "14:00",
    endTime: "15:30",
    kind: "会议",
    location: "城市会客厅",
    note: "需要保持清爽得体。",
  },
  {
    id: "trip-walk",
    title: "河畔晚间散步",
    date: dateWithOffset(0),
    startTime: "19:20",
    endTime: "20:10",
    kind: "户外",
    location: "滨水步道",
    note: "轻松步行，结束后回家护理。",
  },
  {
    id: "trip-yoga",
    title: "舒展瑜伽课",
    date: dateWithOffset(1),
    startTime: "18:30",
    endTime: "19:30",
    kind: "运动",
    location: "植物园路工作室",
    note: "",
  },
  {
    id: "trip-dinner",
    title: "朋友晚餐",
    date: dateWithOffset(3),
    startTime: "19:00",
    endTime: "21:00",
    kind: "聚会",
    location: "梧桐街",
    note: "提前留出准备时间。",
  },
  {
    id: "trip-outdoor",
    title: "周末城市漫游",
    date: dateWithOffset(6),
    startTime: "10:30",
    endTime: "16:00",
    kind: "户外",
    location: "美术馆与街区",
    note: "大部分时间在户外。",
  },
  {
    id: "trip-review",
    title: "月度复盘",
    date: dateWithOffset(-3),
    startTime: "20:00",
    endTime: "20:40",
    kind: "居家",
    location: "家中",
    note: "",
  },
];

const seedProducts: Product[] = [
  {
    id: "p-cleanser",
    image: "/products/cleanser-luxe.png",
    name: "柔润洁面慕斯",
    brand: "MELORA",
    category: "洁面",
    color: "#d9c7b6",
    openDate: "2026-06-18",
    expiryMonths: 12,
    status: "使用中",
    stock: "约一半",
    tags: ["正常", "偏干", "状态不确定"],
    avoidTags: [],
    essential: true,
    fastEligible: true,
    usageCount: 28,
    lastUsed: "2026-07-23",
    note: "泡沫细腻，赶时间也愿意用。",
  },
  {
    id: "p-hydra",
    image: "/products/serum-luxe.png",
    name: "水光保湿精华",
    brand: "ÉLAN",
    category: "精华",
    color: "#c6d5d2",
    openDate: "2026-07-02",
    expiryMonths: 9,
    status: "使用中",
    stock: "充足",
    tags: ["正常", "偏干"],
    avoidTags: [],
    essential: false,
    fastEligible: false,
    usageCount: 15,
    lastUsed: "2026-07-22",
    note: "皮肤偏干时更喜欢这一瓶。",
  },
  {
    id: "p-balance",
    image: "/products/serum-luxe.png",
    name: "清透平衡精华",
    brand: "NUE",
    category: "精华",
    color: "#b9c8b8",
    openDate: "2026-05-11",
    expiryMonths: 8,
    status: "使用中",
    stock: "约一半",
    tags: ["偏油", "起痘较多"],
    avoidTags: ["偏干", "泛红或刺痛"],
    essential: false,
    fastEligible: false,
    usageCount: 12,
    lastUsed: "2026-07-19",
    note: "只在自己状态稳定时使用。",
  },
  {
    id: "p-cream",
    image: "/products/cream-luxe.png",
    name: "柔光修护面霜",
    brand: "LUMIÈRE",
    category: "乳霜",
    color: "#d8b8b2",
    openDate: "2026-03-20",
    expiryMonths: 12,
    status: "使用中",
    stock: "快用完",
    tags: ["正常", "偏干", "泛红或刺痛", "状态不确定"],
    avoidTags: [],
    essential: true,
    fastEligible: true,
    usageCount: 42,
    lastUsed: "2026-07-23",
    note: "近期最常用，已加入回购观察。",
  },
  {
    id: "p-sun",
    image: "/products/sunscreen-luxe.png",
    name: "轻盈防晒乳",
    brand: "SOLEIL",
    category: "防晒",
    color: "#e3c58f",
    openDate: "2026-04-15",
    expiryMonths: 10,
    status: "使用中",
    stock: "约一半",
    tags: ["正常", "偏干", "偏油"],
    avoidTags: [],
    essential: true,
    fastEligible: true,
    usageCount: 36,
    lastUsed: "2026-07-23",
    note: "早间固定步骤。",
  },
  {
    id: "p-mask",
    name: "丝绒舒润面膜",
    brand: "AMARIS",
    category: "面膜",
    color: "#c9b8cf",
    openDate: "2026-07-08",
    expiryMonths: 6,
    status: "使用中",
    stock: "充足",
    tags: ["偏干"],
    avoidTags: ["起痘较多"],
    essential: false,
    fastEligible: false,
    usageCount: 3,
    lastUsed: "2026-07-18",
    note: "周末慢慢护理时使用。",
  },
];

const seedRoutines: Routine[] = [
  {
    id: "routine-am",
    name: "晨间柔光",
    period: "morning",
    time: "08:00",
    days: [0, 1, 2, 3, 4, 5, 6],
    productIds: ["p-cleanser", "p-hydra", "p-cream", "p-sun"],
    enabled: true,
  },
  {
    id: "routine-pm",
    name: "夜间舒缓",
    period: "evening",
    time: "22:00",
    days: [0, 1, 2, 3, 4, 5, 6],
    productIds: ["p-cleanser", "p-hydra", "p-cream", "p-mask"],
    enabled: true,
  },
];

const defaultForm = (): ProductForm => ({
  name: "",
  brand: "",
  category: "精华",
  color: "#d8b8b2",
  image: "",
  openDate: todayISO(),
  expiryMonths: 12,
  status: "使用中",
  stock: "充足",
  tags: ["正常"],
  avoidTags: [],
  essential: false,
  fastEligible: false,
  note: "",
});

const defaultItineraryForm = (date = todayISO()): ItineraryForm => ({
  title: "",
  date,
  startTime: "09:00",
  endTime: "10:00",
  kind: "通勤",
  location: "",
  note: "",
});

const formatLongDate = (date: Date) =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);

const getExpiryDate = (product: Product) => {
  const date = new Date(`${product.openDate}T12:00:00`);
  date.setMonth(date.getMonth() + product.expiryMonths);
  return date;
};

const daysToExpiry = (product: Product) =>
  Math.ceil((getExpiryDate(product).getTime() - Date.now()) / 86400000);

const makeId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export default function Home() {
  const [view, setView] = useState<View>("today");
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [routines, setRoutines] = useState<Routine[]>(seedRoutines);
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [progress, setProgress] = useState<Record<string, string[]>>({});
  const [itineraries, setItineraries] =
    useState<Itinerary[]>(seedItineraries);
  const [hydrated, setHydrated] = useState(false);
  const [period, setPeriod] = useState<Period>(
    new Date().getHours() < 14 ? "morning" : "evening",
  );
  const [pace, setPace] = useState<Pace>("日常");
  const [skinState, setSkinState] = useState<SkinState>("偏干");
  const [productFilter, setProductFilter] = useState("全部");
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(defaultForm());
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("正常");
  const [toast, setToast] = useState("");
  const [routinePicker, setRoutinePicker] = useState<Record<string, string>>({});
  const [calendarCursor, setCalendarCursor] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(
    new Date().getDate(),
  );
  const [itineraryModalOpen, setItineraryModalOpen] = useState(false);
  const [editingItineraryId, setEditingItineraryId] = useState<string | null>(
    null,
  );
  const [itineraryForm, setItineraryForm] = useState<ItineraryForm>(
    defaultItineraryForm(),
  );
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantDockPos, setAssistantDockPos] = useState<DockPosition>(
    readAssistantDockPosition,
  );
  const [assistantDockDragging, setAssistantDockDragging] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantListening, setAssistantListening] = useState(false);
  const [assistantTyping, setAssistantTyping] = useState(false);
  const [voiceReply, setVoiceReply] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<ChatMessage[]>([
    {
      id: "assistant-welcome",
      role: "assistant",
      text: "你好，我是露露。可以问我今天有哪些行程、该带哪些产品，或者让我帮你打开行程添加页。",
    },
  ]);
  const assistantMessagesRef = useRef<HTMLDivElement>(null);
  const assistantInputRef = useRef<HTMLInputElement>(null);
  const assistantDockDragRef = useRef<AssistantDockDragState>({
    dragging: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });

  const today = todayISO();
  const progressKey = `${today}-${period}`;
  const completedIds = progress[progressKey] ?? [];
  const activeRoutine =
    routines.find((routine) => routine.period === period && routine.enabled) ??
    routines.find((routine) => routine.period === period);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as StoredState;
        setProducts(
          parsed.products?.length
            ? parsed.products.map((product) => ({
                ...product,
                image: product.image || curatedProductImages[product.id],
              }))
            : seedProducts,
        );
        setRoutines(parsed.routines?.length ? parsed.routines : seedRoutines);
        setLogs(parsed.logs ?? []);
        setProgress(parsed.progress ?? {});
        setItineraries(
          parsed.itineraries === undefined
            ? seedItineraries
            : parsed.itineraries,
        );
      }
    } catch {
      setToast("本地记录读取失败，已为你恢复示例数据");
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const stored: StoredState = {
      products,
      routines,
      logs,
      progress,
      itineraries,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [hydrated, products, routines, logs, progress, itineraries]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const container = assistantMessagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [assistantMessages, assistantTyping, assistantOpen]);

  useEffect(() => {
    if (!assistantOpen) return;
    assistantInputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAssistantOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [assistantOpen]);

  useEffect(() => {
    const handleResize = () => {
      setAssistantDockPos((current) => clampAssistantDockPosition(current));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const persistAssistantDockPosition = (position: DockPosition) => {
    const clamped = clampAssistantDockPosition(position);
    try {
      localStorage.setItem(ASSISTANT_DOCK_STORAGE_KEY, JSON.stringify(clamped));
    } catch {
      // Ignore storage failures and keep the in-memory position.
    }
    return clamped;
  };

  const handleAssistantFabPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();

    const drag = assistantDockDragRef.current;
    drag.dragging = true;
    drag.moved = false;
    drag.pointerId = event.pointerId;
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.originX = assistantDockPos.x;
    drag.originY = assistantDockPos.y;

    const finishDrag = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== drag.pointerId) return;

      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);

      drag.dragging = false;
      setAssistantDockDragging(false);

      if (drag.moved) {
        setAssistantDockPos((current) => persistAssistantDockPosition(current));
        return;
      }

      setAssistantOpen((current) => !current);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!drag.dragging || moveEvent.pointerId !== drag.pointerId) return;

      const dx = moveEvent.clientX - drag.startX;
      const dy = moveEvent.clientY - drag.startY;

      if (!drag.moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        drag.moved = true;
        setAssistantDockDragging(true);
      }

      if (drag.moved) {
        moveEvent.preventDefault();
        setAssistantDockPos(
          clampAssistantDockPosition({
            x: drag.originX + dx,
            y: drag.originY + dy,
          }),
        );
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
  };

  const recommendedProducts = useMemo(() => {
    if (!activeRoutine) return [];
    const resolved = activeRoutine.productIds
      .map((id) => products.find((product) => product.id === id))
      .filter((product): product is Product => Boolean(product))
      .filter(
        (product) =>
          product.status === "使用中" && !product.avoidTags.includes(skinState),
      )
      .map((product) => {
        const betterMatch = products
          .filter(
            (candidate) =>
              candidate.category === product.category &&
              candidate.status === "使用中" &&
              !candidate.avoidTags.includes(skinState),
          )
          .sort((a, b) => {
            const aScore = a.tags.includes(skinState) ? 1 : 0;
            const bScore = b.tags.includes(skinState) ? 1 : 0;
            return bScore - aScore;
          })[0];
        return betterMatch ?? product;
      })
      .filter(
        (product, index, all) =>
          all.findIndex((candidate) => candidate.id === product.id) === index,
      );

    if (pace === "极速") {
      return resolved.filter((product) => product.fastEligible).slice(0, 3);
    }
    if (pace === "日常") {
      const essential = resolved.filter((product) => product.essential);
      const matching = resolved.find(
        (product) =>
          !product.essential &&
          (product.tags.includes(skinState) || skinState === "正常"),
      );
      return [...essential, ...(matching ? [matching] : [])]
        .sort(
          (a, b) =>
            activeRoutine.productIds.indexOf(a.id) -
            activeRoutine.productIds.indexOf(b.id),
        )
        .slice(0, 4);
    }
    return resolved;
  }, [activeRoutine, pace, products, skinState]);

  const hasRecordedToday = logs.some(
    (log) => log.date === today && log.period === period,
  );

  const recommendationReason = useMemo(() => {
    if (pace === "极速") {
      return "已保留你设置的必要步骤，适合今天想轻松快速完成。";
    }
    if (skinState === "状态不确定" || skinState === "泛红或刺痛") {
      return "优先使用你标记为适合当前状态的基础产品，并减少不确定组合。";
    }
    const matches = recommendedProducts.filter((product) =>
      product.tags.includes(skinState),
    ).length;
    return matches
      ? `其中 ${matches} 件产品被你标记为适合“${skinState}”，并参考了你的基础方案。`
      : "沿用你的基础方案，所有选择都可以替换或移除。";
  }, [pace, recommendedProducts, skinState]);

  const completionRate = recommendedProducts.length
    ? Math.round(
        (recommendedProducts.filter((product) =>
          completedIds.includes(product.id),
        ).length /
          recommendedProducts.length) *
          100,
      )
    : 0;

  const todayItineraries = itineraries
    .filter((itinerary) => itinerary.date === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const getItineraryProducts = (itinerary: Itinerary) => {
    const categoryPlan: Record<ItineraryKind, string[]> = {
      通勤: ["防晒", "乳霜", "精华"],
      会议: ["精华", "乳霜", "防晒"],
      户外: ["防晒", "乳霜", "洁面"],
      运动: ["洁面", "乳霜"],
      约会: ["精华", "乳霜", "防晒"],
      旅行: ["防晒", "乳霜", "洁面"],
      居家: ["精华", "乳霜"],
      聚会: ["精华", "乳霜", "防晒"],
    };

    return categoryPlan[itinerary.kind]
      .map((category) =>
        products
          .filter(
            (product) =>
              product.category === category &&
              product.status === "使用中" &&
              !product.avoidTags.includes(skinState),
          )
          .sort((a, b) => {
            const aMatch = a.tags.includes(skinState) ? 1 : 0;
            const bMatch = b.tags.includes(skinState) ? 1 : 0;
            return bMatch - aMatch;
          })[0],
      )
      .filter((product): product is Product => Boolean(product))
      .slice(0, 3);
  };

  const getItineraryReason = (itinerary: Itinerary) => {
    const reasons: Record<ItineraryKind, string> = {
      通勤: "兼顾出门前的基础保湿与日间安排。",
      会议: "选择你标记为状态稳定、适合清爽完成的产品。",
      户外: "户外时间较长，优先安排日间与回家后的基础步骤。",
      运动: "流程保持轻量，运动后可以快速完成清洁与保湿。",
      约会: "在基础护理上保留一件你喜欢的精华。",
      旅行: "减少数量，优先选择容易带走的基础步骤。",
      居家: "不赶时间，保留舒适简单的日常组合。",
      聚会: "兼顾准备效率和你当前记录的肤感。",
    };
    return reasons[itinerary.kind];
  };

  const openAddProduct = () => {
    setEditingProductId(null);
    setProductForm(defaultForm());
    setProductModalOpen(true);
  };

  const openEditProduct = (product: Product) => {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      brand: product.brand,
      category: product.category,
      image: product.image,
      color: product.color,
      openDate: product.openDate,
      expiryMonths: product.expiryMonths,
      status: product.status,
      stock: product.stock,
      tags: product.tags,
      avoidTags: product.avoidTags,
      essential: product.essential,
      fastEligible: product.fastEligible,
      note: product.note,
    });
    setProductModalOpen(true);
  };

  const saveProduct = (event: FormEvent) => {
    event.preventDefault();
    if (!productForm.name.trim()) return;
    if (editingProductId) {
      setProducts((current) =>
        current.map((product) =>
          product.id === editingProductId
            ? { ...product, ...productForm }
            : product,
        ),
      );
      setToast("产品信息已更新");
    } else {
      const nextProduct: Product = {
        ...productForm,
        id: makeId("product"),
        usageCount: 0,
      };
      setProducts((current) => [nextProduct, ...current]);
      setToast("已加入我的梳妆台");
    }
    setProductModalOpen(false);
  };

  const deleteProduct = () => {
    if (!editingProductId) return;
    const product = products.find((item) => item.id === editingProductId);
    if (!window.confirm(`确定删除“${product?.name ?? "这个产品"}”吗？`)) return;
    setProducts((current) =>
      current.filter((item) => item.id !== editingProductId),
    );
    setRoutines((current) =>
      current.map((routine) => ({
        ...routine,
        productIds: routine.productIds.filter((id) => id !== editingProductId),
      })),
    );
    setProductModalOpen(false);
    setToast("产品已删除");
  };

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new window.Image();
      image.onload = () => {
        const size = 480;
        const scale = Math.min(size / image.width, size / image.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        setProductForm((current) => ({
          ...current,
          image: canvas.toDataURL("image/webp", 0.72),
        }));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const toggleTag = (
    field: "tags" | "avoidTags",
    value: SkinState,
  ) => {
    setProductForm((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((tag) => tag !== value)
        : [...current[field], value],
    }));
  };

  const toggleStep = (productId: string) => {
    setProgress((current) => {
      const existing = current[progressKey] ?? [];
      return {
        ...current,
        [progressKey]: existing.includes(productId)
          ? existing.filter((id) => id !== productId)
          : [...existing, productId],
      };
    });
  };

  const saveFeedback = () => {
    if (!activeRoutine || !completedIds.length) return;
    const newLog: UsageLog = {
      id: makeId("log"),
      date: today,
      period,
      routineName: activeRoutine.name,
      productIds: completedIds,
      feeling: feedback,
      status: "completed",
    };
    setLogs((current) => [
      ...current.filter(
        (log) => !(log.date === today && log.period === period),
      ),
      newLog,
    ]);
    setProducts((current) =>
      current.map((product) =>
        completedIds.includes(product.id)
          ? {
              ...product,
              usageCount: product.usageCount + 1,
              lastUsed: today,
            }
          : product,
      ),
    );
    setFeedbackOpen(false);
    setToast("今日使用记录已保存");
  };

  const skipRoutine = () => {
    if (!activeRoutine) return;
    setLogs((current) => [
      ...current.filter(
        (log) => !(log.date === today && log.period === period),
      ),
      {
        id: makeId("log"),
        date: today,
        period,
        routineName: activeRoutine.name,
        productIds: [],
        feeling: "",
        status: "skipped",
      },
    ]);
    setToast("已记录本次跳过，不会顺延到明天");
  };

  const openAddItinerary = (date = today) => {
    setEditingItineraryId(null);
    setItineraryForm(defaultItineraryForm(date));
    setItineraryModalOpen(true);
  };

  const openEditItinerary = (itinerary: Itinerary) => {
    setEditingItineraryId(itinerary.id);
    setItineraryForm({
      title: itinerary.title,
      date: itinerary.date,
      startTime: itinerary.startTime,
      endTime: itinerary.endTime,
      kind: itinerary.kind,
      location: itinerary.location,
      note: itinerary.note,
    });
    setItineraryModalOpen(true);
  };

  const saveItinerary = (event: FormEvent) => {
    event.preventDefault();
    if (!itineraryForm.title.trim()) return;
    if (editingItineraryId) {
      setItineraries((current) =>
        current.map((itinerary) =>
          itinerary.id === editingItineraryId
            ? { ...itinerary, ...itineraryForm }
            : itinerary,
        ),
      );
      setToast("行程已更新");
    } else {
      setItineraries((current) => [
        ...current,
        { ...itineraryForm, id: makeId("itinerary") },
      ]);
      setToast("行程已加入日历");
    }
    const savedDate = new Date(`${itineraryForm.date}T12:00:00`);
    setCalendarCursor(
      new Date(savedDate.getFullYear(), savedDate.getMonth(), 1),
    );
    setSelectedCalendarDay(savedDate.getDate());
    setItineraryModalOpen(false);
  };

  const deleteItinerary = () => {
    if (!editingItineraryId) return;
    const itinerary = itineraries.find(
      (item) => item.id === editingItineraryId,
    );
    if (!window.confirm(`确定删除“${itinerary?.title ?? "这个行程"}”吗？`)) return;
    setItineraries((current) =>
      current.filter((item) => item.id !== editingItineraryId),
    );
    setItineraryModalOpen(false);
    setToast("行程已删除");
  };

  const renderAssistantText = (text: string) =>
    text
      .split(/(\*\*[^*]+\*\*)/g)
      .map((segment, index) =>
        segment.startsWith("**") && segment.endsWith("**") && segment.length > 4 ? (
          <strong key={index}>{segment.slice(2, -2)}</strong>
        ) : (
          segment
        ),
      );

  const speakAssistantReply = (text: string) => {
    if (!voiceReply || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  };

  const buildAssistantReply = (message: string) => {
    if (/添加|新建|安排/.test(message) && /行程|日程/.test(message)) {
      return "我已经为你打开今天的行程添加页。填好时间、类型和地点后保存即可。";
    }

    if (/今天|行程|安排/.test(message)) {
      if (!todayItineraries.length) {
        return "今天还没有行程。你可以告诉我“添加行程”，我会帮你打开添加页。";
      }
      return `今天有 ${todayItineraries.length} 个行程：${todayItineraries
        .map((item) => `${item.startTime} ${item.title}`)
        .join("；")}。`;
    }

    if (/推荐|产品|用什么|带什么/.test(message)) {
      const names = Array.from(
        new Set(
          todayItineraries.flatMap((itinerary) =>
            getItineraryProducts(itinerary).map((product) => product.name),
          ),
        ),
      );
      return names.length
        ? `结合今天的行程和“${skinState}”状态，可以优先考虑：${names.join("、")}。这些只是基于你自己标签的使用建议，随时可以替换。`
        : "今天暂时没有可匹配的产品。可以先在梳妆台补充产品标签，或为今天添加一个行程。";
    }

    if (/偏干|出油|起痘|泛红|刺痛/.test(message)) {
      return "你可以先在“今天”页面更新当前肤感。我会优先从你标记为适合该状态、且没有暂停的产品中选择；持续明显不适时不建议继续自行尝试新组合。";
    }

    return "我可以帮你查看今天的行程、根据行程整理产品建议，或打开行程添加页。试试问我“今天有哪些行程？”";
  };

  const resolveAssistantReply = async (
    message: string,
    historySnapshot: ChatMessage[],
  ): Promise<string> => {
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 60000);

      const productContext = products.slice(0, 20).map((product) => ({
        name: product.name,
        brand: product.brand,
        category: product.category,
        status: product.status,
        stock: product.stock,
        tags: product.tags,
        avoidTags: product.avoidTags,
        daysToExpiry: daysToExpiry(product),
      }));
      const itineraryContext = todayItineraries.map((itinerary) => ({
        title: itinerary.title,
        kind: itinerary.kind,
        startTime: itinerary.startTime,
        endTime: itinerary.endTime,
        location: itinerary.location,
      }));

      const response = await fetch("/api/assistant-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: historySnapshot
            .slice(-6)
            .map((item) => ({ role: item.role, text: item.text })),
          context: {
            skinState,
            pace,
            period,
            today,
            itineraries: itineraryContext,
            products: productContext,
          },
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);

      if (!response.ok) throw new Error(`assistant-chat responded ${response.status}`);
      const data = (await response.json()) as { reply?: string };
      if (!data.reply) throw new Error("assistant-chat returned an empty reply");
      return data.reply;
    } catch {
      return buildAssistantReply(message);
    }
  };

  const sendAssistantMessage = (message = assistantInput) => {
    const cleanMessage = message.trim();
    if (!cleanMessage || assistantTyping) return;

    const historySnapshot = assistantMessages;
    setAssistantMessages((current) => [
      ...current,
      { id: makeId("message"), role: "user", text: cleanMessage },
    ]);
    setAssistantInput("");

    if (/添加|新建|安排/.test(cleanMessage) && /行程|日程/.test(cleanMessage)) {
      openAddItinerary(today);
      const reply = "我已经为你打开今天的行程添加页。填好时间、类型和地点后保存即可。";
      setAssistantMessages((current) => [
        ...current,
        { id: makeId("message"), role: "assistant", text: reply },
      ]);
      speakAssistantReply(reply);
      return;
    }

    setAssistantTyping(true);
    resolveAssistantReply(cleanMessage, historySnapshot).then((reply) => {
      setAssistantMessages((current) => [
        ...current,
        { id: makeId("message"), role: "assistant", text: reply },
      ]);
      setAssistantTyping(false);
      speakAssistantReply(reply);
    });
  };

  const startVoiceInput = () => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setToast("当前浏览器暂不支持语音输入，可以使用文字对话");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) sendAssistantMessage(transcript);
    };
    recognition.onerror = () => {
      setAssistantListening(false);
      setToast("没有听清，请再试一次");
    };
    recognition.onend = () => setAssistantListening(false);
    setAssistantListening(true);
    recognition.start();
  };

  const updateRoutine = (id: string, patch: Partial<Routine>) => {
    setRoutines((current) =>
      current.map((routine) =>
        routine.id === id ? { ...routine, ...patch } : routine,
      ),
    );
  };

  const addRoutineStep = (routine: Routine) => {
    const productId = routinePicker[routine.id];
    if (!productId || routine.productIds.includes(productId)) return;
    updateRoutine(routine.id, {
      productIds: [...routine.productIds, productId],
    });
    setRoutinePicker((current) => ({ ...current, [routine.id]: "" }));
    setToast("新步骤已加入方案");
  };

  const filteredProducts =
    productFilter === "全部"
      ? products
      : products.filter((product) => product.category === productFilter);

  const calendarYear = calendarCursor.getFullYear();
  const calendarMonth = calendarCursor.getMonth();
  const calendarDays = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
  const calendarOffset = firstDay === 0 ? 6 : firstDay - 1;
  const monthPrefix = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}`;
  const monthLogs = logs.filter((log) => log.date.startsWith(monthPrefix));
  const monthItineraries = itineraries.filter((itinerary) =>
    itinerary.date.startsWith(monthPrefix),
  );
  const selectedDate = `${monthPrefix}-${String(selectedCalendarDay).padStart(2, "0")}`;
  const selectedLogs = logs.filter((log) => log.date === selectedDate);
  const selectedItineraries = itineraries
    .filter((itinerary) => itinerary.date === selectedDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const navItems: { id: View; label: string; icon: string }[] = [
    { id: "today", label: "今天", icon: "✦" },
    { id: "calendar", label: "日历", icon: "□" },
    { id: "products", label: "梳妆台", icon: "◇" },
    { id: "routines", label: "方案", icon: "≋" },
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="主要导航">
        <button className="brand" onClick={() => setView("today")}>
          <span className="brand-mark">L</span>
          <span>
            <strong>LUMIÈRE</strong>
            <small>你的光泽日程</small>
          </span>
        </button>
        <nav className="side-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "nav-item active" : "nav-item"}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="eyebrow">本地保存</span>
          <p>你的产品、方案和记录只保存在当前浏览器。</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">PERSONAL BEAUTY RITUAL</span>
            <h1>
              {view === "today" && "今天的光泽时刻"}
              {view === "products" && "我的梳妆台"}
              {view === "routines" && "护理方案"}
              {view === "calendar" && "使用日历"}
            </h1>
          </div>
          <button className="avatar" aria-label="个人资料">
            露
          </button>
        </header>

        {view === "today" && (
          <div className="page page-today">
            <section className="welcome-card">
              <div className="welcome-copy">
                <p>{formatLongDate(new Date())}</p>
                <h2>按今天的节奏，照顾好自己。</h2>
                <span>
                  从你的梳妆台中选择合适产品，只留下今天真正需要的步骤。
                </span>
              </div>
              <div
                className="progress-ring"
                style={{
                  background: `conic-gradient(var(--gold) ${completionRate}%, rgba(255,255,255,.34) 0)`,
                }}
                aria-label={`完成进度 ${completionRate}%`}
              >
                <div>
                  <strong>{completionRate}%</strong>
                  <span>今日进度</span>
                </div>
              </div>
            </section>

            <section className="checkin-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">TODAY&apos;S CHECK-IN</span>
                  <h2>今天想怎样护理？</h2>
                </div>
                <span className="autosave">自动保存</span>
              </div>
              <div className="checkin-grid">
                <div className="choice-group">
                  <label>护理时间</label>
                  <div className="segmented">
                    <button
                      className={period === "morning" ? "selected" : ""}
                      onClick={() => setPeriod("morning")}
                    >
                      早间
                    </button>
                    <button
                      className={period === "evening" ? "selected" : ""}
                      onClick={() => setPeriod("evening")}
                    >
                      晚间
                    </button>
                  </div>
                </div>
                <div className="choice-group">
                  <label>今天有多少时间？</label>
                  <div className="chip-row">
                    {(["极速", "日常", "完整"] as Pace[]).map((item) => (
                      <button
                        key={item}
                        className={pace === item ? "choice-chip selected" : "choice-chip"}
                        onClick={() => setPace(item)}
                      >
                        {item}
                        <small>
                          {item === "极速" ? "2 min" : item === "日常" ? "5 min" : "10+ min"}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="choice-group skin-choice">
                  <label>现在感觉怎么样？</label>
                  <div className="chip-row wrap">
                    {skinStates.map((item) => (
                      <button
                        key={item}
                        className={
                          skinState === item ? "skin-chip selected" : "skin-chip"
                        }
                        onClick={() => setSkinState(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="routine-card">
              <div className="routine-card-head">
                <div>
                  <span className="eyebrow">
                    {period === "morning" ? "MORNING RITUAL" : "EVENING RITUAL"}
                  </span>
                  <h2>{activeRoutine?.name ?? "还没有可用方案"}</h2>
                  <p>
                    {activeRoutine?.time ?? "--:--"} · 约
                    {pace === "极速" ? "2" : pace === "日常" ? "5" : "10+"}分钟
                  </p>
                </div>
                <span className="routine-count">
                  {recommendedProducts.length} 个步骤
                </span>
              </div>

              <div className="recommendation-note">
                <span>✦</span>
                <div>
                  <strong>今日搭配说明</strong>
                  <p>{recommendationReason}</p>
                </div>
              </div>

              <div className="routine-steps">
                {recommendedProducts.map((product, index) => {
                  const isDone = completedIds.includes(product.id);
                  return (
                    <article
                      key={product.id}
                      className={isDone ? "routine-step done" : "routine-step"}
                    >
                      <button
                        className="step-check"
                        onClick={() => toggleStep(product.id)}
                        aria-label={`${isDone ? "取消完成" : "完成"} ${product.name}`}
                      >
                        {isDone ? "✓" : index + 1}
                      </button>
                      <ProductVisual product={product} compact />
                      <div className="step-copy">
                        <small>{product.category}</small>
                        <strong>{product.name}</strong>
                        <span>{product.brand}</span>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => openEditProduct(product)}
                      >
                        查看
                      </button>
                    </article>
                  );
                })}
                {!recommendedProducts.length && (
                  <div className="empty-state">
                    <span>◇</span>
                    <h3>当前方案里还没有可用产品</h3>
                    <p>去梳妆台添加产品，再把它加入护理方案。</p>
                    <button className="primary-button" onClick={() => setView("products")}>
                      添加产品
                    </button>
                  </div>
                )}
              </div>

              {!!recommendedProducts.length && (
                <div className="routine-actions">
                  <button
                    className="primary-button"
                    disabled={!completedIds.length || hasRecordedToday}
                    onClick={() => setFeedbackOpen(true)}
                  >
                    {hasRecordedToday
                      ? "今日已记录"
                      : completedIds.length === recommendedProducts.length
                        ? "完成本次护理"
                        : `记录已完成 ${completedIds.length}/${recommendedProducts.length}`}
                  </button>
                  <button className="secondary-button" onClick={skipRoutine}>
                    今晚跳过
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => setToast("已为你延后 30 分钟")}
                  >
                    延后30分钟
                  </button>
                </div>
              )}
            </section>

            <section className="itinerary-recommendations">
              <div className="section-heading collection-heading">
                <div>
                  <span className="eyebrow">ITINERARY CARE</span>
                  <h2>根据今天的行程准备产品</h2>
                  <p className="section-subtitle">
                    结合行程类型和你选择的“{skinState}”状态，从自己的梳妆台中挑选。
                  </p>
                </div>
                <button
                  className="secondary-button"
                  onClick={() => openAddItinerary(today)}
                >
                  ＋ 添加今日行程
                </button>
              </div>

              {todayItineraries.length ? (
                <div className="itinerary-recommendation-grid">
                  {todayItineraries.map((itinerary) => {
                    const matchedProducts = getItineraryProducts(itinerary);
                    return (
                      <article
                        className="itinerary-recommendation-card"
                        key={itinerary.id}
                      >
                        <div className="itinerary-card-head">
                          <span className={`itinerary-kind kind-${itinerary.kind}`}>
                            {itinerary.kind}
                          </span>
                          <button
                            className="text-button"
                            onClick={() => openEditItinerary(itinerary)}
                          >
                            编辑
                          </button>
                        </div>
                        <time>{itinerary.startTime}</time>
                        <h3>{itinerary.title}</h3>
                        <p className="itinerary-location">
                          {itinerary.location || "地点待定"}
                        </p>
                        <p className="itinerary-reason">
                          {getItineraryReason(itinerary)}
                        </p>
                        <div className="trip-product-row">
                          {matchedProducts.map((product) => (
                            <div className="trip-product" key={product.id}>
                              <ProductVisual product={product} compact />
                              <span>{product.name}</span>
                            </div>
                          ))}
                          {!matchedProducts.length && (
                            <span className="no-match">
                              暂无匹配产品，可在梳妆台补充状态标签。
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="itinerary-empty">
                  <span>□</span>
                  <div>
                    <h3>添加今天的行程，获得更贴近场景的产品建议</h3>
                    <p>例如通勤、会议、运动、约会或户外活动。</p>
                  </div>
                  <button
                    className="primary-button"
                    onClick={() => openAddItinerary(today)}
                  >
                    添加行程
                  </button>
                </div>
              )}
            </section>
          </div>
        )}

        {view === "products" && (
          <div className="page">
            <section className="stats-strip">
              <div>
                <span>使用中</span>
                <strong>{products.filter((product) => product.status === "使用中").length}</strong>
              </div>
              <div>
                <span>本月使用</span>
                <strong>
                  {monthLogs.reduce((sum, log) => sum + log.productIds.length, 0)}
                </strong>
              </div>
              <div>
                <span>快用完</span>
                <strong>{products.filter((product) => product.stock === "快用完").length}</strong>
              </div>
              <div>
                <span>需要留意</span>
                <strong>
                  {
                    products.filter(
                      (product) =>
                        daysToExpiry(product) < 60 ||
                        product.status === "暂停使用",
                    ).length
                  }
                </strong>
              </div>
            </section>

            <section className="collection-section">
              <div className="section-heading collection-heading">
                <div>
                  <span className="eyebrow">MY COLLECTION</span>
                  <h2>{products.length} 件属于你的产品</h2>
                </div>
                <button className="primary-button" onClick={openAddProduct}>
                  ＋ 添加产品
                </button>
              </div>
              <div className="filter-row" aria-label="产品分类">
                {["全部", ...categories].map((category) => (
                  <button
                    key={category}
                    className={
                      productFilter === category ? "filter-chip active" : "filter-chip"
                    }
                    onClick={() => setProductFilter(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="product-grid">
                {filteredProducts.map((product) => {
                  const expiryDays = daysToExpiry(product);
                  return (
                    <button
                      className="product-card"
                      key={product.id}
                      onClick={() => openEditProduct(product)}
                    >
                      <ProductVisual product={product} />
                      <div className="product-card-copy">
                        <span>{product.brand}</span>
                        <h3>{product.name}</h3>
                        <p>
                          {product.category} · 已使用 {product.usageCount} 次
                        </p>
                        <div className="product-meta">
                          <span className={`stock-dot stock-${product.stock}`}>
                            {product.stock}
                          </span>
                          <span className={expiryDays < 60 ? "expiry urgent" : "expiry"}>
                            {expiryDays < 0
                              ? "已超过期限"
                              : expiryDays < 60
                                ? `剩 ${expiryDays} 天`
                                : product.status}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {view === "routines" && (
          <div className="page">
            <section className="routine-intro">
              <div>
                <span className="eyebrow">MY RITUALS</span>
                <h2>先建立稳定基础，再让今天自由变化。</h2>
              </div>
              <p>
                修改方案只影响未来安排，已经完成的使用记录会保留当时的产品。
              </p>
            </section>
            <div className="routine-editor-grid">
              {routines.map((routine) => (
                <section className="routine-editor" key={routine.id}>
                  <div className="routine-editor-head">
                    <div>
                      <span className="period-badge">
                        {routine.period === "morning" ? "晨间" : "晚间"}
                      </span>
                      <input
                        className="routine-title-input"
                        value={routine.name}
                        onChange={(event) =>
                          updateRoutine(routine.id, { name: event.target.value })
                        }
                        aria-label="方案名称"
                      />
                    </div>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={routine.enabled}
                        onChange={(event) =>
                          updateRoutine(routine.id, {
                            enabled: event.target.checked,
                          })
                        }
                      />
                      <span />
                    </label>
                  </div>
                  <div className="schedule-row">
                    <label>
                      提醒时间
                      <input
                        type="time"
                        value={routine.time}
                        onChange={(event) =>
                          updateRoutine(routine.id, { time: event.target.value })
                        }
                      />
                    </label>
                    <div>
                      <span>重复日期</span>
                      <div className="day-picker">
                        {dayOptions.map((day) => (
                          <button
                            key={day.value}
                            className={routine.days.includes(day.value) ? "active" : ""}
                            onClick={() =>
                              updateRoutine(routine.id, {
                                days: routine.days.includes(day.value)
                                  ? routine.days.filter((value) => value !== day.value)
                                  : [...routine.days, day.value],
                              })
                            }
                            aria-label={`星期${day.label}`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="editor-steps">
                    {routine.productIds.map((productId, index) => {
                      const product = products.find((item) => item.id === productId);
                      if (!product) return null;
                      return (
                        <div className="editor-step" key={`${routine.id}-${productId}`}>
                          <span className="drag-handle">⋮⋮</span>
                          <span className="step-index">{index + 1}</span>
                          <ProductVisual product={product} compact />
                          <div>
                            <small>{product.category}</small>
                            <strong>{product.name}</strong>
                          </div>
                          <button
                            className="remove-button"
                            aria-label={`从方案移除 ${product.name}`}
                            onClick={() =>
                              updateRoutine(routine.id, {
                                productIds: routine.productIds.filter(
                                  (id) => id !== productId,
                                ),
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="add-step-row">
                    <select
                      value={routinePicker[routine.id] ?? ""}
                      onChange={(event) =>
                        setRoutinePicker((current) => ({
                          ...current,
                          [routine.id]: event.target.value,
                        }))
                      }
                      aria-label="选择要加入的产品"
                    >
                      <option value="">选择梳妆台中的产品</option>
                      {products
                        .filter(
                          (product) =>
                            product.status === "使用中" &&
                            !routine.productIds.includes(product.id),
                        )
                        .map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.category} · {product.name}
                          </option>
                        ))}
                    </select>
                    <button
                      className="secondary-button"
                      onClick={() => addRoutineStep(routine)}
                    >
                      加入步骤
                    </button>
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}

        {view === "calendar" && (
          <div className="page calendar-page">
            <section className="calendar-card">
              <div className="calendar-head">
                <div>
                  <span className="eyebrow">BEAUTY CALENDAR</span>
                  <h2>
                    {calendarYear}年{calendarMonth + 1}月
                  </h2>
                </div>
                <div className="calendar-head-actions">
                  <button
                    className="primary-button"
                    onClick={() => openAddItinerary(selectedDate)}
                  >
                    ＋ 添加行程
                  </button>
                  <div className="calendar-nav">
                    <button
                      aria-label="上个月"
                      onClick={() => {
                        setCalendarCursor(
                          new Date(calendarYear, calendarMonth - 1, 1),
                        );
                        setSelectedCalendarDay(1);
                      }}
                    >
                      ←
                    </button>
                    <button
                      onClick={() => {
                        const now = new Date();
                        setCalendarCursor(
                          new Date(now.getFullYear(), now.getMonth(), 1),
                        );
                        setSelectedCalendarDay(now.getDate());
                      }}
                    >
                      今天
                    </button>
                    <button
                      aria-label="下个月"
                      onClick={() => {
                        setCalendarCursor(
                          new Date(calendarYear, calendarMonth + 1, 1),
                        );
                        setSelectedCalendarDay(1);
                      }}
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>
              <div className="calendar-weekdays">
                {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="calendar-grid">
                {Array.from({ length: calendarOffset }).map((_, index) => (
                  <span className="calendar-empty" key={`empty-${index}`} />
                ))}
                {Array.from({ length: calendarDays }, (_, index) => index + 1).map(
                  (day) => {
                    const date = `${monthPrefix}-${String(day).padStart(2, "0")}`;
                    const dayLogs = logs.filter((log) => log.date === date);
                    const dayItineraries = itineraries
                      .filter((itinerary) => itinerary.date === date)
                      .sort((a, b) => a.startTime.localeCompare(b.startTime));
                    const weekday = new Date(
                      calendarYear,
                      calendarMonth,
                      day,
                    ).getDay();
                    const scheduled = routines.some(
                      (routine) =>
                        routine.enabled && routine.days.includes(weekday),
                    );
                    const isToday = date === today;
                    return (
                      <button
                        key={day}
                        className={[
                          "calendar-day",
                          selectedCalendarDay === day ? "selected" : "",
                          isToday ? "today" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setSelectedCalendarDay(day)}
                      >
                        <span>{day}</span>
                        <div className="calendar-event-list">
                          {dayItineraries.slice(0, 2).map((itinerary) => (
                            <span
                              className={`calendar-event kind-${itinerary.kind}`}
                              key={itinerary.id}
                            >
                              <b>{itinerary.startTime}</b>
                              {itinerary.title}
                            </span>
                          ))}
                          {dayItineraries.length > 2 && (
                            <span className="more-events">
                              还有 {dayItineraries.length - 2} 项
                            </span>
                          )}
                        </div>
                        <div>
                          {scheduled && <i className="scheduled-dot" />}
                          {dayLogs.some((log) => log.status === "completed") && (
                            <i className="completed-dot" />
                          )}
                          {dayLogs.some((log) => log.status === "skipped") && (
                            <i className="skipped-dot" />
                          )}
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
              <div className="calendar-legend">
                <span><i className="scheduled-dot" /> 已安排</span>
                <span><i className="completed-dot" /> 已完成</span>
                <span><i className="skipped-dot" /> 已跳过</span>
              </div>
            </section>

            <aside className="calendar-detail">
              <div className="detail-heading">
                <div>
                  <span className="eyebrow">DAY DETAIL</span>
                  <h2>{calendarMonth + 1}月{selectedCalendarDay}日</h2>
                </div>
                <button
                  className="detail-add-button"
                  aria-label="添加这一天的行程"
                  onClick={() => openAddItinerary(selectedDate)}
                >
                  ＋
                </button>
              </div>

              <div className="detail-section">
                <h3>行程安排</h3>
                {selectedItineraries.length ? (
                  selectedItineraries.map((itinerary) => (
                    <button
                      className="itinerary-detail-card"
                      key={itinerary.id}
                      onClick={() => openEditItinerary(itinerary)}
                    >
                      <time>{itinerary.startTime}</time>
                      <div>
                        <span>{itinerary.kind}</span>
                        <strong>{itinerary.title}</strong>
                        <p>{itinerary.location || "地点待定"}</p>
                      </div>
                    </button>
                  ))
                ) : (
                  <button
                    className="day-empty compact-empty"
                    onClick={() => openAddItinerary(selectedDate)}
                  >
                    <span>＋</span>
                    <p>这一天还没有行程，点击添加。</p>
                  </button>
                )}
              </div>

              <div className="detail-section">
                <h3>护理记录</h3>
                {selectedLogs.length ? (
                  selectedLogs.map((log) => (
                    <article className="log-card" key={log.id}>
                      <div>
                        <span>{log.period === "morning" ? "晨间" : "晚间"}</span>
                        <strong>{log.routineName}</strong>
                      </div>
                      <p>
                        {log.status === "skipped"
                          ? "本次已跳过"
                          : `完成 ${log.productIds.length} 件产品 · 感受：${log.feeling}`}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="no-record">暂无护理记录</p>
                )}
              </div>

              <div className="month-summary">
                <h3>本月小结</h3>
                <div>
                  <span>行程安排</span>
                  <strong>{monthItineraries.length} 项</strong>
                </div>
                <div>
                  <span>完成护理</span>
                  <strong>
                    {monthLogs.filter((log) => log.status === "completed").length} 次
                  </strong>
                </div>
                <div>
                  <span>使用产品</span>
                  <strong>
                    {monthLogs.reduce((sum, log) => sum + log.productIds.length, 0)} 次
                  </strong>
                </div>
                <div>
                  <span>最常记录</span>
                  <strong>
                    {monthLogs.find((log) => log.feeling)?.feeling ?? "暂无"}
                  </strong>
                </div>
              </div>
            </aside>
          </div>
        )}
      </section>

      <nav className="mobile-nav" aria-label="移动端导航">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={view === item.id ? "active" : ""}
            onClick={() => setView(item.id)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {itineraryModalOpen && (
        <div className="modal-backdrop">
          <section
            className="modal itinerary-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editingItineraryId ? "编辑行程" : "添加行程"}
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">
                  {editingItineraryId ? "EDIT ITINERARY" : "NEW ITINERARY"}
                </span>
                <h2>{editingItineraryId ? "编辑行程" : "添加行程"}</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setItineraryModalOpen(false)}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <form onSubmit={saveItinerary}>
              <label className="full-field">
                行程名称
                <input
                  required
                  value={itineraryForm.title}
                  onChange={(event) =>
                    setItineraryForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="例如：下午客户会议"
                />
              </label>
              <div className="form-grid itinerary-form-grid">
                <label>
                  日期
                  <input
                    type="date"
                    required
                    value={itineraryForm.date}
                    onChange={(event) =>
                      setItineraryForm((current) => ({
                        ...current,
                        date: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  行程类型
                  <select
                    value={itineraryForm.kind}
                    onChange={(event) =>
                      setItineraryForm((current) => ({
                        ...current,
                        kind: event.target.value as ItineraryKind,
                      }))
                    }
                  >
                    {itineraryKinds.map((kind) => (
                      <option key={kind}>{kind}</option>
                    ))}
                  </select>
                </label>
                <label>
                  开始时间
                  <input
                    type="time"
                    required
                    value={itineraryForm.startTime}
                    onChange={(event) =>
                      setItineraryForm((current) => ({
                        ...current,
                        startTime: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  结束时间
                  <input
                    type="time"
                    required
                    value={itineraryForm.endTime}
                    onChange={(event) =>
                      setItineraryForm((current) => ({
                        ...current,
                        endTime: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label className="full-field">
                地点
                <input
                  value={itineraryForm.location}
                  onChange={(event) =>
                    setItineraryForm((current) => ({
                      ...current,
                      location: event.target.value,
                    }))
                  }
                  placeholder="地点或出行方式"
                />
              </label>
              <label className="full-field">
                备注
                <textarea
                  rows={3}
                  value={itineraryForm.note}
                  onChange={(event) =>
                    setItineraryForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  placeholder="记录需要提前准备的事情"
                />
              </label>
              <div className="modal-actions">
                {editingItineraryId && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={deleteItinerary}
                  >
                    删除行程
                  </button>
                )}
                <span />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setItineraryModalOpen(false)}
                >
                  取消
                </button>
                <button className="primary-button" type="submit">
                  保存行程
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {productModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal product-modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <div>
                <span className="eyebrow">
                  {editingProductId ? "EDIT PRODUCT" : "NEW PRODUCT"}
                </span>
                <h2>{editingProductId ? "编辑产品" : "加入我的梳妆台"}</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setProductModalOpen(false)}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <form onSubmit={saveProduct}>
              <div className="photo-field">
                <div
                  className="photo-preview"
                  style={{ backgroundColor: productForm.color }}
                >
                  {productForm.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={productForm.image} alt="产品预览" />
                  ) : (
                    <span>{productForm.category.slice(0, 1)}</span>
                  )}
                </div>
                <div>
                  <label className="upload-button">
                    上传产品照片
                    <input type="file" accept="image/*" onChange={handleImage} />
                  </label>
                  <p>图片会压缩后保存在当前浏览器。</p>
                </div>
              </div>

              <div className="form-grid">
                <label>
                  产品名称
                  <input
                    required
                    value={productForm.name}
                    onChange={(event) =>
                      setProductForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="例如：柔润保湿面霜"
                  />
                </label>
                <label>
                  品牌
                  <input
                    value={productForm.brand}
                    onChange={(event) =>
                      setProductForm((current) => ({
                        ...current,
                        brand: event.target.value,
                      }))
                    }
                    placeholder="品牌名称"
                  />
                </label>
                <label>
                  分类
                  <select
                    value={productForm.category}
                    onChange={(event) =>
                      setProductForm((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                  >
                    {categories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label>
                  开封日期
                  <input
                    type="date"
                    value={productForm.openDate}
                    onChange={(event) =>
                      setProductForm((current) => ({
                        ...current,
                        openDate: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  开封后使用期限
                  <select
                    value={productForm.expiryMonths}
                    onChange={(event) =>
                      setProductForm((current) => ({
                        ...current,
                        expiryMonths: Number(event.target.value),
                      }))
                    }
                  >
                    {[3, 6, 8, 9, 12, 18, 24].map((month) => (
                      <option value={month} key={month}>
                        {month}个月
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  当前状态
                  <select
                    value={productForm.status}
                    onChange={(event) =>
                      setProductForm((current) => ({
                        ...current,
                        status: event.target.value as ProductStatus,
                      }))
                    }
                  >
                    {(["未开封", "使用中", "暂停使用", "已空瓶"] as ProductStatus[]).map(
                      (status) => (
                        <option key={status}>{status}</option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  剩余量
                  <select
                    value={productForm.stock}
                    onChange={(event) =>
                      setProductForm((current) => ({
                        ...current,
                        stock: event.target.value as Stock,
                      }))
                    }
                  >
                    {(["充足", "约一半", "快用完"] as Stock[]).map((stock) => (
                      <option key={stock}>{stock}</option>
                    ))}
                  </select>
                </label>
                <label>
                  卡片颜色
                  <input
                    className="color-input"
                    type="color"
                    value={productForm.color}
                    onChange={(event) =>
                      setProductForm((current) => ({
                        ...current,
                        color: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <fieldset className="tag-fieldset">
                <legend>你认为适合哪些状态？</legend>
                <div className="chip-row wrap">
                  {skinStates.map((state) => (
                    <button
                      type="button"
                      key={state}
                      className={
                        productForm.tags.includes(state)
                          ? "skin-chip selected"
                          : "skin-chip"
                      }
                      onClick={() => toggleTag("tags", state)}
                    >
                      {state}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="tag-fieldset">
                <legend>哪些状态下暂不推荐？</legend>
                <div className="chip-row wrap">
                  {skinStates.map((state) => (
                    <button
                      type="button"
                      key={state}
                      className={
                        productForm.avoidTags.includes(state)
                          ? "skin-chip avoid selected"
                          : "skin-chip avoid"
                      }
                      onClick={() => toggleTag("avoidTags", state)}
                    >
                      {state}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="checkbox-row">
                <label>
                  <input
                    type="checkbox"
                    checked={productForm.essential}
                    onChange={(event) =>
                      setProductForm((current) => ({
                        ...current,
                        essential: event.target.checked,
                      }))
                    }
                  />
                  基础必选步骤
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={productForm.fastEligible}
                    onChange={(event) =>
                      setProductForm((current) => ({
                        ...current,
                        fastEligible: event.target.checked,
                      }))
                    }
                  />
                  可用于极速方案
                </label>
              </div>

              <label className="full-field">
                我的使用备注
                <textarea
                  value={productForm.note}
                  onChange={(event) =>
                    setProductForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  placeholder="记录自己的使用感受和注意事项"
                  rows={3}
                />
              </label>

              <div className="modal-actions">
                {editingProductId && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={deleteProduct}
                  >
                    删除产品
                  </button>
                )}
                <span />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setProductModalOpen(false)}
                >
                  取消
                </button>
                <button className="primary-button" type="submit">
                  {editingProductId ? "保存修改" : "添加产品"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {feedbackOpen && (
        <div className="modal-backdrop">
          <section className="modal feedback-modal" role="dialog" aria-modal="true">
            <div className="modal-head">
              <div>
                <span className="eyebrow">QUICK NOTE</span>
                <h2>使用后感觉怎么样？</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setFeedbackOpen(false)}
                aria-label="关闭"
              >
                ×
              </button>
            </div>
            <p className="feedback-copy">
              只做个人记录，不会据此给出过敏、致痘或治疗结论。
            </p>
            <div className="feedback-grid">
              {["不错", "正常", "偏干", "出油", "起痘", "泛红", "刺痛"].map(
                (item) => (
                  <button
                    key={item}
                    className={feedback === item ? "selected" : ""}
                    onClick={() => setFeedback(item)}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
            <button className="primary-button wide" onClick={saveFeedback}>
              保存今日记录
            </button>
          </section>
        </div>
      )}

      <div
        className="assistant-dock"
        style={{
          left: assistantDockPos.x,
          top: assistantDockPos.y,
        }}
      >
        <button
          className={
            assistantOpen
              ? assistantDockDragging
                ? "assistant-fab open dragging"
                : "assistant-fab open"
              : assistantDockDragging
                ? "assistant-fab dragging"
                : "assistant-fab"
          }
          onPointerDown={handleAssistantFabPointerDown}
          aria-expanded={assistantOpen}
          aria-grabbed={assistantDockDragging}
          aria-label={assistantOpen ? "收起露露助手" : "打开露露助手"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            draggable={false}
            src={
              assistantOpen
                ? "/robot/lumiere-robot-default-greeting-v2-short-arm-transparent.gif"
                : "/robot/lumiere-robot-default-greeting-transparent.webp"
            }
            alt="露露助手"
          />
        </button>

        {assistantOpen && (
          <section
            className="assistant-panel"
            role="dialog"
            aria-label="露露美妆日程助手"
          >
            <header className="assistant-header">
              <div className="assistant-identity">
                <span className="mini-bot" aria-hidden="true">
                  <i />
                  <i />
                </span>
                <div>
                  <strong>露露</strong>
                  <small>美妆日程助手</small>
                </div>
              </div>
              <div className="assistant-header-actions">
                <button
                  className={voiceReply ? "voice-toggle active" : "voice-toggle"}
                  onClick={() => setVoiceReply((current) => !current)}
                  aria-pressed={voiceReply}
                  aria-label="切换语音播报"
                  title="语音播报"
                >
                  ◖
                </button>
                <button
                  className="assistant-close"
                  onClick={() => setAssistantOpen(false)}
                  aria-label="关闭助手"
                >
                  ×
                </button>
              </div>
            </header>

            <div
              className="assistant-messages"
              aria-live="polite"
              ref={assistantMessagesRef}
            >
              {assistantMessages.map((message) => (
                <div
                  className={`assistant-message ${message.role}`}
                  key={message.id}
                >
                  {message.role === "assistant"
                    ? renderAssistantText(message.text)
                    : message.text}
                </div>
              ))}
              {assistantTyping && (
                <div className="assistant-message assistant typing" aria-label="露露正在输入">
                  <i />
                  <i />
                  <i />
                </div>
              )}
            </div>

            <div className="assistant-prompts">
              {["今天有哪些行程？", "推荐用什么产品？", "帮我添加行程"].map(
                (prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendAssistantMessage(prompt)}
                  >
                    {prompt}
                  </button>
                ),
              )}
            </div>

            <form
              className="assistant-input-row"
              onSubmit={(event) => {
                event.preventDefault();
                sendAssistantMessage();
              }}
            >
              <input
                ref={assistantInputRef}
                value={assistantInput}
                onChange={(event) => setAssistantInput(event.target.value)}
                placeholder={assistantTyping ? "露露正在思考…" : "问问今天的行程或产品…"}
                aria-label="向露露提问"
                disabled={assistantTyping}
              />
              <button
                type="button"
                className={assistantListening ? "mic-button listening" : "mic-button"}
                onClick={startVoiceInput}
                aria-label="语音输入"
                disabled={assistantTyping}
              >
                {assistantListening ? "•••" : "⌁"}
              </button>
              <button
                className="assistant-send"
                type="submit"
                aria-label="发送"
                disabled={assistantTyping || !assistantInput.trim()}
              >
                ↑
              </button>
            </form>
          </section>
        )}
      </div>

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function ProductVisual({
  product,
  compact = false,
}: {
  product: Product;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? "product-visual compact" : "product-visual"}
      style={{ backgroundColor: product.color }}
    >
      {product.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.image} alt="" />
      ) : (
        <>
          <span>{product.category.slice(0, 1)}</span>
          {!compact && <small>{product.brand.slice(0, 10)}</small>}
        </>
      )}
    </div>
  );
}
