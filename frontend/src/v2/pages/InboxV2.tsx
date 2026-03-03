import { useEffect, useRef, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { useVirtualizer } from "@tanstack/react-virtual";
import { addHours, format as formatDateFns, formatDistanceToNow, isValid, parseISO } from "date-fns";
import { useForm } from "react-hook-form";
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { z } from "zod";
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";

import {
  useV2AddConversationNote,
  useV2AssignConversation,
  useV2ConversationNotes,
  useV2CreateTemplate,
  useV2DeleteTemplate,
  useV2DisenrollConversationFromSequence,
  useV2DraftAIPerformance,
  useV2EnrollConversationToSequence,
  useV2GenerateDraft,
  useV2InboxConversationDetail,
  useV2InboxConversations,
  useV2InboxSendConfig,
  useV2InboxTemplates,
  useV2IncrementGuardrailOverride,
  useV2ObjectionFrequency,
  useV2OverrideEscalation,
  useV2SendInboxMessage,
  useV2SetDefaultSendLine,
  useV2SnoozeConversation,
  useV2StageConversion,
  useV2UpdateCallOutcome,
  useV2UpdateConversationStatus,
  useV2UpdateObjectionTags,
  useV2UpdateQualification,
} from "../../api/v2Queries";
import { CALL_OUTCOME_LABELS } from "../../api/v2-types";
import type {
  AlowareSequenceSyncV2,
  CallOutcomeV2,
  QualificationStateV2,
} from "../../api/v2-types";
import { V2Select, type V2SelectOption } from "../components/V2Select";
import { V2State } from "../components/V2Primitives";
import { useToast } from "../hooks/useToast";

const parseDateValue = (value: string): Date | null => {
  const parsed = parseISO(value);
  if (isValid(parsed)) return parsed;
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const fmtDateTime = (value: string | null) => {
  if (!value) return "n/a";
  const date = parseDateValue(value);
  if (!date) return value;
  return formatDateFns(date, "PPp");
};

const timeAgo = (value: string | null): string => {
  if (!value) return "";
  const date = parseDateValue(value);
  if (!date) return value;
  return formatDistanceToNow(date, { addSuffix: true });
};

const shorten = (value: string | null, max = 100): string => {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
};

// ---------------------------------------------------------------------------
// Link Detection
// ---------------------------------------------------------------------------
const CALL_LINK_PATTERNS = [
  "calendly.com",
  "cal.com",
  "acuityscheduling.com",
  "oncehub.com",
  "hubspot.com/meetings",
  "tidycal.com",
  "savvycal.com",
  "physicaltherapybiz.com/call-booked",
];

const PODCAST_LINK_PATTERNS = [
  "ptbizinsider.com",
  "spotify.com",
  "podcasts.apple.com",
  "anchor.fm",
  "buzzsprout.com",
  "physicaltherapybiz.com/blog",
  "drdannymatta.com",
];

const containsCallLink = (text: string): boolean => {
  const lower = text.toLowerCase();
  return CALL_LINK_PATTERNS.some((pattern) => lower.includes(pattern));
};

const containsPodcastLink = (text: string): boolean => {
  const lower = text.toLowerCase();
  return PODCAST_LINK_PATTERNS.some((pattern) => lower.includes(pattern));
};

// ---------------------------------------------------------------------------
// SMS segment counter
// GSM-7: 160 chars single / 153 chars per segment in multi-part
// Unicode (UCS-2): 70 chars single / 67 chars per segment in multi-part
// ---------------------------------------------------------------------------
const getSmsSegmentInfo = (text: string) => {
  const len = text.length;
  if (len === 0) return { segments: 0, charsRemaining: 160, isUnicode: false };
  // Detect characters outside the GSM-7 basic + extended set
  const isUnicode = /[^\u0000-\u00FF\u20AC]/.test(text);
  const singleLimit = isUnicode ? 70 : 160;
  const multiLimit = isUnicode ? 67 : 153;
  const segments = len <= singleLimit ? 1 : Math.ceil(len / multiLimit);
  const charsRemaining =
    segments === 1 ? singleLimit - len : segments * multiLimit - len;
  return { segments, charsRemaining, isUnicode };
};

// ---------------------------------------------------------------------------
// Aloware / carrier error code → human-readable tooltip
// ---------------------------------------------------------------------------
const ALOWARE_ERROR_MAP: Record<string, string> = {
  landline: "Landline — this number cannot receive SMS",
  voip: "VoIP number — delivery not guaranteed",
  invalid: "Invalid number — check formatting",
  blocked: "Blocked by carrier — number may be on DNC list",
  dnc: "Do Not Contact — number is on the DNC list",
  "opt-out": "Opted out — contact has unsubscribed",
  unsubscribed: "Opted out — contact has unsubscribed",
  spam: "Flagged as spam by carrier",
  carrier: "Carrier violation — message content may be blocked",
  duplicate: "Duplicate — identical message sent recently",
  "rate-limit": "Rate limited — too many messages sent too quickly",
  "no-line": "No send line configured",
  disabled: "Sending disabled for this contact",
};

const humanizeAlowareError = (reason: string | null | undefined): string => {
  if (!reason) return "Unknown error";
  const lower = reason.toLowerCase();
  for (const [key, label] of Object.entries(ALOWARE_ERROR_MAP)) {
    if (lower.includes(key)) return label;
  }
  return reason;
};

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const describeSequenceSync = (sync: AlowareSequenceSyncV2 | null): string => {
  if (!sync) return "No sync event yet";
  const reason = sync.reason ? sync.reason.replace(/_/g, " ") : "ok";
  return `${sync.status === "synced" ? "Synced" : "Skipped"} · ${reason}`;
};

const formatSendLineLabel = (params: {
  label?: string | null;
  lineId?: number | null;
  fromNumber?: string | null;
}): string => {
  const parts: string[] = [];
  if (params.label && params.label.trim().length > 0) {
    parts.push(params.label.trim());
  }
  if (params.lineId != null) {
    parts.push(`line ${params.lineId}`);
  }
  if (params.fromNumber) {
    parts.push(params.fromNumber);
  }
  if (parts.length === 0) return "Account default line";
  return parts.join(" · ");
};

const displaySetterName = (value: string | null | undefined): string | null => {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.includes("jack")) return "Jack";
  if (lower.includes("brandon")) return "Brandon";
  // Filter out system/dashboard/automated users
  if (
    lower.includes("dashboard") ||
    lower.includes("password") ||
    lower.includes("system") ||
    lower.includes("bot") ||
    lower.includes("automated")
  )
    return null;
  return trimmed;
};

const getSetterColor = (name: string | null | undefined): string => {
  const setter = displaySetterName(name);
  if (setter === "Jack") return "#11b8d6";
  if (setter === "Brandon") return "#13b981";
  return "#56607a";
};

type StateTone = "red" | "orange" | "yellow" | "green";

const computeQualificationProgress = (state: QualificationStateV2): number => {
  let score = 0;
  if (state.fullOrPartTime !== "unknown") score += 1;
  if ((state.niche || "").trim().length > 0) score += 1;
  if (state.revenueMix !== "unknown") score += 1;
  if (state.coachingInterest !== "unknown") score += 1;
  return score;
};

const qualificationToneForProgress = (progress: number): StateTone => {
  if (progress <= 0) return "red";
  if (progress === 1) return "orange";
  if (progress === 2) return "yellow";
  return "green";
};

const escalationToneForLevel = (level: 1 | 2 | 3 | 4): StateTone => {
  if (level <= 1) return "red";
  if (level === 2) return "orange";
  if (level === 3) return "yellow";
  return "green";
};

const escalationLevelSubtitle = (level: 1 | 2 | 3 | 4): string => {
  if (level === 1) return "Awareness";
  if (level === 2) return "Objection Bridge";
  if (level === 3) return "Call First";
  return "Scaling Hybrid";
};

const LINE_NONE_VALUE = "__line_none__";
const DRAFT_NONE_VALUE = "__draft_none__";

const FULL_OR_PART_TIME_OPTIONS: V2SelectOption[] = [
  { value: "unknown", label: "Unknown" },
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
];

const REVENUE_MIX_OPTIONS: V2SelectOption[] = [
  { value: "unknown", label: "Unknown" },
  { value: "mostly_cash", label: "Mostly Cash" },
  { value: "mostly_insurance", label: "Mostly Insurance" },
  { value: "balanced", label: "Balanced" },
];

const COACHING_INTEREST_OPTIONS: V2SelectOption[] = [
  { value: "unknown", label: "Unknown" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const assignSchema = z.object({
  ownerLabel: z.string().trim().max(80, "Owner name is too long"),
});

const snoozeSchema = z.object({
  snoozedUntil: z
    .string()
    .trim()
    .min(1, "Select a snooze date/time")
    .refine((value) => parseDateValue(value) !== null, "Invalid date/time"),
});

const noteSchema = z.object({
  text: z.string().trim().min(1, "Note cannot be empty").max(1000, "Note is too long"),
});

const templateSchema = z.object({
  name: z.string().trim().min(1, "Template name is required").max(100, "Template name is too long"),
  body: z.string().trim().min(1, "Template body is required").max(1600, "Template body is too long"),
});

type AssignFormValues = z.infer<typeof assignSchema>;
type SnoozeFormValues = z.infer<typeof snoozeSchema>;
type NoteFormValues = z.infer<typeof noteSchema>;
type TemplateFormValues = z.infer<typeof templateSchema>;

export default function InboxV2() {
  const [statusFilter, setStatusFilter] = useState<
    "open" | "closed" | "dnc" | ""
  >("open");
  const [needsReplyOnly, setNeedsReplyOnly] = useState(true);
  const toast = useToast();
  const [ownerFilter, setOwnerFilter] = useState<
    "all" | "jack" | "brandon" | "unassigned"
  >("all");
  const [search, setSearch] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [isComposerModalOpen, setIsComposerModalOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [draftPrefillDoneForConversation, setDraftPrefillDoneForConversation] =
    useState<string | null>(null);
  const [selectedLineKey, setSelectedLineKey] = useState("");
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [justSentMessage, setJustSentMessage] = useState<{
    text: string;
    timestamp: string;
    confirmed?: boolean;
  } | null>(null);
  const [detailForceSyncTick, setDetailForceSyncTick] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  const listParentRef = useRef<HTMLDivElement | null>(null);

  const [qualificationState, setQualificationState] =
    useState<QualificationStateV2>({
      fullOrPartTime: "unknown",
      niche: "",
      revenueMix: "unknown",
      coachingInterest: "unknown",
      progressStep: 0,
    });
  const [escalationLevel, setEscalationLevel] = useState<1 | 2 | 3 | 4>(1);
  const [escalationReason, setEscalationReason] = useState("");

  // Phase 2 — Team Collaboration
  const [showTemplates, setShowTemplates] = useState(false);
  const [sequenceIdInput, setSequenceIdInput] = useState("");
  const [lastSequenceSync, setLastSequenceSync] =
    useState<AlowareSequenceSyncV2 | null>(null);
  const assignForm = useForm<AssignFormValues>({
    resolver: zodResolver(assignSchema),
    defaultValues: { ownerLabel: "" },
  });
  const snoozeForm = useForm<SnoozeFormValues>({
    resolver: zodResolver(snoozeSchema),
    defaultValues: { snoozedUntil: "" },
  });
  const noteForm = useForm<NoteFormValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: { text: "" },
  });
  const templateForm = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: { name: "", body: "" },
  });

  // Phase 3 state
  const [objectionTagInput, setObjectionTagInput] = useState("");
  const [localObjectionTags, setLocalObjectionTags] = useState<string[]>([]);
  const [localCallOutcome, setLocalCallOutcome] =
    useState<CallOutcomeV2 | null>(null);

  // Phase 2 Guardrail Modal state
  const [isGuardrailModalOpen, setIsGuardrailModalOpen] = useState(false);
  const [guardrailChecks, setGuardrailChecks] = useState<
    Record<string, boolean>
  >({});
  const [pendingMessageText, setPendingMessageText] = useState<string | null>(
    null,
  );
  // Double Pitch Protection banner
  const [showDoublePitchWarning, setShowDoublePitchWarning] = useState(false);
  const [isNarrowComposerViewport, setIsNarrowComposerViewport] = useState(
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(max-width: 900px)").matches
        : false,
  );

  const qualificationProgressLive =
    computeQualificationProgress(qualificationState);
  const qualificationTone = qualificationToneForProgress(
    qualificationProgressLive,
  );
  const qualificationProgressPct = Math.round(
    (qualificationProgressLive / 4) * 100,
  );
  const escalationTone = escalationToneForLevel(escalationLevel);
  const escalationProgressPct = Math.round((escalationLevel / 4) * 100);
  const qualificationFields = [
    {
      key: "full",
      label: "Full or part time",
      complete: qualificationState.fullOrPartTime !== "unknown",
    },
    {
      key: "niche",
      label: "Niche",
      complete: (qualificationState.niche || "").trim().length > 0,
    },
    {
      key: "mix",
      label: "Revenue mix",
      complete: qualificationState.revenueMix !== "unknown",
    },
    {
      key: "coach",
      label: "Coaching interest",
      complete: qualificationState.coachingInterest !== "unknown",
    },
  ];

  const listQuery = useV2InboxConversations({
    ...(statusFilter ? { status: statusFilter } : {}),
    needsReplyOnly,
    search,
    limit: 75,
    offset: 0,
  });

  const conversationsRaw = listQuery.data?.data.items || [];
  const conversations = conversationsRaw.filter((conversation) => {
    if (ownerFilter === "all") return true;
    const owner = (conversation.ownerLabel || "").toLowerCase();
    if (ownerFilter === "jack") return owner === "jack";
    if (ownerFilter === "brandon") return owner === "brandon";
    if (ownerFilter === "unassigned") return owner.length === 0;
    return true;
  });

  // Analytics calculations
  const totalConversations = conversations.length;
  const unreadCount = conversations.filter(
    (c) => c.openNeedsReplyCount > 0,
  ).length;
  const urgentCount = conversations.filter(
    (c) => c.escalation.level <= 2 && c.openNeedsReplyCount > 0,
  ).length;
  const jackCount = conversations.filter(
    (c) => displaySetterName(c.ownerLabel) === "Jack",
  ).length;
  const brandonCount = conversations.filter(
    (c) => displaySetterName(c.ownerLabel) === "Brandon",
  ).length;
  const unassignedCount = conversations.filter((c) => !c.ownerLabel).length;
  const inboxHealth = Math.max(
    0,
    Math.min(100, 100 - urgentCount * 10 - unassignedCount * 5),
  );

  // Virtual list for conversation list performance
  const rowVirtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 96,
    overscan: 8,
  });
  const composerLayoutStorageId = isNarrowComposerViewport
    ? "v2-inbox-composer-layout-vertical"
    : "v2-inbox-composer-layout-horizontal";
  const { defaultLayout: composerSavedLayout, onLayoutChanged: onComposerLayoutChanged } =
    useDefaultLayout({
      id: composerLayoutStorageId,
      panelIds: ["composer-primary", "composer-sidebar"],
    });
  const composerDefaultLayout = composerSavedLayout ?? {
    "composer-primary": isNarrowComposerViewport ? 62 : 66,
    "composer-sidebar": isNarrowComposerViewport ? 38 : 34,
  };
  const {
    refs: templateFloatingRefs,
    floatingStyles: templateFloatingStyles,
    context: templateFloatingContext,
  } = useFloating({
    open: showTemplates,
    onOpenChange: setShowTemplates,
    placement: "top-end",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.min(
            340,
            Math.max(180, availableHeight),
          )}px`;
        },
      }),
    ],
  });
  const templateDismiss = useDismiss(templateFloatingContext);
  const { getReferenceProps: getTemplateReferenceProps, getFloatingProps } =
    useInteractions([templateDismiss]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const onChange = () => setIsNarrowComposerViewport(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!isComposerModalOpen && showTemplates) {
      setShowTemplates(false);
    }
  }, [isComposerModalOpen, showTemplates]);

  useEffect(() => {
    // Do NOT auto-switch while the composer modal is open.
    // When needsReplyOnly is true, a conversation drops out of the filtered list
    // the moment you reply to it — without this guard the effect would immediately
    // snap selectedConversationId to conversations[0] (a completely different
    // contact) while the user is still looking at the modal they just sent from.
    if (isComposerModalOpen) return;

    if (!selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0]?.id || null);
      return;
    }

    if (
      selectedConversationId &&
      !conversations.some((row) => row.id === selectedConversationId)
    ) {
      setSelectedConversationId(conversations[0]?.id || null);
    }
  }, [conversations, selectedConversationId, isComposerModalOpen]);

  const detailQuery = useV2InboxConversationDetail(selectedConversationId, {
    forceSyncTick: detailForceSyncTick,
  });

  const generateDraftMutation = useV2GenerateDraft();
  const sendMutation = useV2SendInboxMessage();
  const sendConfigQuery = useV2InboxSendConfig();
  const setDefaultLineMutation = useV2SetDefaultSendLine();
  const qualificationMutation = useV2UpdateQualification();
  const escalationMutation = useV2OverrideEscalation();
  const statusMutation = useV2UpdateConversationStatus();
  const sequenceEnrollMutation = useV2EnrollConversationToSequence();
  const sequenceDisenrollMutation = useV2DisenrollConversationFromSequence();

  // Phase 2 hooks
  const notesQuery = useV2ConversationNotes(selectedConversationId);
  const addNoteMutation = useV2AddConversationNote();
  const snoozeMutation = useV2SnoozeConversation();
  const assignMutation = useV2AssignConversation();
  const templatesQuery = useV2InboxTemplates();
  const createTemplateMutation = useV2CreateTemplate();
  const deleteTemplateMutation = useV2DeleteTemplate();

  // Phase 3 hooks
  const stageConversionQuery = useV2StageConversion();
  const objectionFrequencyQuery = useV2ObjectionFrequency();
  const draftAiPerformanceQuery = useV2DraftAIPerformance({
    range: "30d",
    tz: "America/Chicago",
  });
  const updateObjectionTagsMutation = useV2UpdateObjectionTags();
  const updateCallOutcomeMutation = useV2UpdateCallOutcome();
  const incrementGuardrailOverrideMutation = useV2IncrementGuardrailOverride();

  const detail = detailQuery.data?.data || null;
  const detailConversation = detail?.conversation || null;
  const detailContactCard = detail?.contactCard || null;
  const detailMessages = Array.isArray(detail?.messages) ? detail.messages : [];
  const detailDrafts = Array.isArray(detail?.drafts) ? detail.drafts : [];
  const detailMondayTrail = Array.isArray(detail?.mondayTrail)
    ? detail.mondayTrail
    : [];
  const contactTags = Array.isArray(detailContactCard?.tags)
    ? detailContactCard.tags
    : [];
  const stageConversionRows = Array.isArray(stageConversionQuery.data)
    ? stageConversionQuery.data
    : [];
  const objectionFrequencyRows = Array.isArray(objectionFrequencyQuery.data)
    ? objectionFrequencyQuery.data
    : [];
  const draftAiPerformance = draftAiPerformanceQuery.data?.data || null;
  const setterLikeRate = toFiniteNumber(draftAiPerformance?.setterLikeRate);
  const genericToneRate = toFiniteNumber(draftAiPerformance?.genericToneRate);
  const setterAnchorCoverageRate = toFiniteNumber(
    draftAiPerformance?.setterAnchorCoverageRate,
  );
  const sendConfig = sendConfigQuery.data?.data || null;
  const lineOptions = sendConfig?.lines || [];
  const lineSelectOptions: V2SelectOption[] = [
    { value: LINE_NONE_VALUE, label: "No line selected" },
    ...lineOptions.map((option) => ({
      value: option.key,
      label: formatSendLineLabel(option),
    })),
  ];
  const assignLabel = assignForm.watch("ownerLabel");
  const snoozeDate = snoozeForm.watch("snoozedUntil");
  const noteText = noteForm.watch("text");
  const newTemplateName = templateForm.watch("name");
  const newTemplateBody = templateForm.watch("body");
  const selectedLineOption =
    lineOptions.find((option) => option.key === selectedLineKey) || null;
  const lineSelectionRequired =
    Boolean(sendConfig?.requiresSelection) && !selectedLineOption;
  const savedDefaultSummary = sendConfig?.defaultSelection
    ? formatSendLineLabel(sendConfig.defaultSelection)
    : "No saved default line";

  useEffect(() => {
    if (!sendConfig) return;
    if (
      selectedLineKey &&
      lineOptions.some((option) => option.key === selectedLineKey)
    )
      return;

    if (
      sendConfig.defaultSelection?.key &&
      lineOptions.some(
        (option) => option.key === sendConfig.defaultSelection?.key,
      )
    ) {
      setSelectedLineKey(sendConfig.defaultSelection.key);
      return;
    }

    if (lineOptions.length === 1) {
      const onlyOption = lineOptions[0];
      if (onlyOption) {
        setSelectedLineKey(onlyOption.key);
      }
      return;
    }

    setSelectedLineKey("");
  }, [lineOptions, selectedLineKey, sendConfig]);

  useEffect(() => {
    if (!detailConversation) return;

    setQualificationState(detailConversation.qualification);
    setEscalationLevel(detailConversation.escalation.level);
    setEscalationReason(detailConversation.escalation.reason || "");
    setSequenceIdInput(detailContactCard?.sequenceId || "");
    assignForm.reset({ ownerLabel: detailConversation.ownerLabel || "" });
    setLocalObjectionTags(detailConversation.objectionTags ?? []);
    setLocalCallOutcome(detailConversation.callOutcome ?? null);
  }, [
    assignForm,
    detailConversation?.id,
    detailContactCard?.sequenceId,
    detailQuery.dataUpdatedAt,
  ]);

  useEffect(() => {
    setDraftPrefillDoneForConversation(null);
    // Clear the optimistic sent-message bubble so it doesn't bleed into the
    // next conversation's thread when the user switches contacts.
    setJustSentMessage(null);
    setShowDoublePitchWarning(false);
    setSequenceIdInput("");
    setLastSequenceSync(null);
    noteForm.reset({ text: "" });
    snoozeForm.reset({ snoozedUntil: "" });
  }, [selectedConversationId]);

  useEffect(() => {
    if (!detail) return;
    if (!selectedConversationId) return;
    if (draftPrefillDoneForConversation === selectedConversationId) return;

    const latestDraft = detailDrafts[0];
    if (!latestDraft) return;

    if (composerText.trim().length === 0) {
      setComposerText(latestDraft.text);
      setSelectedDraftId(latestDraft.id);
    }
    setDraftPrefillDoneForConversation(selectedConversationId);
  }, [
    detailDrafts,
    composerText,
    selectedConversationId,
    draftPrefillDoneForConversation,
  ]);

  useEffect(() => {
    if (!isComposerModalOpen || !selectedConversationId || !detail) return;
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }, [isComposerModalOpen, selectedConversationId, detailConversation?.id]);

  // Auto-scroll chat thread to bottom whenever messages load or a new message is sent
  useEffect(() => {
    if (!chatThreadRef.current) return;
    chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight;
  }, [detailMessages, justSentMessage]);

  useEffect(() => {
    if (!isComposerModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsComposerModalOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isComposerModalOpen]);

  const onGenerateDraft = async () => {
    if (!selectedConversationId) return;

    setFlashMessage(null);
    try {
      const result = await generateDraftMutation.mutateAsync({
        conversationId: selectedConversationId,
      });
      setComposerText(result.data.text);
      setSelectedDraftId(result.data.id);
      setDraftPrefillDoneForConversation(selectedConversationId);
      if (result.data.generationMode === "contextual_fallback") {
        const firstWarning =
          result.data.generationWarnings[0] || "AI generation unavailable";
        setFlashMessage(`Draft generated in fallback mode. ${firstWarning}`);
        return;
      }
      if (result.data.lint.passed) {
        setFlashMessage("Draft generated and passed quality check.");
      } else {
        setFlashMessage(
          "Draft generated with quality issues. Review before sending.",
        );
      }
    } catch (error) {
      setFlashMessage(
        `Draft generation failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const onSend = async () => {
    if (!selectedConversationId || composerText.trim().length === 0) return;
    if (lineSelectionRequired) {
      setFlashMessage("Select a send line before sending.");
      return;
    }

    const messageText = composerText.trim();

    // Phase 2: Stage Gating
    if (containsCallLink(messageText) && escalationLevel <= 1) {
      setFlashMessage(
        "Set the escalation stage to L2 or higher before sending a call link.",
      );
      return;
    }

    // Phase 2: Double Pitch Protection — detect prior outbound call link with no inbound reply since
    if (containsCallLink(messageText) && detailMessages.length > 0) {
      const msgs = detailMessages;
      // Find the last outbound call link index
      let lastCallLinkOutboundIdx = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        const message = msgs[i];
        if (
          message &&
          message.direction === "outbound" &&
          message.body &&
          containsCallLink(message.body)
        ) {
          lastCallLinkOutboundIdx = i;
          break;
        }
      }
      if (lastCallLinkOutboundIdx !== -1) {
        // Check if there's any inbound reply AFTER that outbound call link
        const hasReplyAfter = msgs
          .slice(lastCallLinkOutboundIdx + 1)
          .some((m) => m.direction === "inbound");
        if (!hasReplyAfter) {
          // Show the banner and block send — user must dismiss or it stays visible
          setShowDoublePitchWarning(true);
          return;
        }
      }
    }

    // Phase 2: Guardrail Checklist (L3/L4)
    if (containsCallLink(messageText) && escalationLevel >= 3) {
      setPendingMessageText(messageText);
      setIsGuardrailModalOpen(true);
      return;
    }

    await executeSend(messageText);
  };

  const executeSend = async (messageText: string) => {
    if (!selectedConversationId) return;

    setFlashMessage(null);
    setSendStatus("sending");
    setJustSentMessage({
      text: messageText,
      timestamp: new Date().toISOString(),
      confirmed: false,
    });

    try {
      const sendFromNumber =
        selectedLineOption?.lineId == null
          ? selectedLineOption?.fromNumber || null
          : null;
      const result = await sendMutation.mutateAsync({
        conversationId: selectedConversationId,
        body: messageText,
        idempotencyKey: `inbox-${Date.now()}`,
        ...(selectedLineOption?.lineId != null
          ? { lineId: selectedLineOption.lineId }
          : {}),
        ...(sendFromNumber ? { fromNumber: sendFromNumber } : {}),
        ...(selectedDraftId ? { draftId: selectedDraftId } : {}),
      });
      const lineSummary = formatSendLineLabel(result.data.lineSelection);

      if (result.data.status === "sent" || result.data.status === "duplicate") {
        setSendStatus("sent");
        setJustSentMessage(null);
        setDetailForceSyncTick((prev) => prev + 1);

        setComposerText("");
        setSelectedDraftId(null);
        toast.success("Message sent successfully");

        // Phase 2: Auto-Snooze
        if (containsPodcastLink(messageText)) {
          const snoozeUntil = addHours(new Date(), 72);
          await snoozeMutation.mutateAsync({
            conversationId: selectedConversationId,
            snoozedUntil: snoozeUntil.toISOString(),
          });
          toast.info("Podcast link sent. Snoozed for 72 hours.");
        } else if (containsCallLink(messageText)) {
          const snoozeUntil = addHours(new Date(), 96);
          await snoozeMutation.mutateAsync({
            conversationId: selectedConversationId,
            snoozedUntil: snoozeUntil.toISOString(),
          });
          toast.info("Call link sent. Snoozed for 4 days.");
        }

        setTimeout(() => {
          setSendStatus("idle");
        }, 2000);
      } else {
        setSendStatus("error");
        setJustSentMessage(null);
        toast.error(
          `Send blocked: ${humanizeAlowareError(result.data.reason)} · ${lineSummary}`,
        );
      }
    } catch (error) {
      setSendStatus("error");
      setJustSentMessage(null);
      toast.error(`Send failed: ${String((error as Error)?.message || error)}`);
    }
  };

  const onSaveDefaultLine = async () => {
    if (!selectedLineOption) {
      setFlashMessage("Choose a line before saving default.");
      return;
    }

    setFlashMessage(null);
    try {
      const defaultFromNumber = selectedLineOption.fromNumber || null;
      await setDefaultLineMutation.mutateAsync({
        ...(selectedLineOption?.lineId != null
          ? { lineId: selectedLineOption.lineId }
          : {}),
        ...(defaultFromNumber ? { fromNumber: defaultFromNumber } : {}),
      });
      setFlashMessage(
        `Default send line saved: ${formatSendLineLabel(selectedLineOption)}`,
      );
    } catch (error) {
      setFlashMessage(
        `Failed to save default line: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const onClearDefaultLine = async () => {
    setFlashMessage(null);
    try {
      await setDefaultLineMutation.mutateAsync({ clear: true });
      setFlashMessage("Default send line cleared.");
    } catch (error) {
      setFlashMessage(
        `Failed to clear default line: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const onClearDraft = () => {
    if (!selectedConversationId) return;
    setComposerText("");
    setSelectedDraftId(null);
    setDraftPrefillDoneForConversation(selectedConversationId);
    setFlashMessage("Draft cleared.");
  };

  const onSaveQualification = async () => {
    if (!selectedConversationId) return;

    setFlashMessage(null);
    try {
      await qualificationMutation.mutateAsync({
        conversationId: selectedConversationId,
        fullOrPartTime: qualificationState.fullOrPartTime,
        niche: qualificationState.niche,
        revenueMix: qualificationState.revenueMix,
        coachingInterest: qualificationState.coachingInterest,
      });
      setFlashMessage("Qualification saved.");
    } catch (error) {
      setFlashMessage(
        `Qualification update failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const onOverrideEscalation = async () => {
    if (!selectedConversationId) return;

    setFlashMessage(null);
    try {
      await escalationMutation.mutateAsync({
        conversationId: selectedConversationId,
        level: escalationLevel,
        reason: escalationReason,
      });
      setFlashMessage("Stage saved.");
    } catch (error) {
      setFlashMessage(
        `Escalation update failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const onUpdateStatus = async (status: "open" | "closed" | "dnc") => {
    if (!selectedConversationId) return;
    try {
      const result = await statusMutation.mutateAsync({
        conversationId: selectedConversationId,
        status,
      });
      const sync = result.data.alowareSequenceSync || null;
      if (sync) {
        setLastSequenceSync(sync);
      }
      toast.success(`Conversation marked as ${status.toUpperCase()}`);
      if (sync) {
        setFlashMessage(`Aloware sync: ${describeSequenceSync(sync)}`);
      }
    } catch (error) {
      toast.error(
        `Status update failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const onEnrollToSequence = async () => {
    if (!selectedConversationId) return;
    const sequenceId = sequenceIdInput.trim();
    if (!sequenceId) {
      setFlashMessage("Enter a sequence ID before enrolling.");
      return;
    }
    try {
      const result = await sequenceEnrollMutation.mutateAsync({
        conversationId: selectedConversationId,
        sequenceId,
      });
      const sync = result.data.alowareSequenceSync || null;
      setLastSequenceSync(sync);
      setFlashMessage(`Sequence enroll: ${describeSequenceSync(sync)}`);
    } catch (error) {
      setFlashMessage(
        `Sequence enroll failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const onDisenrollFromSequence = async () => {
    if (!selectedConversationId) return;
    try {
      const result = await sequenceDisenrollMutation.mutateAsync({
        conversationId: selectedConversationId,
      });
      const sync = result.data.alowareSequenceSync || null;
      setLastSequenceSync(sync);
      setFlashMessage(`Sequence disenroll: ${describeSequenceSync(sync)}`);
    } catch (error) {
      setFlashMessage(
        `Sequence disenroll failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  // ── Phase 3 handlers ──────────────────────────────────────────────────────

  const onAddObjectionTag = async () => {
    const tag = objectionTagInput.trim();
    if (!tag || !selectedConversationId) return;
    const next = localObjectionTags.includes(tag)
      ? localObjectionTags
      : [...localObjectionTags, tag];
    setLocalObjectionTags(next);
    setObjectionTagInput("");
    try {
      await updateObjectionTagsMutation.mutateAsync({
        conversationId: selectedConversationId,
        tags: next,
      });
    } catch (error) {
      setFlashMessage(
        `Objection tag update failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const onRemoveObjectionTag = async (tag: string) => {
    if (!selectedConversationId) return;
    const next = localObjectionTags.filter((t) => t !== tag);
    setLocalObjectionTags(next);
    try {
      await updateObjectionTagsMutation.mutateAsync({
        conversationId: selectedConversationId,
        tags: next,
      });
    } catch (error) {
      setFlashMessage(
        `Objection tag update failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const onSetCallOutcome = async (outcome: CallOutcomeV2 | null) => {
    if (!selectedConversationId) return;
    setLocalCallOutcome(outcome);
    try {
      await updateCallOutcomeMutation.mutateAsync({
        conversationId: selectedConversationId,
        outcome,
      });
    } catch (error) {
      setFlashMessage(
        `Call outcome update failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const onIncrementGuardrailOverride = async () => {
    if (!selectedConversationId) return;
    try {
      await incrementGuardrailOverrideMutation.mutateAsync(
        selectedConversationId,
      );
      setFlashMessage("Override recorded.");
    } catch (error) {
      setFlashMessage(
        `Guardrail override failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  // ── Phase 2 handlers ──────────────────────────────────────────────────────

  const onAddNote = async (values: NoteFormValues) => {
    if (!selectedConversationId) return;
    try {
      await addNoteMutation.mutateAsync({
        conversationId: selectedConversationId,
        author: "agent",
        text: values.text.trim(),
      });
      noteForm.reset({ text: "" });
    } catch (error) {
      setFlashMessage(
        `Note failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const onSnooze = async (values: SnoozeFormValues) => {
    if (!selectedConversationId) return;
    const snoozedUntil = parseDateValue(values.snoozedUntil);
    if (!snoozedUntil) {
      setFlashMessage("Select a valid snooze date.");
      return;
    }
    try {
      await snoozeMutation.mutateAsync({
        conversationId: selectedConversationId,
        snoozedUntil: snoozedUntil.toISOString(),
      });
      snoozeForm.reset({ snoozedUntil: "" });
      setFlashMessage("Conversation snoozed.");
    } catch (error) {
      setFlashMessage(
        `Snooze failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const onClearSnooze = async () => {
    if (!selectedConversationId) return;
    try {
      await snoozeMutation.mutateAsync({
        conversationId: selectedConversationId,
        snoozedUntil: null,
      });
      snoozeForm.reset({ snoozedUntil: "" });
      setFlashMessage("Snooze cleared.");
    } catch (error) {
      setFlashMessage(
        `Clear snooze failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const onAssign = async (values: AssignFormValues) => {
    if (!selectedConversationId) return;
    const ownerLabel = values.ownerLabel.trim();
    try {
      await assignMutation.mutateAsync({
        conversationId: selectedConversationId,
        ownerLabel: ownerLabel || null,
      });
      setFlashMessage(`Assigned to: ${ownerLabel || "Unassigned"}`);
    } catch (error) {
      setFlashMessage(
        `Assign failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const onInsertTemplate = (body: string) => {
    const name = detail?.contactCard.name || "";
    const filled = body.replace(/\{\{name\}\}/gi, name);
    setComposerText(filled);
    setShowTemplates(false);
  };

  const onCreateTemplate = async (values: TemplateFormValues) => {
    try {
      await createTemplateMutation.mutateAsync({
        name: values.name.trim(),
        body: values.body.trim(),
      });
      templateForm.reset({ name: "", body: "" });
    } catch (error) {
      setFlashMessage(
        `Template save failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const onDeleteTemplate = async (id: string) => {
    try {
      await deleteTemplateMutation.mutateAsync(id);
    } catch (error) {
      setFlashMessage(
        `Template delete failed: ${String((error as Error)?.message || error)}`,
      );
    }
  };

  const submitAssign = assignForm.handleSubmit(onAssign);
  const submitSnooze = snoozeForm.handleSubmit(onSnooze);
  const submitAddNote = noteForm.handleSubmit(onAddNote);
  const submitCreateTemplate = templateForm.handleSubmit(onCreateTemplate);

  const getHealthColor = (score: number): string => {
    if (score >= 80) return "#13b981";
    if (score >= 60) return "#f59d0d";
    return "#ef4c62";
  };

  const GUARDRAIL_SIGNALS = [
    { id: "timeline", label: "Timeline — Has a clear start date in mind" },
    { id: "cash", label: "Cash Intent — Expressed desire to go cash-pay" },
    {
      id: "revenue",
      label:
        "Revenue Ambition — Mentioned revenue goal or frustration with current income",
    },
    {
      id: "frustration",
      label: "Frustration — Expressed frustration with current situation",
    },
    {
      id: "complexity",
      label:
        "Complexity — Has a complex case (multiple staff, insurance transition)",
    },
    { id: "engagement", label: "Engagement — Replied 3+ times in this thread" },
    {
      id: "howto",
      label: "How-To Question — Asked a how-to or implementation question",
    },
  ];

  const checkedGuardrailsCount =
    Object.values(guardrailChecks).filter(Boolean).length;
  const canPassGuardrails = checkedGuardrailsCount >= 2;

  const canOverrideGuardrails = checkedGuardrailsCount >= 1;

  const onConfirmGuardrails = async () => {
    if (!selectedConversationId || !pendingMessageText) return;

    if (!canPassGuardrails) {
      if (!canOverrideGuardrails) {
        setFlashMessage("Not enough signals. Check at least 1 to override.");
        return;
      }
      // Log override
      try {
        await incrementGuardrailOverrideMutation.mutateAsync(
          selectedConversationId,
        );
      } catch (error) {
        console.error("Failed to log override", error);
      }
    }

    setIsGuardrailModalOpen(false);
    setGuardrailChecks({});
    await executeSend(pendingMessageText);
    setPendingMessageText(null);
  };

  return (
    <div className="V2Page V2Inbox">
      {/* Floating Filter Bar */}
      <div className="V2Inbox__filterBar">
        <div className="V2Inbox__filterGroup">
          <button
            className={`V2Inbox__filterChip ${statusFilter === "open" ? "is-active" : ""}`}
            onClick={() =>
              setStatusFilter(statusFilter === "open" ? "" : "open")
            }
          >
            <span
              className="V2Inbox__filterDot"
              style={{ background: "#13b981" }}
            />
            Open
          </button>
          <button
            className={`V2Inbox__filterChip ${statusFilter === "closed" ? "is-active" : ""}`}
            onClick={() =>
              setStatusFilter(statusFilter === "closed" ? "" : "closed")
            }
          >
            <span
              className="V2Inbox__filterDot"
              style={{ background: "#56607a" }}
            />
            Closed
          </button>
          <button
            className={`V2Inbox__filterChip ${statusFilter === "dnc" ? "is-active" : ""}`}
            onClick={() => setStatusFilter(statusFilter === "dnc" ? "" : "dnc")}
          >
            <span
              className="V2Inbox__filterDot"
              style={{ background: "#ef4c62" }}
            />
            DNC
          </button>
        </div>

        <div className="V2Inbox__searchBox">
          <svg
            className="V2Inbox__searchIcon"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="V2Inbox__filterGroup">
          <button
            className={`V2Inbox__ownerChip ${ownerFilter === "jack" ? "is-active" : ""}`}
            onClick={() =>
              setOwnerFilter(ownerFilter === "jack" ? "all" : "jack")
            }
            style={{ "--owner-color": "#11b8d6" } as React.CSSProperties}
          >
            <span className="V2Inbox__ownerAvatar">J</span>
            Jack
          </button>
          <button
            className={`V2Inbox__ownerChip ${ownerFilter === "brandon" ? "is-active" : ""}`}
            onClick={() =>
              setOwnerFilter(ownerFilter === "brandon" ? "all" : "brandon")
            }
            style={{ "--owner-color": "#13b981" } as React.CSSProperties}
          >
            <span className="V2Inbox__ownerAvatar">B</span>
            Brandon
          </button>
          <button
            className={`V2Inbox__ownerChip ${ownerFilter === "unassigned" ? "is-active" : ""}`}
            onClick={() =>
              setOwnerFilter(
                ownerFilter === "unassigned" ? "all" : "unassigned",
              )
            }
          >
            <span className="V2Inbox__ownerAvatar">?</span>
            Unassigned
          </button>
        </div>

        <div
          className={`V2Inbox__needsReplyToggle ${needsReplyOnly ? "is-active" : ""}`}
        >
          <button
            id="needs-reply-switch"
            type="button"
            role="switch"
            aria-checked={needsReplyOnly}
            onClick={() => setNeedsReplyOnly((prev) => !prev)}
            style={{
              width: "36px",
              height: "20px",
              background: needsReplyOnly
                ? "var(--v2-accent, #11b8d6)"
                : "rgba(86, 96, 122, 0.4)",
              borderRadius: "999px",
              border: "none",
              cursor: "pointer",
              position: "relative",
              flexShrink: 0,
              transition: "background 0.2s",
              display: "inline-flex",
              alignItems: "center",
              padding: 0,
            }}
          >
            <span
              style={{
                display: "block",
                width: "14px",
                height: "14px",
                background: "#fff",
                borderRadius: "50%",
                boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                transition: "transform 0.2s",
                transform: needsReplyOnly
                  ? "translateX(18px)"
                  : "translateX(3px)",
              }}
            />
          </button>
          <label
            htmlFor="needs-reply-switch"
            style={{ cursor: "pointer", userSelect: "none" }}
          >
            Needs Reply
          </label>
        </div>
      </div>

      {flashMessage ? (
        <div className="V2Inbox__flash">{flashMessage}</div>
      ) : null}

      {/* Success Toast */}
      {sendStatus === "sent" && (
        <div className="V2Inbox__successToast">
          <span className="V2Inbox__successIcon">✓</span>
          <span>Message sent successfully!</span>
        </div>
      )}

      <section className="V2Inbox__newLayout">
        {/* Left: Enhanced Conversation List */}
        <div className="V2Inbox__conversationColumn">
          <div className="V2Inbox__listHeader">
            <h2>Conversations</h2>
            <span className="V2Inbox__listCount">
              {totalConversations} total
            </span>
          </div>

          {listQuery.isLoading ? (
            <div className="V2Inbox__skeletonList">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="V2Inbox__skeletonRow"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ))}
            </div>
          ) : listQuery.isError ? (
            <V2State kind="error">
              Failed to load conversations:{" "}
              {String((listQuery.error as Error)?.message || listQuery.error)}
            </V2State>
          ) : conversations.length === 0 ? (
            <div className="V2Inbox__emptyState">
              <div className="V2Inbox__emptyIcon">📭</div>
              <h3>No conversations</h3>
              <p>Try adjusting your filters or search terms</p>
            </div>
          ) : (
            /* Virtual list — only renders visible rows for performance */
            <div
              ref={listParentRef}
              className="V2Inbox__conversationList V2Inbox__conversationList--enhanced"
              style={{ overflowY: "auto", height: "100%" }}
            >
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  position: "relative",
                  width: "100%",
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                  const conversation = conversations[virtualItem.index];
                  if (!conversation) return null;
                  const isActive = selectedConversationId === conversation.id;
                  const hasUnread = conversation.openNeedsReplyCount > 0;
                  const isUrgent =
                    conversation.escalation.level <= 2 && hasUnread;
                  const setterName = displaySetterName(conversation.ownerLabel);
                  const setterColor = getSetterColor(conversation.ownerLabel);

                  return (
                    <div
                      key={virtualItem.key}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <button
                        type="button"
                        className={`V2Inbox__convCard ${isActive ? "is-active" : ""} ${hasUnread ? "has-unread" : ""} ${isUrgent ? "is-urgent" : ""}`}
                        onClick={() => {
                          setSelectedConversationId(conversation.id);
                          setComposerText("");
                          setSelectedDraftId(null);
                          setDraftPrefillDoneForConversation(null);
                          setIsComposerModalOpen(true);
                        }}
                      >
                        {/* Row 1: name + time */}
                        <div className="V2Inbox__convRow">
                          <div className="V2Inbox__convNameWrap">
                            {hasUnread && <span className="V2Inbox__convPip" />}
                            <span className="V2Inbox__convName">
                              {conversation.contactName ||
                                conversation.contactPhone ||
                                conversation.contactKey}
                              {conversation.dnc && (
                                <span className="V2Inbox__dncBadge">DNC</span>
                              )}
                              {conversation.mondayBooked && (
                                <span className="V2Inbox__mondayBadge">
                                  📅 Booked
                                </span>
                              )}
                            </span>
                          </div>
                          <span className="V2Inbox__convTime">
                            {timeAgo(conversation.lastMessage.createdAt)}
                          </span>
                        </div>

                        {/* Row 2: direction + preview */}
                        <p className="V2Inbox__convPreview">
                          <span
                            className="V2Inbox__convDir"
                            data-dir={conversation.lastMessage.direction}
                          >
                            {conversation.lastMessage.direction === "inbound"
                              ? "←"
                              : "→"}
                          </span>
                          {shorten(conversation.lastMessage.body, 85) || (
                            <em>No preview</em>
                          )}
                        </p>

                        {/* Row 3: tags */}
                        <div className="V2Inbox__convTags">
                          <span
                            className="V2Inbox__convEscTag"
                            data-tone={escalationToneForLevel(
                              conversation.escalation.level,
                            )}
                          >
                            L{conversation.escalation.level}
                          </span>
                          {setterName && (
                            <span
                              className="V2Inbox__convOwnerTag"
                              style={
                                { "--c": setterColor } as React.CSSProperties
                              }
                            >
                              <span className="V2Inbox__convOwnerDot" />
                              {setterName}
                            </span>
                          )}
                          {conversation.openNeedsReplyCount > 0 && (
                            <span className="V2Inbox__convReplyTag">
                              {conversation.openNeedsReplyCount} needs reply
                            </span>
                          )}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Analytics Dashboard */}
        <div className="V2Inbox__analyticsColumn">
          <div className="V2Inbox__analyticsPanel">
            <h3 className="V2Inbox__analyticsTitle">Inbox Health</h3>

            <div className="V2Inbox__healthScore">
              <div
                className="V2Inbox__healthRing"
                style={{
                  background: `conic-gradient(${getHealthColor(inboxHealth)} ${inboxHealth * 3.6}deg, rgba(7, 19, 36, 0.08) 0deg)`,
                }}
              >
                <span>{Math.round(inboxHealth)}</span>
              </div>
              <p className="V2Inbox__healthLabel">
                {inboxHealth >= 80
                  ? "Healthy"
                  : inboxHealth >= 60
                    ? "Needs attention"
                    : "Critical"}
              </p>
            </div>

            <div className="V2Inbox__statGrid">
              <div className="V2Inbox__statCard">
                <span
                  className="V2Inbox__statValue"
                  style={{ color: unreadCount > 0 ? "#f59d0d" : "#13b981" }}
                >
                  {unreadCount}
                </span>
                <span className="V2Inbox__statLabel">Needs Reply</span>
              </div>
              <div className="V2Inbox__statCard">
                <span
                  className="V2Inbox__statValue"
                  style={{ color: urgentCount > 0 ? "#ef4c62" : "#13b981" }}
                >
                  {urgentCount}
                </span>
                <span className="V2Inbox__statLabel">Urgent</span>
              </div>
              <div className="V2Inbox__statCard">
                <span className="V2Inbox__statValue">{jackCount}</span>
                <span className="V2Inbox__statLabel">Jack</span>
              </div>
              <div className="V2Inbox__statCard">
                <span className="V2Inbox__statValue">{brandonCount}</span>
                <span className="V2Inbox__statLabel">Brandon</span>
              </div>
            </div>

            {unassignedCount > 0 && (
              <div className="V2Inbox__alertBanner">
                <span className="V2Inbox__alertIcon">⚠️</span>
                <span>{unassignedCount} conversations need an owner</span>
              </div>
            )}

            <div className="V2Inbox__workloadSection">
              <h4>Team Workload</h4>
              <div className="V2Inbox__workloadBars">
                <div className="V2Inbox__workloadItem">
                  <div className="V2Inbox__workloadHeader">
                    <span className="V2Inbox__workloadName">
                      <span
                        className="V2Inbox__workloadAvatar"
                        style={{ background: "#11b8d6" }}
                      >
                        J
                      </span>
                      Jack
                    </span>
                    <span>{jackCount} convos</span>
                  </div>
                  <div className="V2Inbox__workloadBar">
                    <div
                      className="V2Inbox__workloadFill"
                      style={{
                        width: `${totalConversations > 0 ? (jackCount / totalConversations) * 100 : 0}%`,
                        background: "#11b8d6",
                      }}
                    />
                  </div>
                </div>
                <div className="V2Inbox__workloadItem">
                  <div className="V2Inbox__workloadHeader">
                    <span className="V2Inbox__workloadName">
                      <span
                        className="V2Inbox__workloadAvatar"
                        style={{ background: "#13b981" }}
                      >
                        B
                      </span>
                      Brandon
                    </span>
                    <span>{brandonCount} convos</span>
                  </div>
                  <div className="V2Inbox__workloadBar">
                    <div
                      className="V2Inbox__workloadFill"
                      style={{
                        width: `${totalConversations > 0 ? (brandonCount / totalConversations) * 100 : 0}%`,
                        background: "#13b981",
                      }}
                    />
                  </div>
                </div>
                {unassignedCount > 0 && (
                  <div className="V2Inbox__workloadItem">
                    <div className="V2Inbox__workloadHeader">
                      <span className="V2Inbox__workloadName">
                        <span
                          className="V2Inbox__workloadAvatar"
                          style={{ background: "#56607a" }}
                        >
                          ?
                        </span>
                        Unassigned
                      </span>
                      <span>{unassignedCount} convos</span>
                    </div>
                    <div className="V2Inbox__workloadBar">
                      <div
                        className="V2Inbox__workloadFill"
                        style={{
                          width: `${totalConversations > 0 ? (unassignedCount / totalConversations) * 100 : 0}%`,
                          background: "#ef4c62",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Phase 3: Stage → Call Conversion */}
            <div className="V2Inbox__analyticsSection">
              <h4 className="V2Inbox__analyticsSectionTitle">
                Stage-to-Call Conversion
              </h4>
              {stageConversionQuery.isLoading ? (
                <p className="V2Inbox__analyticsHint">Loading…</p>
              ) : stageConversionQuery.isError ? (
                <p className="V2Inbox__analyticsHint">Failed to load</p>
              ) : stageConversionRows.length === 0 ? (
                <p className="V2Inbox__analyticsHint">No conversion data yet</p>
              ) : (
                <table className="V2Inbox__conversionTable">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Total</th>
                      <th>Offered</th>
                      <th>Outcome</th>
                      <th>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageConversionRows.map((row) => (
                      <tr key={row.escalation_level}>
                        <td>L{row.escalation_level}</td>
                        <td>{row.total_conversations}</td>
                        <td>{row.call_offered_count}</td>
                        <td>{row.call_outcome_count}</td>
                        <td>
                          <span
                            className="V2Inbox__conversionRate"
                            style={{
                              color:
                                Number(row.conversion_rate_pct) >= 50
                                  ? "var(--v2-positive)"
                                  : Number(row.conversion_rate_pct) >= 25
                                    ? "var(--v2-warning)"
                                    : "var(--v2-critical)",
                            }}
                          >
                            {Number(row.conversion_rate_pct).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Phase 3: Objection Frequency */}
            <div className="V2Inbox__analyticsSection">
              <h4 className="V2Inbox__analyticsSectionTitle">Top Objections</h4>
              {objectionFrequencyQuery.isLoading ? (
                <p className="V2Inbox__analyticsHint">Loading…</p>
              ) : objectionFrequencyQuery.isError ? (
                <p className="V2Inbox__analyticsHint">Failed to load</p>
              ) : objectionFrequencyRows.length === 0 ? (
                <p className="V2Inbox__analyticsHint">
                  No objection tags recorded yet
                </p>
              ) : (
                <div className="V2Inbox__objectionBars">
                  {(() => {
                    const maxCount = Math.max(
                      ...objectionFrequencyRows.map((r) => r.count),
                      1,
                    );
                    return objectionFrequencyRows
                      .slice(0, 8)
                      .map((row) => (
                        <div key={row.tag} className="V2Inbox__objectionRow">
                          <span className="V2Inbox__objectionTag">
                            {row.tag}
                          </span>
                          <div className="V2Inbox__objectionBarWrap">
                            <div
                              className="V2Inbox__objectionBar"
                              style={{
                                width: `${(row.count / maxCount) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="V2Inbox__objectionCount">
                            {row.count}
                          </span>
                        </div>
                      ));
                  })()}
                </div>
              )}
            </div>

            <div className="V2Inbox__analyticsSection">
              <h4 className="V2Inbox__analyticsSectionTitle">
                Draft Voice Quality (30d)
              </h4>
              {draftAiPerformanceQuery.isLoading ? (
                <p className="V2Inbox__analyticsHint">Loading…</p>
              ) : draftAiPerformanceQuery.isError || !draftAiPerformance ? (
                <p className="V2Inbox__analyticsHint">Failed to load</p>
              ) : (
                <div className="V2Inbox__objectionBars">
                  <div className="V2Inbox__objectionRow">
                    <span className="V2Inbox__objectionTag">Setter-like rate</span>
                    <div className="V2Inbox__objectionBarWrap">
                      <div
                        className="V2Inbox__objectionBar"
                        style={{
                          width: `${Math.max(0, Math.min(100, setterLikeRate))}%`,
                          background:
                            "linear-gradient(90deg, #11b8d6, #13b981)",
                        }}
                      />
                    </div>
                    <span className="V2Inbox__objectionCount">
                      {setterLikeRate.toFixed(1)}
                      %
                    </span>
                  </div>
                  <div className="V2Inbox__objectionRow">
                    <span className="V2Inbox__objectionTag">Generic-tone rate</span>
                    <div className="V2Inbox__objectionBarWrap">
                      <div
                        className="V2Inbox__objectionBar"
                        style={{
                          width: `${Math.max(0, Math.min(100, genericToneRate))}%`,
                          background: "#ef4c62",
                        }}
                      />
                    </div>
                    <span className="V2Inbox__objectionCount">
                      {genericToneRate.toFixed(1)}
                      %
                    </span>
                  </div>
                  <div className="V2Inbox__objectionRow">
                    <span className="V2Inbox__objectionTag">Style anchor coverage</span>
                    <div className="V2Inbox__objectionBarWrap">
                      <div
                        className="V2Inbox__objectionBar"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(100, setterAnchorCoverageRate),
                          )}%`,
                          background: "#56607a",
                        }}
                      />
                    </div>
                    <span className="V2Inbox__objectionCount">
                      {setterAnchorCoverageRate.toFixed(1)}
                      %
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Guardrail Checklist — Radix Alert Dialog */}
      <AlertDialog.Root
        open={isGuardrailModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsGuardrailModalOpen(false);
            setPendingMessageText(null);
            setGuardrailChecks({});
          }
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(4, 10, 22, 0.65)",
              backdropFilter: "blur(4px)",
              zIndex: 1000,
            }}
          />
          <AlertDialog.Content
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(440px, 92vw)",
              background: "var(--v2-surface)",
              border: "1px solid rgba(17, 184, 214, 0.15)",
              borderRadius: "10px",
              padding: "1.5rem",
              boxShadow: "0 24px 64px rgba(4, 10, 22, 0.5)",
              zIndex: 1001,
            }}
          >
            <AlertDialog.Title
              style={{
                marginBottom: "0.5rem",
                fontSize: "1rem",
                fontWeight: 600,
              }}
            >
              Buying Signal Checklist
            </AlertDialog.Title>
            <AlertDialog.Description
              style={{
                fontSize: "0.85rem",
                color: "var(--v2-muted)",
                marginBottom: "1rem",
              }}
            >
              You&apos;re sending a call link at L{escalationLevel}. Confirm at
              least 2 buying signals before proceeding.
            </AlertDialog.Description>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                marginBottom: "1.25rem",
              }}
            >
              {GUARDRAIL_SIGNALS.map((signal) => (
                <label
                  key={signal.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={guardrailChecks[signal.id] || false}
                    onChange={(e) =>
                      setGuardrailChecks((prev) => ({
                        ...prev,
                        [signal.id]: e.target.checked,
                      }))
                    }
                  />
                  {signal.label}
                </label>
              ))}
            </div>

            {!canPassGuardrails && (
              <div
                style={{
                  marginBottom: "1.25rem",
                  padding: "0.75rem",
                  background: "rgba(239, 76, 98, 0.1)",
                  borderRadius: "6px",
                  border: "1px solid var(--v2-critical)",
                }}
              >
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--v2-critical)",
                    margin: 0,
                  }}
                >
                  ⚠ Not enough signals. Consider sending a podcast episode
                  first.
                </p>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
              }}
            >
              <AlertDialog.Cancel asChild>
                <button type="button" className="V2Inbox__button">
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                {canPassGuardrails ? (
                  <button
                    type="button"
                    className="V2Inbox__button V2Inbox__button--primary"
                    onClick={onConfirmGuardrails}
                  >
                    Send Anyway
                  </button>
                ) : (
                  <button
                    type="button"
                    className="V2Inbox__button V2Inbox__button--primary"
                    onClick={onConfirmGuardrails}
                    disabled={!canOverrideGuardrails}
                    title={
                      !canOverrideGuardrails
                        ? "Check at least 1 signal to override"
                        : "Override and send"
                    }
                  >
                    Override &amp; Send
                  </button>
                )}
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      {/* Composer Modal - Unchanged */}
      {isComposerModalOpen ? (
        <div
          className="V2Inbox__composerBackdrop"
          onClick={() => setIsComposerModalOpen(false)}
        >
          <section
            className="V2Inbox__composerModal"
            role="dialog"
            aria-modal="true"
            aria-label="Conversation and message composer"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="V2Inbox__composerModalHeader">
              <div className="V2Inbox__composerHeaderMain">
                {detail ? (
                  <>
                    <h3>
                      {detailContactCard?.name ||
                        detailContactCard?.phone ||
                        detailContactCard?.contactKey}
                    </h3>
                    <p className="V2Inbox__composerMeta">
                      {detailContactCard?.phone || "n/a"} · Owner:{" "}
                      {detailConversation?.ownerLabel || "Unassigned"} · Stage:
                      L{detailConversation?.escalation.level ?? "?"}
                    </p>
                    <div className="V2Inbox__statusRow">
                      <span
                        className={`V2Inbox__statusBadge V2Inbox__statusBadge--${detailConversation?.status || "open"}`}
                      >
                        {detailConversation?.status === "open"
                          ? "● Open"
                          : detailConversation?.status === "closed"
                            ? "✓ Closed"
                            : "⊘ DNC"}
                      </span>
                      {detailConversation?.status !== "closed" && (
                        <button
                          type="button"
                          className="V2Inbox__button V2Inbox__button--small"
                          onClick={() => onUpdateStatus("closed")}
                          disabled={statusMutation.isPending}
                          title="Mark as closed"
                        >
                          Close
                        </button>
                      )}
                      {detailConversation?.status === "closed" && (
                        <button
                          type="button"
                          className="V2Inbox__button V2Inbox__button--small"
                          onClick={() => onUpdateStatus("open")}
                          disabled={statusMutation.isPending}
                          title="Reopen conversation"
                        >
                          Reopen
                        </button>
                      )}
                      {detailConversation?.status !== "dnc" && (
                        <button
                          type="button"
                          className="V2Inbox__button V2Inbox__button--small V2Inbox__button--danger"
                          onClick={() => onUpdateStatus("dnc")}
                          disabled={statusMutation.isPending}
                          title="Mark as Do Not Contact — removes from active inbox"
                        >
                          DNC
                        </button>
                      )}
                      {detailConversation?.status === "dnc" && (
                        <button
                          type="button"
                          className="V2Inbox__button V2Inbox__button--small"
                          onClick={() => onUpdateStatus("open")}
                          disabled={statusMutation.isPending}
                          title="Remove DNC flag and reopen"
                        >
                          Remove DNC
                        </button>
                      )}
                    </div>
                    {/* Assignment + Snooze row */}
                    <div className="V2Inbox__statusRow V2Inbox__statusRow--meta">
                      <span className="V2Inbox__metaLabel">Assign to:</span>
                      <input
                        type="text"
                        className="V2Inbox__assignInput"
                        value={assignLabel}
                        onChange={(e) =>
                          assignForm.setValue("ownerLabel", e.target.value, {
                            shouldValidate: true,
                          })
                        }
                        placeholder="Rep name…"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void submitAssign();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="V2Inbox__button V2Inbox__button--small"
                        onClick={() => void submitAssign()}
                        disabled={assignMutation.isPending}
                      >
                        {assignMutation.isPending ? "…" : "Assign"}
                      </button>
                      <span className="V2Inbox__metaLabel">Snooze:</span>
                      <input
                        type="datetime-local"
                        className="V2Inbox__snoozeInput"
                        aria-label="Snooze until date and time"
                        value={snoozeDate}
                        onChange={(e) =>
                          snoozeForm.setValue("snoozedUntil", e.target.value, {
                            shouldValidate: true,
                          })
                        }
                      />
                      <button
                        type="button"
                        className="V2Inbox__button V2Inbox__button--small"
                        onClick={() => void submitSnooze()}
                        disabled={snoozeMutation.isPending || !snoozeDate}
                      >
                        {snoozeMutation.isPending ? "…" : "Snooze"}
                      </button>
                      {detailConversation?.escalation.nextFollowupDueAt && (
                        <button
                          type="button"
                          className="V2Inbox__button V2Inbox__button--small"
                          onClick={onClearSnooze}
                          disabled={snoozeMutation.isPending}
                          title="Clear snooze"
                        >
                          ✕ Snooze
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <h3>Conversation</h3>
                )}
              </div>
              <div className="V2Inbox__composerHeaderActions">
                <button
                  type="button"
                  className="V2Inbox__button V2Inbox__button--small"
                  onClick={() => {
                    setDetailForceSyncTick((prev) => prev + 1);
                    void listQuery.refetch();
                    void notesQuery.refetch();
                  }}
                  disabled={detailQuery.isFetching}
                  title="Refresh messages"
                >
                  {detailQuery.isFetching ? "↻ Syncing…" : "↻ Refresh"}
                </button>
                <button
                  type="button"
                  className="V2Inbox__composerClose"
                  onClick={() => setIsComposerModalOpen(false)}
                >
                  ✕
                </button>
              </div>
            </header>

            <div className="V2Inbox__composerModalBody">
              {!selectedConversationId ? (
                <V2State kind="empty">
                  Select a conversation to open it.
                </V2State>
              ) : detailQuery.isLoading ? (
                <V2State kind="loading">Loading messages…</V2State>
              ) : detailQuery.isError || !detail ? (
                <V2State kind="error">
                  Failed to load messages:{" "}
                  {String(
                    (detailQuery.error as Error)?.message || detailQuery.error,
                  )}
                </V2State>
              ) : (
                <Group
                  className="V2Inbox__composerPanels"
                  id="v2-inbox-composer-group"
                  orientation={
                    isNarrowComposerViewport ? "vertical" : "horizontal"
                  }
                  defaultLayout={composerDefaultLayout}
                  onLayoutChanged={onComposerLayoutChanged}
                >
                  <Panel
                    id="composer-primary"
                    minSize={isNarrowComposerViewport ? "260px" : "45%"}
                  >
                    <div className="V2Inbox__composerPrimary">
                    {/* Conversation Thread - Chat Style */}
                    <div className="V2Inbox__chatThread" ref={chatThreadRef}>
                      {detailMessages.map((message) => {
                        const leadLabel =
                          detailContactCard?.name ||
                          detailContactCard?.phone ||
                          "Lead";
                        // For outbound messages: prefer inferring from message body (e.g., "Jack with PT Biz")
                        // Fall back to alowareUser field, then to default setter
                        const defaultSetter =
                          displaySetterName(detailConversation?.ownerLabel) ||
                          "Setter";
                        let speaker: string;
                        if (message.direction === "inbound") {
                          speaker = leadLabel;
                        } else {
                          // Try to infer from message body for sequence messages
                          const bodySenderMatch = message.body?.match(
                            /^Hey.*?,\s*(\w+(?:\s+\w+)?)\s+with\s+PT/i,
                          );
                          const bodySender = bodySenderMatch?.[1] || null;
                          speaker =
                            displaySetterName(bodySender) ||
                            displaySetterName(message.alowareUser) ||
                            defaultSetter;
                        }
                        return (
                          <article
                            key={message.id}
                            className={`V2Inbox__chatMessage V2Inbox__chatMessage--${message.direction}`}
                          >
                            <div className="V2Inbox__chatMessageHeader">
                              <span className="V2Inbox__chatSpeaker">
                                {speaker}
                              </span>
                              <time className="V2Inbox__chatTime">
                                {fmtDateTime(message.createdAt)}
                              </time>
                            </div>
                            <p className="V2Inbox__chatBody">
                              {message.body || "(empty)"}
                            </p>
                          </article>
                        );
                      })}

                      {/* Optimistic sent message */}
                      {justSentMessage && !justSentMessage.confirmed && (
                        <article
                          className={`V2Inbox__chatMessage V2Inbox__chatMessage--outbound ${!justSentMessage.confirmed ? "V2Inbox__chatMessage--sending" : "V2Inbox__chatMessage--confirmed"}`}
                        >
                          <div className="V2Inbox__chatMessageHeader">
                            <span className="V2Inbox__chatSpeaker">You</span>
                            <time className="V2Inbox__chatTime">
                              {fmtDateTime(justSentMessage.timestamp)}
                            </time>
                          </div>
                          <p className="V2Inbox__chatBody">
                            {justSentMessage.text}
                          </p>
                          <span className="V2Inbox__sendingIndicator">
                            {!justSentMessage.confirmed ? "Sending…" : "✓ Sent"}
                          </span>
                        </article>
                      )}
                    </div>

                    {/* Composer Area */}
                    <div className="V2Inbox__chatComposer">
                      {/* Double Pitch Protection Banner */}
                      {showDoublePitchWarning && (
                        <div
                          style={{
                            background: "rgba(245, 157, 13, 0.12)",
                            border: "1px solid #f59d0d",
                            borderRadius: "4px",
                            padding: "0.5rem 0.75rem",
                            marginBottom: "0.5rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "0.5rem",
                            fontSize: "0.8rem",
                            color: "#f59d0d",
                          }}
                        >
                          <span>
                            ⚠ Call link already sent — no reply yet. Try a
                            follow-up question instead.
                          </span>
                          <button
                            type="button"
                            style={{
                              background: "none",
                              border: "none",
                              color: "#f59d0d",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                              padding: "0 0.25rem",
                            }}
                            onClick={() => setShowDoublePitchWarning(false)}
                            title="Dismiss and send anyway"
                          >
                            Send anyway ✕
                          </button>
                        </div>
                      )}
                      <div className="V2Inbox__chatInputRow">
                        <textarea
                          ref={composerRef}
                          className="V2Inbox__chatInput"
                          value={composerText}
                          onChange={(event) => {
                            const nextText = event.target.value;
                            setComposerText(nextText);
                            if (selectedDraftId) {
                              const selectedDraft = detailDrafts.find(
                                (draft) => draft.id === selectedDraftId,
                              );
                              if (
                                !selectedDraft ||
                                selectedDraft.text !== nextText
                              ) {
                                setSelectedDraftId(null);
                              }
                            }
                          }}
                          placeholder="Type your message…"
                          rows={3}
                        />
                        <div className="V2Inbox__chatActions">
                          <button
                            type="button"
                            className="V2Inbox__button V2Inbox__button--secondary V2Inbox__button--small"
                            onClick={onGenerateDraft}
                            disabled={
                              generateDraftMutation.isPending ||
                              sendMutation.isPending
                            }
                            title="Generate AI draft"
                          >
                            {generateDraftMutation.isPending ? "..." : "✨"}
                          </button>
                          <button
                            type="button"
                            className={`V2Inbox__button V2Inbox__button--primary V2Inbox__button--small ${sendStatus === "sending" ? "V2Inbox__button--sending" : ""} ${sendStatus === "sent" ? "V2Inbox__button--success" : ""}`}
                            onClick={onSend}
                            disabled={
                              sendMutation.isPending ||
                              composerText.trim().length === 0 ||
                              lineSelectionRequired ||
                              sendConfigQuery.isLoading
                            }
                          >
                            {sendStatus === "sending" ? (
                              <span className="V2Inbox__buttonSpinner" />
                            ) : sendStatus === "sent" ? (
                              "Sent!"
                            ) : (
                              "Send"
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="V2Inbox__chatFooter">
                        {(() => {
                          const { segments, charsRemaining, isUnicode } =
                            getSmsSegmentInfo(composerText);
                          const warn = segments >= 2;
                          const danger = segments >= 4;
                          return (
                            <span
                              className={`V2Inbox__chatCount${danger ? " V2Inbox__chatCount--danger" : warn ? " V2Inbox__chatCount--warn" : ""}`}
                              title={
                                isUnicode
                                  ? "Message contains Unicode characters — reduced segment size (70/67 chars)"
                                  : "GSM-7 encoding — 160 chars single / 153 per segment"
                              }
                            >
                              {composerText.length === 0
                                ? "160 chars left"
                                : `${charsRemaining} left · ${segments} SMS${isUnicode ? " ⚠ unicode" : ""}`}
                            </span>
                          );
                        })()}
                        <div className="V2Inbox__chatTools">
                          {lineOptions.length > 0 && (
                            <V2Select
                              triggerClassName="V2Inbox__chatLineSelect"
                              value={selectedLineKey || LINE_NONE_VALUE}
                              onValueChange={(value) =>
                                setSelectedLineKey(
                                  value === LINE_NONE_VALUE ? "" : value,
                                )
                              }
                              options={lineSelectOptions}
                              ariaLabel="Select send line"
                            />
                          )}
                          {detailDrafts.length > 0 && (
                            <V2Select
                              triggerClassName="V2Inbox__chatDraftSelect"
                              value={selectedDraftId || DRAFT_NONE_VALUE}
                              onValueChange={(value) => {
                                if (value === DRAFT_NONE_VALUE) {
                                  setSelectedDraftId(null);
                                  return;
                                }
                                const draft = detailDrafts.find(
                                  (d) => d.id === value,
                                );
                                if (!draft) return;
                                setComposerText(draft.text);
                                setSelectedDraftId(draft.id);
                              }}
                              options={[
                                {
                                  value: DRAFT_NONE_VALUE,
                                  label: `Drafts (${detailDrafts.length})`,
                                },
                                ...detailDrafts.slice(0, 5).map((draft) => ({
                                  value: draft.id,
                                  label: `${shorten(draft.text, 40)} (L${toFiniteNumber(draft.lintScore).toFixed(0)})`,
                                })),
                              ]}
                              ariaLabel="Use a saved draft"
                            />
                          )}
                          {/* Templates */}
                          <div className="V2Inbox__templateWrapper">
                            <button
                              type="button"
                              className="V2Inbox__button V2Inbox__button--small"
                              title="Insert template"
                              ref={templateFloatingRefs.setReference}
                              {...getTemplateReferenceProps({
                                onClick: () =>
                                  setShowTemplates((prev) => !prev),
                                "aria-expanded": showTemplates,
                                "aria-haspopup": "dialog",
                              })}
                            >
                              Templates
                            </button>
                            {showTemplates && (
                              <FloatingPortal>
                                <div
                                  className="V2Inbox__templateDropdown"
                                  ref={templateFloatingRefs.setFloating}
                                  style={templateFloatingStyles}
                                  {...getFloatingProps({
                                    "aria-label": "Templates menu",
                                  })}
                                >
                                  {templatesQuery.data &&
                                  templatesQuery.data.length > 0 ? (
                                    templatesQuery.data.map((tpl) => (
                                      <div
                                        key={tpl.id}
                                        className="V2Inbox__templateItem"
                                      >
                                        <button
                                          type="button"
                                          className="V2Inbox__templateInsert"
                                          onClick={() =>
                                            onInsertTemplate(tpl.body)
                                          }
                                          title={tpl.body}
                                        >
                                          {tpl.name}
                                        </button>
                                        <button
                                          type="button"
                                          className="V2Inbox__templateDelete"
                                          onClick={() =>
                                            void onDeleteTemplate(tpl.id)
                                          }
                                          title="Delete template"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="V2Inbox__templateEmpty">
                                      No templates saved yet.
                                    </p>
                                  )}
                                  <div className="V2Inbox__templateCreate">
                                    <input
                                      type="text"
                                      className="V2Inbox__templateNameInput"
                                      value={newTemplateName}
                                      onChange={(e) =>
                                        templateForm.setValue(
                                          "name",
                                          e.target.value,
                                          { shouldValidate: true },
                                        )
                                      }
                                      placeholder="Template name…"
                                    />
                                    <textarea
                                      className="V2Inbox__templateBodyInput"
                                      value={newTemplateBody}
                                      onChange={(e) =>
                                        templateForm.setValue(
                                          "body",
                                          e.target.value,
                                          { shouldValidate: true },
                                        )
                                      }
                                      rows={2}
                                      placeholder="Message body… use {{name}} for contact name"
                                    />
                                    <button
                                      type="button"
                                      className="V2Inbox__button V2Inbox__button--small V2Inbox__button--primary"
                                      onClick={() =>
                                        void submitCreateTemplate()
                                      }
                                      disabled={
                                        createTemplateMutation.isPending ||
                                        !newTemplateName.trim() ||
                                        !newTemplateBody.trim()
                                      }
                                    >
                                      {createTemplateMutation.isPending
                                        ? "Saving…"
                                        : "+ Save Template"}
                                    </button>
                                  </div>
                                </div>
                              </FloatingPortal>
                            )}
                          </div>
                          <button
                            type="button"
                            className="V2Inbox__chatClear"
                            onClick={onClearDraft}
                            disabled={
                              !selectedDraftId && composerText.length === 0
                            }
                            title="Clear message"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    </div>
                    </div>
                  </Panel>

                  <Separator
                    className={`V2Inbox__composerResizeHandle ${
                      isNarrowComposerViewport ? "is-vertical" : "is-horizontal"
                    }`}
                    title="Resize composer panels"
                  />

                  <Panel
                    id="composer-sidebar"
                    minSize={isNarrowComposerViewport ? "180px" : "22%"}
                  >
                    {/* Sidebar: Tabbed with Radix Tabs */}
                    <Tabs.Root
                      defaultValue="qualify"
                      className="V2Inbox__composerSidebar V2Inbox__sideColumn"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                      }}
                  >
                    <Tabs.List
                      style={{
                        display: "flex",
                        borderBottom: "1px solid rgba(17, 184, 214, 0.12)",
                        flexShrink: 0,
                        overflowX: "auto",
                      }}
                    >
                      <Tabs.Trigger
                        value="qualify"
                        style={{
                          padding: "0.45rem 0.7rem",
                          fontSize: "0.72rem",
                          fontWeight: 500,
                          background: "none",
                          border: "none",
                          borderBottom: "2px solid transparent",
                          cursor: "pointer",
                          color: "var(--v2-muted)",
                          fontFamily: "inherit",
                        }}
                      >
                        Qualify
                      </Tabs.Trigger>
                      <Tabs.Trigger
                        value="stage"
                        style={{
                          padding: "0.45rem 0.7rem",
                          fontSize: "0.72rem",
                          fontWeight: 500,
                          background: "none",
                          border: "none",
                          borderBottom: "2px solid transparent",
                          cursor: "pointer",
                          color: "var(--v2-muted)",
                          fontFamily: "inherit",
                        }}
                      >
                        Stage
                      </Tabs.Trigger>
                      <Tabs.Trigger
                        value="notes"
                        style={{
                          padding: "0.45rem 0.7rem",
                          fontSize: "0.72rem",
                          fontWeight: 500,
                          background: "none",
                          border: "none",
                          borderBottom: "2px solid transparent",
                          cursor: "pointer",
                          color: "var(--v2-muted)",
                          fontFamily: "inherit",
                        }}
                      >
                        Notes
                      </Tabs.Trigger>
                      <Tabs.Trigger
                        value="contact"
                        style={{
                          padding: "0.45rem 0.7rem",
                          fontSize: "0.72rem",
                          fontWeight: 500,
                          background: "none",
                          border: "none",
                          borderBottom: "2px solid transparent",
                          cursor: "pointer",
                          color: "var(--v2-muted)",
                          fontFamily: "inherit",
                        }}
                      >
                        Contact
                      </Tabs.Trigger>
                      <Tabs.Trigger
                        value="outcome"
                        style={{
                          padding: "0.45rem 0.7rem",
                          fontSize: "0.72rem",
                          fontWeight: 500,
                          background: "none",
                          border: "none",
                          borderBottom: "2px solid transparent",
                          cursor: "pointer",
                          color: "var(--v2-muted)",
                          fontFamily: "inherit",
                        }}
                      >
                        Outcome
                      </Tabs.Trigger>
                      {lineOptions.length > 0 && (
                        <Tabs.Trigger
                          value="line"
                          style={{
                            padding: "0.45rem 0.7rem",
                            fontSize: "0.72rem",
                            fontWeight: 500,
                            background: "none",
                            border: "none",
                            borderBottom: "2px solid transparent",
                            cursor: "pointer",
                            color: "var(--v2-muted)",
                            fontFamily: "inherit",
                          }}
                        >
                          Line
                        </Tabs.Trigger>
                      )}
                    </Tabs.List>
                    <div style={{ overflowY: "auto", flex: 1 }}>
                      {/* ── Qualify Tab ── */}
                      <Tabs.Content value="qualify">
                        <div
                          className={`V2Panel V2Inbox__sidePanel V2Inbox__stateCard V2Inbox__stateCard--${qualificationTone}`}
                        >
                          <p className="V2Panel__title">Qualification</p>
                          <div className="V2Inbox__stateTop">
                            <span className="V2Inbox__stateBadge">
                              {qualificationProgressLive} of 4 fields
                            </span>
                            <span className="V2Inbox__stateHint">
                              {qualificationProgressPct}% complete
                            </span>
                          </div>
                          <div className="V2Inbox__stateMeter">
                            <span
                              style={{ width: `${qualificationProgressPct}%` }}
                            />
                          </div>
                          <div className="V2Inbox__pillRow">
                            {qualificationFields.map((field) => (
                              <span
                                key={field.key}
                                className={`V2Inbox__pill ${field.complete ? "is-complete" : ""}`}
                              >
                                {field.label}
                              </span>
                            ))}
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gap: "0.5rem",
                              marginTop: "0.75rem",
                            }}
                          >
                            <label className="V2Control">
                              <span>Full or Part Time</span>
                              <V2Select
                                value={qualificationState.fullOrPartTime}
                                onValueChange={(value) =>
                                  setQualificationState((prev) => ({
                                    ...prev,
                                    fullOrPartTime:
                                      value as QualificationStateV2["fullOrPartTime"],
                                  }))
                                }
                                options={FULL_OR_PART_TIME_OPTIONS}
                                ariaLabel="Full or part time"
                              />
                            </label>
                            <label className="V2Control">
                              <span>Niche</span>
                              <input
                                type="text"
                                value={qualificationState.niche || ""}
                                onChange={(e) =>
                                  setQualificationState((prev) => ({
                                    ...prev,
                                    niche: e.target.value,
                                  }))
                                }
                                placeholder="e.g. Sports performance"
                              />
                            </label>
                            <label className="V2Control">
                              <span>Revenue Mix</span>
                              <V2Select
                                value={qualificationState.revenueMix}
                                onValueChange={(value) =>
                                  setQualificationState((prev) => ({
                                    ...prev,
                                    revenueMix:
                                      value as QualificationStateV2["revenueMix"],
                                  }))
                                }
                                options={REVENUE_MIX_OPTIONS}
                                ariaLabel="Revenue mix"
                              />
                            </label>
                            <label className="V2Control">
                              <span>Coaching Interest</span>
                              <V2Select
                                value={qualificationState.coachingInterest}
                                onValueChange={(value) =>
                                  setQualificationState((prev) => ({
                                    ...prev,
                                    coachingInterest:
                                      value as QualificationStateV2["coachingInterest"],
                                  }))
                                }
                                options={COACHING_INTEREST_OPTIONS}
                                ariaLabel="Coaching interest"
                              />
                            </label>
                            <button
                              type="button"
                              className="V2Inbox__stateAction V2Inbox__stateAction--primary"
                              onClick={onSaveQualification}
                              disabled={qualificationMutation.isPending}
                            >
                              {qualificationMutation.isPending
                                ? "Saving…"
                                : "Save Qualification"}
                            </button>
                          </div>
                        </div>
                      </Tabs.Content>

                      {/* ── Stage Tab ── */}
                      <Tabs.Content value="stage">
                        <div
                          className={`V2Panel V2Inbox__sidePanel V2Inbox__stateCard V2Inbox__stateCard--${escalationTone}`}
                        >
                          <p className="V2Panel__title">Escalation Stage</p>
                          <div className="V2Inbox__stateTop">
                            <span className="V2Inbox__stateBadge">
                              L{escalationLevel} ·{" "}
                              {escalationLevelSubtitle(escalationLevel)}
                            </span>
                            <span className="V2Inbox__stateHint">
                              {escalationProgressPct}%
                            </span>
                          </div>
                          <div className="V2Inbox__stateMeter">
                            <span
                              style={{ width: `${escalationProgressPct}%` }}
                            />
                          </div>
                          <div className="V2Inbox__levelRail">
                            {([1, 2, 3, 4] as const).map((level) => (
                              <button
                                key={level}
                                type="button"
                                className={`V2Inbox__levelChip ${escalationLevel === level ? "is-active" : ""}`}
                                onClick={() => setEscalationLevel(level)}
                              >
                                L{level}
                              </button>
                            ))}
                          </div>
                          <label
                            className="V2Control"
                            style={{ marginTop: "0.5rem" }}
                          >
                            <span>Override Reason</span>
                            <textarea
                              value={escalationReason}
                              onChange={(e) =>
                                setEscalationReason(e.target.value)
                              }
                              rows={2}
                              placeholder="Why are you overriding? (optional)"
                            />
                          </label>
                          <button
                            type="button"
                            className="V2Inbox__stateAction V2Inbox__stateAction--primary"
                            style={{ marginTop: "0.5rem" }}
                            onClick={onOverrideEscalation}
                            disabled={escalationMutation.isPending}
                          >
                            {escalationMutation.isPending
                              ? "Saving…"
                              : "Save Stage"}
                          </button>
                        </div>
                      </Tabs.Content>

                      {/* ── Notes Tab ── */}
                      <Tabs.Content value="notes">
                        <div className="V2Panel V2Inbox__sidePanel">
                          <p className="V2Panel__title">Internal Notes</p>
                          <p
                            className="V2Panel__caption"
                            style={{
                              fontSize: "0.75rem",
                              marginBottom: "0.5rem",
                              color: "var(--v2-muted)",
                            }}
                          >
                            Not visible to the lead
                          </p>
                          <div className="V2Inbox__notesList">
                            {notesQuery.isLoading && (
                              <p
                                style={{
                                  fontSize: "0.75rem",
                                  color: "var(--v2-muted)",
                                }}
                              >
                                Loading…
                              </p>
                            )}
                            {notesQuery.data &&
                              notesQuery.data.length === 0 && (
                                <p
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "var(--v2-muted)",
                                  }}
                                >
                                  No notes yet.
                                </p>
                              )}
                            {notesQuery.data?.map((note) => (
                              <div key={note.id} className="V2Inbox__noteItem">
                                <div className="V2Inbox__noteHeader">
                                  <span className="V2Inbox__noteAuthor">
                                    {note.author}
                                  </span>
                                  <span className="V2Inbox__noteTime">
                                    {fmtDateTime(note.createdAt)}
                                  </span>
                                </div>
                                <p className="V2Inbox__noteBody">{note.text}</p>
                              </div>
                            ))}
                          </div>
                          <div className="V2Inbox__noteComposer">
                            <textarea
                              className="V2Inbox__noteInput"
                              value={noteText}
                              onChange={(e) =>
                                noteForm.setValue("text", e.target.value, {
                                  shouldValidate: true,
                                })
                              }
                              rows={2}
                              placeholder="Add a note… (⌘↵ to save)"
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" &&
                                  (e.metaKey || e.ctrlKey)
                                ) {
                                  e.preventDefault();
                                  void submitAddNote();
                                }
                              }}
                            />
                            <button
                              type="button"
                              className="V2Inbox__button V2Inbox__button--small V2Inbox__button--primary"
                              onClick={() => void submitAddNote()}
                              disabled={
                                addNoteMutation.isPending ||
                                noteText.trim().length === 0
                              }
                            >
                              {addNoteMutation.isPending ? "Saving…" : "+ Note"}
                            </button>
                          </div>
                        </div>
                      </Tabs.Content>

                      {/* ── Contact Tab ── */}
                      <Tabs.Content value="contact">
                        <div className="V2Panel V2Inbox__sidePanel">
                          <p className="V2Panel__title">Aloware Contact Sync</p>
                          <p
                            className="V2Panel__caption"
                            style={{
                              fontSize: "0.75rem",
                              marginBottom: "0.5rem",
                              color: "var(--v2-muted)",
                            }}
                          >
                            Use the current sequence ID or enter a new one.
                          </p>

                          <div
                            style={{
                              fontSize: "0.75rem",
                              marginBottom: "0.6rem",
                              color:
                                (lastSequenceSync?.status || null) === "synced"
                                  ? "var(--v2-positive)"
                                  : "var(--v2-muted)",
                            }}
                          >
                            {describeSequenceSync(lastSequenceSync)}
                          </div>

                          <label className="V2Control">
                            <span>Sequence ID</span>
                            <input
                              type="text"
                              value={sequenceIdInput}
                              onChange={(e) => setSequenceIdInput(e.target.value)}
                              placeholder="e.g. 12345"
                            />
                          </label>

                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              marginTop: "0.6rem",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              className="V2Inbox__button V2Inbox__button--small V2Inbox__button--primary"
                              onClick={onEnrollToSequence}
                              disabled={
                                sequenceEnrollMutation.isPending ||
                                !sequenceIdInput.trim()
                              }
                            >
                              {sequenceEnrollMutation.isPending
                                ? "Enrolling…"
                                : "Enroll"}
                            </button>
                            <button
                              type="button"
                              className="V2Inbox__button V2Inbox__button--small"
                              onClick={onDisenrollFromSequence}
                              disabled={sequenceDisenrollMutation.isPending}
                            >
                              {sequenceDisenrollMutation.isPending
                                ? "Disenrolling…"
                                : "Disenroll"}
                            </button>
                          </div>

                          <div
                            style={{
                              marginTop: "0.8rem",
                              borderTop: "1px solid rgba(17, 184, 214, 0.12)",
                              paddingTop: "0.65rem",
                              display: "grid",
                              gap: "0.35rem",
                              fontSize: "0.75rem",
                            }}
                          >
                            <div>
                              <strong>Lead Source:</strong>{" "}
                              {detailContactCard?.leadSource || "n/a"}
                            </div>
                            <div>
                              <strong>Current Sequence:</strong>{" "}
                              {detailContactCard?.sequenceId || "n/a"}
                            </div>
                            <div>
                              <strong>Disposition:</strong>{" "}
                              {detailContactCard?.dispositionStatusId || "n/a"}
                            </div>
                            <div>
                              <strong>Tags:</strong>{" "}
                              {contactTags.length > 0
                                ? contactTags.join(", ")
                                : "n/a"}
                            </div>
                            <div>
                              <strong>Text Authorized:</strong>{" "}
                              {detailContactCard?.textAuthorized == null
                                ? "n/a"
                                : detailContactCard.textAuthorized
                                  ? "yes"
                                  : "no"}
                            </div>
                            <div>
                              <strong>Blocked:</strong>{" "}
                              {detailContactCard?.isBlocked == null
                                ? "n/a"
                                : detailContactCard.isBlocked
                                  ? "yes"
                                  : "no"}
                            </div>
                            <div>
                              <strong>Carrier / Line:</strong>{" "}
                              {detailContactCard?.lrnCarrier || "n/a"} /{" "}
                              {detailContactCard?.lrnLineType || "n/a"}
                            </div>
                            <div>
                              <strong>Unread:</strong>{" "}
                              {detailContactCard?.unreadCount ?? 0}
                            </div>
                            <div>
                              <strong>SMS In/Out:</strong>{" "}
                              {detailContactCard?.inboundSmsCount ?? 0}/
                              {detailContactCard?.outboundSmsCount ?? 0}
                            </div>
                            <div>
                              <strong>Calls In/Out:</strong>{" "}
                              {detailContactCard?.inboundCallCount ?? 0}/
                              {detailContactCard?.outboundCallCount ?? 0}
                            </div>
                            <div>
                              <strong>Last Engagement:</strong>{" "}
                              {fmtDateTime(
                                detailContactCard?.lastEngagementAt || null,
                              )}
                            </div>
                            <div>
                              <strong>LRN Checked:</strong>{" "}
                              {fmtDateTime(
                                detailContactCard?.lrnLastCheckedAt || null,
                              )}
                            </div>
                          </div>
                        </div>
                      </Tabs.Content>

                      {/* ── Outcome Tab ── */}
                      <Tabs.Content value="outcome">
                        <div className="V2Panel V2Inbox__sidePanel">
                          <p className="V2Panel__title">
                            Call Outcome &amp; Objections
                          </p>

                          <p
                            className="V2Panel__caption"
                            style={{
                              fontSize: "0.72rem",
                              marginBottom: "0.4rem",
                            }}
                          >
                            Call Outcome
                          </p>
                          <div className="V2Inbox__outcomeChips">
                            {(
                              [
                                "not_a_fit",
                                "too_early",
                                "budget",
                                "joined",
                                "ghosted",
                              ] as CallOutcomeV2[]
                            ).map((outcome) => (
                              <button
                                key={outcome}
                                type="button"
                                className={`V2Inbox__outcomeChip${localCallOutcome === outcome ? " is-active" : ""}`}
                                data-outcome={outcome}
                                onClick={() =>
                                  void onSetCallOutcome(
                                    localCallOutcome === outcome
                                      ? null
                                      : outcome,
                                  )
                                }
                                disabled={updateCallOutcomeMutation.isPending}
                                title={CALL_OUTCOME_LABELS[outcome]}
                              >
                                {CALL_OUTCOME_LABELS[outcome]}
                              </button>
                            ))}
                          </div>

                          <p
                            className="V2Panel__caption"
                            style={{
                              fontSize: "0.72rem",
                              marginTop: "0.75rem",
                              marginBottom: "0.4rem",
                            }}
                          >
                            Objection Tags
                          </p>
                          <div className="V2Inbox__objectionTagChips">
                            {localObjectionTags.length === 0 && (
                              <span
                                style={{
                                  fontSize: "0.72rem",
                                  color: "var(--v2-muted)",
                                }}
                              >
                                No tags yet
                              </span>
                            )}
                            {localObjectionTags.map((tag) => (
                              <span
                                key={tag}
                                className="V2Inbox__objectionTagChip"
                              >
                                {tag}
                                <button
                                  type="button"
                                  className="V2Inbox__objectionTagRemove"
                                  onClick={() => void onRemoveObjectionTag(tag)}
                                  disabled={
                                    updateObjectionTagsMutation.isPending
                                  }
                                  title="Remove tag"
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="V2Inbox__objectionTagInput">
                            <input
                              type="text"
                              className="V2Inbox__assignInput"
                              value={objectionTagInput}
                              onChange={(e) =>
                                setObjectionTagInput(e.target.value)
                              }
                              placeholder="Add tag… (e.g. price, timing)"
                              title="Add objection tag"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void onAddObjectionTag();
                              }}
                            />
                            <button
                              type="button"
                              className="V2Inbox__button V2Inbox__button--small"
                              onClick={onAddObjectionTag}
                              disabled={
                                updateObjectionTagsMutation.isPending ||
                                !objectionTagInput.trim()
                              }
                            >
                              + Tag
                            </button>
                          </div>

                          <div style={{ marginTop: "0.75rem" }}>
                            <button
                              type="button"
                              className="V2Inbox__button V2Inbox__button--small V2Inbox__button--danger"
                              onClick={onIncrementGuardrailOverride}
                              disabled={
                                incrementGuardrailOverrideMutation.isPending
                              }
                              title="Record that a guardrail was overridden for this conversation"
                            >
                              {incrementGuardrailOverrideMutation.isPending
                                ? "…"
                                : "⚠ Log Override"}
                            </button>
                            <p
                              style={{
                                fontSize: "0.68rem",
                                color: "var(--v2-muted)",
                                marginTop: "0.25rem",
                              }}
                            >
                              Overrides:{" "}
                              {detail?.conversation.guardrailOverrideCount ?? 0}
                            </p>
                          </div>
                        </div>

                        {detail && detailMondayTrail.length > 0 && (
                          <div className="V2Panel V2Inbox__sidePanel">
                            <p className="V2Panel__title">
                              📅 Monday Booked Calls
                            </p>
                            <div className="V2Inbox__mondayTrail">
                              {detailMondayTrail.map((snap) => (
                                <div
                                  key={snap.itemId}
                                  className="V2Inbox__mondayTrailRow"
                                >
                                  <div className="V2Inbox__mondayTrailName">
                                    {snap.itemName || "—"}
                                    {snap.isBooked && (
                                      <span className="V2Inbox__mondayBadge V2Inbox__mondayBadge--inline">
                                        Booked
                                      </span>
                                    )}
                                  </div>
                                  <div className="V2Inbox__mondayTrailMeta">
                                    {snap.stage && (
                                      <span className="V2Inbox__mondayTrailStage">
                                        {snap.stage}
                                      </span>
                                    )}
                                    {snap.callDate && (
                                      <span className="V2Inbox__mondayTrailDate">
                                        {snap.callDate}
                                      </span>
                                    )}
                                    {snap.disposition && (
                                      <span className="V2Inbox__mondayTrailDisp">
                                        {snap.disposition}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </Tabs.Content>

                      {/* ── Line Tab ── */}
                      {lineOptions.length > 0 && (
                        <Tabs.Content value="line">
                          <div className="V2Panel V2Inbox__sidePanel">
                            <p className="V2Panel__title">Send Line</p>
                            <p
                              className="V2Panel__caption"
                              style={{
                                fontSize: "0.78rem",
                                marginBottom: "0.5rem",
                              }}
                            >
                              Default: {savedDefaultSummary}
                            </p>
                            <label className="V2Control">
                              <span>Active Line</span>
                              <V2Select
                                value={selectedLineKey || LINE_NONE_VALUE}
                                onValueChange={(value) =>
                                  setSelectedLineKey(
                                    value === LINE_NONE_VALUE ? "" : value,
                                  )
                                }
                                options={lineSelectOptions}
                                ariaLabel="Active send line"
                              />
                            </label>
                            <div
                              style={{
                                display: "flex",
                                gap: "0.5rem",
                                marginTop: "0.5rem",
                                flexWrap: "wrap",
                              }}
                            >
                              <button
                                type="button"
                                className="V2Inbox__button V2Inbox__button--primary V2Inbox__button--small"
                                onClick={onSaveDefaultLine}
                                disabled={
                                  setDefaultLineMutation.isPending ||
                                  !selectedLineOption
                                }
                              >
                                Save as Default
                              </button>
                              <button
                                type="button"
                                className="V2Inbox__button V2Inbox__button--small"
                                onClick={onClearDefaultLine}
                                disabled={setDefaultLineMutation.isPending}
                              >
                                Clear Default
                              </button>
                            </div>
                          </div>
                        </Tabs.Content>
                      )}
                    </div>
                    </Tabs.Root>
                  </Panel>
                </Group>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
